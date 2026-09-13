import {
  GoogleAuthProvider, OAuthProvider, linkWithCredential, linkWithPopup, onIdTokenChanged, signInAnonymously, signInWithCredential,
  signInWithPopup, signInWithRedirect, signOut as firebaseSignOut, type AuthCredential, type AuthError, type AuthProvider, type User,
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

/** Anonymous at first launch, as on the phone; nothing anonymous is ever written to Firestore. */
export function startSession(): void {
  if (started || !cloud) return;
  started = true;
  const { auth } = firebase();
  // Linking a provider keeps the uid, so only the token listener sees the anonymous → real transition.
  onIdTokenChanged(auth, (user) => {
    publish(user);
    if (!user) signInAnonymously(auth).catch(() => session.update({ ready: true, error: 'offline' }));
  });
}

function provider(kind: 'apple' | 'google'): AuthProvider {
  if (kind === 'google') return new GoogleAuthProvider();
  const apple = new OAuthProvider('apple.com');
  apple.addScope('email');
  apple.addScope('name');
  return apple;
}

function credentialFromError(kind: 'apple' | 'google', error: AuthError): AuthCredential | null {
  return kind === 'google' ? GoogleAuthProvider.credentialFromError(error) : OAuthProvider.credentialFromError(error);
}

/** Links the anonymous account when the credential is new; otherwise moves to the existing account. */
export async function signInWith(kind: 'apple' | 'google'): Promise<void> {
  if (!cloud || session.get().busy) return;
  const { auth } = firebase();
  session.update({ busy: true, error: null });
  try {
    const current = auth.currentUser;
    try {
      if (current?.isAnonymous) await linkWithPopup(current, provider(kind));
      else await signInWithPopup(auth, provider(kind));
    } catch (raw) {
      const error = raw as AuthError;
      if (error.code === 'auth/credential-already-in-use') {
        const credential = credentialFromError(kind, error);
        if (!credential) throw error;
        await signInWithCredential(auth, credential);
      } else if (error.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, provider(kind));
      } else if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        throw error;
      }
    }
    publish(auth.currentUser);
  } catch (raw) {
    session.update({ error: (raw as Error).message });
  } finally {
    session.update({ busy: false });
  }
}

export async function signOut(): Promise<void> {
  if (!cloud) return;
  const { auth } = firebase();
  try {
    await firebaseSignOut(auth);
    await signInAnonymously(auth);
  } catch (raw) {
    session.update({ error: (raw as Error).message });
  }
}

/** Emulator only: the Auth emulator accepts an unsigned Google id token, exactly as the iOS tests do. */
export async function signInEmulator(subject: string): Promise<void> {
  if (!cloud?.emulatorHost) throw new Error('Emulator sign-in needs the Auth emulator.');
  const { auth } = firebase();
  const token = JSON.stringify({ sub: subject, email: `${subject}@example.invalid`, email_verified: true });
  const credential = GoogleAuthProvider.credential(token);
  const current: User | null = auth.currentUser;
  try {
    if (current?.isAnonymous) await linkWithCredential(current, credential);
    else await signInWithCredential(auth, credential);
  } catch (raw) {
    if ((raw as AuthError).code !== 'auth/credential-already-in-use') throw raw;
    await signInWithCredential(auth, credential);
  }
  publish(auth.currentUser);
}
