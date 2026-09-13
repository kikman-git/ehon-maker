import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { MAX_ACTIVE_SHARES, ShareService } from '../functions/src/share.ts';

const app = initializeApp({ projectId: 'demo-ehon-shares' }, 'share-tests');
const db = getFirestore(app);
const service = new ShareService(db);
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const pageJson = (id: string, partId?: string) => JSON.stringify({ version: 3, page: { id, items: partId ? [{ type: 'part', partId: { value: partId } }] : [] } });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ehon-shares/databases/(default)/documents`, { method: 'DELETE' });
});
after(async () => { await db.terminate(); await deleteApp(app); });

async function book(id = 'b1', owner = 'alice', pages: Record<string, string> = { p1: pageJson('p1'), p2: pageJson('p2') }) {
  const batch = db.batch();
  const pageIds = Object.keys(pages);
  batch.set(db.doc(`books/${id}`), {
    ownerId: owner, meta: JSON.stringify({ version: 3, book: { id: { value: id }, title: 'Night', pages: [] } }), pageIds,
    pageHashes: Object.fromEntries(pageIds.map(p => [p, sha256(pages[p])])), revision: 1, lease: null, deleted: false, updatedAt: FieldValue.serverTimestamp(),
  });
  for (const p of pageIds) batch.set(db.doc(`books/${id}/pages/${p}`), { ownerId: owner, json: pages[p], updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
}

test('owners create links to their own live books only, within a bounded count', async () => {
  await book();
  await assert.rejects(service.create('bob', 'b1', ''), { code: 'permission-denied' });
  await assert.rejects(service.create('alice', 'missing', ''), { code: 'permission-denied' });
  await assert.rejects(service.create('alice', '../b1', ''), { code: 'invalid-argument' });
  await assert.rejects(service.create('alice', 'b1', 5), { code: 'invalid-argument' });
  const { token } = await service.create('alice', 'b1', ' ばあば '.padEnd(80, 'x'));
  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  const share = (await db.doc(`shares/${token}`).get()).data()!;
  assert.equal(share.ownerId, 'alice'); assert.equal(share.bookId, 'b1'); assert.equal(share.label.length, 40); assert.equal(share.revokedAt, null);
  for (let n = 1; n < MAX_ACTIVE_SHARES; n++) await service.create('alice', 'b1', `${n}`);
  await assert.rejects(service.create('alice', 'b1', 'one too many'), { code: 'resource-exhausted' });
  await db.doc('books/b1').update({ deleted: true });
  await assert.rejects(service.create('alice', 'b1', ''), { code: 'permission-denied' });
});

test('a guest reads a consistent snapshot until the link is revoked', async () => {
  await book();
  const { token } = await service.create('alice', 'b1', 'grandma');
  const guest = (await service.guestBook(token))!;
  assert.equal(guest.title, 'Night');
  assert.deepEqual(guest.pages, [pageJson('p1'), pageJson('p2')]);
  assert.deepEqual(guest.parts, []);
  assert.ok(guest.updatedAt > 0);
  assert.equal(await service.guestBook('nope'), null);
  assert.equal(await service.guestBook(token.slice(0, 31) + (token.endsWith('A') ? 'B' : 'A')), null);
  await assert.rejects(service.revoke('bob', token), { code: 'permission-denied' });
  assert.deepEqual(await service.revoke('alice', token), { revoked: true });
  assert.deepEqual(await service.revoke('alice', token), { revoked: false });
  assert.equal(await service.guestBook(token), null);
  await assert.rejects(service.revoke('alice', 'short'), { code: 'invalid-argument' });
});

test('torn writes, deleted books and foreign illustrations are never served', async () => {
  await book('b2', 'alice', { p1: pageJson('p1', 'lib:cat'), p2: pageJson('p2', 'lib:stolen') });
  await db.doc('illustrations/cat').set({ ownerId: 'alice', masterRef: `a/${'a'.repeat(64)}`, w: 1024, h: 768, deleted: false });
  await db.doc('illustrations/stolen').set({ ownerId: 'bob', masterRef: `a/${'b'.repeat(64)}`, w: 10, h: 10, deleted: false });
  const { token } = await service.create('alice', 'b2', '');
  const guest = (await service.guestBook(token))!;
  assert.deepEqual(guest.parts, [{ partId: 'lib:cat', masterRef: `a/${'a'.repeat(64)}`, w: 1024, h: 768 }]);
  await db.doc('books/b2/pages/p2').update({ json: pageJson('p2') });
  assert.equal(await service.guestBook(token), null);
  await db.doc('books/b2').update({ pageHashes: { p1: sha256(pageJson('p1', 'lib:cat')), p2: sha256(pageJson('p2')) } });
  assert.equal((await service.guestBook(token))!.pages.length, 2);
  await db.doc('books/b2').update({ deleted: true });
  assert.equal(await service.guestBook(token), null);
});
