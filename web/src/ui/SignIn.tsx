import { useEffect, useState } from 'react';
import { cloud } from '../cloud/config';
import { handoff, startHandoff, stopHandoff, type HandoffState } from '../cloud/handoff';
import { session, signInEmulator, signInWith } from '../cloud/session';
import { useStore } from '../cloud/store';
import { AppleMark, GoogleMark } from './Brand';
import { Icon } from './Icon';
import { QrCode } from './QrCode';
import type { LandingLanguage } from './landingCopy';

export type Intent = 'shelf' | 'studio' | 'reader';
const signInCopy = {
  ja: {
    title: 'はじめる', apple: 'Appleで つづける', google: 'Googleで つづける', or: 'または',
    phone: 'スマホの ぺたぺたで ログイン', phoneHint: 'アプリで QRコードを よみとるだけ。パスワードは いりません。',
    offline: 'ネットに つながると サインインできます。',
    starting: 'QRコードを つくっています…',
    failed: 'QRコードを つくれませんでした。Apple か Google で サインインするか、しばらくして もういちど おためしください。',
    retry: 'もういちど', newCode: 'あたらしい QRコード', qrLabel: 'スマホの ぺたぺたで よみとる QRコード',
    steps: ['スマホで ぺたぺたを ひらき、せってい → パソコンで ぺたぺたを ひらく', 'この QRコードを よみとる（または コードを 入力）', 'スマホで ログイン を おす'],
    code: 'コード', expired: 'コードの ゆうこう きげんが きれました。', waiting: '3分間 ゆうこうです。この がめんは そのまま おまちください。',
    reasons: {
      shelf: 'アカウントで サインインすると、えほんが ほぞんされ、スマホの ぺたぺたと つながります。',
      studio: 'サインインすると、この えほんを ひらいて つづきを 描けます。',
      reader: 'サインインすると、この えほんを よめます。',
    },
  },
  en: {
    title: 'Make yourself at home.', apple: 'Continue with Apple', google: 'Continue with Google', or: 'or bring your stories with you',
    phone: 'Sign in with the Peta Peta app', phoneHint: 'Scan a QR code with the phone app. No password needed.',
    offline: 'Connect to the internet to sign in.',
    starting: 'Getting your QR code ready…',
    failed: 'We couldn’t create a QR code. Continue with Apple or Google, or try again in a little while.',
    retry: 'Try again', newCode: 'Get a new QR code', qrLabel: 'Scan this QR code with the Peta Peta phone app',
    steps: ['Open Peta Peta on your phone, then Settings → Open Peta Peta on a computer.', 'Scan this QR code, or enter the code below.', 'Tap Sign in on your phone.'],
    code: 'Code', expired: 'This code has expired.', waiting: 'Valid for 3 minutes. Keep this page open while you sign in.',
    reasons: {
      shelf: 'Sign in to give your stories a place to grow. Your books are saved to your account, ready for your next little spark.',
      studio: 'Sign in to open this picture book and pick up where you left off.',
      reader: 'Sign in to open this picture book and turn the first page.',
    },
  },
};

/** Apple, Google, or the phone: the three ways into an account (decision 58). */
export function SignInCard({ intent = 'shelf', language = 'ja' }: { intent?: Intent; language?: LandingLanguage }) {
  const account = useStore(session);
  const flow = useStore(handoff);
  const [phone, setPhone] = useState(false);
  useEffect(() => () => stopHandoff(), []);
  const disabled = !account.ready || account.busy;
  const copy = signInCopy[language];

  return <section id="sign-in" className="sign-in-card" aria-labelledby="sign-in-title">
    <h2 id="sign-in-title">{copy.title}</h2>
    <p className="hint">{copy.reasons[intent]}</p>
    <div className="sign-in-buttons">
      <button className="apple" disabled={disabled} onClick={() => void signInWith('apple')}><AppleMark />{copy.apple}</button>
      <button className="google" disabled={disabled} onClick={() => void signInWith('google')}><GoogleMark />{copy.google}</button>
    </div>
    <div className="or" role="separator"><span>{copy.or}</span></div>
    {phone
      ? <PhoneLogin state={flow} onRetry={() => void startHandoff()} language={language} />
      : <button className="phone-login" disabled={!account.ready} onClick={() => { setPhone(true); void startHandoff(); }}>
        <Icon name="qr" size={26} />
        <span><strong>{copy.phone}</strong><small>{copy.phoneHint}</small></span>
        <Icon name="chevron" size={16} />
      </button>}
    {cloud?.emulatorHost && <EmulatorSignIn />}
    {account.error && <p role="alert" className="error">{account.error === 'offline' ? copy.offline : account.error}</p>}
  </section>;
}

function PhoneLogin({ state, onRetry, language }: { state: HandoffState; onRetry: () => void; language: LandingLanguage }) {
  const copy = signInCopy[language];
  if (state.phase === 'idle' || state.phase === 'starting') return <p className="loading phone-login-wait" role="status">{copy.starting}</p>;
  if (state.phase === 'failed') {
    return <div className="phone-login-panel phone-login-failed">
      <p className="hint">{copy.failed}</p>
      <button onClick={onRetry}><Icon name="rotate" size={16} />{copy.retry}</button>
    </div>;
  }
  const expired = state.phase === 'expired';
  return <div className="phone-login-panel">
    <div className="qr-frame" data-expired={expired || undefined}>
      {expired
        ? <button className="primary" onClick={onRetry}><Icon name="rotate" size={16} />{copy.newCode}</button>
        : <QrCode text={state.url} label={copy.qrLabel} />}
    </div>
    <div className="phone-login-steps">
      <ol>
        {copy.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <p className="login-code">{copy.code} <code>{state.code.slice(0, 3)} {state.code.slice(3)}</code></p>
      <p className="hint">{expired ? copy.expired : copy.waiting}</p>
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
