import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { cloud } from './config';
import { firebase } from './firebase';
import { session, type SessionState } from './session';
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
  const follow = (state: SessionState) => {
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
      // A turn in flight holds credits; the chip keeps showing them until the real cost settles, so a hold never reads as a charge.
      credits.set({ ready: true, balance: Number(data.balance ?? 0) + Number(data.reserved ?? 0), plan: data.plan === 'plus' ? 'plus' : 'free', granted: Number(data.granted ?? 0), spent: Number(data.spent ?? 0) });
    }, () => {});
    void httpsCallable(functions, 'creditsBalance')().catch(() => {});
  };
  session.subscribe(follow);
  // The gate mounts after the session is already known, so the signed-in state never arrives as a change.
  follow(session.get());
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
export type Metered<T> = T & { credits: number; balance: number };
export type AtelierResult = Metered<{ candidates: string[]; piece: string | null; say: string }>;
/** What the harness streams while it works: characters of the answer so far, or a step in the user's language. */
export interface Progress { chars?: number; step?: string }
type Chunk<R> = ({ type: 'progress' } & Progress) | { type: 'result'; result: R };

/** What the book desk sends: the page in view, the mark and its items, and the document without its art. */
export interface BookInput {
  title: string;
  request: string;
  pageIndex: number;
  pageId: string;
  pageCount: number;
  book: string;
  bookArt: string[];
  mark: { pageIndex: number; pageId: string; x0: number; y0: number; x1: number; y1: number } | null;
  items: unknown[];
  selected: unknown;
  image: string | null;
}
export type BookResult = Metered<{ book: string | null; say: string }>;

export type AtelierFailure = 'credits' | 'paused' | 'rate' | 'signedOut' | 'network';
export class AtelierError extends Error {
  constructor(readonly reason: AtelierFailure, readonly balance: number | null = null) { super(reason); }
}

/** One metered turn on the server, with its progress as it streams. */
async function aiTurn<I, R>(name: string, input: I, onProgress: (progress: Progress) => void): Promise<R> {
  const { functions } = firebase();
  const callable = httpsCallable<I, R, Chunk<R>>(functions, name, { timeout: 600_000 });
  try {
    const { stream, data } = await callable.stream(input);
    for await (const chunk of stream) if (chunk.type === 'progress') onProgress(chunk);
    return await data;
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    const details = (error as { details?: { balance?: number; reason?: string } }).details;
    if (code === 'functions/resource-exhausted') throw new AtelierError('credits', details?.balance ?? null);
    if (code === 'functions/unavailable' && details?.reason === 'rate') throw new AtelierError('rate');
    if (code === 'functions/unavailable' || code === 'functions/failed-precondition') throw new AtelierError('paused');
    if (code === 'functions/unauthenticated') throw new AtelierError('signedOut');
    throw new AtelierError('network');
  }
}
export const atelierTurn = (input: AtelierInput, onProgress: (progress: Progress) => void) => aiTurn<AtelierInput, AtelierResult>('atelierTurn', input, onProgress);
export const bookTurn = (input: BookInput, onProgress: (progress: Progress) => void) => aiTurn<BookInput, BookResult>('bookTurn', input, onProgress);

/** One line for the chat when a turn could not run. */
export const failureText: Record<Exclude<AtelierFailure, 'credits'>, string> = {
  paused: 'AI は いま おやすみちゅうです。',
  rate: 'たくさん たのんだので、すこし やすんでから もういちど たのんでください。',
  signedOut: 'サインインが きれました。',
  network: 'AI に つながりませんでした。',
};

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
