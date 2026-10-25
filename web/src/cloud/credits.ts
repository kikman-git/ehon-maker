import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { cloud } from './config';
import { firebase } from './firebase';
import { session } from './session';
import { createStore } from './store';

// Credits (decision #66): AI is paid in credits priced from the model's tokens; everything else stays free.

export type Plan = 'free' | 'plus';
export interface CreditsState {
  /** False until the account's balance is known; a checkout without cloud never becomes ready. */
  ready: boolean;
  balance: number;
  plan: Plan;
  granted: number;
  spent: number;
}

export const WELCOME_CREDITS = 100;
/** Under this a turn is refused by the server, so the UI offers the upgrade instead. */
export const MIN_TURN_CREDITS = 3;
export const LOW_CREDITS = 20;
export const PLUS_CREDITS = 1500;
export const PACK_CREDITS = 600;

export const credits = createStore<CreditsState>({ ready: false, balance: 0, plan: 'free', granted: 0, spent: 0 });

let watching: Unsubscribe | null = null;
let watchedUid: string | null = null;

/** Follows the signed-in account's balance; the first call per account also opens it with the welcome grant. */
export function startCredits(): void {
  if (!cloud) return;
  session.subscribe((state) => {
    const uid = state.signedIn ? state.uid : null;
    if (uid === watchedUid) return;
    watching?.(); watching = null;
    watchedUid = uid;
    credits.set({ ready: false, balance: 0, plan: 'free', granted: 0, spent: 0 });
    if (!uid) return;
    const { db, functions } = firebase();
    watching = onSnapshot(doc(db, 'credits', uid), (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      credits.set({ ready: true, balance: Number(data.balance ?? 0), plan: data.plan === 'plus' ? 'plus' : 'free', granted: Number(data.granted ?? 0), spent: Number(data.spent ?? 0) });
    }, () => {});
    void httpsCallable(functions, 'creditsBalance')().catch(() => {});
  });
}

export interface AtelierInput {
  title: string;
  request: string;
  mode: 'new' | 'revise';
  piece: string | null;
  selected: { id: string; name: string } | null;
  sketched: boolean;
  image: string | null;
  bookArt: string[];
}
export interface AtelierResult { candidates: string[]; piece: string | null; say: string; credits: number; balance: number }
type AtelierChunk = { type: 'progress'; chars: number } | { type: 'result'; result: AtelierResult };

export type AtelierFailure = 'credits' | 'paused' | 'signedOut' | 'network';
export class AtelierError extends Error {
  constructor(readonly reason: AtelierFailure, readonly balance: number | null = null) { super(reason); }
}

/** One metered turn on the server; progress is characters of the model's answer so far. */
export async function atelierTurn(input: AtelierInput, onProgress: (chars: number) => void): Promise<AtelierResult> {
  const { functions } = firebase();
  const callable = httpsCallable<AtelierInput, AtelierResult, AtelierChunk>(functions, 'atelierTurn', { timeout: 300_000 });
  try {
    const { stream, data } = await callable.stream(input);
    for await (const chunk of stream) if (chunk.type === 'progress') onProgress(chunk.chars);
    return await data;
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    const details = (error as { details?: { balance?: number } }).details;
    if (code === 'functions/resource-exhausted') throw new AtelierError('credits', details?.balance ?? null);
    if (code === 'functions/unavailable' || code === 'functions/failed-precondition') throw new AtelierError('paused');
    if (code === 'functions/unauthenticated') throw new AtelierError('signedOut');
    throw new AtelierError('network');
  }
}

export type Product = 'plus' | 'pack';

/** Sends the browser to Stripe; the webhook credits the account, and the snapshot above shows it. */
export async function startCheckout(product: Product): Promise<void> {
  const { functions } = firebase();
  const { data } = await httpsCallable<{ product: Product }, { url: string }>(functions, 'stripeCheckout')({ product });
  location.assign(data.url);
}

export async function openBillingPortal(): Promise<void> {
  const { functions } = firebase();
  const { data } = await httpsCallable<void, { url: string }>(functions, 'stripePortal')();
  location.assign(data.url);
}
