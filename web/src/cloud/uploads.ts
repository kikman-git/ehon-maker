import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { MAX_MASTER_BYTES, MAX_MASTER_PIXELS } from './assetLoader';
import { firebase } from './firebase';
import { sha256Hex } from './hash';

const REF = /^a\/[0-9a-f]{64}$/;

export type UploadFailure = 'type' | 'size' | 'dimensions' | 'alpha' | 'network' | 'quota' | 'signedOut';
export class UploadError extends Error {
  constructor(readonly reason: UploadFailure) { super(reason); }
}

async function inspect(file: File): Promise<{ w: number; h: number }> {
  if (!['image/png', 'image/webp'].includes(file.type)) throw new UploadError('type');
  if (file.size === 0 || file.size > MAX_MASTER_BYTES) throw new UploadError('size');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new UploadError('type'); }
  try {
    if (bitmap.width > MAX_MASTER_PIXELS || bitmap.height > MAX_MASTER_PIXELS) throw new UploadError('dimensions');
    // The server rejects opaque masters; checking here saves the upload and gives a clearer message.
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let transparent = false;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] < 255) { transparent = true; break; }
    if (!transparent) throw new UploadError('alpha');
    return { w: bitmap.width, h: bitmap.height };
  } finally { bitmap.close(); }
}

/** PNG/WebP with alpha → presign → PUT → finalize → an `illustrations` document the listener turns into a part. */
export async function uploadIllustration(file: File, title: string, uid: string): Promise<string> {
  const { w, h } = await inspect(file);
  const bytes = await file.arrayBuffer();
  const hash = await sha256Hex(bytes);
  const { db, functions } = firebase();
  const presign = httpsCallable<object, { key: string; url: string; headers: Record<string, string> }>(functions, 'presignUpload');
  const finalize = httpsCallable<{ key: string }, { ref: string; w?: number; h?: number }>(functions, 'finalizeAsset');
  let ticket: { key: string; url: string; headers: Record<string, string> };
  try {
    ticket = (await presign({ kind: 'master', mime: file.type, bytes: bytes.byteLength, sha256: hash })).data;
  } catch (error) {
    throw new UploadError((error as { code?: string }).code === 'functions/resource-exhausted' ? 'quota' : 'network');
  }
  const put = await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: bytes }).catch(() => null);
  if (!put?.ok) throw new UploadError('network');
  let finalized: { ref: string; w?: number; h?: number };
  try { finalized = (await finalize({ key: ticket.key })).data; } catch (error) {
    throw new UploadError((error as { code?: string }).code === 'functions/resource-exhausted' ? 'quota' : 'network');
  }
  if (!REF.test(finalized.ref)) throw new UploadError('network');
  const id = crypto.randomUUID();
  await setDoc(doc(db, 'illustrations', id), {
    ownerId: uid, title: title.trim().slice(0, 200), masterRef: finalized.ref, w: finalized.w ?? w, h: finalized.h ?? h,
    origin: 'upload', aiAssisted: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), deleted: false,
  }).catch(() => { throw new UploadError('network'); });
  return id;
}
