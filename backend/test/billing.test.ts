import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { BillingService, type StripeLike } from '../functions/src/billing.ts';
import { CreditService, WELCOME_CREDITS } from '../functions/src/credits.ts';

const app = initializeApp({ projectId: 'demo-ehon-billing' }, 'billing-tests');
const db = getFirestore(app);
const credits = new CreditService(db);
const catalog = { plus: { priceId: 'price_plus', credits: 1500 }, pack: { priceId: 'price_pack', credits: 600 } };
const SECRET = 'whsec_test';

/** Records what the service asked of Stripe and signs webhook payloads the way Stripe does. */
class FakeStripe implements StripeLike {
  customersCreated = 0; sessions: Stripe.Checkout.SessionCreateParams[] = []; portals = 0;
  customers = { create: async () => { this.customersCreated++; return { id: `cus_${this.customersCreated}` }; } };
  checkout = { sessions: { create: async (params: Stripe.Checkout.SessionCreateParams) => { this.sessions.push(params); return { url: `https://checkout.stripe.test/${params.mode}` }; } } };
  billingPortal = { sessions: { create: async () => { this.portals++; return { url: 'https://portal.stripe.test' }; } } };
  webhooks = { constructEvent: (payload: string | Buffer, signature: string, secret: string) => Stripe.webhooks.constructEvent(payload, signature, secret) };
}
const signed = (event: object) => { const payload = JSON.stringify(event); return { payload: Buffer.from(payload), signature: Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }; };
const event = (type: string, object: object) => ({ id: `evt_${type}`, object: 'event', type, data: { object }, api_version: '2026-01-01', created: 1, livemode: false, pending_webhooks: 0, request: null });

let stripe: FakeStripe; let service: BillingService;
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ehon-billing/databases/(default)/documents`, { method: 'DELETE' });
  stripe = new FakeStripe(); service = new BillingService(db, stripe, credits, catalog, 'https://petapeta.test');
});
after(async () => { await db.terminate(); await deleteApp(app); });

test('checkout creates one Stripe customer per account and names the product; the portal needs that customer', async () => {
  await assert.rejects(service.portal('alice'), { code: 'failed-precondition' });
  await assert.rejects(service.checkout('alice', 'a@example.invalid', 'gold'), { code: 'invalid-argument' });
  assert.deepEqual(await service.checkout('alice', 'a@example.invalid', 'plus'), { url: 'https://checkout.stripe.test/subscription' });
  assert.deepEqual(await service.checkout('alice', 'a@example.invalid', 'pack'), { url: 'https://checkout.stripe.test/payment' });
  assert.equal(stripe.customersCreated, 1);
  assert.equal(stripe.sessions[0].customer, 'cus_1'); assert.equal(stripe.sessions[0].metadata?.product, 'plus'); assert.equal(stripe.sessions[0].client_reference_id, 'alice');
  assert.equal(stripe.sessions[1].mode, 'payment'); assert.equal(stripe.sessions[1].line_items?.[0].price, 'price_pack');
  assert.equal((await db.doc('entitlements/alice').get()).data()!.stripeCustomerId, 'cus_1');
  assert.deepEqual(await service.portal('alice'), { url: 'https://portal.stripe.test' });
  const unconfigured = new BillingService(db, stripe, credits, { ...catalog, pack: { priceId: '', credits: 0 } }, 'https://petapeta.test');
  await assert.rejects(unconfigured.checkout('alice', undefined, 'pack'), { code: 'failed-precondition' });
});

test('webhooks must be signed; a paid pack and a paid invoice grant credits exactly once and set the plan', async () => {
  await assert.rejects(service.webhook(Buffer.from('{}'), undefined, SECRET), { code: 'unauthenticated' });
  await assert.rejects(service.webhook(Buffer.from('{}'), 't=1,v1=bad', SECRET), { code: 'unauthenticated' });

  const pack = signed(event('checkout.session.completed', { id: 'cs_1', object: 'checkout.session', payment_status: 'paid', client_reference_id: 'alice', metadata: { uid: 'alice', product: 'pack' } }));
  assert.deepEqual(await service.webhook(pack.payload, pack.signature, SECRET), { handled: 'checkout.session.completed' });
  await service.webhook(pack.payload, pack.signature, SECRET);
  assert.equal((await db.doc('credits/alice').get()).data()!.balance, WELCOME_CREDITS + 600);

  const subscriptionCheckout = signed(event('checkout.session.completed', { id: 'cs_2', object: 'checkout.session', payment_status: 'paid', metadata: { uid: 'alice', product: 'plus' } }));
  await service.webhook(subscriptionCheckout.payload, subscriptionCheckout.signature, SECRET);
  assert.equal((await db.doc('credits/alice').get()).data()!.balance, WELCOME_CREDITS + 600);

  await service.checkout('alice', 'a@example.invalid', 'plus');
  const invoice = signed(event('invoice.paid', { id: 'in_1', object: 'invoice', customer: 'cus_1', parent: { subscription_details: { metadata: {} } }, lines: { data: [{ period: { start: 1, end: 1_800_000_000 } }] } }));
  await service.webhook(invoice.payload, invoice.signature, SECRET);
  await service.webhook(invoice.payload, invoice.signature, SECRET);
  const account = (await db.doc('credits/alice').get()).data()!;
  assert.equal(account.balance, WELCOME_CREDITS + 600 + 1500); assert.equal(account.plan, 'plus');
  const entitlement = (await db.doc('entitlements/alice').get()).data()!;
  assert.equal(entitlement.plan, 'plus'); assert.equal(entitlement.status, 'active'); assert.equal(entitlement.currentPeriodEnd.toMillis(), 1_800_000_000_000);

  const ended = signed(event('customer.subscription.deleted', { id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'canceled', metadata: { uid: 'alice' } }));
  await service.webhook(ended.payload, ended.signature, SECRET);
  assert.equal((await db.doc('credits/alice').get()).data()!.plan, 'free');
  assert.equal((await db.doc('credits/alice').get()).data()!.balance, WELCOME_CREDITS + 2100);
  assert.equal((await db.doc('entitlements/alice').get()).data()!.plan, 'free');

  const unknown = signed(event('invoice.paid', { id: 'in_2', object: 'invoice', customer: 'cus_nobody', lines: { data: [] } }));
  assert.deepEqual(await service.webhook(unknown.payload, unknown.signature, SECRET), { handled: 'invoice.paid' });
  assert.equal((await db.collection('credits').get()).size, 1);
});
