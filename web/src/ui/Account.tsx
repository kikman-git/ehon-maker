import { cloud } from '../cloud/config';
import { type BookRepository } from '../cloud/repository';
import { session, signOut } from '../cloud/session';
import { useStore } from '../cloud/store';
import { Icon } from './Icon';

export function syncStatus(state: { syncError: string | null; pendingChanges: boolean }): string {
  if (state.syncError) return 'この ブラウザに ほぞんしました。クラウドほぞんは あとで もういちど おこないます。';
  return state.pendingChanges ? 'えほんを アカウントに ほぞんちゅう…' : 'えほんを アカウントに ほぞんしました。';
}

/** Account status and sign-out; signing in happens on the landing page. The web sells nothing here either. */
export function AccountPanel({ repo, onClose }: { repo: BookRepository; onClose: () => void }) {
  const account = useStore(session);
  const state = useStore(repo.state);

  return <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <header className="dialog-header">
        <h2 id="account-title">アカウント</h2>
        <button className="ghost icon-button" onClick={onClose} aria-label="とじる"><Icon name="close" size={18} /></button>
      </header>
      {!cloud && <p>このビルドは クラウドほぞんの じゅんびちゅうです。えほんは この ブラウザに ほぞんされています。</p>}
      {cloud && <>
        <div className="account-identity">
          <span className="avatar"><Icon name="user" size={22} /></span>
          <div>
            <p className="account-name">{account.displayName || 'サインインずみ'}</p>
            <p className="status" data-pending={state.pendingChanges}>{syncStatus(state)}</p>
          </div>
        </div>
        <p className="hint">サインアウトすると ほんだなは とじ、もういちど サインインすると もどります。えほんは この ブラウザにも のこります。</p>
        <button onClick={() => { repo.saveOpenBook(); void signOut(); }}><Icon name="logout" size={16} />サインアウト</button>
      </>}
      {account.error && <p role="alert" className="error">{account.error === 'offline' ? 'ネットに つながると サインインできます。' : account.error}</p>}
    </section>
  </div>;
}
