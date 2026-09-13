import { useState } from 'react';
import { cloud } from '../cloud/config';
import { type BookRepository } from '../cloud/repository';
import { session, signInEmulator, signInWith, signOut } from '../cloud/session';
import { useStore } from '../cloud/store';

export function syncStatus(state: { syncError: string | null; pendingChanges: boolean }): string {
  if (state.syncError) return 'この ブラウザに ほぞんしました。クラウドほぞんは あとで もういちど おこないます。';
  return state.pendingChanges ? 'えほんを アカウントに ほぞんちゅう…' : 'えほんを アカウントに ほぞんしました。';
}

/** Sign-in and account status. The web sells nothing here either; billing lives on its own page later. */
export function AccountPanel({ repo, onClose }: { repo: BookRepository; onClose: () => void }) {
  const account = useStore(session);
  const state = useStore(repo.state);
  const [subject, setSubject] = useState('tester');

  return <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <header className="dialog-header">
        <h2 id="account-title">アカウント</h2>
        <button onClick={onClose} aria-label="とじる">✕</button>
      </header>
      {!cloud && <p>このビルドは クラウドほぞんの じゅんびちゅうです。えほんは この ブラウザに ほぞんされています。</p>}
      {cloud && account.signedIn && <>
        <p className="account-name">{account.displayName || 'サインインずみ'}</p>
        <p className="status" data-pending={state.pendingChanges}>{syncStatus(state)}</p>
        <p className="hint">サインアウトしても この ブラウザの えほんは のこります。</p>
        <button onClick={() => { repo.saveOpenBook(); void signOut(); }}>サインアウト</button>
      </>}
      {cloud && !account.signedIn && <>
        <h3>えほんを アカウントに ほぞんする</h3>
        <p className="hint">サインインすると、スマホの ぺたぺたでも おなじ えほんが よめます。</p>
        <div className="sign-in-buttons">
          <button className="apple" disabled={!account.ready || account.busy} onClick={() => void signInWith('apple')}> Appleで つづける</button>
          <button disabled={!account.ready || account.busy} onClick={() => void signInWith('google')}>Googleで つづける</button>
        </div>
        {cloud.emulatorHost && <form className="emulator-sign-in" onSubmit={(event) => { event.preventDefault(); void signInEmulator(subject).catch((error: Error) => session.update({ error: error.message })); }}>
          <label className="field">エミュレーター アカウント<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
          <button type="submit">エミュレーターで サインイン</button>
        </form>}
      </>}
      {account.error && <p role="alert" className="error">{account.error === 'offline' ? 'ネットに つながると サインインできます。' : account.error}</p>}
    </section>
  </div>;
}
