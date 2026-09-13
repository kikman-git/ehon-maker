import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { paths } from '../routes';
import { cloud } from './config';
import { firebase } from './firebase';
import { createStore } from './store';

export type HandoffPhase = 'idle' | 'starting' | 'waiting' | 'expired' | 'failed';
export interface HandoffState { phase: HandoffPhase; code: string; url: string; expiresAt: number }
interface Started { id: string; code: string; secret: string; expiresAt: number }
type Claimed = { status: 'pending' } | { status: 'approved'; token: string };

const POLL_MS = 2500;
const idle: HandoffState = { phase: 'idle', code: '', url: '', expiresAt: 0 };

/**
 * Sign-in from the phone (decision 58): this browser starts a request and keeps its secret, the QR
 * code carries the request id, the signed-in app approves, and one poll here claims the token.
 */
export const handoff = createStore<HandoffState>(idle);
let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/** What the phone shows before approving: the browser and the platform, nothing that identifies a person. */
export function describeClient(agent = navigator.userAgent): string {
  const browser = /Edg\//.test(agent) ? 'Edge' : /OPR\//.test(agent) ? 'Opera' : /Firefox\//.test(agent) ? 'Firefox'
    : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'ブラウザ';
  const platform = /iPad/.test(agent) ? 'iPad' : /iPhone/.test(agent) ? 'iPhone' : /Android/.test(agent) ? 'Android'
    : /Mac/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : /CrOS/.test(agent) ? 'Chromebook' : /Linux/.test(agent) ? 'Linux' : '';
  return platform ? `${browser} · ${platform}` : browser;
}

export async function startHandoff(): Promise<void> {
  if (!cloud) return;
  const run = ++generation;
  clearTimer();
  handoff.set({ ...idle, phase: 'starting' });
  try {
    const { data } = await httpsCallable<{ client: string }, Started>(firebase().functions, 'qrLoginStart')({ client: describeClient() });
    if (run !== generation) return;
    handoff.set({ phase: 'waiting', code: data.code, url: `${location.origin}${paths.login(data.id)}`, expiresAt: data.expiresAt });
    schedule(run, data);
  } catch {
    if (run === generation) handoff.set({ ...idle, phase: 'failed' });
  }
}

/** Leaving the sign-in card abandons the request; the server forgets it at expiry. */
export function stopHandoff(): void {
  generation++;
  clearTimer();
  handoff.set(idle);
}

function schedule(run: number, request: Started): void {
  timer = setTimeout(() => { timer = null; void claim(run, request); }, POLL_MS);
}

async function claim(run: number, request: Started): Promise<void> {
  if (run !== generation) return;
  if (Date.now() > request.expiresAt) { handoff.update({ phase: 'expired' }); return; }
  try {
    const { data } = await httpsCallable<{ id: string; secret: string }, Claimed>(firebase().functions, 'qrLoginClaim')({ id: request.id, secret: request.secret });
    if (run !== generation) return;
    if (data.status === 'approved') {
      await signInWithCustomToken(firebase().auth, data.token);
      if (run === generation) handoff.set(idle);
      return;
    }
    schedule(run, request);
  } catch (raw) {
    if (run === generation) handoff.update({ phase: (raw as { code?: string }).code === 'functions/not-found' ? 'expired' : 'failed' });
  }
}

function clearTimer(): void {
  if (timer) { clearTimeout(timer); timer = null; }
}
