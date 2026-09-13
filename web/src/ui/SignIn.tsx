import { useEffect, useState } from 'react';
import { cloud } from '../cloud/config';
import { handoff, startHandoff, stopHandoff, type HandoffState } from '../cloud/handoff';
import { session, signInEmulator, signInWith } from '../cloud/session';
import { useStore } from '../cloud/store';
import { AppleMark, GoogleMark } from './Brand';
import { Icon } from './Icon';
import { QrCode } from './QrCode';

export type Intent = 'shelf' | 'studio' | 'reader';
const reasons: Record<Intent, string> = {
  shelf: 'アカウントで サインインすると、えほんが ほぞんされ、スマホの ぺたぺたと つながります。',
  studio: 'サインインすると、この えほんを ひらいて つづきを 描けます。',
  reader: 'サインインすると、この えほんを よめます。',
};

/** Apple, Google, or the phone: the three ways into an account (decision 58). */
export function SignInCard({ intent = 'shelf' }: { intent?: Intent }) {
  const account = useStore(session);
  const flow = useStore(handoff);
  const [phone, setPhone] = useState(false);
  useEffect(() => () => stopHandoff(), []);
  const disabled = !account.ready || account.busy;

  return <section id="sign-in" className="sign-in-card" aria-labelledby="sign-in-title">
    <h2 id="sign-in-title">はじめる</h2>
    <p className="hint">{reasons[intent]}</p>
    <div className="sign-in-buttons">
      <button className="apple" disabled={disabled} onClick={() => void signInWith('apple')}><AppleMark />Appleで つづける</button>
      <button className="google" disabled={disabled} onClick={() => void signInWith('google')}><GoogleMark />Googleで つづける</button>
    </div>
    <div className="or" role="separator"><span>または</span></div>
    {phone
      ? <PhoneLogin state={flow} onRetry={() => void startHandoff()} />
      : <button className="phone-login" disabled={!account.ready} onClick={() => { setPhone(true); void startHandoff(); }}>
        <Icon name="qr" size={26} />
        <span><strong>スマホの ぺたぺたで ログイン</strong><small>アプリで QRコードを よみとるだけ。パスワードは いりません。</small></span>
        <Icon name="chevron" size={16} />
      </button>}
    {cloud?.emulatorHost && <EmulatorSignIn />}
    {account.error && <p role="alert" className="error">{account.error === 'offline' ? 'ネットに つながると サインインできます。' : account.error}</p>}
  </section>;
}

function PhoneLogin({ state, onRetry }: { state: HandoffState; onRetry: () => void }) {
  if (state.phase === 'idle' || state.phase === 'starting') return <p className="loading phone-login-wait" role="status">QRコードを つくっています…</p>;
  if (state.phase === 'failed') {
    return <div className="phone-login-panel phone-login-failed">
      <p className="hint">QRコードを つくれませんでした。Apple か Google で サインインするか、しばらくして もういちど おためしください。</p>
      <button onClick={onRetry}><Icon name="rotate" size={16} />もういちど</button>
    </div>;
  }
  const expired = state.phase === 'expired';
  return <div className="phone-login-panel">
    <div className="qr-frame" data-expired={expired || undefined}>
      {expired
        ? <button className="primary" onClick={onRetry}><Icon name="rotate" size={16} />あたらしい QRコード</button>
        : <QrCode text={state.url} label="スマホの ぺたぺたで よみとる QRコード" />}
    </div>
    <div className="phone-login-steps">
      <ol>
        <li>スマホで ぺたぺたを ひらき、<b>せってい → パソコンで ぺたぺたを ひらく</b></li>
        <li>この QRコードを よみとる（または コードを 入力）</li>
        <li>スマホで <b>ログイン</b> を おす</li>
      </ol>
      <p className="login-code">コード <code>{state.code.slice(0, 3)} {state.code.slice(3)}</code></p>
      <p className="hint">{expired ? 'コードの ゆうこう きげんが きれました。' : '3分間 ゆうこうです。この がめんは そのまま おまちください。'}</p>
    </div>
  </div>;
}

function EmulatorSignIn() {
  const [subject, setSubject] = useState('tester');
  return <form className="emulator-sign-in" onSubmit={(event) => { event.preventDefault(); void signInEmulator(subject).catch((error: Error) => session.update({ error: error.message })); }}>
    <label className="field">エミュレーター アカウント<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
    <button type="submit"><Icon name="flask" size={16} />エミュレーターで サインイン</button>
  </form>;
}
