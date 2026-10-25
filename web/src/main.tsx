import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { assets } from './cloud/assetLoader';
import { cloud } from './cloud/config';
import { repository, type BookRepository } from './cloud/repository';
import { session } from './cloud/session';
import { useStore } from './cloud/store';
import { UploadError, uploadIllustration, type UploadFailure, type UploadStage } from './cloud/uploads';
import { Workspace } from './cloud/workspace';
import { AiPanel } from './ai/AiPanel';
import { aiBridge, atelierBridge } from './ai/bridge';
import { APPLIED_NOTE } from './ai/state';
import { Atelier } from './atelier/Atelier';
import type { Mark } from './ai/prompt';
import { backgrounds, blankBook, bookGlyphs, codec, createEditor, cssColor, drawingColors, ensureGlyphs, loadFonts, parts, type WebEditor } from './core';
import { loadTemplates, templateBook, templateStore } from './templates';
import { Desk, type DeskHandle } from './desk/Desk';
import { dragging, startPartDrag } from './desk/drag';
import { aiTool, colorNames, drawingTools, type DrawingTool } from './desk/tools';
import { currentRoute, paths } from './routes';
import { AccountPanel, syncStatus } from './ui/Account';
import { CreditChip, CreditNudge } from './ui/Credits';
import { Gate } from './ui/Gate';
import { Icon } from './ui/Icon';
import { PartPreview } from './ui/PartPreview';
import { TextStyleControls } from './ui/TextStyle';
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

// The AI tool appears only where an AI layer exists: the dev server's Claude CLI bridge for now.
// Squared so the thin end, where small differences show, gets most of the track.
const sliderSteps = 1000;
function brushStepAt(editor: WebEditor, position: number) {
  const t = position / sliderSteps;
  return Math.round((editor.minBrushStep + (editor.maxBrushStep - editor.minBrushStep) * t * t) * 100) / 100;
}
function brushSliderPosition(editor: WebEditor) {
  return Math.round(Math.sqrt((editor.brushStep - editor.minBrushStep) / (editor.maxBrushStep - editor.minBrushStep)) * sliderSteps);
}

// Outlives one composer, so a copy in one book pastes into the next; the system clipboard carries it across tabs.
let memoryClip: { clip: string; text: string } | null = null;

const tools = aiBridge ? [...drawingTools, aiTool] : drawingTools;

const uploadStages: Record<UploadStage, string> = {
  checking: '画像を チェックしています…',
  sending: 'アップロードしています…',
  finishing: 'しあげています…',
};
type UploadStatus = { file: File; name: string; preview: string; stage: UploadStage | 'done' | 'failed'; message?: string; partId?: string };

const uploadMessages: Record<UploadFailure, string> = {
  type: 'PNG か WebP の ファイルを えらんでください。',
  size: '25MB までの ファイルに してください。',
  dimensions: '2048px までの えに してください。',
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
  const catalog = useStore(templateStore);
  useEffect(() => { if (!cloudBook) void loadTemplates().catch(() => undefined); }, [cloudBook]);
  // A book opens on the AI chat where it exists: it is the way most people will make their book.
  const [tool, setTool] = useState<DrawingTool>(() => aiBridge ? 'ai' : editor.artJson() !== '[]' ? 'select' : 'brush');
  const [panelOpen, setPanelOpen] = useState(() => aiBridge !== null || remembered('studio.panel', true));
  const [stripOpen, setStripOpen] = useState(() => remembered('studio.strip', true));
  const bookArt = useMemo(() => JSON.parse(editor.artJson()) as { id: string; name: string; aspect: number }[], [editor, revision]);
  const [category, setCategory] = useState(() => (bookArt.length ? 'art' : parts[0].category));
  const [draft, setDraft] = useState('');
  const [ruby, setRuby] = useState('');
  const [error, setError] = useState('');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const uploading = uploadStatus != null && uploadStatus.stage !== 'done' && uploadStatus.stage !== 'failed';
  useEffect(() => { if (uploadStatus) return () => URL.revokeObjectURL(uploadStatus.preview); }, [uploadStatus?.preview]);
  useEffect(() => { if (uploadStatus?.stage === 'done') document.querySelector('.library-parts [data-new]')?.scrollIntoView({ block: 'nearest' }); }, [uploadStatus?.stage, library.parts]);
  const [uploadName, setUploadName] = useState('');
  const [workspace] = useState(() => (bookId ? new Workspace(bookId) : null));
  const [mark, setMark] = useState<Mark | null>(null);
  const [atelierOpen, setAtelierOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [aiOpenFor, setAiOpenFor] = useState<typeof editor | null>(() => aiBridge ? editor : null);
  const aiOpen = aiBridge !== null && aiOpenFor === editor;
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

  // Brush size is not book content, so resizing re-renders without saving.
  const resizeBrush = (step: number) => {
    if (editor.isGestureActive) return;
    editor.setBrush(step);
    setRevision(editor.revision);
  };
  // Holds the typed text so clamping never rewrites "0." mid-entry; cleared on blur.
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  const typeBrushSize = (text: string) => {
    setSizeDraft(text);
    const step = Number(text);
    if (text.trim() && Number.isFinite(step) && step > 0) resizeBrush(Math.round(step * 100) / 100);
  };

  const showPanel = (open: boolean) => { setPanelOpen(open); remember('studio.panel', open); };
  const showStrip = (open: boolean) => { setStripOpen(open); remember('studio.strip', open); };

  const chooseTool = (next: DrawingTool) => {
    if (editor.isGestureActive) return;
    setTool(next);
    // Words and materials live in the panel, so these tools bring it back.
    if (next === 'text' || next === 'parts' || next === 'ai') showPanel(true);
    if (next === 'ai') setAiOpenFor(editor);
    if (next === 'select' || next === 'parts' || next === 'text') editor.endIllustrationEdit();
    editor.setEraser(next === 'eraser');
    if (!editor.isEditingIllustration && (next === 'brush' || next === 'eraser' || next === 'hand')) editor.clearSelection();
    setRevision(editor.revision);
  };

  const [hasClip, setHasClip] = useState(() => memoryClip != null);
  const clipText = () => editor.selectedText ?? (editor.selectedPartId ? editor.partName(editor.selectedPartId, 'ja') : '');
  const copySelection = (data: DataTransfer | null) => {
    const clip = editor.copySelected();
    if (!clip) return false;
    const text = clipText();
    memoryClip = { clip, text };
    setHasClip(true);
    if (data) { data.setData(editor.clipboardType, clip); data.setData('text/plain', text); }
    else void navigator.clipboard?.writeText(text).catch(() => {});
    return true;
  };
  const pasteClip = (clip: string) => edit(() => { if (!editor.paste(clip)) setError('ここには はりつけられませんでした。'); });

  useEffect(() => {
    const typing = (target: EventTarget | null) => (target as Element | null)?.closest?.('input, textarea, select, [contenteditable], dialog, [role=dialog]');
    const copy = (event: ClipboardEvent) => {
      if (typing(event.target) || editor.isGestureActive || !copySelection(event.clipboardData)) return;
      event.preventDefault();
      if (event.type === 'cut') edit(() => editor.deleteSelected());
    };
    const paste = (event: ClipboardEvent) => {
      if (typing(event.target) || readOnly || editor.isGestureActive) return;
      const clip = event.clipboardData?.getData(editor.clipboardType);
      const text = event.clipboardData?.getData('text/plain') ?? '';
      event.preventDefault();
      if (clip) pasteClip(clip);
      // Browsers that drop custom types still hand back the text we wrote alongside the clip.
      else if (memoryClip && text === memoryClip.text) pasteClip(memoryClip.clip);
      else if (text.trim()) edit(() => editor.pasteText(text));
    };
    document.addEventListener('copy', copy);
    document.addEventListener('cut', copy);
    document.addEventListener('paste', paste);
    return () => { document.removeEventListener('copy', copy); document.removeEventListener('cut', copy); document.removeEventListener('paste', paste); };
  }, [editor, readOnly]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as Element)?.closest('input, textarea, select, [contenteditable], dialog, [role=dialog]') || event.altKey || editor.isGestureActive) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        edit(() => event.shiftKey ? editor.redo() : editor.undo());
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b' && (editor.selectedText != null || tool === 'text')) {
        event.preventDefault();
        edit(() => editor.setBold(!editor.textBold));
        return;
      }
      if (event.metaKey || event.ctrlKey) return;
      const next = tools.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (next) { event.preventDefault(); chooseTool(next.id); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [editor, readOnly, tool]);

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

  // A mark belongs to the page it was drawn on; turning the page or losing that page drops it.
  useEffect(() => {
    if (mark && (mark.pageIndex !== editor.pageIndex || mark.pageIndex >= editor.pageCount || editor.pageId(mark.pageIndex) !== mark.pageId)) setMark(null);
  }, [editor, revision]);

  /** The harness's document is validated like an opened file, then applied as one undo step. */
  const applyAiDocument = (json: string, attempt = 0, draft = false) => {
    if (!aiBridge) return;
    if (editor.isGestureActive) { if (attempt < 20) setTimeout(() => applyAiDocument(json, attempt + 1, draft), 250); return; }
    if (readOnlyRef.current) { if (!draft) aiBridge.note({ kind: 'rejected', text: '閲覧モードなので 反映しませんでした。' }); return; }
    try {
      const migrated = codec.migrate(json);
      editor.applyDocument(migrated);
      void bookGlyphs(migrated);
      changed();
      // A draft lands on the page as the AI works; only the finished turn says so in the chat.
      if (!draft) aiBridge.note({ kind: 'applied', text: APPLIED_NOTE });
    } catch (raw) {
      if (!draft) aiBridge.note({ kind: 'rejected', text: `反映できませんでした: ${raw instanceof Error ? raw.message : String(raw)}` });
    }
  };
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  useEffect(() => {
    const bridge = aiBridge;
    if (!aiOpen || !bridge) return;
    bridge.open(editor.bookId, editor.bookJson());
    return bridge.onBook((id, json, draft) => { if (id === editor.bookId) applyAiDocument(json, 0, draft); });
  }, [aiOpen, editor]);
  useEffect(() => {
    const bridge = aiBridge;
    if (!aiOpen || !bridge || editor.isGestureActive) return;
    const timer = setTimeout(() => bridge.sync(editor.bookId, editor.bookJson()), 400);
    return () => clearTimeout(timer);
  }, [aiOpen, editor, revision]);
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

  const upload = async (file: File, name = uploadName.trim() || file.name.replace(/\.[^.]+$/, '')) => {
    if (!account.signedIn || !account.uid) { setError(uploadMessages.signedOut); return; }
    const preview = URL.createObjectURL(file);
    const update = (next: Partial<UploadStatus>) => setUploadStatus((current) => current?.preview === preview ? { ...current, ...next } : current);
    setUploadStatus({ file, name, preview, stage: 'checking' });
    try {
      const id = await uploadIllustration(file, name, account.uid, (stage) => update({ stage }));
      // The listener can lag the write; fetching now lets the tile and the place button appear together.
      await repo.library.ensure(['lib:' + id]);
      setUploadName('');
      update({ stage: 'done', partId: 'lib:' + id });
    } catch (raw) {
      update({ stage: 'failed', message: raw instanceof UploadError ? uploadMessages[raw.reason] : uploadMessages.network });
    }
  };

  /** Library buttons place on a tap and drag onto a frame or the desk; a finished drag swallows its click. */
  const partButton = (partId: string, label: string, size: number, content: React.ReactNode, fresh = false) => <button
    key={partId}
    data-new={fresh || undefined}
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

  const activeTool = tools.find((item) => item.id === tool)!;
  const isDrawing = tool === 'brush' || tool === 'eraser';

  return <div className="studio-app">
    <header className="topbar studio-header">
      <a className="brand" href={paths.shelf} onClick={(event) => void goHome(event)} aria-label="ぺたぺた ホーム"><span className="brand-mark"><Icon name="brush" /></span><h1>ぺたぺた</h1><span className="studio-wordmark">STUDIO</span></a>
      <div className="document-title"><strong>{editor.title}</strong><span>{cloudBook ? 'このブラウザに自動保存' : 'おためし · 本棚に保存して続けられます'}</span></div>
      <div className="actions">
        <a className="button ghost shelf-link" href={paths.shelf} onClick={(event) => void goHome(event)}><Icon name="home" size={17} />ホーム</a>
        {cloudBook && account.signedIn && <span className="status" data-pending={repoState.pendingChanges} data-error={(repoState.pendingChanges && repoState.syncError) || undefined} title={syncStatus(repoState)}>{repoState.pendingChanges ? (repoState.syncError ? '同期できていません' : '同期中…') : '同期済み'}</span>}
        <CreditChip onClick={() => setAccountOpen(true)} />
        <button className="ghost read-button" title="読むモードで開く" onClick={() => void readBook()}><Icon name="book" size={17} /><span>よむ</span></button>
        <details className="file-menu">
          <summary className="button"><Icon name="folder" size={16} />ファイル <Icon name="chevronDown" size={14} /></summary>
          <div className="file-popover">
            <button onClick={() => importRef.current?.click()}><Icon name="folderOpen" size={16} />ファイルを開く</button>
            <button aria-label="ファイルに ほぞん" onClick={() => download(new Blob([editor.bookJson()], { type: 'application/json' }), editor.bookId + '.ehon')}><Icon name="save" size={16} />えほんを保存 (.ehon)</button>
            {!cloudBook && <button aria-label="ほんだなに ほぞん" onClick={() => void keepOnShelf()}><Icon name="shelf" size={16} />本棚に保存</button>}
            {!cloudBook && <label className="field">テンプレート
              <select value={template} onChange={(event) => {
                const id = event.target.value;
                const request = ++generation.current;
                setTemplate(id);
                void templateBook(id).then((json) => {
                  if (request !== generation.current) return;
                  const next = createEditor(json);
                  setEditor(next); setRevision(next.revision); setDraft(''); setRuby(''); setError(''); setTool(next.artJson() !== '[]' ? 'select' : 'brush');
                  setCategory(JSON.parse(next.artJson()).length ? 'art' : parts[0].category);
                }).catch(() => { if (request === generation.current) setError('テンプレートを よみこめませんでした。'); });
              }}>
                <option value="" disabled>ファイルから</option>
                {catalog.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>}
          </div>
        </details>
        <input ref={importRef} type="file" accept=".ehon,application/json" hidden onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ''; if (file) void openBook(file);
        }} />
        <button className="primary export-button" aria-label="PNGを書き出す" onClick={exportPage}><Icon name="image" size={17} /><span>PNGを書き出す</span></button>
      </div>
    </header>
    {readOnly && <div className="lease-banner" role="status">ほかの たんまつで へんしゅうちゅう。<a href={paths.reader(editor.bookId)}>この えほんを よむ</a></div>}
    {error && <p role="alert" className="error">{error}</p>}
    {repoState.syncError === 'diskError' && <p role="alert" className="error">保存できませんでした。ファイルメニューからえほんを保存してください。</p>}
    <div className="studio-toolbar">
      <nav className="drawing-tools" aria-label="描画ツール">
        {tools.map((item) => <button key={item.id} className="tool-button" data-tool={item.id} aria-pressed={tool === item.id} aria-label={item.label} title={item.label + ' (' + item.key + ')'} aria-keyshortcuts={item.key} onClick={() => chooseTool(item.id)}>
          <Icon name={item.id === 'ai' ? 'sparkles' : item.id} /><span>{item.label}</span><kbd>{item.key}</kbd>
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
    <main className="workspace studio-workspace" data-readonly={readOnly || undefined} data-panel={panelOpen ? undefined : 'hidden'} data-ai={tool === 'ai' || undefined}>
      <aside className="tool-panel" data-tool={tool} aria-label={activeTool.label + 'の設定'}>
        {tool !== 'ai' && <div className="panel-heading"><span className="eyebrow">{isDrawing ? 'DRAWING' : 'TOOLS'}</span><h2>{activeTool.label}</h2><p>{editor.isEditingIllustration ? '選んだイラストの一部を消して、描き直せます。' : activeTool.hint}</p></div>}
        {editor.isEditingIllustration && <div className="illustration-editing" role="status">
          <strong>{editor.partName(editor.selectedPartId!, 'ja')}を編集中</strong>
          <p>このイラストだけを消したり、描き直したりできます。</p>
          <button disabled={readOnly} onClick={() => chooseTool('select')}><Icon name="check" size={16} />編集を完了</button>
        </div>}
        {isDrawing && <fieldset disabled={readOnly}>
          <div className="brush-preview" aria-hidden="true">
            <svg viewBox="0 0 200 64"><path d="M18 43 C40 43 45 16 70 20 S100 53 124 35 S161 13 182 26" fill="none" stroke={tool === 'eraser' ? '#b1b6b4' : cssColor(editor.brushColor)} strokeWidth={Math.min(56, Math.max(1, editor.brushStep * 4))} strokeLinecap="round" /></svg>
            <span>{tool === 'eraser' ? '消しゴム' : editor.hasCustomInk ? cssColor(editor.brushColor).toUpperCase() : colorNames[editor.crayonIndex]}</span>
          </div>
          <h3>太さ</h3>
          <div className="brush-size">
            <span className="brush-dot" style={{ width: Math.min(28, 2 + editor.brushStep * 2), height: Math.min(28, 2 + editor.brushStep * 2) }} />
            <input type="range" aria-label="ブラシの太さ" min={0} max={sliderSteps} value={brushSliderPosition(editor)} onChange={(event) => resizeBrush(brushStepAt(editor, Number(event.target.value)))} />
            <input type="number" aria-label="ブラシの太さ（数値）" inputMode="decimal" min={editor.minBrushStep} max={editor.maxBrushStep} step={editor.brushStep < 1 ? 0.01 : 0.1}
              value={sizeDraft ?? editor.brushStep.toFixed(editor.brushStep < 1 ? 2 : 1)} onChange={(event) => typeBrushSize(event.target.value)} onBlur={() => setSizeDraft(null)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }} />
          </div>
          {tool === 'brush' && <><h3>カラー <span className="color-value">{cssColor(editor.brushColor).toUpperCase()}</span></h3>
            <div className="drawing-colors" role="group" aria-label="描画カラー">{drawingColors.map((color, index) => <button key={color} aria-label={colorNames[index]} title={colorNames[index]} aria-pressed={!editor.hasCustomInk && editor.crayonIndex === index} style={{ backgroundColor: cssColor(color) }} onClick={() => edit(() => editor.setCrayon(index))}>{!editor.hasCustomInk && editor.crayonIndex === index && <Icon name="check" size={16} style={{ color: index < 7 ? '#fff' : '#243a31' }} />}</button>)}</div>
            <label className="custom-ink">好きな色<input type="color" aria-label="好きな色" value={cssColor(editor.brushColor)} onChange={(event) => edit(() => editor.setBrushColor(0xff000000 | parseInt(event.target.value.slice(1), 16)))} /></label>
          </>}
        </fieldset>}
        {tool === 'parts' && <>
          {atelierBridge && <button className="atelier-open ai-cta" disabled={readOnly} onClick={() => setAtelierOpen(true)}><span><Icon name="sparkles" size={16} />AIで 素材を つくる</span><CreditNudge /></button>}
          <label className="field" htmlFor="material-category">しゅるい</label><select id="material-category" value={category} onChange={(event) => setCategory(event.target.value)}>{bookArt.length > 0 && <option value="art">この えほんの え</option>}{[...new Set(parts.map((part) => part.category))].map((item) => <option key={item}>{item}</option>)}</select>
          <div className="parts material-grid">{category === 'art'
            ? bookArt.map((art) => partButton(art.id, art.name, 30, <><PartPreview editor={editor} partId={art.id} /><span className="part-name">{art.name}<Icon name="plus" size={12} /></span></>))
            : parts.filter((part) => part.category === category).map((part) => partButton(part.id, part.name, 26, <><PartPreview editor={editor} partId={part.id} /><span className="part-name">{part.name}<Icon name="plus" size={12} /></span></>))}</div>
          {cloud && <>
            <h3>マイイラスト</h3>
            {account.signedIn ? <div className="upload">
              <input ref={uploadRef} type="file" accept="image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
              <label className="field">なまえ<input value={uploadName} maxLength={40} placeholder="イラストの名前" onChange={(event) => setUploadName(event.target.value)} /></label>
              <button disabled={uploading || readOnly} onClick={() => uploadRef.current?.click()}><Icon name="upload" size={16} />{uploading ? 'アップロード中…' : '画像をアップロード'}</button>
              <p className="hint">PNG / WebP、2048px まで。背景が透明なら切り抜きとして置けます。</p>
              {uploadStatus && <div className="upload-status" data-stage={uploadStatus.stage} role={uploadStatus.stage === 'failed' ? 'alert' : 'status'}>
                <img src={uploadStatus.preview} alt="" />
                <div>
                  <strong>{uploadStatus.name}</strong>
                  <p>{uploadStatus.stage === 'done' ? 'マイイラストに 追加しました' : uploadStatus.stage === 'failed' ? uploadStatus.message : uploadStages[uploadStatus.stage]}</p>
                  {uploading && <span className="upload-progress" />}
                </div>
                {uploadStatus.stage === 'done' && uploadStatus.partId && <button className="primary upload-action" disabled={readOnly} onClick={() => { edit(() => editor.addPartAt(uploadStatus.partId!, 50, 52, 30, editor.partHeightPct(uploadStatus.partId!, 30))); setUploadStatus(null); }}><Icon name="plus" size={14} />ページに置く</button>}
                {uploadStatus.stage === 'failed' && <button className="upload-action" onClick={() => void upload(uploadStatus.file, uploadStatus.name)}>もういちど</button>}
                {!uploading && <button className="upload-dismiss" aria-label="とじる" onClick={() => setUploadStatus(null)}><Icon name="close" size={14} /></button>}
              </div>}
            </div> : <p className="hint">{uploadMessages.signedOut}</p>}
            <div className="parts library-parts">{library.parts.map((part) => partButton(part.partId, part.title || 'イラスト', 30, <>{assetsUrl && <img src={assetsUrl + '/' + part.masterRef + '/256.webp'} alt="" loading="lazy" decoding="async" draggable={false} />}<span>{part.title || 'イラスト'}</span></>, part.partId === uploadStatus?.partId))}</div>
          </>}
        </>}
        {(tool === 'text' || editor.selectedText != null) && <fieldset disabled={readOnly} className="text-tools">
          <label className="field" htmlFor="story-text">ことば</label><textarea id="story-text" value={editor.selectedText ?? draft} onChange={(event) => setDraftValue(event.target.value)} placeholder="物語の言葉をここに…" />
          <label className="field">ふりがな<input value={editor.selectedText != null ? editor.selectedRuby ?? '' : ruby} onChange={(event) => {
            const value = event.target.value; setRuby(value); void ensureGlyphs({ [editor.fontId]: value }); edit(() => editor.setDraftRuby(value));
          }} /></label>
          <span className="field">書式</span>
          <TextStyleControls editor={editor} disabled={readOnly} act={edit} />
          {editor.selectedText == null && <button className="text-commit primary" aria-label="ことばを はる" onClick={() => edit(() => { if (editor.commitText()) { setDraft(''); setRuby(''); } })}><Icon name="plus" size={16} />ページに追加</button>}
        </fieldset>}
        {(tool === 'select' || ((tool === 'parts' || tool === 'text') && editor.selectedId)) && <>
          <h3>選択したもの</h3>
          {!editor.selectedId && <p className="hint">ページ上のイラストや文字を選択してください。</p>}
          {editor.selectedPartId && <div className="illustration-action">
            <button className="primary" disabled={readOnly} onClick={() => edit(() => { editor.beginIllustrationEdit(); showPanel(true); chooseTool('eraser'); })}><Icon name="brush" size={16} />イラストを編集</button>
            <p className="hint">消しゴムで一部を消し、ブラシで描き直せます。</p>
            {atelierBridge && editor.selectedPartId.startsWith('art:') && <button className="ai-cta" disabled={readOnly} onClick={() => setAtelierOpen(true)}><Icon name="sparkles" size={16} />アトリエで AIと なおす</button>}
          </div>}
          <fieldset disabled={!editor.selectedId || readOnly} className="selection-tools">
            <button onClick={() => edit(() => editor.resizeSelected(false))}><Icon name="compress" size={15} />小さく</button><button onClick={() => edit(() => editor.resizeSelected(true))}><Icon name="expand" size={15} />大きく</button>
            <button onClick={() => edit(() => editor.rotateSelected())}><Icon name="rotate" size={15} />回転</button><button onClick={() => edit(() => editor.deleteSelected())}><Icon name="trash" size={15} />削除</button>
            <button onClick={() => edit(() => editor.sendBackward())}><Icon name="toBack" size={15} />背面へ</button><button onClick={() => edit(() => editor.bringForward())}><Icon name="toFront" size={15} />前面へ</button>
            <button title="コピー (⌘C)" onClick={() => copySelection(null)}><Icon name="copy" size={15} />コピー</button><button title="切り取り (⌘X)" onClick={() => { if (copySelection(null)) edit(() => editor.deleteSelected()); }}><Icon name="cut" size={15} />切り取り</button>
          </fieldset>
          <div className="selection-tools clipboard-tools">
            <button disabled={!hasClip || readOnly} title="貼り付け (⌘V)" onClick={() => memoryClip && pasteClip(memoryClip.clip)}><Icon name="paste" size={15} />貼り付け</button>
            {editor.pageCount > 1 && <label className="move-page"><select aria-label="ページへ移動" disabled={!editor.selectedId || readOnly} value="" onChange={(event) => { const target = Number(event.target.value); edit(() => editor.moveSelectedToPage(target, null, null)); }}>
              <option value="" disabled>ページへ移動…</option>
              {Array.from({ length: editor.pageCount }, (_, index) => index).filter((index) => index !== editor.pageIndex).map((index) => <option key={index} value={index}>{index + 1} ページへ</option>)}
            </select></label>}
          </div>
          <p className="hint">ページのサムネイルや見開きのとなりのページに ドラッグしても移動できます。</p>
        </>}
        {tool === 'ai' && aiBridge && <AiPanel bridge={aiBridge} editor={editor} revision={revision} mark={mark} onClearMark={() => setMark(null)} readOnly={readOnly} />}
        {tool === 'hand' && <div className="navigation-guide"><Icon name="hand" size={40} /><p>細かいところまで、自由に。</p><span>⌘ / Ctrl + スクロールで拡大・縮小。<br />「ページに合わせる」で全体に戻れます。</span></div>}
        <div className="paper-settings"><h3>用紙の色</h3><div className="swatches">{[-1, ...backgrounds].map((color, index) => <button key={color} disabled={readOnly} aria-label={'ページの いろ ' + (index + 1)} title={index === 0 ? '白' : '用紙の色 ' + (index + 1)} style={{ backgroundColor: cssColor(color) }} onClick={() => edit(() => editor.setPageBackground(color))} />)}</div></div>
        <div className="panel-shortcuts"><span><kbd>Space</kbd> 押しながらドラッグで移動</span><span><kbd>⌘ / Ctrl Z</kbd> 元に戻す</span></div>
      </aside>
      <section className="desk" aria-label="えほんを つくる">
        <Desk ref={deskRef} editor={editor} revision={revision} readOnly={readOnly} onChange={changed} workspace={workspace} library={repo.library} assetsUrl={assetsUrl} tool={tool} showStrip={stripOpen} mark={mark} onMark={setMark} />
        {accountOpen && <AccountPanel repo={repo} onClose={() => setAccountOpen(false)} />}
        {atelierBridge && atelierOpen && <Atelier key={editor.bookId} bridge={atelierBridge} editor={editor} readOnly={readOnly} act={edit} onClose={() => setAtelierOpen(false)} />}
      </section>
    </main>
    {ghost && <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">{ghost.label}</div>}
  </div>;
}

function Missing({ text }: { text: string }) {
  return <main className="stage-message" role="alert"><p>{text}</p><a className="button" href={paths.shelf}><Icon name="home" size={16} />ほんだなへ</a></main>;
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
  const [initial, setInitial] = useState<{ preview: boolean; json: string } | null>(null);
  const [bootError, setBootError] = useState(false);
  useEffect(() => {
    let alive = true;
    const start = async () => {
      const wanted = new URLSearchParams(location.search).get('template');
      let preview = false;
      let json = blankBook();
      if (wanted && route.kind === 'composer' && !route.id) {
        // A published story previews without touching the shelf; an unknown id falls back to a blank book.
        const items = await loadTemplates().catch(() => []);
        if (items.some((item) => item.id === wanted)) { json = await templateBook(wanted); preview = true; }
      }
      const ready = await repository();
      if (!alive) return;
      if (route.kind === 'composer' && !route.id && !preview) {
        if (!ready.save(json)) { setBootError(true); return; }
        await ready.flush();
        if (!alive) return;
        history.replaceState(null, '', paths.composer(ready.summary(json).id));
      }
      setInitial({ preview, json });
      setRepo(ready);
    };
    start().catch(() => { if (alive) setBootError(true); });
    return () => { alive = false; };
  }, []);
  if (route.kind !== 'composer') return <Missing text="この ページは ありません。" />;
  if (bootError) return <Missing text="えほんを開けませんでした。もう一度お試しください。" />;
  if (!repo || !initial) return <p className="loading" role="status">じゅんび しています…</p>;
  return route.id ? <CloudBoot repo={repo} id={route.id} /> : <Composer repo={repo} bookId={initial.preview ? null : repo.summary(initial.json).id} initialJson={initial.json} />;
}

const root = createRoot(document.getElementById('root')!);
root.render(<p className="loading" role="status">じゅんび しています…</p>);
loadFonts().then(() => root.render(<Gate intent="studio"><Boot /></Gate>)).catch(() => {
  root.render(<p className="loading" role="alert">フォントを よみこめませんでした。ページを さいよみこみしてください。</p>);
});
