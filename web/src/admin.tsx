import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cloud } from './cloud/config';
import { firebase } from './cloud/firebase';
import { session, startSession } from './cloud/session';
import { useStore } from './cloud/store';
import { loadFonts } from './core';
import { paths } from './routes';
import { Gate } from './ui/Gate';
import { Icon } from './ui/Icon';
import './style.css';

// The admin page (decision #68): what the AI cost and did, the guards, and one account at a time. Only uids in config/admins may read it.

interface Daily { day: string; turns?: number; errors?: number; refusals?: number; usd?: number; credits?: number; drawings?: number; tokensIn?: number; tokensOut?: number; durationMs?: number; byTask?: Record<string, { turns?: number; usd?: number; credits?: number; errors?: number }>; byModel?: Record<string, { turns?: number; usd?: number }> }
interface Turn { id: string; uid: string; task: string; model: string; rounds: number; drawings: number; usd: number; credits: number; durationMs: number; status: string; error?: string; createdAt?: { toDate(): Date } }
interface Flags { aiEnabled?: boolean; aiDailyUsdCap?: number; aiTurnsPerHour?: number }
interface Account { balance: number; reserved: number; granted: number; spent: number; plan: string }

const DAYS = 14;
const usd = (value = 0) => `$${value.toFixed(2)}`;
const n = (value = 0) => value.toLocaleString('ja-JP');
const seconds = (ms = 0, turns = 1) => `${(ms / Math.max(1, turns) / 1000).toFixed(1)}秒`;
const when = (turn: Turn) => turn.createdAt?.toDate().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) ?? '';

/** Where the rest of the picture lives: the consoles for logs, metrics and the providers' own bills. */
function Links() {
  const project = cloud?.projectId ?? '';
  const logs = `https://console.cloud.google.com/logs/query;query=${encodeURIComponent('jsonPayload.message="ai.turn"')}?project=${project}`;
  return <ul className="admin-links">
    <li><a href={logs} target="_blank" rel="noreferrer">Cloud Logging · すべての AI ターン（jsonPayload.message="ai.turn"）</a></li>
    <li><a href={`https://console.cloud.google.com/logs/query;query=${encodeURIComponent('severity>=WARNING jsonPayload.message=~"^ai\\."')}?project=${project}`} target="_blank" rel="noreferrer">Cloud Logging · AI の エラーと 警告</a></li>
    <li><a href={`https://console.cloud.google.com/monitoring?project=${project}`} target="_blank" rel="noreferrer">Cloud Monitoring · ダッシュボードと アラート</a></li>
    <li><a href={`https://console.firebase.google.com/project/${project}/functions/logs`} target="_blank" rel="noreferrer">Firebase · Functions の ログ</a></li>
    <li><a href={`https://console.firebase.google.com/project/${project}/firestore/data/~2FaiDaily`} target="_blank" rel="noreferrer">Firestore · aiDaily / aiTurns / credits</a></li>
    <li><a href="https://console.anthropic.com/settings/usage" target="_blank" rel="noreferrer">Anthropic Console · 使用量と 請求</a></li>
    <li><a href="https://platform.openai.com/usage" target="_blank" rel="noreferrer">OpenAI Platform · 使用量と 請求</a></li>
    <li><a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer">Stripe · 売上と サブスクリプション</a></li>
  </ul>;
}

function Admin() {
  const account = useStore(session);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [days, setDays] = useState<Daily[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [flags, setFlags] = useState<Flags>({});
  const [cap, setCap] = useState('');
  const [perHour, setPerHour] = useState('');
  const [lookup, setLookup] = useState('');
  const [found, setFound] = useState<Account | null | 'missing'>(null);
  const [grant, setGrant] = useState('100');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    const { db } = firebase();
    const [daily, recent] = await Promise.all([
      getDocs(query(collection(db, 'aiDaily'), orderBy('day', 'desc'), limit(DAYS))),
      getDocs(query(collection(db, 'aiTurns'), orderBy('createdAt', 'desc'), limit(50))),
    ]);
    setDays(daily.docs.map((snapshot) => snapshot.data() as Daily));
    setTurns(recent.docs.map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() as Omit<Turn, 'id'>) })));
  };

  useEffect(() => {
    if (!account.uid) return;
    const { db } = firebase();
    getDoc(doc(db, 'config/admins')).then(() => setAllowed(true), () => setAllowed(false));
  }, [account.uid]);
  useEffect(() => {
    if (!allowed) return;
    const { db } = firebase();
    void load().catch((error: unknown) => setNotice(`読み込めませんでした: ${error instanceof Error ? error.message : String(error)}`));
    return onSnapshot(doc(db, 'config/flags'), (snapshot) => {
      const data = (snapshot.data() ?? {}) as Flags;
      setFlags(data);
      setCap(String(data.aiDailyUsdCap ?? 50));
      setPerHour(String(data.aiTurnsPerHour ?? 30));
    });
  }, [allowed]);

  const saveFlags = async (patch: Flags) => {
    setBusy(true); setNotice('');
    try { await setDoc(doc(firebase().db, 'config/flags'), patch, { merge: true }); setNotice('保存しました。'); }
    catch (error) { setNotice(`保存できませんでした: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };
  const find = async () => {
    const uid = lookup.trim();
    if (!uid) return;
    const snapshot = await getDoc(doc(firebase().db, 'credits', uid));
    setFound(snapshot.exists() ? snapshot.data() as Account : 'missing');
  };
  const adjust = async (patch: { credits?: number; plan?: 'free' | 'plus' }) => {
    setBusy(true); setNotice('');
    try {
      const { data } = await httpsCallable<{ uid: string; credits?: number; plan?: string }, Account>(firebase().functions, 'adminAdjust')({ uid: lookup.trim(), ...patch });
      setFound(data); setNotice('反映しました。'); void load();
    } catch (error) { setNotice(`反映できませんでした: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };

  if (!cloud) return <main className="admin"><p>このビルドには バックエンドが ありません。</p></main>;
  if (allowed === null) return <main className="admin"><p className="loading" role="status">確認しています…</p></main>;
  if (!allowed) return <main className="admin"><h1>管理</h1><p role="alert">管理者のみ ひらけます。<code>config/admins</code> の <code>uids</code> に あなたの uid（<code>{account.uid}</code>）を 追加してください。</p><p><a href={paths.shelf}>ほんだなへ</a></p></main>;

  const today = days[0];
  const total = days.reduce((sum, day) => ({ turns: sum.turns + (day.turns ?? 0), usd: sum.usd + (day.usd ?? 0), credits: sum.credits + (day.credits ?? 0), errors: sum.errors + (day.errors ?? 0) }), { turns: 0, usd: 0, credits: 0, errors: 0 });
  const margin = (day: { usd?: number; credits?: number }) => (day.credits ?? 0) / 100 - (day.usd ?? 0);
  return <main className="admin">
    <header className="admin-head">
      <h1><Icon name="sparkles" size={20} />AI の ようす</h1>
      <span className="hint">{account.displayName} · <a href={paths.shelf}>ほんだな</a></span>
    </header>
    {notice && <p className="admin-notice" role="status">{notice}</p>}

    <section className="admin-cards" aria-label="きょう">
      <div><small>きょうの ターン</small><strong>{n(today?.turns)}</strong><span>エラー {n(today?.errors)} · おことわり {n(today?.refusals)}</span></div>
      <div><small>きょうの モデル費用</small><strong>{usd(today?.usd)}</strong><span>上限 {usd(flags.aiDailyUsdCap ?? 50)}</span></div>
      <div><small>きょうの クレジット</small><strong>{n(today?.credits)}</strong><span>差し引き {usd(margin(today ?? {}))}</span></div>
      <div><small>{DAYS}日間</small><strong>{usd(total.usd)}</strong><span>{n(total.turns)} ターン · {n(total.credits)} クレジット · エラー {n(total.errors)}</span></div>
    </section>

    <section className="admin-panel" aria-label="ガード">
      <h2>ガード</h2>
      <div className="admin-controls">
        <button className={flags.aiEnabled === false ? 'primary' : 'ghost'} disabled={busy} onClick={() => saveFlags({ aiEnabled: flags.aiEnabled === false })}>
          <Icon name={flags.aiEnabled === false ? 'play' : 'stop'} size={14} />{flags.aiEnabled === false ? 'AI を 再開する' : 'AI を 止める'}
        </button>
        <label>1日の 上限 (US$)<input type="number" min={0} step={1} value={cap} onChange={(event) => setCap(event.target.value)} /></label>
        <label>1アカウント 1時間の ターン<input type="number" min={0} step={1} value={perHour} onChange={(event) => setPerHour(event.target.value)} /></label>
        <button disabled={busy} onClick={() => saveFlags({ aiDailyUsdCap: Number(cap), aiTurnsPerHour: Number(perHour) })}>保存</button>
      </div>
      <p className="hint">上限に 達すると その日は AI が 止まります（プロバイダーの 請求は GCP の 予算アラートに 届かないため）。0 で 無制限。</p>
    </section>

    <section className="admin-panel" aria-label="日ごと">
      <h2>日ごと</h2>
      <table>
        <thead><tr><th>日</th><th>ターン</th><th>エラー</th><th>費用</th><th>クレジット</th><th>差し引き</th><th>え</th><th>トークン 入/出</th><th>平均時間</th><th>内訳</th></tr></thead>
        <tbody>{days.map((day) => <tr key={day.day}>
          <td>{day.day}</td><td>{n(day.turns)}</td><td>{n(day.errors)}</td><td>{usd(day.usd)}</td><td>{n(day.credits)}</td><td data-negative={margin(day) < 0 || undefined}>{usd(margin(day))}</td><td>{n(day.drawings)}</td>
          <td>{n(day.tokensIn)} / {n(day.tokensOut)}</td><td>{seconds(day.durationMs, day.turns)}</td>
          <td className="admin-breakdown">{Object.entries(day.byTask ?? {}).map(([task, stat]) => `${task} ${n(stat.turns)}`).join(' · ')}<br />{Object.entries(day.byModel ?? {}).map(([model, stat]) => `${model} ${usd(stat.usd)}`).join(' · ')}</td>
        </tr>)}</tbody>
      </table>
      {!days.length && <p className="hint">まだ ターンが ありません。</p>}
    </section>

    <section className="admin-panel" aria-label="さいきんの ターン">
      <h2>さいきんの ターン</h2>
      <table>
        <thead><tr><th>いつ</th><th>アカウント</th><th>しごと</th><th>モデル</th><th>ラウンド</th><th>え</th><th>費用</th><th>クレジット</th><th>時間</th><th>けっか</th></tr></thead>
        <tbody>{turns.map((turn) => <tr key={turn.id} data-status={turn.status}>
          <td>{when(turn)}</td><td><button className="link" onClick={() => { setLookup(turn.uid); setFound(null); }}>{turn.uid.slice(0, 10)}…</button></td><td>{turn.task}</td><td>{turn.model}</td>
          <td>{n(turn.rounds)}</td><td>{n(turn.drawings)}</td><td>{usd(turn.usd)}</td><td>{n(turn.credits)}</td><td>{seconds(turn.durationMs)}</td><td title={turn.error}>{turn.status}{turn.error ? ` · ${turn.error.slice(0, 60)}` : ''}</td>
        </tr>)}</tbody>
      </table>
    </section>

    <section className="admin-panel" aria-label="アカウント">
      <h2>アカウント</h2>
      <div className="admin-controls">
        <label>uid<input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="アカウントの uid" /></label>
        <button disabled={!lookup.trim()} onClick={() => void find()}>しらべる</button>
      </div>
      {found === 'missing' && <p className="hint">この uid に クレジット口座は ありません（まだ AI を つかっていません）。</p>}
      {found && found !== 'missing' && <div className="admin-account">
        <p>プラン <strong>{found.plan}</strong> · のこり <strong>{n(found.balance)}</strong> · ほりゅう {n(found.reserved)} · これまで {n(found.granted)} もらい {n(found.spent)} つかう</p>
        <div className="admin-controls">
          <label>クレジットを 足す<input type="number" min={1} step={1} value={grant} onChange={(event) => setGrant(event.target.value)} /></label>
          <button disabled={busy || !(Number(grant) > 0)} onClick={() => void adjust({ credits: Number(grant) })}>足す</button>
          <button disabled={busy || found.plan === 'plus'} onClick={() => void adjust({ plan: 'plus' })}>プラスに する</button>
          <button disabled={busy || found.plan === 'free'} onClick={() => void adjust({ plan: 'free' })}>フリーに もどす</button>
        </div>
      </div>}
    </section>

    <section className="admin-panel" aria-label="ほかの ダッシュボード">
      <h2>ほかの ダッシュボード</h2>
      <Links />
    </section>
  </main>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<p className="loading" role="status">じゅんび しています…</p>);
startSession();
const ready = new Promise<void>((resolve) => { if (session.get().ready) resolve(); else { const unsubscribe = session.subscribe((state) => { if (state.ready) { unsubscribe(); resolve(); } }); } });
Promise.all([loadFonts(), ready]).then(() => root.render(<Gate intent="shelf"><Admin /></Gate>)).catch(() => root.render(<p role="alert">ひらけませんでした。</p>));
