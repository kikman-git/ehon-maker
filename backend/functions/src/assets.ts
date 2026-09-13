import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const IMMUTABLE = 'public, max-age=31536000, immutable';
export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

export interface BlobStore {
  presignPut(key: string, mime: string, bytes: number, hash: string): Promise<{ url: string; headers: Record<string, string> }>;
  presignGet(key: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  write(key: string, bytes: Buffer, mime: string, cacheControl: string): Promise<void>;
}
export interface Upload {
  kind: 'master' | 'source' | 'voice'; sha256: string; bytes: number; mime: string;
  illustrationId?: string; sourceVersion?: number; bookId?: string; replyId?: string;
}
export interface Finalized { key: string; ref: string; bytes: number; w?: number; h?: number }

function validId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !ID.test(id)) throw new HttpsError('invalid-argument', 'Invalid identifier.');
}
export function uploadKey(uid: string, input: Upload): string {
  validId(uid);
  if (!input || !HASH.test(input.sha256) || !Number.isSafeInteger(input.bytes) || input.bytes <= 0 || input.bytes > MAX_UPLOAD_BYTES) {
    throw new HttpsError('invalid-argument', 'Uploads must be 1 byte to 25 MiB with a SHA-256 checksum.');
  }
  let filename: string;
  switch (input.kind) {
    case 'master':
      if (!['image/png', 'image/webp'].includes(input.mime)) throw new HttpsError('invalid-argument', 'A master must be PNG or WebP.');
      filename = input.mime === 'image/png' ? 'asset.png' : 'asset.webp';
      break;
    case 'source':
      validId(input.illustrationId);
      if (input.mime !== 'application/zip' || !Number.isSafeInteger(input.sourceVersion) || input.sourceVersion! < 1) {
        throw new HttpsError('invalid-argument', 'A source needs a ZIP and a positive version.');
      }
      filename = `${input.illustrationId}.${input.sourceVersion}.zip`;
      break;
    case 'voice':
      validId(input.bookId); validId(input.replyId);
      if (input.mime !== 'audio/mp4') throw new HttpsError('invalid-argument', 'Voice must be M4A.');
      filename = `${input.bookId}.${input.replyId}.m4a`;
      break;
    default: throw new HttpsError('invalid-argument', 'Unknown upload kind.');
  }
  return `u/${uid}/${input.kind}/${input.sha256}/${filename}`;
}

function parseKey(uid: string, key: string) {
  const pieces = key.split('/');
  if (pieces.length !== 5 || pieces[0] !== 'u' || pieces[1] !== uid || !HASH.test(pieces[3])) {
    throw new HttpsError('permission-denied', 'This upload does not belong to you.');
  }
  validId(uid);
  const [, , kind, hash, filename] = pieces;
  const source = /^([A-Za-z0-9_-]{1,128})\.([1-9][0-9]*)\.zip$/.exec(filename);
  const voice = /^([A-Za-z0-9_-]{1,128})\.([A-Za-z0-9_-]{1,128})\.m4a$/.exec(filename);
  if (kind === 'master' && ['asset.png', 'asset.webp'].includes(filename)) return { kind, hash, target: '', mime: filename.endsWith('.png') ? 'image/png' : 'image/webp' };
  if (kind === 'source' && source) return { kind, hash, target: `s/${uid}/${source[1]}/${source[2]}.zip`, mime: 'application/zip' };
  if (kind === 'voice' && voice) return { kind, hash, target: `v/${uid}/${voice[1]}/${voice[2]}.m4a`, mime: 'audio/mp4' };
  throw new HttpsError('invalid-argument', 'Invalid upload key.');
}

export function privateKeyOwner(key: string): string | null {
  const match = /^(?:s\/([A-Za-z0-9_-]{1,128})\/[A-Za-z0-9_-]{1,128}\/[1-9][0-9]*\.zip|v\/([A-Za-z0-9_-]{1,128})\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\.m4a)$/.exec(key);
  return match ? match[1] ?? match[2] : null;
}

export class AssetService {
  constructor(private readonly db: Firestore, private readonly blobs: BlobStore, private readonly quotaBytes = 512 * 1024 * 1024) {}

  async presign(uid: string, input: Upload) {
    const key = uploadKey(uid, input);
    if (input.kind === 'voice') {
      const book = await this.db.doc(`books/${input.bookId}`).get();
      if (book.data()?.ownerId !== uid || book.data()?.deleted) throw new HttpsError('permission-denied', 'Book not available.');
    }
    const usage = (await this.db.doc(`storageUsage/${uid}`).get()).data()?.bytes ?? 0;
    if (usage + input.bytes > this.quotaBytes) throw new HttpsError('resource-exhausted', 'Storage allowance exceeded.');
    return { key, ...await this.blobs.presignPut(key, input.mime, input.bytes, input.sha256) };
  }

  async signedRead(uid: string, key: string) {
    if (privateKeyOwner(key) !== uid) throw new HttpsError('permission-denied', 'Private blob access denied.');
    const owned = await this.db.doc(`users/${uid}/blobs/${sha256(key)}`).get();
    if (owned.data()?.status !== 'done') throw new HttpsError('not-found', 'Blob is not finalized.');
    return { url: await this.blobs.presignGet(key), expiresIn: 600 };
  }

  async finalize(uid: string, key: string): Promise<Finalized> {
    const parsed = parseKey(uid, key);
    const receipt = this.db.doc(`uploadReceipts/${sha256(`${uid}/${key}`)}`);
    const previous = await receipt.get();
    if (previous.exists) return previous.data()!.result as Finalized;
    const input = await this.blobs.read(key);
    if (input.length === 0 || input.length > MAX_UPLOAD_BYTES || sha256(input) !== parsed.hash) {
      throw new HttpsError('invalid-argument', 'Upload size or checksum is invalid.');
    }
    let objects: { key: string; data: Buffer; mime: string }[];
    let asset: Record<string, unknown> | undefined;
    let result: Finalized;
    if (parsed.kind === 'master') {
      const options = { limitInputPixels: 2048 * 2048, failOn: 'warning' as const };
      const metadata = await sharp(input, options).metadata().catch(() => { throw new HttpsError('invalid-argument', 'Invalid image.'); });
      if (metadata.format !== parsed.mime.split('/')[1] || !metadata.hasAlpha || !metadata.width || !metadata.height
        || metadata.width > 2048 || metadata.height > 2048 || (metadata.pages ?? 1) > 1) {
        throw new HttpsError('invalid-argument', 'Use a single transparent PNG/WebP no larger than 2048 pixels.');
      }
      // Normalizing removes metadata; the public key hashes the exact stored master bytes.
      const master = await sharp(input, options).rotate().ensureAlpha().png().toBuffer({ resolveWithObject: true });
      const hash = sha256(master.data);
      const ref = `a/${hash}`;
      const [medium, thumb] = await Promise.all([1024, 256].map(size =>
        sharp(master.data).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer()));
      objects = [{ key: `${ref}/m.png`, data: master.data, mime: 'image/png' },
        { key: `${ref}/1024.webp`, data: medium, mime: 'image/webp' }, { key: `${ref}/256.webp`, data: thumb, mime: 'image/webp' }];
      result = { key: objects[0].key, ref, bytes: master.data.length, w: master.info.width, h: master.info.height };
      asset = { bytes: result.bytes, mime: 'image/png', w: result.w, h: result.h, hasAlpha: true,
        derivatives: objects.map(item => item.key), createdBy: uid, createdAt: FieldValue.serverTimestamp() };
    } else {
      if (parsed.kind === 'source' && !(input[0] === 0x50 && input[1] === 0x4b && [3, 5, 7].includes(input[2]))) {
        throw new HttpsError('invalid-argument', 'Invalid ZIP source.');
      }
      if (parsed.kind === 'voice' && (input.length < 12 || input.toString('ascii', 4, 8) !== 'ftyp')) {
        throw new HttpsError('invalid-argument', 'Invalid M4A voice.');
      }
      objects = [{ key: parsed.target, data: input, mime: parsed.mime }];
      result = { key: parsed.target, ref: parsed.target, bytes: input.length };
    }
    const cost = objects.reduce((sum, item) => sum + item.data.length, 0);
    const owned = this.db.doc(`users/${uid}/blobs/${sha256(result.key)}`);
    const usage = this.db.doc(`storageUsage/${uid}`);
    await this.db.runTransaction(async tx => {
      const [current, currentUsage] = await Promise.all([tx.get(owned), tx.get(usage)]);
      if (current.exists) {
        if (current.data()!.hash !== sha256(objects[0].data)) throw new HttpsError('already-exists', 'This version is immutable.');
        return;
      }
      const bytes = (currentUsage.data()?.bytes ?? 0) + cost;
      if (bytes > this.quotaBytes) throw new HttpsError('resource-exhausted', 'Storage allowance exceeded.');
      tx.set(usage, { bytes, updatedAt: FieldValue.serverTimestamp() });
      tx.create(owned, { key: result.key, hash: sha256(objects[0].data), bytes: cost, status: 'pending', createdAt: FieldValue.serverTimestamp() });
    });
    // Pending reservations make retries safe across an R2 or Firestore failure.
    await Promise.all(objects.map(object => this.blobs.write(object.key, object.data, object.mime, asset ? IMMUTABLE : 'private, no-store')));
    await this.db.runTransaction(async tx => {
      const assetRef = asset ? this.db.doc(`assets/${result.ref.slice(2)}`) : null;
      const existing = assetRef ? await tx.get(assetRef) : null;
      if (assetRef && !existing!.exists) tx.create(assetRef, asset!);
      tx.update(owned, { status: 'done' });
      tx.set(receipt, { ownerId: uid, result, createdAt: FieldValue.serverTimestamp() });
    });
    return result;
  }
}
