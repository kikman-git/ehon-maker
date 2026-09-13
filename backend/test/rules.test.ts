import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

let env: RulesTestEnvironment;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-ehon-rules', firestore: { rules: await readFile('firestore.rules', 'utf8') } }); });
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { await env.cleanup(); });
const user = (uid = 'alice', provider = 'apple.com') => env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }).firestore();
const book = (ownerId = 'alice') => ({ ownerId, meta: '{}', pageIds: ['p1'], pageHashes: { p1: 'hash' }, revision: 1, lease: null, deleted: false, updatedAt: serverTimestamp() });
async function createBook() {
  const db = user(); const batch = writeBatch(db);
  batch.set(doc(db, 'books/b1'), book());
  batch.set(doc(db, 'books/b1/pages/p1'), { ownerId: 'alice', json: '{}', updatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  return db;
}

test('anonymous users can only write their own bounded session counters', async () => {
  const db = user('anon', 'anonymous');
  await assertSucceeds(setDoc(doc(db, 'sessions/anon'), { count: 1, parts: {}, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'sessions/alice'), { count: 1, parts: {}, updatedAt: serverTimestamp() }));
  for (const path of ['books/b1', 'users/anon', 'workspaces/b1', 'illustrations/i1', 'packs/p1', 'jobs/j1', 'reports/r1']) {
    await assertFails(setDoc(doc(db, path), book('anon')));
  }
  await assertFails(setDoc(doc(db, 'sessions/anon'), { count: -1, parts: {}, updatedAt: serverTimestamp() }));
});

test('only the owner can read books and pages; shelf queries must be constrained', async () => {
  const db = await createBook();
  await assertSucceeds(getDoc(doc(db, 'books/b1/pages/p1')));
  await assertSucceeds(getDocs(query(collection(db, 'books'), where('ownerId', '==', 'alice'), where('deleted', '==', false))));
  await assertFails(getDocs(collection(db, 'books')));
  for (const other of [user('bob', 'google.com'), user('alice', 'anonymous'), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(other, 'books/b1')));
    await assertFails(getDoc(doc(other, 'books/b1/pages/p1')));
  }
});

test('page changes need the same atomic book revision; stale writes fail', async () => {
  const db = await createBook();
  const page = { ownerId: 'alice', json: '{"edited":true}', updatedAt: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'books/b1/pages/p1'), page));
  const batch = writeBatch(db);
  batch.update(doc(db, 'books/b1'), { revision: 2, updatedAt: serverTimestamp(), pageHashes: { p1: 'changed' } });
  batch.set(doc(db, 'books/b1/pages/p1'), page);
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(doc(db, 'books/b1'), { revision: 2, meta: 'stale', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'books/b1'), { revision: 3, updatedAt: Timestamp.fromMillis(1) }));
  await assertFails(updateDoc(doc(db, 'books/b1'), { ownerId: 'bob', revision: 3, updatedAt: serverTimestamp() }));
});

test('manifest, page size and leases are bounded; deletion cannot be undone by a stale device', async () => {
  const db = await createBook();
  await assertFails(updateDoc(doc(db, 'books/b1'), { pageIds: ['p1', 'p1'], revision: 2, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'books/b1'), { pageHashes: {}, revision: 2, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, 'books/b1'), { lease: { deviceId: 'phone', expiresAt: Timestamp.fromMillis(Date.now() + 120_000) } }));
  await assertFails(updateDoc(doc(db, 'books/b1'), { lease: { deviceId: 'phone', expiresAt: Timestamp.fromMillis(Date.now() + 900_000) } }));
  const batch = writeBatch(db);
  batch.update(doc(db, 'books/b1'), { revision: 2, updatedAt: serverTimestamp() });
  batch.update(doc(db, 'books/b1/pages/p1'), { json: 'a'.repeat(900_001), updatedAt: serverTimestamp() });
  await assertFails(batch.commit());
  await assertSucceeds(updateDoc(doc(db, 'books/b1'), { deleted: true, revision: 2, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'books/b1'), { deleted: false, revision: 3, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db, 'books/b1')));
});

test('assets and entitlements are server-owned; public assets are readable', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'assets/hash'), { w: 12 });
    await setDoc(doc(ctx.firestore(), 'entitlements/alice'), { plan: 'free' });
  });
  const db = user();
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'assets/hash')));
  await assertSucceeds(getDoc(doc(db, 'entitlements/alice')));
  await assertFails(getDoc(doc(user('bob'), 'entitlements/alice')));
  for (const path of ['assets/hash', 'entitlements/alice', 'storageUsage/alice', 'users/alice/blobs/hash', 'config/flags', 'uploadReceipts/id']) {
    await assertFails(setDoc(doc(db, path), { ownerId: 'alice', plan: 'paid' }));
  }
});

test('illustrations require finalized masters and owned source prefixes', async () => {
  const hash = 'a'.repeat(64); const db = user();
  const illustration = { ownerId: 'alice', title: 'cat', masterRef: `a/${hash}`, w: 20, h: 30, origin: 'upload', aiAssisted: false, deleted: false, updatedAt: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'illustrations/i1'), illustration));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), `assets/${hash}`), { w: 20, h: 30 }));
  await assertSucceeds(setDoc(doc(db, 'illustrations/i1'), illustration));
  await assertFails(updateDoc(doc(db, 'illustrations/i1'), { sourceRef: 's/bob/i1/1.zip', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'illustrations/i1'), { w: 3000, updatedAt: serverTimestamp() }));
});

test('only approved packs are public; clients cannot self-approve or inflate installs', async () => {
  const db = user();
  await assertSucceeds(setDoc(doc(db, 'packs/p1'), { ownerId: 'alice', status: 'draft', price: 0, installs: 0 }));
  await assertFails(getDoc(doc(user('bob'), 'packs/p1')));
  await assertFails(updateDoc(doc(db, 'packs/p1'), { status: 'approved' }));
  await assertFails(updateDoc(doc(db, 'packs/p1'), { installs: 100 }));
});

test('a workspace belongs to an existing book of the same owner and stays bounded', async () => {
  const db = await createBook();
  const scratch = { ownerId: 'alice', scratch: [{ id: 's1', partId: 'lib:i1', x: 10, y: 20, w: 220 }], updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db, 'workspaces/b1'), scratch));
  await assertSucceeds(getDoc(doc(db, 'workspaces/b1')));
  await assertFails(setDoc(doc(db, 'workspaces/b2'), scratch));
  await assertFails(setDoc(doc(user('bob', 'google.com'), 'workspaces/b1'), { ...scratch, ownerId: 'bob' }));
  await assertFails(getDoc(doc(user('bob', 'google.com'), 'workspaces/b1')));
  await assertFails(setDoc(doc(db, 'workspaces/b1'), { ...scratch, extra: true }));
  await assertFails(setDoc(doc(db, 'workspaces/b1'), { ...scratch, scratch: Array.from({ length: 201 }, (_, i) => ({ id: String(i) })) }));
  await assertFails(setDoc(doc(db, 'workspaces/b1'), { ...scratch, updatedAt: Timestamp.fromMillis(1) }));
});
