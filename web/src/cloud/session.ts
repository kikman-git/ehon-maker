import {
  GoogleAuthProvider, OAuthProvider, onIdTokenChanged, signInWithCredential, signInWithPopup, signInWithRedirect,
  signOut as firebaseSignOut, type AuthError, type AuthProvider, type User,
} from 'firebase/auth';
import { cloud } from './config';
import { firebase } from './firebase';
import { createStore } from './store';

export interface SessionState {
  ready: boolean;
  uid: string | null;
  signedIn: boolean;
  displayName: string;
  busy: boolean;
  error: string | null;
}

export const session = createStore<SessionState>({ ready: !cloud, uid: null, signedIn: false, displayName: '', busy: false, error: null });
let started = false;

function publish(user: User | null): void {
  session.update({ ready: true, uid: user?.uid ?? null, signedIn: !!user && !user.isAnonymous, displayName: user?.displayName || user?.email || '' });
}

/**
 * The web has no anonymous stage (decision 58): a visitor sees the landing page until Apple, Google
 * or the phone signs them in. A session left over from the anonymous days is closed on sight.
 */
export function startSession(): void {
  if (started || !cloud) return;
  started = true;
  const { auth } = firebase();
  onIdTokenChanged(auth, (user) => {
    if (user?.isAnonymous) { void firebaseSignOut(auth); return; }
    publish(user);
  });
}

function provider(kind: 'apple' | 'google'): AuthProvider {
  if (kind === 'google') return new GoogleAuthProvider();
  const apple = new OAuthProvider('apple.com');
  apple.addScope('email');
  apple.addScope('name');
  return apple;
}

export async function signInWith(kind: 'apple' | 'google'): Promise<void> {
  if (!cloud || session.get().busy) return;
  const { auth } = firebase();
  session.update({ busy: true, error: null });
  try {
    try {
      await signInWithPopup(auth, provider(kind));
    } catch (raw) {
      const error = raw as AuthError;
      if (error.code === 'auth/popup-blocked') await signInWithRedirect(auth, provider(kind));
      else if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') throw error;
    }
    publish(auth.currentUser);
  } catch (raw) {
    session.update({ error: (raw as AuthError).code === 'auth/network-request-failed' ? 'offline' : (raw as Error).message });
  } finally {
    session.update({ busy: false });
  }
}

export async function signOut(): Promise<void> {
  if (!cloud) return;
  try { await firebaseSignOut(firebase().auth); }
  catch (raw) { session.update({ error: (raw as Error).message }); }
}

/** Emulator only: the Auth emulator accepts an unsigned Google id token, exactly as the iOS tests do. */
export async function signInEmulator(subject: string): Promise<void> {
  if (!cloud?.emulatorHost) throw new Error('Emulator sign-in needs the Auth emulator.');
  const { auth } = firebase();
  const token = JSON.stringify({ sub: subject, email: `${subject}@example.invalid`, email_verified: true });
  await signInWithCredential(auth, GoogleAuthProvider.credential(token));
  publish(auth.currentUser);
}
