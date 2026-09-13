import { useEffect, type ReactNode } from 'react';
import { cloud } from '../cloud/config';
import { session, startSession } from '../cloud/session';
import { useStore } from '../cloud/store';
import { Landing } from './Landing';
import type { Intent } from './SignIn';

/** Accounts only (decision 58). A checkout without cloud settings has no accounts, so its local harness opens directly. */
export function Gate({ intent, children }: { intent: Intent; children: ReactNode }) {
  const account = useStore(session);
  useEffect(() => { startSession(); }, []);
  if (!cloud) return <>{children}</>;
  if (!account.ready) return <p className="loading" role="status">じゅんび しています…</p>;
  if (!account.signedIn) return <Landing intent={intent} />;
  return <>{children}</>;
}

export default Gate;
