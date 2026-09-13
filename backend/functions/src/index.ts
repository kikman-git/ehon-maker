import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineInt, defineSecret, defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { resolve } from 'node:path';
import { AssetService, type BlobStore, type Upload } from './assets';
import { LocalBlobStore } from './localBlobs';
import { LoginService } from './login';
import { R2Store } from './r2';
import { applyBudgetAlert, cleanupJobs } from './maintenance';
import { ShareService, TOKEN } from './share';

initializeApp();
setGlobalOptions({ region: 'asia-northeast1', maxInstances: 10 });
const endpoint = defineString('R2_ENDPOINT', { default: '' });
const bucket = defineString('R2_BUCKET', { default: 'ehon-assets-dev' });
const accessKey = defineSecret('R2_ACCESS_KEY_ID');
const secretKey = defineSecret('R2_SECRET_ACCESS_KEY');
const quota = defineInt('STORAGE_QUOTA_BYTES', { default: 536870912 });
const budgetTopic = defineString('BUDGET_ALERT_TOPIC', { default: 'ehon-budget-alerts' });
const budgetLimit = defineInt('BUDGET_LIMIT_JPY', { default: 10000 });
const webOrigins = defineString('WEB_ORIGINS', { default: 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173' });
const options = { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true', secrets: [accessKey, secretKey] };

function user(request: CallableRequest): string {
  const token = request.auth?.token;
  // A browser opened from the phone (qrLoginClaim) carries the handoff claim instead of a provider.
  const real = ['apple.com', 'google.com'].includes(token?.firebase?.sign_in_provider ?? '') || token?.handoff === 'app';
  if (!request.auth || !real) throw new HttpsError('unauthenticated', 'Sign in with Apple or Google first.');
  return request.auth.uid;
}
const emulated = process.env.FUNCTIONS_EMULATOR === 'true';
const localBlobs = () => new LocalBlobStore(resolve(__dirname, '..', '.blobs'), `http://127.0.0.1:5001/${process.env.GCLOUD_PROJECT ?? 'demo-ehon'}/asia-northeast1/localBlob`);
function blobs(): BlobStore {
  if (endpoint.value()) return new R2Store(bucket.value(), endpoint.value(), accessKey.value(), secretKey.value());
  if (emulated) return localBlobs();
  throw new HttpsError('failed-precondition', 'R2 is not configured.');
}
const assets = () => new AssetService(getFirestore(), blobs(), quota.value());
function key(request: CallableRequest): string {
  if (typeof request.data?.key !== 'string') throw new HttpsError('invalid-argument', 'A blob key is required.');
  return request.data.key;
}

export const presignUpload = onCall<Upload>(options, request => { const uid = user(request); return assets().presign(uid, request.data); });
export const finalizeAsset = onCall({ ...options, memory: '512MiB', timeoutSeconds: 120 }, request => { const uid = user(request); return assets().finalize(uid, key(request)); });
export const signedRead = onCall(options, request => { const uid = user(request); return assets().signedRead(uid, key(request)); });
export const shareCreate = onCall({ enforceAppCheck: options.enforceAppCheck }, request => {
  const uid = user(request); return new ShareService(getFirestore()).create(uid, request.data?.bookId, request.data?.label);
});
export const shareRevoke = onCall({ enforceAppCheck: options.enforceAppCheck }, request => {
  const uid = user(request); return new ShareService(getFirestore()).revoke(uid, request.data?.token);
});
/** QR hand-off (decision 58): the browser starts and claims, the signed-in app approves. */
const handoff = () => new LoginService(getFirestore(), uid => getAuth().createCustomToken(uid, { handoff: 'app' }));
export const qrLoginStart = onCall({ enforceAppCheck: options.enforceAppCheck }, request => handoff().start(request.data?.client));
export const qrLoginApprove = onCall({ enforceAppCheck: options.enforceAppCheck }, request => {
  const uid = user(request); return handoff().approve(uid, { id: request.data?.id, code: request.data?.code });
});
export const qrLoginClaim = onCall({ enforceAppCheck: options.enforceAppCheck }, request => handoff().claim(request.data?.id, request.data?.secret));
/** `GET /guestBook/<token>`: the only unauthenticated read; the token is the whole capability. */
export const guestBook = onRequest(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && webOrigins.value().split(',').map(item => item.trim()).includes(origin)) {
    response.set('Access-Control-Allow-Origin', origin);
    response.set('Vary', 'Origin');
  }
  response.set('X-Content-Type-Options', 'nosniff');
  // Revocation must be immediate, so neither the browser nor a proxy may keep a copy.
  response.set('Cache-Control', 'no-store');
  if (request.method !== 'GET') { response.status(405).end(); return; }
  const token = request.path.split('/').filter(Boolean).pop() ?? '';
  const book = TOKEN.test(token) ? await new ShareService(getFirestore()).guestBook(token) : null;
  if (!book) { response.status(404).json({ error: 'not-found' }); return; }
  response.json(book);
});
/** Emulator only: the presigned PUT target and the assets domain for local development. */
export const localBlob = onRequest(async (request, response) => {
  if (emulated) await localBlobs().handle(request, response);
  else response.status(404).end();
});
export const cleanup = onSchedule({ schedule: 'every day 03:00', timeZone: 'Asia/Tokyo' }, async () => { await cleanupJobs(getFirestore()); });
export const budgetGuard = onMessagePublished({ topic: budgetTopic }, async event => {
  await applyBudgetAlert(getFirestore(), event.data.message.json, budgetLimit.value());
});
