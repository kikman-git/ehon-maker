import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

// Credits (decision #66): AI is priced by the model's tokens, 1 credit = US$0.01 of model cost, rounded up per turn.

export const CREDITS_PER_USD = 100;
export const WELCOME_CREDITS = 100;
/** Held before a turn so a crash never gives a free one; the actual cost settles it. */
export const TURN_HOLD = 30;
/** The least a turn may start with, so a near-empty balance still gets small edits. */
export const MIN_TURN_CREDITS = 3;

export interface TokenUsage { input: number; output: number; cacheRead: number; cacheWrite: number }

/** US$ per million tokens, from the published Claude API rates. */
export interface Prices { input: number; output: number; cacheRead: number; cacheWrite: number }
export const PRICES: Record<string, Prices> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export function usdFor(model: string, usage: TokenUsage): number {
  const price = PRICES[model] ?? PRICES['claude-opus-5-5'];
  return (usage.input * price.input + usage.output * price.output + usage.cacheRead * price.cacheRead + usage.cacheWrite * price.cacheWrite) / 1e6;
}

/** Never free: a turn that reached the model costs at least one credit. */
export const creditsFor = (model: string, usage: TokenUsage): number => Math.max(1, Math.ceil(usdFor(model, usage) * CREDITS_PER_USD));

export type Plan = 'free' | 'plus';
export interface Balance { balance: number; reserved: number; granted: number; spent: number; plan: Plan }
export type GrantKind = 'welcome' | 'subscription' | 'pack' | 'adjust';

const ID = /^[A-Za-z0-9_-]{1,120}$/;

export class CreditService {
  constructor(private readonly db: Firestore, private readonly welcome = WELCOME_CREDITS) {}

  private account(uid: string) { return this.db.doc(`credits/${uid}`); }
  private ledger(uid: string, id: string) { return this.account(uid).collection('ledger').doc(id); }

  /** The account, created with the welcome grant on first touch so the first AI turn needs no sign-up step. */
  async ensure(uid: string): Promise<Balance> {
    return this.db.runTransaction(async tx => {
      const existing = await tx.get(this.account(uid));
      if (existing.exists) return read(existing.data()!);
      const fresh: Balance = { balance: this.welcome, reserved: 0, granted: this.welcome, spent: 0, plan: 'free' };
      tx.set(this.account(uid), { ...fresh, updatedAt: FieldValue.serverTimestamp() });
      tx.set(this.ledger(uid, 'welcome'), { kind: 'welcome', delta: this.welcome, createdAt: FieldValue.serverTimestamp() });
      return fresh;
    });
  }

  /**
   * Takes a hold for one turn, or refuses with `resource-exhausted` when the balance cannot cover a small one.
   * A thin balance is held whole, so the last credits are still usable.
   */
  async reserve(uid: string, feature: string): Promise<{ id: string; hold: number }> {
    return this.db.runTransaction(async tx => {
      const account = await this.loaded(tx, uid);
      if (account.balance < MIN_TURN_CREDITS) throw new HttpsError('resource-exhausted', 'Not enough credits.', { balance: account.balance });
      const hold = Math.min(TURN_HOLD, account.balance);
      const entry = this.account(uid).collection('ledger').doc();
      tx.update(this.account(uid), { balance: FieldValue.increment(-hold), reserved: FieldValue.increment(hold), updatedAt: FieldValue.serverTimestamp() });
      tx.set(entry, { kind: 'turn', feature, status: 'reserved', hold, delta: 0, createdAt: FieldValue.serverTimestamp() });
      return { id: entry.id, hold };
    });
  }

  /** Charges the turn's real cost against its hold; the balance never drops below zero for one overrunning turn. */
  async settle(uid: string, id: string, charge: { model: string; usage: TokenUsage }): Promise<{ credits: number; balance: number }> {
    const credits = creditsFor(charge.model, charge.usage);
    return this.db.runTransaction(async tx => {
      const entry = await tx.get(this.ledger(uid, id));
      const hold = reservedHold(entry.data());
      const account = await this.loaded(tx, uid);
      const charged = Math.min(credits, hold + account.balance);
      const balance = account.balance + hold - charged;
      tx.update(this.account(uid), { balance, reserved: FieldValue.increment(-hold), spent: FieldValue.increment(charged), updatedAt: FieldValue.serverTimestamp() });
      tx.update(this.ledger(uid, id), { status: 'spent', delta: -charged, credits, model: charge.model, usage: charge.usage, settledAt: FieldValue.serverTimestamp() });
      return { credits: charged, balance };
    });
  }

  /** Returns the hold of a turn that never reached a result. */
  async release(uid: string, id: string): Promise<void> {
    await this.db.runTransaction(async tx => {
      const entry = await tx.get(this.ledger(uid, id));
      const hold = reservedHold(entry.data());
      tx.update(this.account(uid), { balance: FieldValue.increment(hold), reserved: FieldValue.increment(-hold), updatedAt: FieldValue.serverTimestamp() });
      tx.update(this.ledger(uid, id), { status: 'released', settledAt: FieldValue.serverTimestamp() });
    });
  }

  /** Adds credits once per `ref` (a Stripe invoice or session id), so a replayed webhook grants nothing twice. */
  async grant(uid: string, credits: number, kind: GrantKind, ref: string, plan?: Plan): Promise<boolean> {
    if (!Number.isInteger(credits) || credits <= 0 || credits > 1_000_000) throw new HttpsError('invalid-argument', 'Invalid credit grant.');
    if (!ID.test(ref)) throw new HttpsError('invalid-argument', 'Invalid grant reference.');
    await this.ensure(uid);
    return this.db.runTransaction(async tx => {
      const entry = this.ledger(uid, `${kind}-${ref}`);
      if ((await tx.get(entry)).exists) return false;
      tx.update(this.account(uid), { balance: FieldValue.increment(credits), granted: FieldValue.increment(credits), ...(plan ? { plan } : {}), updatedAt: FieldValue.serverTimestamp() });
      tx.set(entry, { kind, delta: credits, ref, createdAt: FieldValue.serverTimestamp() });
      return true;
    });
  }

  async setPlan(uid: string, plan: Plan): Promise<void> {
    await this.ensure(uid);
    await this.account(uid).update({ plan, updatedAt: FieldValue.serverTimestamp() });
  }

  private async loaded(tx: Transaction, uid: string): Promise<Balance> {
    const snapshot = await tx.get(this.account(uid));
    if (!snapshot.exists) throw new HttpsError('failed-precondition', 'No credit account.');
    return read(snapshot.data()!);
  }
}

function read(data: FirebaseFirestore.DocumentData): Balance {
  return { balance: data.balance ?? 0, reserved: data.reserved ?? 0, granted: data.granted ?? 0, spent: data.spent ?? 0, plan: data.plan === 'plus' ? 'plus' : 'free' };
}

function reservedHold(entry: FirebaseFirestore.DocumentData | undefined): number {
  if (!entry || entry.kind !== 'turn' || entry.status !== 'reserved') throw new HttpsError('failed-precondition', 'No open reservation.');
  return entry.hold as number;
}
