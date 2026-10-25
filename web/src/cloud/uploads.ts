import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { MAX_MASTER_BYTES, MAX_MASTER_PIXELS } from './assetLoader';
import { firebase } from './firebase';
import { sha256Hex } from './hash';

const REF = /^a\/[0-9a-f]{64}$/;

export type UploadFailure = 'type' | 'size' | 'dimensions' | 'network' | 'quota' | 'signedOut';
export type UploadStage = 'checking' | 'sending' | 'finishing';
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
    return { w: bitmap.width, h: bitmap.height };
  } finally { bitmap.close(); }
}

/** PNG/WebP → presign → PUT → finalize → an `illustrations` document the listener turns into a part. */
export async function uploadIllustration(file: File, title: string, uid: string, onStage: (stage: UploadStage) => void = () => {}): Promise<string> {
  onStage('checking');
  const { w, h } = await inspect(file);
  onStage('sending');
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
  onStage('finishing');
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
