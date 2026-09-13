import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cloud } from './cloud/config';
import { libraryPart, type LibraryPart } from './cloud/parts';
import type { BookRepository } from './cloud/repository';
import { useStore } from './cloud/store';
import { codec, loadFonts } from './core';
import { currentRoute, paths } from './routes';
import { Reader } from './ui/Reader';
import './style.css';

function Missing({ text }: { text: string }) {
  return <main className="stage stage-message" role="alert"><p>{text}</p><a className="button ghost" href={paths.shelf}>ほんだなへ</a></main>;
}

/** Family voices are private blobs: a signed URL per play, fetched through the lazily loaded cloud modules. */
async function resolveVoice(audioRef: string): Promise<string> {
  const [{ firebase }, { httpsCallable }] = await Promise.all([import('./cloud/firebase'), import('firebase/functions')]);
  const { data } = await httpsCallable<{ key: string }, { url: string }>(firebase().functions, 'signedRead')({ key: audioRef });
  return data.url;
}

/** The owner's copy: local row first, remote changes as they land, one page listener while open. */
function OwnerReader({ repo, id }: { repo: BookRepository; id: string }) {
  const state = useStore(repo.state);
  const [waited, setWaited] = useState(false);
  const json = repo.bookJson(id);
  useEffect(() => {
    repo.open(id, false);
    const timer = setTimeout(() => setWaited(true), 8000);
    return () => { clearTimeout(timer); repo.close(); };
  }, [repo, id]);
  if (!json) return waited || !cloud ? <Missing text="この えほんは みつかりませんでした。" /> : <p className="loading" role="status">えほんを よみこんでいます…</p>;
  return <Reader json={json} library={repo.library} resolveVoice={state.owner ? resolveVoice : undefined} backHref={paths.shelf} editHref={paths.composer(id)} />;
}

/** A guest link: one fetch, no login, no Firestore, no Firebase SDK in the bundle. */
function GuestReader({ token }: { token: string }) {
  const [state, setState] = useState<{ json: string; title: string; parts: LibraryPart[] } | 'loading' | 'missing'>('loading');
  useEffect(() => {
    if (!cloud) { setState('missing'); return; }
    const lifetime = new AbortController();
    fetch(`${cloud.functionsUrl}/guestBook/${token}`, { signal: lifetime.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json() as { title: string; meta: string; pages: string[]; parts: { partId: string; masterRef: string; w: number; h: number }[] };
        const json = codec.assembleOrNull(body.meta, body.pages);
        if (!json) throw new Error('invalid');
        const parts = body.parts.flatMap((part) => { const resolved = libraryPart(part.partId.replace(/^lib:/, ''), part); return resolved ? [resolved] : []; });
        setState({ json, title: body.title, parts });
      })
      .catch(() => { if (!lifetime.signal.aborted) setState('missing'); });
    return () => lifetime.abort();
  }, [token]);
  if (state === 'loading') return <p className="loading" role="status">えほんを よみこんでいます…</p>;
  if (state === 'missing') return <main className="stage stage-message" role="alert"><p>この リンクは つかえません。おくった ひとに あたらしい リンクを もらってください。</p></main>;
  return <Reader json={state.json} library={null} guestParts={state.parts} caption="ぺたぺた から とどきました" />;
}

function Boot() {
  const [route] = useState(currentRoute);
  const [repo, setRepo] = useState<BookRepository | null>(null);
  useEffect(() => {
    if (route.kind !== 'reader') return;
    let alive = true;
    void import('./cloud/repository').then(({ repository }) => repository()).then((ready) => { if (alive) setRepo(ready); });
    return () => { alive = false; };
  }, [route.kind]);
  if (route.kind === 'guest') return <GuestReader token={route.token} />;
  if (route.kind !== 'reader') return <Missing text="この ページは ありません。" />;
  return repo ? <OwnerReader repo={repo} id={route.id} /> : <p className="loading" role="status">じゅんび しています…</p>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<p className="loading" role="status">じゅんび しています…</p>);
loadFonts().then(() => root.render(<Boot />)).catch(() => {
  root.render(<p className="loading" role="alert">フォントを よみこめませんでした。ページを さいよみこみしてください。</p>);
});
