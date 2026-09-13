import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { assets } from './cloud/assetLoader';
import { cloud } from './cloud/config';
import { repository, type BookRepository } from './cloud/repository';
import { session } from './cloud/session';
import { useStore } from './cloud/store';
import { UploadError, uploadIllustration, type UploadFailure } from './cloud/uploads';
import { Workspace } from './cloud/workspace';
import { backgrounds, blankBook, bookGlyphs, codec, createEditor, cssColor, drawingColors, ensureGlyphs, fontChoices, loadFonts, parts, templateBook, templates } from './core';
import { Desk, type DeskHandle } from './desk/Desk';
import { dragging, startPartDrag } from './desk/drag';
import { colorNames, drawingTools, type DrawingTool } from './desk/tools';
import { currentRoute, paths } from './routes';
import { syncStatus } from './ui/Account';
import { Icon } from './ui/Icon';
import { PartPreview } from './ui/PartPreview';
import './style.css';

function download(contents: Blob, name: string) {
  const url = URL.createObjectURL(contents);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Layout choices survive reloads; a blocked storage just means the defaults. */
function remembered(key: string, fallback: boolean) {
  try { const saved = localStorage.getItem(key); return saved === null ? fallback : saved === '1'; } catch { return fallback; }
}
function remember(key: string, value: boolean) {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* the choice still holds for this page */ }
}

const uploadMessages: Record<UploadFailure, string> = {
  type: 'PNG か WebP の ファイルを えらんでください。',
  size: '25MB までの ファイルに してください。',
  dimensions: '2048px までの えに してください。',
  alpha: 'はいけいが とうめいな えに してください。',
  network: 'アップロードできませんでした。もういちど おためしください。',
  quota: 'ほぞんできる ようりょうが いっぱいです。',
  signedOut: 'サインインすると イラストを アップロードできます。',
};

/**
 * The composer. Without a book id it is the local harness (file open/save, templates); with one it
 * edits a repository book: autosave, lease, remote replacement, the personal illustration library
 * and the scratch desk.
 */
function Composer({ repo, bookId, initialJson }: { repo: BookRepository; bookId: string | null; initialJson: string }) {
  const cloudBook = bookId !== null;
  const repoState = useStore(repo.state);
  const account = useStore(session);
  const library = useStore(repo.library.state);
  const ghost = useStore(dragging).active;
  const [editor, setEditor] = useState(() => createEditor(initialJson));
  const [revision, setRevision] = useState(editor.revision);
  const [template, setTemplate] = useState(cloudBook ? '' : new URLSearchParams(location.search).get('template') || '');
  const [tool, setTool] = useState<DrawingTool>(() => editor.artJson() !== '[]' ? 'select' : 'brush');
  const [panelOpen, setPanelOpen] = useState(() => remembered('studio.panel', true));
  const [stripOpen, setStripOpen] = useState(() => remembered('studio.strip', true));
  const bookArt = useMemo(() => JSON.parse(editor.artJson()) as { id: string; name: string; aspect: number }[], [editor, revision]);
  const [category, setCategory] = useState(() => (bookArt.length ? 'art' : parts[0].category));
  const [draft, setDraft] = useState('');
  const [ruby, setRuby] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [workspace] = useState(() => (bookId ? new Workspace(bookId) : null));
  const importRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const deskRef = useRef<DeskHandle>(null);
  const generation = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readOnly = cloudBook && repoState.readOnly;
  const assetsUrl = cloud?.assetsUrl ?? null;

  const persist = () => { if (cloudBook && !editor.isGestureActive) repo.save(editor.bookJson()); };
  const saveNow = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    persist();
  };
  const changed = () => {
    setRevision(editor.revision);
    if (cloudBook) {
      // Make completed gestures durable immediately; debounce only the network write.
      if (!editor.isGestureActive) repo.save(editor.bookJson(), false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { saveTimer.current = null; persist(); }, 2000);
    }
    repo.flushRemote();
  };
  const edit = (action: () => void) => {
    if (readOnly || editor.isGestureActive) return;
    try { action(); changed(); setError(''); }
    catch { setError('へんこう できませんでした。もういちど おためしください。'); }
  };

  const showPanel = (open: boolean) => { setPanelOpen(open); remember('studio.panel', open); };
  const showStrip = (open: boolean) => { setStripOpen(open); remember('studio.strip', open); };

  const chooseTool = (next: DrawingTool) => {
    if (editor.isGestureActive) return;
    setTool(next);
    // Words and materials live in the panel, so these tools bring it back.
    if (next === 'text' || next === 'parts') showPanel(true);
    editor.setEraser(next === 'eraser');
    if (next === 'brush' || next === 'eraser' || next === 'hand') editor.clearSelection();
    setRevision(editor.revision);
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as Element)?.closest('input, textarea, select, [contenteditable], dialog, [role=dialog]') || event.altKey || editor.isGestureActive) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        edit(() => event.shiftKey ? editor.redo() : editor.undo());
        return;
      }
      if (event.metaKey || event.ctrlKey) return;
      const next = drawingTools.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (next) { event.preventDefault(); chooseTool(next.id); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [editor, readOnly]);

  useEffect(() => {
    const save = () => { if (!editor.isGestureActive) saveNow(); };
    const visibility = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', visibility); };
  }, [editor]);

  useEffect(() => {
    editor.setImageProvider((ref) => assets.image(ref));
    void bookGlyphs(editor.bookJson());
    if (!cloudBook) return () => { generation.current++; editor.dispose(); };
    repo.liveBook = (id) => (id === editor.bookId ? editor.bookJson() : null);
    repo.isGestureActive = () => editor.isGestureActive;
    repo.onRemote = (json) => {
      if (editor.isGestureActive) return;
      try {
        if (json !== editor.bookJson()) { editor.replaceBook(json); setRevision(editor.revision); void bookGlyphs(json); }
      } catch { /* a foreign or malformed document never replaces the open book */ }
    };
    repo.onIdentityChange = () => location.assign(paths.shelf);
    repo.open(editor.bookId, true);
    return () => {
      saveNow();
      repo.close();
      repo.liveBook = () => null;
      repo.isGestureActive = () => false;
      repo.onRemote = () => {};
      repo.onIdentityChange = () => {};
      generation.current++;
      editor.dispose();
    };
  }, [editor]);

  useEffect(() => {
    repo.library.apply(editor);
    assets.prefetch(editor.rasterPartIds().flatMap((id) => { const part = repo.library.find(id); return part ? [part.masterRef] : []; }));
    setRevision(editor.revision);
  }, [editor, library.parts]);

  useEffect(() => { workspace?.start(repoState.owner); }, [workspace, repoState.owner]);
  useEffect(() => () => workspace?.stop(), [workspace]);

  const openBook = async (file: File) => {
    const request = ++generation.current;
    const expectedRevision = editor.revision;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Book too large.');
      const json = await file.text();
      if (request !== generation.current) return;
      if (expectedRevision !== editor.revision) {
        setError('へんしゅうが つづいています。ファイルを もういちど ひらいてください。');
        return;
      }
      const migrated = codec.migrate(json);
      if (cloudBook) {
        if (repo.summary(migrated).id !== editor.bookId) { setError('べつの えほんの ファイルです。ほんだなから ひらいてください。'); return; }
        editor.replaceBook(migrated);
        void bookGlyphs(migrated);
        changed();
        return;
      }
      const next = createEditor(migrated);
      setEditor(next);
      setRevision(next.revision);
      setTemplate('');
      setDraft('');
      setRuby('');
      setError('');
      setTool(next.artJson() !== '[]' ? 'select' : 'brush');
    } catch {
      if (request === generation.current) setError('このファイルは ひらけませんでした。ぺたぺたの .ehon ファイルを えらんでください。');
    }
  };

  const keepOnShelf = async () => {
    const json = editor.bookJson();
    if (!repo.save(json)) { setError('ほんだなに ほぞんできませんでした。'); return; }
    await repo.flush();
    location.assign(paths.composer(editor.bookId));
  };

  /** Reading needs a shelf copy, so a template preview is kept first. */
  const readBook = async () => {
    if (editor.isGestureActive) return;
    saveNow();
    if (!cloudBook && !repo.save(editor.bookJson())) { setError('保存できませんでした。ファイルに保存してから開いてください。'); return; }
    await repo.flush();
    location.assign(paths.reader(editor.bookId));
  };

  const goHome = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (editor.isGestureActive) return;
    saveNow();
    if (!cloudBook && !repo.save(editor.bookJson())) { setError('保存できませんでした。ファイルに保存してからホームに戻ってください。'); return; }
    await repo.flush();
    location.assign(paths.shelf);
  };

  const upload = async (file: File) => {
    if (!account.signedIn || !account.uid) { setError(uploadMessages.signedOut); return; }
    setUploading(true);
    setError('');
    try {
      await uploadIllustration(file, uploadName || file.name.replace(/\.[^.]+$/, ''), account.uid);
      setUploadName('');
    } catch (raw) {
      setError(raw instanceof UploadError ? uploadMessages[raw.reason] : uploadMessages.network);
    } finally { setUploading(false); }
  };

  /** Library buttons place on a tap and drag onto a frame or the desk; a finished drag swallows its click. */
  const partButton = (partId: string, label: string, size: number, content: React.ReactNode) => <button
    key={partId}
    disabled={readOnly}
    onPointerDown={(event) => startPartDrag(event, partId, label, (x, y) => {
      if (!deskRef.current?.drop(partId, x, y)) setError(partId.startsWith('lib:') && !workspace ? 'イラストは ページの うえに おいてください。' : 'パーツは ページの うえに おいてください。');
    })}
    onClick={(event) => {
      if (event.currentTarget.dataset.dragged) { delete event.currentTarget.dataset.dragged; return; }
      edit(() => editor.addPartAt(partId, 50, 52, size, editor.partHeightPct(partId, size)));
    }}
  >{content}</button>;

  const setDraftValue = (value: string) => {
    setDraft(value);
    void ensureGlyphs({ [editor.fontId]: value });
    edit(() => editor.setDraftText(value));
  };

  const exportPage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(2048 * Math.min(1, editor.pageAspect));
    canvas.height = Math.round(2048 / Math.max(1, editor.pageAspect));
    editor.render(canvas.getContext('2d')!, canvas.width, canvas.height, editor.pageIndex, true);
    canvas.toBlob((blob) => {
      if (blob) download(blob, editor.title + '-' + (editor.pageIndex + 1) + '.png');
      canvas.width = canvas.height = 0;
    });
  };

  const activeTool = drawingTools.find((item) => item.id === tool)!;
  const isDrawing = tool === 'brush' || tool === 'eraser';

  return <div className="studio-app">
    <header className="topbar studio-header">
      <a className="brand" href={paths.shelf} onClick={(event) => void goHome(event)} aria-label="ぺたぺた ホーム"><span className="brand-mark"><Icon name="brush" /></span><h1>ぺたぺた</h1><span className="studio-wordmark">STUDIO</span></a>
      <div className="document-title"><strong>{editor.title}</strong><span>{cloudBook ? 'このブラウザに自動保存' : 'おためし · 本棚に保存して続けられます'}</span></div>
      <div className="actions">
        <a className="button ghost shelf-link" href={paths.shelf} onClick={(event) => void goHome(event)}><Icon name="home" size={17} />ホーム</a>
        {cloudBook && account.signedIn && <span className="status" data-pending={repoState.pendingChanges} title={syncStatus(repoState)}>{repoState.pendingChanges ? '同期中…' : '同期済み'}</span>}
        <button className="ghost read-button" title="読むモードで開く" onClick={() => void readBook()}><Icon name="book" size={17} /><span>よむ</span></button>
        <details className="file-menu">
          <summary className="button">ファイル <span aria-hidden="true">⌄</span></summary>
          <div className="file-popover">
            <button onClick={() => importRef.current?.click()}>ファイルを開く</button>
            <button aria-label="ファイルに ほぞん" onClick={() => download(new Blob([editor.bookJson()], { type: 'application/json' }), editor.bookId + '.ehon')}>えほんを保存 (.ehon)</button>
            {!cloudBook && <button aria-label="ほんだなに ほぞん" onClick={() => void keepOnShelf()}>本棚に保存</button>}
            {!cloudBook && <label className="field">テンプレート
              <select value={template} onChange={(event) => {
                generation.current++;
                const next = createEditor(templateBook(event.target.value));
                setEditor(next); setRevision(next.revision); setTemplate(event.target.value); setDraft(''); setRuby(''); setError(''); setTool(next.artJson() !== '[]' ? 'select' : 'brush');
                setCategory(JSON.parse(next.artJson()).length ? 'art' : parts[0].category);
              }}>
                <option value="" disabled>ファイルから</option>
                {templates.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>}
          </div>
        </details>
        <input ref={importRef} type="file" accept=".ehon,application/json" hidden onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ''; if (file) void openBook(file);
        }} />
        <button className="primary export-button" aria-label="PNGを書き出す" onClick={exportPage}><Icon name="download" size={17} /><span>PNGを書き出す</span></button>
      </div>
    </header>
    {readOnly && <div className="lease-banner" role="status">ほかの たんまつで へんしゅうちゅう。<a href={paths.reader(editor.bookId)}>この えほんを よむ</a></div>}
    {error && <p role="alert" className="error">{error}</p>}
    {repoState.syncError === 'diskError' && <p role="alert" className="error">保存できませんでした。ファイルメニューからえほんを保存してください。</p>}
    <div className="studio-toolbar">
      <nav className="drawing-tools" aria-label="描画ツール">
        {drawingTools.map((item) => <button key={item.id} className="tool-button" aria-pressed={tool === item.id} aria-label={item.label} title={item.label + ' (' + item.key + ')'} aria-keyshortcuts={item.key} onClick={() => chooseTool(item.id)}>
          <Icon name={item.id} /><span>{item.label}</span><kbd>{item.key}</kbd>
        </button>)}
      </nav>
      <div className="toolbar-right">
        <div className="layout-tools" role="group" aria-label="表示">
          <button aria-label="ツールパネル" aria-pressed={panelOpen} title={panelOpen ? 'ツールパネルを隠す' : 'ツールパネルを表示'} onClick={() => showPanel(!panelOpen)}><Icon name="panel" size={18} /></button>
          <button aria-label="ページ一覧" aria-pressed={stripOpen} title={stripOpen ? 'ページ一覧を隠す' : 'ページ一覧を表示'} onClick={() => showStrip(!stripOpen)}><Icon name="pages" size={18} /></button>
        </div>
        <div className="history-tools">
          <button aria-label="もどす" title="元に戻す (⌘ / Ctrl + Z)" disabled={!editor.canUndo || readOnly} onClick={() => edit(() => editor.undo())}><Icon name="undo" size={18} /><span>元に戻す</span></button>
          <button aria-label="やりなおす" title="やり直す (⌘ / Ctrl + Shift + Z)" disabled={!editor.canRedo || readOnly} onClick={() => edit(() => editor.redo())}><Icon name="redo" size={18} /></button>
        </div>
      </div>
    </div>
    <main className="workspace studio-workspace" data-readonly={readOnly || undefined} data-panel={panelOpen ? undefined : 'hidden'}>
      <aside className="tool-panel" aria-label={activeTool.label + 'の設定'}>
        <div className="panel-heading"><span className="eyebrow">{isDrawing ? 'DRAWING' : 'TOOLS'}</span><h2>{activeTool.label}</h2><p>{activeTool.hint}</p></div>
        {isDrawing && <fieldset disabled={readOnly}>
          <div className="brush-preview" aria-hidden="true">
            <svg viewBox="0 0 200 64"><path d="M18 43 C40 43 45 16 70 20 S100 53 124 35 S161 13 182 26" fill="none" stroke={tool === 'eraser' ? '#b1b6b4' : cssColor(drawingColors[editor.crayonIndex])} strokeWidth={editor.brushStep * 4} strokeLinecap="round" /></svg>
            <span>{tool === 'eraser' ? '消しゴム' : colorNames[editor.crayonIndex]}</span>
          </div>
          <h3>太さ</h3>
          <div className="brush-sizes" role="group" aria-label="ブラシの太さ">
            {['細い', 'ふつう', '太い'].map((name, index) => <button key={name} aria-pressed={editor.brushStep === index + 1} onClick={() => edit(() => { editor.setBrush(index + 1); editor.setEraser(tool === 'eraser'); })}>
              <span className="brush-dot" style={{ width: 5 + index * 6, height: 5 + index * 6 }} /><span>{name}</span>
            </button>)}
          </div>
          {tool === 'brush' && <><h3>カラー <span className="color-value">{cssColor(drawingColors[editor.crayonIndex]).toUpperCase()}</span></h3>
            <div className="drawing-colors" role="group" aria-label="描画カラー">{drawingColors.map((color, index) => <button key={color} aria-label={colorNames[index]} title={colorNames[index]} aria-pressed={editor.crayonIndex === index} style={{ backgroundColor: cssColor(color) }} onClick={() => edit(() => editor.setCrayon(index))}>{editor.crayonIndex === index && <Icon name="check" size={16} style={{ color: index < 7 ? '#fff' : '#243a31' }} />}</button>)}</div>
          </>}
        </fieldset>}
        {tool === 'parts' && <>
          <label className="field" htmlFor="material-category">しゅるい</label><select id="material-category" value={category} onChange={(event) => setCategory(event.target.value)}>{bookArt.length > 0 && <option value="art">この えほんの え</option>}{[...new Set(parts.map((part) => part.category))].map((item) => <option key={item}>{item}</option>)}</select>
          <div className="parts material-grid">{category === 'art'
            ? bookArt.map((art) => partButton(art.id, art.name, 30, <><PartPreview editor={editor} partId={art.id} /><span className="part-name">{art.name}<span aria-hidden="true">＋</span></span></>))
            : parts.filter((part) => part.category === category).map((part) => partButton(part.id, part.name, 26, <><PartPreview editor={editor} partId={part.id} /><span className="part-name">{part.name}<span aria-hidden="true">＋</span></span></>))}</div>
          {cloud && <>
            <h3>マイイラスト</h3>
            {account.signedIn ? <div className="upload">
              <input ref={uploadRef} type="file" accept="image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
              <label className="field">なまえ<input value={uploadName} maxLength={40} placeholder="イラストの名前" onChange={(event) => setUploadName(event.target.value)} /></label>
              <button disabled={uploading || readOnly} onClick={() => uploadRef.current?.click()}>{uploading ? 'アップロード中…' : '画像をアップロード'}</button>
              <p className="hint">背景が透明な PNG / WebP、2048px まで。</p>
            </div> : <p className="hint">{uploadMessages.signedOut}</p>}
            <div className="parts library-parts">{library.parts.map((part) => partButton(part.partId, part.title || 'イラスト', 30, <>{assetsUrl && <img src={assetsUrl + '/' + part.masterRef + '/256.webp'} alt="" loading="lazy" decoding="async" draggable={false} />}<span>{part.title || 'イラスト'}</span></>))}</div>
          </>}
        </>}
        {(tool === 'text' || editor.selectedText != null) && <fieldset disabled={readOnly} className="text-tools">
          <label className="field" htmlFor="story-text">ことば</label><textarea id="story-text" value={editor.selectedText ?? draft} onChange={(event) => setDraftValue(event.target.value)} placeholder="物語の言葉をここに…" />
          <label className="field">ふりがな<input value={editor.selectedText != null ? editor.selectedRuby ?? '' : ruby} onChange={(event) => {
            const value = event.target.value; setRuby(value); void ensureGlyphs({ [editor.fontId]: value }); edit(() => editor.setDraftRuby(value));
          }} /></label>
          <label className="field">じの かたち<select value={editor.fontId} onChange={(event) => edit(() => editor.setFont(event.target.value))}>{fontChoices.map((face) => <option key={face.id} value={face.id}>{face.name}</option>)}</select></label>
          <button className="text-commit primary" aria-label="ことばを はる" onClick={() => edit(() => { if (editor.commitText()) { setDraft(''); setRuby(''); } })}>{editor.selectedText != null ? '編集を おわる' : 'ページに追加'}</button>
        </fieldset>}
        {(tool === 'select' || ((tool === 'parts' || tool === 'text') && editor.selectedId)) && <>
          <h3>選択したもの</h3>
          {!editor.selectedId && <p className="hint">ページ上のイラストや文字を選択してください。</p>}
          <fieldset disabled={!editor.selectedId || readOnly} className="selection-tools">
            <button onClick={() => edit(() => editor.resizeSelected(false))}>小さく</button><button onClick={() => edit(() => editor.resizeSelected(true))}>大きく</button>
            <button onClick={() => edit(() => editor.rotateSelected())}>回転</button><button onClick={() => edit(() => editor.deleteSelected())}>削除</button>
            <button onClick={() => edit(() => editor.sendBackward())}>背面へ</button><button onClick={() => edit(() => editor.bringForward())}>前面へ</button>
          </fieldset>
        </>}
        {tool === 'hand' && <div className="navigation-guide"><Icon name="hand" size={40} /><p>細かいところまで、自由に。</p><span>⌘ / Ctrl + スクロールで拡大・縮小。<br />「ページに合わせる」で全体に戻れます。</span></div>}
        <div className="paper-settings"><h3>用紙の色</h3><div className="swatches">{[-1, ...backgrounds].map((color, index) => <button key={color} disabled={readOnly} aria-label={'ページの いろ ' + (index + 1)} title={index === 0 ? '白' : '用紙の色 ' + (index + 1)} style={{ backgroundColor: cssColor(color) }} onClick={() => edit(() => editor.setPageBackground(color))} />)}</div></div>
        <div className="panel-shortcuts"><span><kbd>Space</kbd> 押しながらドラッグで移動</span><span><kbd>⌘ / Ctrl Z</kbd> 元に戻す</span></div>
      </aside>
      <section className="desk" aria-label="えほんを つくる">
        <Desk ref={deskRef} editor={editor} revision={revision} readOnly={readOnly} onChange={changed} workspace={workspace} library={repo.library} assetsUrl={assetsUrl} tool={tool} showStrip={stripOpen} />
      </section>
    </main>
    {ghost && <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">{ghost.label}</div>}
  </div>;
}

function Missing({ text }: { text: string }) {
  return <main className="stage-message" role="alert"><p>{text}</p><a className="button" href={paths.shelf}>ほんだなへ</a></main>;
}

/** Waits for the local row, or for the shelf listener to deliver a book made on another device. */
function CloudBoot({ repo, id }: { repo: BookRepository; id: string }) {
  useStore(repo.state);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 8000);
    return () => clearTimeout(timer);
  }, []);
  const json = repo.bookJson(id);
  if (!json) return waited || !cloud ? <Missing text="この えほんは みつかりませんでした。" /> : <p className="loading" role="status">えほんを よみこんでいます…</p>;
  return <Composer key={id} repo={repo} bookId={id} initialJson={json} />;
}

function Boot() {
  const [route] = useState(currentRoute);
  const [repo, setRepo] = useState<BookRepository | null>(null);
  const [initial] = useState(() => {
    const template = new URLSearchParams(location.search).get('template');
    return { preview: templates.some((item) => item.id === template), json: template && templates.some((item) => item.id === template) ? templateBook(template) : blankBook() };
  });
  const [bootError, setBootError] = useState(false);
  useEffect(() => {
    let alive = true;
    void repository().then(async (ready) => {
      if (!alive) return;
      if (route.kind === 'composer' && !route.id && !initial.preview) {
        if (!ready.save(initial.json)) { setBootError(true); return; }
        await ready.flush();
        if (!alive) return;
        history.replaceState(null, '', paths.composer(ready.summary(initial.json).id));
      }
      setRepo(ready);
    }).catch(() => { if (alive) setBootError(true); });
    return () => { alive = false; };
  }, []);
  if (route.kind !== 'composer') return <Missing text="この ページは ありません。" />;
  if (bootError) return <Missing text="えほんを開けませんでした。もう一度お試しください。" />;
  if (!repo) return <p className="loading" role="status">じゅんび しています…</p>;
  return route.id ? <CloudBoot repo={repo} id={route.id} /> : <Composer repo={repo} bookId={initial.preview ? null : repo.summary(initial.json).id} initialJson={initial.json} />;
}

const root = createRoot(document.getElementById('root')!);
root.render(<p className="loading" role="status">じゅんび しています…</p>);
loadFonts().then(() => root.render(<Boot />)).catch(() => {
  root.render(<p className="loading" role="alert">フォントを よみこめませんでした。ページを さいよみこみしてください。</p>);
});
