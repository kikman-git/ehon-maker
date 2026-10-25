import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { AtelierService } from '../functions/src/atelier.ts';
import { CreditService, WELCOME_CREDITS } from '../functions/src/credits.ts';
import { FakeModel } from '../functions/src/fake.ts';
import { cleanupJobs } from '../functions/src/maintenance.ts';
import { dayKey, isAdmin, releaseStaleHolds, UsageService } from '../functions/src/usage.ts';

const app = initializeApp({ projectId: 'demo-ehon-usage' }, 'usage-tests');
const db = getFirestore(app);
const credits = new CreditService(db);
const usage = new UsageService(db);
const send = async () => {};

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ehon-usage/databases/(default)/documents`, { method: 'DELETE' });
});
after(async () => { await db.terminate(); await deleteApp(app); });

test('every turn leaves a record and folds into the Tokyo day, errors included', async () => {
  const service = new AtelierService(db, credits, new FakeModel());
  await service.turn('alice', { title: 'くま', request: 'ぼうしの くま', mode: 'new', bookArt: [] }, send);
  await service.turn('alice', { title: 'くま', request: 'unsafe thing', mode: 'new', bookArt: [] }, send);
  class Failing { id = 'claude-opus-5-5'; async reply() { throw new Error('boom'); } }
  await assert.rejects(new AtelierService(db, credits, new Failing()).turn('alice', { request: 'くま', bookArt: [] }, send));
  const turns = (await db.collection('aiTurns').orderBy('createdAt').get()).docs.map(doc => doc.data());
  assert.deepEqual(turns.map(turn => turn.status), ['ok', 'ok', 'error']);
  assert.equal(turns[0].task, 'atelier'); assert.equal(turns[0].credits, 6); assert.equal(turns[0].rounds, 1); assert.ok(turns[0].usd > 0.05 && turns[0].usd < 0.06);
  assert.equal(turns[2].credits, 0); assert.match(turns[2].error as string, /boom/);
  const day = (await db.doc(`aiDaily/${dayKey()}`).get()).data()!;
  assert.equal(day.turns, 3); assert.equal(day.errors, 1); assert.equal(day.credits, 12);
  assert.equal(day.byTask.atelier.turns, 3); assert.equal(day.byModel['claude-opus-5-5'].turns, 3);
  assert.ok(day.tokensIn > 0 && day.durationMs >= 0);
  assert.match(dayKey(Date.UTC(2026, 0, 1, 20)), /^2026-01-02$/);
});

test('the daily cap and the hourly rate limit refuse a turn before it costs anything', async () => {
  const service = new AtelierService(db, credits, new FakeModel());
  await db.doc('config/flags').set({ aiTurnsPerHour: 2 });
  await service.turn('bob', { request: 'くま', bookArt: [] }, send);
  await service.turn('bob', { request: 'くま', bookArt: [] }, send);
  await assert.rejects(service.turn('bob', { request: 'くま', bookArt: [] }, send), (error: { code: string; details?: { reason?: string } }) => error.code === 'unavailable' && error.details?.reason === 'rate');
  await assert.doesNotReject(service.turn('carol', { request: 'くま', bookArt: [] }, send));
  await db.doc('config/flags').set({ aiTurnsPerHour: 0, aiDailyUsdCap: 0.1 });
  await assert.rejects(service.turn('carol', { request: 'くま', bookArt: [] }, send), (error: { code: string; details?: { reason?: string } }) => error.code === 'unavailable' && error.details?.reason === 'cap');
  const carol = (await db.doc('credits/carol').get()).data()!;
  assert.equal(carol.balance, WELCOME_CREDITS - 6); assert.equal(carol.reserved, 0);
  await usage.checkRate('dave', 1, Date.UTC(2026, 0, 1));
  await assert.doesNotReject(usage.checkRate('dave', 1, Date.UTC(2026, 0, 1, 1, 0, 1)), 'a new hour starts a new window');
});

test('holds a crashed turn left behind go back to the account on the nightly cleanup', async () => {
  await credits.ensure('erin');
  const fresh = await credits.reserve('erin', 'book', 30);
  const old = await credits.reserve('erin', 'book', 20);
  await db.doc(`credits/erin/ledger/${old.id}`).update({ createdAt: Timestamp.fromMillis(Date.now() - 2 * 3_600_000) });
  assert.equal(await releaseStaleHolds(db), 1);
  const account = (await db.doc('credits/erin').get()).data()!;
  assert.equal(account.balance, WELCOME_CREDITS - 30); assert.equal(account.reserved, 30);
  assert.equal((await db.doc(`credits/erin/ledger/${old.id}`).get()).data()!.status, 'released');
  assert.equal((await db.doc(`credits/erin/ledger/${fresh.id}`).get()).data()!.status, 'reserved');
  await db.doc(`credits/erin/ledger/${fresh.id}`).update({ createdAt: Timestamp.fromMillis(Date.now() - 2 * 3_600_000) });
  assert.equal(await cleanupJobs(db), 1);
  assert.equal((await db.doc('credits/erin').get()).data()!.reserved, 0);
});

test('admins are the uids in config/admins', async () => {
  assert.equal(await isAdmin(db, 'alice'), false);
  await db.doc('config/admins').set({ uids: FieldValue.arrayUnion('alice') });
  assert.equal(await isAdmin(db, 'alice'), true);
  assert.equal(await isAdmin(db, 'bob'), false);
});
