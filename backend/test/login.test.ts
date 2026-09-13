import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { CODE, LoginService, MAX_CLIENT, REQUEST_ID, REQUEST_TTL_MS } from '../functions/src/login.ts';
import { cleanupJobs } from '../functions/src/maintenance.ts';

const app = initializeApp({ projectId: 'demo-ehon-login' }, 'login-tests');
const db = getFirestore(app);
let clock = 1_700_000_000_000;
const minted: string[] = [];
const service = new LoginService(db, async uid => { minted.push(uid); return `token-for-${uid}`; }, () => clock);

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ehon-login/databases/(default)/documents`, { method: 'DELETE' });
  minted.length = 0;
});
after(async () => { await db.terminate(); await deleteApp(app); });

test('the browser learns the account only after the app approves, and claims it exactly once', async () => {
  const started = await service.start('Chrome · Mac');
  assert.match(started.id, REQUEST_ID);
  assert.match(started.code, CODE);
  assert.equal(started.secret.length, 43);
  assert.equal(started.expiresAt, clock + REQUEST_TTL_MS);
  const stored = (await db.doc(`loginRequests/${started.id}`).get()).data()!;
  assert.equal(stored.status, 'pending');
  assert.ok(!Object.values(stored).includes(started.secret), 'the secret itself is never stored');

  assert.deepEqual(await service.claim(started.id, started.secret), { status: 'pending' });
  await assert.rejects(service.claim(started.id, 'x'.repeat(43)), { code: 'not-found' });
  await assert.rejects(service.claim('short', started.secret), { code: 'invalid-argument' });
  await assert.rejects(service.claim(started.id, 'short'), { code: 'invalid-argument' });
  assert.deepEqual(minted, []);

  // The phone may type the code in any case, with a space or a hyphen in the middle.
  const typed = `${started.code.slice(0, 3).toLowerCase()}-${started.code.slice(3)}`;
  assert.deepEqual(await service.approve('alice', { code: typed }), { client: 'Chrome · Mac' });
  await assert.rejects(service.approve('bob', { id: started.id }), { code: 'not-found' });
  await assert.rejects(service.approve('bob', { code: started.code }), { code: 'not-found' });

  assert.deepEqual(await service.claim(started.id, started.secret), { status: 'approved', token: 'token-for-alice' });
  assert.deepEqual(minted, ['alice']);
  await assert.rejects(service.claim(started.id, started.secret), { code: 'not-found' });
  assert.equal((await db.doc(`loginRequests/${started.id}`).get()).data()!.status, 'done');
});

test('requests expire, malformed or unknown codes are refused, and the cleanup job purges them', async () => {
  const started = await service.start(undefined);
  const noisy = await service.start(`  ${'x'.repeat(200)}`);
  assert.equal((await db.doc(`loginRequests/${noisy.id}`).get()).data()!.client.length, MAX_CLIENT);
  await assert.rejects(service.start(5), { code: 'invalid-argument' });
  await assert.rejects(service.approve('alice', { code: 'ZZZZZZ' }), { code: 'not-found' });
  await assert.rejects(service.approve('alice', { code: 'no' }), { code: 'invalid-argument' });
  await assert.rejects(service.approve('alice', { id: 'not-a-request-id' }), { code: 'invalid-argument' });
  await assert.rejects(service.approve('alice', {}), { code: 'invalid-argument' });

  clock += REQUEST_TTL_MS + 1;
  await assert.rejects(service.approve('alice', { id: started.id }), { code: 'not-found' });
  await assert.rejects(service.approve('alice', { code: started.code }), { code: 'not-found' });
  await assert.rejects(service.claim(started.id, started.secret), { code: 'not-found' });
  assert.equal(await cleanupJobs(db, clock), 2);
  assert.equal((await db.collection('loginRequests').get()).size, 0);
  assert.deepEqual(minted, []);
});
