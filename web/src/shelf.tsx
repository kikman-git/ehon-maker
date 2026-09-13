import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cloud } from './cloud/config';
import { repository, type BookRepository, type BookSummary } from './cloud/repository';
import { session } from './cloud/session';
import { useStore } from './cloud/store';
import { blankBook, loadFonts } from './core';
import { loadTemplates, templateBook, templateStore } from './templates';
import { currentRoute, paths } from './routes';
import { AccountPanel, syncStatus } from './ui/Account';
import { ShareDialog } from './ui/ShareDialog';
import { Thumbnail } from './ui/Thumbnail';
import { Gate } from './ui/Gate';
import { Icon } from './ui/Icon';
import { HandoffNotice } from './ui/Landing';
import './style.css';

const shapeName: Record<string, string> = { SQUARE: 'ましかく', LANDSCAPE: 'よこなが', PORTRAIT: 'たてなが' };
const when = (ms: number) => new Date(ms).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });

function Shelf({ repo }: { repo: BookRepository }) {
  const state = useStore(repo.state);
  const account = useStore(session);
  const [panel, setPanel] = useState<'none' | 'account' | 'templates'>('none');
  const [shareFor, setShareFor] = useState<BookSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const catalog = useStore(templateStore);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => { if (panel === 'templates') void loadTemplates().catch(() => undefined); }, [panel]);
  // The published documents arrive after the index; each card paints as soon as its own book is in.
  useEffect(() => {
    if (panel !== 'templates' || catalog.status !== 'ready') return;
    let alive = true;
    for (const template of catalog.items) {
      if (previews[template.id]) continue;
      void templateBook(template.id, 'preview-' + template.id).then((json) => { if (alive) setPreviews((current) => ({ ...current, [template.id]: json })); }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [panel, catalog]);

  const create = async (templateId?: string) => {
    if (creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const json = templateId ? await templateBook(templateId) : blankBook();
      if (!repo.save(json)) throw new Error('Could not create book');
      await repo.flush();
      location.assign(paths.composer(repo.summary(json).id));
    } catch { setCreateError('えほんを作れませんでした。もう一度お試しください。'); setCreating(false); }
  };

  return <>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Icon name="brush" /></span><h1>ぺたぺた</h1><span className="studio-wordmark">STUDIO</span></div>
      <div className="actions">
        {cloud && account.signedIn && <span className="status" data-pending={state.pendingChanges} title={syncStatus(state)}>{state.pendingChanges ? 'ほぞんちゅう…' : 'ほぞんずみ'}</span>}
        {cloud && <button className="account-button" onClick={() => setPanel('account')}><Icon name="user" size={16} /><span>{account.displayName || 'アカウント'}</span></button>}
        <button className="primary" disabled={creating} onClick={() => void create()}><Icon name="plus" size={16} /> 新しく描く</button>
      </div>
    </header>
    {!cloud && <div className="notice">作品はこのブラウザに保存されます。</div>}
    {createError && <p role="alert" className="error">{createError}</p>}
    <main className="shelf" aria-label="ほんだな">
      <section className="shelf-intro">
        <div><span className="eyebrow">YOUR ILLUSTRATION STUDIO</span><h2>一筆から、物語を。</h2><p>白いページに自由に描く。言葉を添えて、えほんにする。<br />あなただけの一冊を、ここから。</p><div className="actions">
          <button className="primary" disabled={creating} onClick={() => void create()}><Icon name="brush" />{creating ? '準備しています…' : '白紙から描きはじめる'}</button>
          <button aria-label="あたらしい えほん" onClick={() => setPanel('templates')}><Icon name="sparkles" size={17} />テンプレートから</button>
        </div></div>
        <div className="start-sheet" aria-hidden="true"><svg viewBox="0 0 180 180" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M28 138c23-14 52-5 73-9s38-13 54-6M50 123c-9-18-9-31 5-43-4-16 1-29 5-33l17 20c9-3 17-3 24 0l18-20c5 11 9 23 4 34 11 13 13 28 4 42M77 91v3m25-3v3m-21 12c5 5 9 5 15 0M65 123c-13-7-26-7-25-20" /><path d="m30 43 2-8 3 8 8 3-8 3-3 8-2-8-8-3 8-3Zm114 38 2-7 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" stroke="#c8b569" /></svg></div>
      </section>
      <div className="shelf-section-title"><h2>あなたのえほん</h2><span>{state.books.length} 作品</span></div>
      {state.books.length === 0 && <section className="empty">
        <h3>最初の一冊を描いてみましょう</h3>
        <p>描きはじめると、ここからいつでも続きを開けます。</p>
      </section>}
      <ul className="book-grid">
        {state.books.map((book) => {
          const json = repo.bookJson(book.id);
          return <li key={book.id} className="book-card">
            <a className="book-cover" href={paths.composer(book.id)} aria-label={`${book.title} の続きを描く`}>
              {json && <Thumbnail json={json} library={repo.library} className="cover-canvas" />}
            </a>
            <div className="book-meta">
              <h2>{book.title}</h2>
              <p className="hint">{book.pageCount} ページ · {shapeName[book.shape] ?? book.shape} · {when(book.updatedAtEpochMs)}</p>
            </div>
            <div className="book-actions">
              <a className="button" href={paths.composer(book.id)}><Icon name="brush" size={15} />続きを描く</a>
              <a className="button" href={paths.reader(book.id)}><Icon name="book" size={15} />よむ</a>
              <button disabled={!cloud} onClick={() => setShareFor(book)}><Icon name="send" size={15} />おくる</button>
              {confirmDelete === book.id
                ? <button className="danger" onClick={() => { repo.delete(book.id); setConfirmDelete(null); }}><Icon name="trash" size={15} />ほんとうに けす</button>
                : <button onClick={() => setConfirmDelete(book.id)}><Icon name="trash" size={15} />けす</button>}
            </div>
          </li>;
        })}
      </ul>
    </main>
    {panel === 'account' && <AccountPanel repo={repo} onClose={() => setPanel('none')} />}
    {panel === 'templates' && <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setPanel('none'); }}>
      <section className="dialog template-dialog" role="dialog" aria-modal="true" aria-labelledby="templates-title">
        <header className="dialog-header"><h2 id="templates-title">テンプレートを選ぶ</h2><button className="ghost icon-button" onClick={() => setPanel('none')} aria-label="とじる"><Icon name="close" size={18} /></button></header>
        <p className="hint">好きな世界から、描きはじめましょう。絵を動かしたり、ことばを書きかえたりできます。</p>
        <ul className="template-list">
          {catalog.status === 'loading' && <li className="template-status"><p role="status">おはなしを よみこんでいます…</p></li>}
          {catalog.status === 'error' && <li className="template-status"><p role="alert">おはなしを よみこめませんでした。</p><button onClick={() => void loadTemplates(true).catch(() => undefined)}><Icon name="rotate" size={15} />もういちど</button></li>}
          {catalog.items.map((template) => { const spread = template.shape === 'PORTRAIT' && template.pageCount > 1; const preview = previews[template.id]; return <li key={template.id}>
            <button className="template" disabled={creating} onClick={() => void create(template.id)}>
              <span className="template-preview" data-spread={spread || undefined}>{preview ? <><Thumbnail json={preview} library={repo.library} className="template-canvas" />{spread && <Thumbnail json={preview} library={repo.library} pageIndex={1} className="template-canvas" />}</> : <span className="template-canvas template-pending" aria-hidden="true" />}<span className="template-format">{spread ? '見開き' : shapeName[template.shape] ?? template.shape}</span></span>
              <strong>{template.title}</strong>
              <span className="template-provenance">{template.pageCount}ページ · オリジナルストーリー · えも ことばも うごかせる</span>
              <span>{template.description}</span>
            </button>
          </li>; })}
        </ul>
      </section>
    </div>}
    {shareFor && <ShareDialog repo={repo} bookId={shareFor.id} title={shareFor.title} onClose={() => setShareFor(null)} />}
    {state.syncError === 'diskError' && <p role="alert" className="error">ほぞんできませんでした。ブラウザの あきようりょうを たしかめてください。</p>}
  </>;
}

function Boot() {
  const [repo, setRepo] = useState<BookRepository | null>(null);
  useEffect(() => {
    let alive = true;
    void repository().then((ready) => { if (alive) setRepo(ready); });
    return () => { alive = false; };
  }, []);
  return repo ? <Shelf repo={repo} /> : <p className="loading" role="status">じゅんび しています…</p>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<p className="loading" role="status">じゅんび しています…</p>);
const route = currentRoute();
loadFonts().then(() => root.render(route.kind === 'login' ? <HandoffNotice /> : <Gate intent="shelf"><Boot /></Gate>)).catch(() => {
  root.render(<p className="loading" role="alert">フォントを よみこめませんでした。ページを さいよみこみしてください。</p>);
});
