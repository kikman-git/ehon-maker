import { cloud } from '../cloud/config';
import { credits } from '../cloud/credits';
import { type BookRepository } from '../cloud/repository';
import { session, signOut } from '../cloud/session';
import { useStore } from '../cloud/store';
import { CreditNudge, Offers, planName } from './Credits';
import { Icon } from './Icon';

export function syncStatus(state: { syncError: string | null; pendingChanges: boolean }): string {
  if (state.syncError) return 'この ブラウザに ほぞんしました。クラウドほぞんは あとで もういちど おこないます。';
  return state.pendingChanges ? 'えほんを アカウントに ほぞんちゅう…' : 'えほんを アカウントに ほぞんしました。';
}

/** Account status, the AI plan and sign-out; signing in happens on the landing page. This is the one place the web sells (decision #40). */
export function AccountPanel({ repo, onClose }: { repo: BookRepository; onClose: () => void }) {
  const account = useStore(session);
  const state = useStore(repo.state);
  const wallet = useStore(credits);

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
        <section className="account-plan" aria-labelledby="plan-title">
          <h3 id="plan-title">AI クレジット</h3>
          {wallet.ready
            ? <><p className="plan-line"><strong>{wallet.balance.toLocaleString()}</strong> クレジット · {planName(wallet.plan)}<CreditNudge /></p>
              <p className="hint">えや えほんを AI と つくるときに つかいます。1回 およそ 5〜10 クレジット（AI の つかった ぶんだけ）。おえかき、ほぞん、よみきかせは ずっと 無料です。</p>
              <Offers /></>
            : <p className="hint">クレジットを しらべています…</p>}
        </section>
        <p className="hint">サインアウトすると ほんだなは とじ、もういちど サインインすると もどります。えほんは この ブラウザにも のこります。</p>
        <button onClick={() => { repo.saveOpenBook(); void signOut(); }}><Icon name="logout" size={16} />サインアウト</button>
      </>}
      {account.error && <p role="alert" className="error">{account.error === 'offline' ? 'ネットに つながると サインインできます。' : account.error}</p>}
    </section>
  </div>;
}
