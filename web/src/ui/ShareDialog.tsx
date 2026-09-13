import { collection, getDocs, query, where, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { firebase } from '../cloud/firebase';
import { type BookRepository } from '../cloud/repository';
import { session } from '../cloud/session';
import { useStore } from '../cloud/store';
import { paths } from '../routes';
import { Icon } from './Icon';

interface Share { token: string; label: string; createdAt: number }

/** Read-only guest links: one per recipient, revocable, no expiry, no login (decision 41). */
export function ShareDialog({ repo, bookId, title, onClose }: { repo: BookRepository; bookId: string; title: string; onClose: () => void }) {
  const account = useStore(session);
  const state = useStore(repo.state);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const uid = account.signedIn ? account.uid : null;
  const unsynced = state.pendingChanges || !state.books.some((book) => book.id === bookId);

  useEffect(() => {
    if (!uid) { setShares(null); return; }
    const lifetime = new AbortController();
    const { db } = firebase();
    getDocs(query(collection(db, 'shares'), where('ownerId', '==', uid), where('bookId', '==', bookId))).then((snapshot) => {
      if (lifetime.signal.aborted) return;
      setShares(snapshot.docs
        .filter((item) => item.data().revokedAt == null)
        .map((item) => ({ token: item.id, label: item.data().label ?? '', createdAt: (item.data().createdAt as Timestamp | null)?.toMillis() ?? 0 }))
        .sort((a, b) => b.createdAt - a.createdAt));
    }).catch(() => { if (!lifetime.signal.aborted) setError('リンクを よみこめませんでした。'); });
    return () => lifetime.abort();
  }, [uid, bookId, busy]);

  const create = async () => {
    setBusy(true); setError('');
    try {
      await httpsCallable(firebase().functions, 'shareCreate')({ bookId, label });
      setLabel('');
    } catch (raw) {
      setError((raw as { code?: string }).code === 'functions/permission-denied' ? 'えほんの ほぞんが おわってから リンクを つくれます。' : 'リンクを つくれませんでした。');
    } finally { setBusy(false); }
  };
  const revoke = async (token: string) => {
    setBusy(true); setError('');
    try { await httpsCallable(firebase().functions, 'shareRevoke')({ token }); }
    catch { setError('リンクを とめられませんでした。'); }
    finally { setBusy(false); }
  };
  const copy = async (token: string) => {
    const url = `${location.origin}${paths.guest(token)}`;
    try { await navigator.clipboard.writeText(url); setCopied(token); setTimeout(() => setCopied(''), 1500); }
    catch { setError(url); }
  };

  return <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <header className="dialog-header">
        <h2 id="share-title">かぞくに おくる · {title}</h2>
        <button className="ghost icon-button" onClick={onClose} aria-label="とじる"><Icon name="close" size={18} /></button>
      </header>
      {!uid && <p>リンクを つくるには サインインしてください。</p>}
      {uid && <>
        <p className="hint">リンクを ひらいた ひとは、アプリも サインインも なしで えほんを よめます。ひとりに ひとつの リンクを つくると、あとで ひとりずつ とめられます。</p>
        <form className="share-form" onSubmit={(event) => { event.preventDefault(); void create(); }}>
          <label className="field">だれに<input value={label} maxLength={40} placeholder="ばあば" onChange={(event) => setLabel(event.target.value)} /></label>
          <button type="submit" className="primary" disabled={busy || unsynced}><Icon name="link" size={16} />リンクを つくる</button>
        </form>
        {unsynced && <p className="hint">えほんの ほぞんが おわると リンクを つくれます。</p>}
        <ul className="share-list">
          {shares?.map((share) => <li key={share.token}>
            <span className="share-label">{share.label || 'リンク'}</span>
            <code className="share-url">{`${location.host}${paths.guest(share.token)}`}</code>
            <button onClick={() => void copy(share.token)}><Icon name={copied === share.token ? 'check' : 'copy'} size={15} />{copied === share.token ? 'コピーしました' : 'コピー'}</button>
            <button disabled={busy} onClick={() => void revoke(share.token)}><Icon name="stop" size={15} />とめる</button>
          </li>)}
          {shares && shares.length === 0 && <li className="hint">まだ リンクは ありません。</li>}
        </ul>
      </>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  </div>;
}
