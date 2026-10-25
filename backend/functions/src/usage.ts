import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { type TokenUsage } from './credits';

// Observability for the AI (decision #68): one record per turn, a daily rollup the admin page reads in one go, and the guards that watch model spend.

export const DEFAULT_DAILY_USD_CAP = 50;
export const DEFAULT_TURNS_PER_HOUR = 30;
const HOUR_MS = 3_600_000;

export interface TurnRecord {
  uid: string;
  task: string;
  model: string;
  rounds: number;
  drawings: number;
  usage: TokenUsage;
  usd: number;
  credits: number;
  durationMs: number;
  status: 'ok' | 'refusal' | 'error';
  error?: string;
}

export interface Guards { aiEnabled: boolean; dailyUsdCap: number; turnsPerHour: number }

/** The calendar day in Tokyo, where the family and the bills live. */
export const dayKey = (now = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(now));
const mapKey = (value: string) => value.replace(/[.~*/[\]]/g, '_');

export class UsageService {
  constructor(private readonly db: Firestore) {}

  async guards(): Promise<Guards> {
    const data = (await this.db.doc('config/flags').get()).data() ?? {};
    const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback);
    return { aiEnabled: data.aiEnabled !== false, dailyUsdCap: num(data.aiDailyUsdCap, DEFAULT_DAILY_USD_CAP), turnsPerHour: num(data.aiTurnsPerHour, DEFAULT_TURNS_PER_HOUR) };
  }

  /** Refuses a turn once today's model spend reached the cap; the GCP budget cannot see the providers' bills. */
  async checkDailyCap(cap: number, now = Date.now()): Promise<void> {
    if (cap <= 0) return;
    const today = (await this.db.doc(`aiDaily/${dayKey(now)}`).get()).data();
    if ((today?.usd ?? 0) >= cap) {
      logger.warn('ai.cap', { day: dayKey(now), usd: today?.usd, cap });
      throw new HttpsError('unavailable', 'AI has reached today\'s budget.', { reason: 'cap' });
    }
  }

  /** A sliding hour per account, so a runaway client cannot drain an allowance in minutes. */
  async checkRate(uid: string, perHour: number, now = Date.now()): Promise<void> {
    if (perHour <= 0) return;
    const ref = this.db.doc(`aiRate/${uid}`);
    await this.db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      const fresh = !data || typeof data.windowStart !== 'number' || now - data.windowStart >= HOUR_MS;
      const count = fresh ? 0 : Number(data.count ?? 0);
      if (count >= perHour) throw new HttpsError('unavailable', 'Too many turns in an hour; rest a little.', { reason: 'rate' });
      tx.set(ref, { windowStart: fresh ? now : data!.windowStart, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
    });
  }

  /** Writes the turn and folds it into the day; a failure here must never fail a turn the user already paid for. */
  async record(record: TurnRecord, now = Date.now()): Promise<void> {
    const day = dayKey(now);
    const failed = record.status === 'error' ? 1 : 0;
    try {
      const batch = this.db.batch();
      batch.set(this.db.collection('aiTurns').doc(), { ...record, day, createdAt: Timestamp.fromMillis(now) });
      batch.set(this.db.doc(`aiDaily/${day}`), {
        day, turns: FieldValue.increment(1), errors: FieldValue.increment(failed), refusals: FieldValue.increment(record.status === 'refusal' ? 1 : 0),
        usd: FieldValue.increment(record.usd), credits: FieldValue.increment(record.credits), drawings: FieldValue.increment(record.drawings),
        tokensIn: FieldValue.increment(record.usage.input + record.usage.cacheRead + record.usage.cacheWrite), tokensOut: FieldValue.increment(record.usage.output),
        durationMs: FieldValue.increment(record.durationMs),
        byTask: { [mapKey(record.task)]: { turns: FieldValue.increment(1), usd: FieldValue.increment(record.usd), credits: FieldValue.increment(record.credits), errors: FieldValue.increment(failed) } },
        byModel: { [mapKey(record.model || 'unknown')]: { turns: FieldValue.increment(1), usd: FieldValue.increment(record.usd) } },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await batch.commit();
    } catch (error) {
      logger.error('ai.record', { error: error instanceof Error ? error.message : String(error), record });
    }
    (record.status === 'error' ? logger.warn : logger.info)('ai.turn', { ...record, day });
  }
}

/** Holds a crashed turn never settled or released: returned to their accounts and marked, so the ledger stays honest. */
export async function releaseStaleHolds(db: Firestore, now = Date.now(), maxAgeMs = HOUR_MS): Promise<number> {
  const stale = await db.collectionGroup('ledger').where('status', '==', 'reserved').where('createdAt', '<', Timestamp.fromMillis(now - maxAgeMs)).limit(200).get();
  let released = 0;
  for (const entry of stale.docs) {
    const account = entry.ref.parent.parent;
    if (!account) continue;
    await db.runTransaction(async tx => {
      const current = (await tx.get(entry.ref)).data();
      if (current?.status !== 'reserved') return;
      const hold = Number(current.hold ?? 0);
      tx.update(account, { balance: FieldValue.increment(hold), reserved: FieldValue.increment(-hold), updatedAt: FieldValue.serverTimestamp() });
      tx.update(entry.ref, { status: 'released', stale: true, settledAt: FieldValue.serverTimestamp() });
      released++;
    });
  }
  if (released) logger.warn('ai.staleHolds', { released });
  return released;
}

/** Admin actions on one account, after the caller was found in `config/admins`. */
export async function isAdmin(db: Firestore, uid: string): Promise<boolean> {
  const data = (await db.doc('config/admins').get()).data();
  return Array.isArray(data?.uids) && data!.uids.includes(uid);
}
