import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { CreditService, creditsFor, MIN_TURN_CREDITS, TURN_HOLD, usdFor, WELCOME_CREDITS } from '../functions/src/credits.ts';

const app = initializeApp({ projectId: 'demo-ehon-credits' }, 'credits-tests');
const db = getFirestore(app);
const service = new CreditService(db);
const usage = { input: 10_000, output: 2_000, cacheRead: 0, cacheWrite: 0 };

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ehon-credits/databases/(default)/documents`, { method: 'DELETE' });
});
after(async () => { await db.terminate(); await deleteApp(app); });

const account = async (uid = 'alice') => (await db.doc(`credits/${uid}`).get()).data()!;
const ledger = async (uid = 'alice') => (await db.collection(`credits/${uid}/ledger`).get()).docs.map(d => ({ id: d.id, ...d.data() })) as Record<string, unknown>[];

test('a turn is priced from the model tokens at one credit per cent, never free', () => {
  assert.equal(usdFor('claude-opus-5-5', usage), 0.08);
  assert.equal(creditsFor('claude-opus-5-5', usage), 8);
  assert.equal(creditsFor('claude-opus-5-5', { input: 1_000, output: 100, cacheRead: 8_000, cacheWrite: 0 }), 1);
  assert.equal(creditsFor('claude-opus-5-5', { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }), 1);
  assert.equal(creditsFor('claude-haiku-5-5', usage), 1);
  assert.equal(creditsFor('unknown-model', usage), 8);
});

test('the first touch grants the welcome credits once, and a turn holds, settles and shows in the ledger', async () => {
  assert.deepEqual(await service.ensure('alice'), { balance: WELCOME_CREDITS, reserved: 0, granted: WELCOME_CREDITS, spent: 0, plan: 'free' });
  assert.equal((await service.ensure('alice')).granted, WELCOME_CREDITS);
  const { id, hold } = await service.reserve('alice', 'atelier');
  assert.equal(hold, TURN_HOLD);
  assert.equal((await account()).balance, WELCOME_CREDITS - TURN_HOLD);
  const settled = await service.settle('alice', id, { model: 'claude-opus-5-5', usage });
  assert.deepEqual(settled, { credits: 8, balance: WELCOME_CREDITS - 8 });
  const after = await account();
  assert.equal(after.reserved, 0); assert.equal(after.spent, 8);
  const entries = await ledger();
  assert.equal(entries.length, 2);
  const turn = entries.find(e => e.kind === 'turn')!;
  assert.equal(turn.status, 'spent'); assert.equal(turn.delta, -8); assert.deepEqual(turn.usage, usage);
  await assert.rejects(service.settle('alice', id, { model: 'claude-opus-5-5', usage }), { code: 'failed-precondition' });
});

test('a failed turn gives its hold back; an empty account is refused and a thin one is held whole', async () => {
  await service.ensure('alice');
  const { id } = await service.reserve('alice', 'atelier');
  await service.release('alice', id);
  assert.equal((await account()).balance, WELCOME_CREDITS);
  assert.equal((await ledger()).find(e => e.kind === 'turn')!.status, 'released');
  await db.doc('credits/alice').update({ balance: 5 });
  const thin = await service.reserve('alice', 'atelier');
  assert.equal(thin.hold, 5);
  const settled = await service.settle('alice', thin.id, { model: 'claude-opus-5-5', usage: { input: 100_000, output: 20_000, cacheRead: 0, cacheWrite: 0 } });
  assert.deepEqual(settled, { credits: 5, balance: 0 });
  await assert.rejects(service.reserve('alice', 'atelier'), (error: { code: string; details: { balance: number } }) => error.code === 'resource-exhausted' && error.details.balance === 0);
  await db.doc('credits/alice').update({ balance: MIN_TURN_CREDITS - 1 });
  await assert.rejects(service.reserve('alice', 'atelier'), { code: 'resource-exhausted' });
});

test('grants are idempotent by reference and may move the plan', async () => {
  assert.equal(await service.grant('alice', 1500, 'subscription', 'in_1', 'plus'), true);
  assert.equal(await service.grant('alice', 1500, 'subscription', 'in_1', 'plus'), false);
  assert.equal(await service.grant('alice', 600, 'pack', 'cs_1'), true);
  const data = await account();
  assert.equal(data.balance, WELCOME_CREDITS + 2100); assert.equal(data.plan, 'plus'); assert.equal(data.granted, WELCOME_CREDITS + 2100);
  await service.setPlan('alice', 'free');
  assert.equal((await account()).plan, 'free');
  await assert.rejects(service.grant('alice', 0, 'pack', 'cs_2'), { code: 'invalid-argument' });
  await assert.rejects(service.grant('alice', 10, 'pack', 'bad ref!'), { code: 'invalid-argument' });
});
