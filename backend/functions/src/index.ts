import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineInt, defineSecret, defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Stripe from 'stripe';
import { stopTurn } from './agent';
import { AssetService, type BlobStore, type Upload } from './assets';
import { AtelierService, type AtelierChunk } from './atelier';
import { BillingService } from './billing';
import { BookService, type BookChunk } from './book';
import { CreditService } from './credits';
import { FakeImageModel, FakeModel } from './fake';
import { LibraryPainter } from './library';
import { DEFAULT_MODEL, modelFor, type ChatModel, type Provider } from './model';
import { DEFAULT_IMAGE_MODEL, OpenAIImageModel, type ImageModel } from './painter';
import { LocalBlobStore } from './localBlobs';
import { LoginService } from './login';
import { R2Store } from './r2';
import { applyBudgetAlert, cleanupJobs } from './maintenance';
import { ShareService, TOKEN } from './share';
import { isAdmin } from './usage';

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
const anthropicKey = defineSecret('ANTHROPIC_API_KEY');
const openaiKey = defineSecret('OPENAI_API_KEY');
/** The harness is model-agnostic (decision #67): the provider and model are configuration, not code. */
const aiProvider = defineString('AI_PROVIDER', { default: 'anthropic' });
const aiModel = defineString('AI_MODEL', { default: '' });
const imageModel = defineString('IMAGE_MODEL', { default: '' });
const stripeKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const pricePlus = defineString('STRIPE_PRICE_PLUS', { default: '' });
const pricePack = defineString('STRIPE_PRICE_PACK', { default: '' });
const plusCredits = defineInt('PLUS_CREDITS', { default: 1500 });
const packCredits = defineInt('PACK_CREDITS', { default: 600 });
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
const credits = () => new CreditService(getFirestore());
/** Without a key the emulator answers with the stand-in, so the whole credit flow runs offline. */
function model(): ChatModel {
  const provider: Provider = aiProvider.value() === 'openai' ? 'openai' : 'anthropic';
  const apiKey = provider === 'openai' ? openaiKey.value() : anthropicKey.value();
  if (apiKey) return modelFor(provider, apiKey, aiModel.value() || DEFAULT_MODEL[provider]);
  if (emulated) return new FakeModel();
  throw new HttpsError('failed-precondition', 'AI is not configured.');
}
/** Poses are painted with OpenAI's image model whichever chat provider is chosen; without its key the book keeps to the library and its drawings. */
function painter(): LibraryPainter | null {
  const apiKey = openaiKey.value();
  const images: ImageModel | null = apiKey ? new OpenAIImageModel(apiKey, imageModel.value() || DEFAULT_IMAGE_MODEL) : emulated ? new FakeImageModel() : null;
  if (!images) return null;
  const store = blobs();
  // The emulator reads the assembled masters from the repository when its blob store has none (decision #61).
  const local = resolve(__dirname, '..', '..', '..', 'shared', 'build', 'materials');
  const reference = (masterRef: string) => store.read(`${masterRef}/m.png`).catch((error: unknown) => (emulated ? readFile(resolve(local, masterRef, 'm.png')) : Promise.reject(error)));
  return new LibraryPainter(getFirestore(), images, assets(), reference);
}
const billing = () => {
  const key = stripeKey.value();
  if (!key) throw new HttpsError('failed-precondition', 'Billing is not configured.');
  const origin = webOrigins.value().split(',').map(item => item.trim()).find(item => !/^(http:\/\/)?(127\.0\.0\.1|localhost)/.test(item)) ?? webOrigins.value().split(',')[0].trim();
  return new BillingService(getFirestore(), new Stripe(key), credits(), { plus: { priceId: pricePlus.value(), credits: plusCredits.value() }, pack: { priceId: pricePack.value(), credits: packCredits.value() } }, origin);
};
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
/** Credits and the metered AI turns (decisions #66, #67). The balance call also opens the account with its welcome grant. */
export const creditsBalance = onCall({ enforceAppCheck: options.enforceAppCheck }, request => { const uid = user(request); return credits().ensure(uid); });
const aiOptions = { enforceAppCheck: options.enforceAppCheck, secrets: [anthropicKey, openaiKey], memory: '512MiB' as const, timeoutSeconds: 540 };
export const atelierTurn = onCall<unknown, Promise<unknown>, AtelierChunk>(aiOptions, (request, response) => {
  const uid = user(request);
  return new AtelierService(getFirestore(), credits(), model()).turn(uid, request.data, chunk => response?.sendChunk(chunk) ?? Promise.resolve(false), response?.signal);
});
export const bookTurn = onCall<unknown, Promise<unknown>, BookChunk>(aiOptions, (request, response) => {
  const uid = user(request);
  return new BookService(getFirestore(), credits(), model(), painter()).turn(uid, request.data, chunk => response?.sendChunk(chunk) ?? Promise.resolve(false), response?.signal);
});
/** Admin (decision #68): credits and plans for one account; the admins are the uids in `config/admins`. */
/** Stops the turn the browser named: the server settles what was done and the hold goes back. */
export const aiStop = onCall({ enforceAppCheck: options.enforceAppCheck }, request => { const uid = user(request); return stopTurn(getFirestore(), uid, request.data?.turnId); });
export const adminAdjust = onCall({ enforceAppCheck: options.enforceAppCheck }, async request => {
  const uid = user(request);
  if (!(await isAdmin(getFirestore(), uid))) throw new HttpsError('permission-denied', 'Admins only.');
  const target = typeof request.data?.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(request.data.uid) ? request.data.uid : null;
  if (!target) throw new HttpsError('invalid-argument', 'A target uid is required.');
  const amount = request.data?.credits;
  if (typeof amount === 'number' && amount > 0) await credits().grant(target, Math.floor(amount), 'adjust', `${uid}-${Date.now()}`);
  if (request.data?.plan === 'plus' || request.data?.plan === 'free') await credits().setPlan(target, request.data.plan);
  return credits().ensure(target);
});
export const stripeCheckout = onCall({ enforceAppCheck: options.enforceAppCheck, secrets: [stripeKey] }, request => {
  const uid = user(request); return billing().checkout(uid, request.auth?.token.email, request.data?.product);
});
export const stripePortal = onCall({ enforceAppCheck: options.enforceAppCheck, secrets: [stripeKey] }, request => { const uid = user(request); return billing().portal(uid); });
/** Stripe calls this; the signature is the whole authentication. */
export const stripeWebhook = onRequest({ secrets: [stripeKey, stripeWebhookSecret] }, async (request, response) => {
  if (request.method !== 'POST') { response.status(405).end(); return; }
  try {
    const result = await billing().webhook(request.rawBody, request.get('stripe-signature'), stripeWebhookSecret.value());
    response.json(result);
  } catch (error) {
    const code = error instanceof HttpsError ? error.code : 'internal';
    response.status(code === 'unauthenticated' ? 400 : 500).json({ error: code });
  }
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
