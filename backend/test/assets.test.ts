import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import sharp from 'sharp';
import { AssetService, MAX_UPLOAD_BYTES, sha256, uploadKey, type BlobStore } from '../functions/src/assets.ts';
import { applyBudgetAlert, cleanupJobs } from '../functions/src/maintenance.ts';
import { publicKey } from '../assets-worker/src/index.ts';

const app = initializeApp({ projectId: 'demo-ehon-assets' }, 'assets-tests');
const db = getFirestore(app);
class MemoryBlobs implements BlobStore {
  files = new Map<string, Buffer>(); failWrite = false;
  async presignPut(key: string) { return { url: `https://upload.invalid/${key}`, headers: {} }; }
  async presignGet(key: string) { return `https://private.invalid/${key}`; }
  async read(key: string) { assert.ok(this.files.has(key)); return this.files.get(key)!; }
  async write(key: string, bytes: Buffer) { if (this.failWrite) throw Error('network'); this.files.set(key, bytes); }
}
let blobs: MemoryBlobs;
let service: AssetService;
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ehon-assets/databases/(default)/documents`, { method: 'DELETE' });
  blobs = new MemoryBlobs(); service = new AssetService(db, blobs);
});
after(async () => { await db.terminate(); await deleteApp(app); });
async function master(width = 32, channels: 3 | 4 = 4) {
  const bytes = await sharp({ create: { width, height: 24, channels, background: { r: 255, g: 30, b: 20, alpha: 0.5 } } }).png().toBuffer();
  const input = { kind: 'master' as const, mime: 'image/png', sha256: sha256(bytes), bytes: bytes.length };
  const key = uploadKey('alice', input); blobs.files.set(key, bytes);
  return { key, input };
}

test('presigning validates size, MIME, hashes, identifiers and book ownership', async () => {
  const { input } = await master();
  await assert.rejects(service.presign('alice', { ...input, bytes: MAX_UPLOAD_BYTES + 1 }), { code: 'invalid-argument' });
  await assert.rejects(service.presign('alice', { ...input, mime: 'image/svg+xml' }), { code: 'invalid-argument' });
  await assert.rejects(service.presign('alice', { ...input, sha256: '../bad' }), { code: 'invalid-argument' });
  await assert.rejects(service.presign('alice', { ...input, kind: 'voice', mime: 'audio/mp4', bookId: 'b1', replyId: 'r1' }), { code: 'permission-denied' });
  await db.doc('books/b1').set({ ownerId: 'alice', deleted: false });
  assert.match((await service.presign('alice', { ...input, kind: 'voice', mime: 'audio/mp4', bookId: 'b1', replyId: 'r1' })).key, /^u\/alice\/voice\//);
});

test('finalize normalizes a master, creates derivatives and charges once under retries/concurrency', async () => {
  const { key } = await master();
  const [a, b] = await Promise.all([service.finalize('alice', key), service.finalize('alice', key)]);
  assert.deepEqual(a, b);
  assert.equal(a.ref, `a/${sha256(blobs.files.get(a.key)!)}`);
  const asset = (await db.doc(`assets/${a.ref.slice(2)}`).get()).data()!;
  assert.equal(asset.w, 32); assert.equal(asset.hasAlpha, true);
  assert.equal(asset.derivatives.length, 3);
  const charged = asset.derivatives.reduce((sum: number, k: string) => sum + blobs.files.get(k)!.length, 0);
  assert.equal((await db.doc('storageUsage/alice').get()).data()!.bytes, charged);
  assert.deepEqual(await service.finalize('alice', key), a);
  await assert.rejects(service.finalize('bob', key), { code: 'permission-denied' });
});

test('failed writes resume reservations without publishing an asset or double-charging', async () => {
  const { key } = await master(); blobs.failWrite = true;
  await assert.rejects(service.finalize('alice', key), /network/);
  assert.equal((await db.collection('assets').get()).size, 0);
  const charged = (await db.doc('storageUsage/alice').get()).data()!.bytes;
  blobs.failWrite = false; await service.finalize('alice', key);
  assert.equal((await db.doc('storageUsage/alice').get()).data()!.bytes, charged);
});

test('invalid, opaque, oversized or tampered images never publish', async () => {
  for (const args of [[32, 3], [2049, 4]] as const) {
    const { key } = await master(...args);
    await assert.rejects(service.finalize('alice', key), { code: 'invalid-argument' });
  }
  const { key } = await master(); blobs.files.set(key, Buffer.from('tampered'));
  await assert.rejects(service.finalize('alice', key), { code: 'invalid-argument' });
  assert.equal((await db.collection('assets').get()).size, 0);
});

test('finalization enforces derivative-inclusive quotas transactionally', async () => {
  const { key } = await master();
  await assert.rejects(new AssetService(db, blobs, 1).finalize('alice', key), { code: 'resource-exhausted' });
  assert.equal((await db.doc('storageUsage/alice').get()).exists, false);
});

test('private sources are immutable and only finalized owned keys can be signed', async () => {
  const bytes = Buffer.from([0x50, 0x4b, 3, 4, 0, 0]);
  const key = uploadKey('alice', { kind: 'source', mime: 'application/zip', bytes: bytes.length, sha256: sha256(bytes), illustrationId: 'i1', sourceVersion: 1 });
  blobs.files.set(key, bytes);
  const result = await service.finalize('alice', key);
  assert.equal(result.ref, 's/alice/i1/1.zip');
  assert.equal((await service.signedRead('alice', result.key)).expiresIn, 600);
  await assert.rejects(service.signedRead('bob', result.key), { code: 'permission-denied' });
  await assert.rejects(service.signedRead('alice', 's/alice/i1/2.zip'), { code: 'not-found' });
  await assert.rejects(service.signedRead('alice', 's/alice/../bob/1.zip'), { code: 'permission-denied' });
  const changed = Buffer.concat([bytes, Buffer.from('new')]); const otherKey = key.replace(sha256(bytes), sha256(changed));
  blobs.files.set(otherKey, changed);
  await assert.rejects(service.finalize('alice', otherKey), { code: 'already-exists' });
});

test('asset domain exposes only canonical images and font files', () => {
  assert.equal(publicKey(`/a/${'a'.repeat(64)}/256.webp`), `a/${'a'.repeat(64)}/256.webp`);
  assert.equal(publicKey('/fonts/Yomogi-Regular.ttf'), 'fonts/Yomogi-Regular.ttf');
  for (const path of ['/v/alice/b/r.m4a', '/s/alice/i/1.zip', '/u/alice/master/x/asset.png', '/fonts/../secret', '/fonts/a%2ftest.ttf', `/a/${'a'.repeat(64)}/source.zip`]) assert.equal(publicKey(path), null);
});

test('cleanup removes expired jobs only; budget guard never reenables AI', async () => {
  await db.doc('jobs/old').set({ expiresAt: Timestamp.fromMillis(1) });
  await db.doc('jobs/new').set({ expiresAt: Timestamp.fromMillis(Date.now() + 100_000) });
  await db.doc('books/kept').set({ deleted: true });
  assert.equal(await cleanupJobs(db), 1);
  assert.equal((await db.doc('books/kept').get()).exists, true);
  assert.equal(await applyBudgetAlert(db, { currencyCode: 'JPY', costAmount: 10_000 }, 10_000), true);
  assert.equal(await applyBudgetAlert(db, { currencyCode: 'JPY', costAmount: 2 }, 10_000), false);
  assert.equal(await applyBudgetAlert(db, { currencyCode: 'USD', costAmount: 20_000 }, 10_000), false);
  assert.equal((await db.doc('config/flags').get()).data()!.aiEnabled, false);
});
