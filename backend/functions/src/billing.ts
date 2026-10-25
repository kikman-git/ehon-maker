import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type Stripe from 'stripe';
import type { CreditService } from './credits';

// Stripe on the web (decisions #40, #66): one subscription with a monthly credit allowance, plus one-off credit packs.

export type Product = 'plus' | 'pack';
export interface Offer { priceId: string; credits: number }
export interface Catalog { plus: Offer; pack: Offer }

/** The slice of the Stripe client the service uses, so tests run against a stand-in. */
export interface StripeLike {
  customers: { create(params: Stripe.CustomerCreateParams): Promise<{ id: string }> };
  checkout: { sessions: { create(params: Stripe.Checkout.SessionCreateParams): Promise<{ url: string | null }> } };
  billingPortal: { sessions: { create(params: Stripe.BillingPortal.SessionCreateParams): Promise<{ url: string }> } };
  webhooks: { constructEvent(payload: string | Buffer, signature: string, secret: string): Stripe.Event };
}

const PRODUCTS: Product[] = ['plus', 'pack'];
const ID = /^[A-Za-z0-9_-]{1,120}$/;

export class BillingService {
  constructor(
    private readonly db: Firestore,
    private readonly stripe: StripeLike,
    private readonly credits: CreditService,
    private readonly catalog: Catalog,
    private readonly webOrigin: string,
  ) {}

  private entitlement(uid: string) { return this.db.doc(`entitlements/${uid}`); }

  /** A Checkout page for the subscription or a pack; the customer is created once and remembered. */
  async checkout(uid: string, email: string | undefined, product: unknown): Promise<{ url: string }> {
    if (typeof product !== 'string' || !PRODUCTS.includes(product as Product)) throw new HttpsError('invalid-argument', 'Unknown product.');
    const offer = this.catalog[product as Product];
    if (!offer.priceId) throw new HttpsError('failed-precondition', 'Billing is not configured.');
    const customer = await this.customer(uid, email);
    const session = await this.stripe.checkout.sessions.create({
      customer,
      mode: product === 'plus' ? 'subscription' : 'payment',
      line_items: [{ price: offer.priceId, quantity: 1 }],
      success_url: `${this.webOrigin}/?billing=done`,
      cancel_url: `${this.webOrigin}/?billing=cancelled`,
      client_reference_id: uid,
      metadata: { uid, product },
      ...(product === 'plus' ? { subscription_data: { metadata: { uid } } } : {}),
      allow_promotion_codes: true,
      locale: 'ja',
    });
    if (!session.url) throw new HttpsError('internal', 'Stripe returned no Checkout URL.');
    return { url: session.url };
  }

  async portal(uid: string): Promise<{ url: string }> {
    const data = (await this.entitlement(uid).get()).data();
    if (!data?.stripeCustomerId) throw new HttpsError('failed-precondition', 'No billing account yet.');
    const session = await this.stripe.billingPortal.sessions.create({ customer: data.stripeCustomerId, return_url: `${this.webOrigin}/` });
    return { url: session.url };
  }

  /** Verifies and applies one webhook delivery; every grant is keyed by the Stripe object id, so retries are harmless. */
  async webhook(payload: Buffer, signature: string | undefined, secret: string): Promise<{ handled: string }> {
    if (!signature) throw new HttpsError('unauthenticated', 'Missing Stripe signature.');
    let event: Stripe.Event;
    try { event = this.stripe.webhooks.constructEvent(payload, signature, secret); }
    catch { throw new HttpsError('unauthenticated', 'Invalid Stripe signature.'); }
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const uid = session.metadata?.uid ?? session.client_reference_id;
        if (!uid || !ID.test(uid) || session.metadata?.product !== 'pack' || session.payment_status !== 'paid') break;
        await this.credits.grant(uid, this.catalog.pack.credits, 'pack', session.id);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const uid = await this.uidOf(invoice.customer, invoice.parent?.subscription_details?.metadata?.uid);
        if (!uid) break;
        const periodEnd = invoice.lines.data.reduce((end, line) => Math.max(end, line.period?.end ?? 0), 0);
        await this.credits.grant(uid, this.catalog.plus.credits, 'subscription', invoice.id, 'plus');
        await this.entitlement(uid).set({ plan: 'plus', status: 'active', currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const uid = await this.uidOf(subscription.customer, subscription.metadata?.uid);
        if (!uid) break;
        const active = event.type === 'customer.subscription.updated' && ['active', 'trialing', 'past_due'].includes(subscription.status);
        await this.entitlement(uid).set({ plan: active ? 'plus' : 'free', status: subscription.status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        // Granted credits stay spendable after a plan ends; only the monthly allowance stops.
        await this.credits.setPlan(uid, active ? 'plus' : 'free');
        break;
      }
      default: break;
    }
    return { handled: event.type };
  }

  private async customer(uid: string, email: string | undefined): Promise<string> {
    const ref = this.entitlement(uid);
    const existing = (await ref.get()).data()?.stripeCustomerId;
    if (typeof existing === 'string') return existing;
    const created = await this.stripe.customers.create({ email, metadata: { uid } });
    await ref.set({ stripeCustomerId: created.id, plan: 'free', status: 'none', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return created.id;
  }

  /** The account behind a Stripe customer: its metadata first, then the entitlement that remembered the customer. */
  private async uidOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null, hinted: string | undefined): Promise<string | null> {
    if (hinted && ID.test(hinted)) return hinted;
    const id = typeof customer === 'string' ? customer : customer?.id;
    if (!id) return null;
    const match = await this.db.collection('entitlements').where('stripeCustomerId', '==', id).limit(1).get();
    return match.empty ? null : match.docs[0].id;
  }
}
