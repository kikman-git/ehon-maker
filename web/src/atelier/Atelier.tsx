import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { credits as creditStore, MIN_TURN_CREDITS } from '../cloud/credits';
import { useStore } from '../cloud/store';
import { codec, type WebEditor } from '../core';
import type { AiBridge } from '../ai/bridge';
import { arrivalLabel, ChatMessage, chatMessages, formatElapsed, LONG_TURN_MS, stepText, WorkingCard } from '../ai/feedback';
import { CreditNudge, OutOfCredits } from '../ui/Credits';
import { Icon } from '../ui/Icon';
import { inertSvg, partAt, partsOf } from './svg';

const CANDIDATES = 3;

interface Version { svg: string; label: string }
interface Sketch { points: { x: number; y: number }[] }
interface ArtCheck { ok: boolean; error?: string; unsupported?: string[] }

interface Draft { versions: Version[]; current: number | null; sketch: Sketch[]; name: string }
/** The turn in flight: when it began, how many pictures it should bring and how many have come. */
interface Turn { started: number; mode: 'new' | 'revise'; expected: number; arrived: number }

const PAPER = '#f9f4ed';
const VIEW_PX = 1024;
const PLACE_SIZE_PCT = 30;
const BOOK_ART_LIMIT = 6;
const ideas = ['ぼうしを かぶった くま', 'あかい じてんしゃ', 'ほしの かたちの はな', 'わらっている くも'];

// Versions survive closing the atelier until the tab reloads, one draft per book.
const drafts = new Map<string, Draft>();

function paint(context: CanvasRenderingContext2D, editor: WebEditor, size: number, svg: string | null, sketch: Sketch[], box: DOMRect | null) {
  context.fillStyle = PAPER;
  context.fillRect(0, 0, size, size);
  if (svg) editor.renderSvg(context, size, size, svg);
  if (box) {
    context.lineWidth = size / 170;
    context.strokeStyle = 'rgba(220, 60, 40, 0.95)';
    context.strokeRect(box.x * size, box.y * size, box.width * size, box.height * size);
  }
  context.lineWidth = size / 110;
  context.lineCap = context.lineJoin = 'round';
  context.strokeStyle = 'rgba(47, 111, 220, 0.9)';
  for (const stroke of sketch) {
    context.beginPath();
    stroke.points.forEach((p, i) => (i ? context.lineTo : context.moveTo).call(context, p.x * size, p.y * size));
    if (stroke.points.length === 1) context.lineTo(stroke.points[0].x * size + 0.1, stroke.points[0].y * size);
    context.stroke();
  }
}

interface Props {
  bridge: AiBridge;
  editor: WebEditor;
  readOnly: boolean;
  act: (action: () => void) => void;
  onClose: () => void;
}

/** One illustration made from scratch with the AI: candidates, tap-a-part revisions and a version strip. */
export function Atelier({ bridge, editor, readOnly, act, onClose }: Props) {
  const state = useStore(bridge.state);
  const wallet = useStore(creditStore);
  const bookId = editor.bookId;
  const [draft, setDraftState] = useState<Draft>(() => startDraft(editor, drafts.get(bookId)));
  const [request, setRequest] = useState('');
  const [mode, setMode] = useState<'new' | 'revise'>(() => (draft.current === null ? 'new' : 'revise'));
  const [selected, setSelected] = useState<string | null>(null);
  const [sketching, setSketching] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const runKeys = useRef(new Map<string, number>());
  const rejected = useRef(new Set<string>());
  const drawing = useRef<Sketch | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastRequest = useRef('');
  const wasRunning = useRef(false);
  const [turn, setTurn] = useState<Turn | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const stopped = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const [boxTick, setBoxTick] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus inside the dialog keeps the studio's shortcuts, Delete among them, off the page behind it.
  useEffect(() => { dialogRef.current?.focus(); }, []);

  const setDraft = (update: (current: Draft) => Draft) => setDraftState((current) => {
    const next = update(current);
    drafts.set(bookId, next);
    return next;
  });
  const piece = draft.current === null ? null : draft.versions[draft.current]?.svg ?? null;
  const inert = useMemo(() => (piece ? inertSvg(piece) : null), [piece]);
  const parts = useMemo(() => partsOf(inert), [inert]);
  const selectedPart = parts.find((part) => part.id === selected) ?? null;
  const messages = useMemo(() => chatMessages(state.entries), [state.entries]);
  // The server refuses a turn under the minimum, so the offers take the compose box's place before a request fails.
  const outOfCredits = wallet.ready && wallet.balance < MIN_TURN_CREDITS;
  const busy = state.running || outOfCredits;
  const effectiveMode = piece ? mode : 'new';
  const working = state.running && turn ? {
    step: stepText(state, turn.mode),
    elapsed: formatElapsed(now - turn.started),
    long: now - turn.started > LONG_TURN_MS && turn.arrived === 0,
    fraction: state.progress ? Math.min(0.95, state.progress / (turn.mode === 'new' ? CANDIDATES * 2_400 : (piece?.length ?? 2_400) + 200)) : null,
    pending: Math.max(0, turn.expected - turn.arrived),
  } : null;
  const updateTurn = (change: (current: Turn) => Turn) => { if (turnRef.current) { turnRef.current = change(turnRef.current); setTurn(turnRef.current); } };

  const payload = (svg: string | null) => {
    const art = Object.fromEntries((JSON.parse(editor.artJson()) as { id: string }[]).slice(0, BOOK_ART_LIMIT)
      .map((entry) => [entry.id.slice(entry.id.indexOf(':') + 1), editor.artSvg(entry.id)] as const).filter((entry) => entry[1]));
    return JSON.stringify({ piece: svg, art });
  };

  useEffect(() => { bridge.open(bookId, payload(piece)); }, [bridge, bookId]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages.length, working?.step, working?.long]);

  // A run's files arrive as they are saved; each candidate slot or the piece keeps one version per run.
  useEffect(() => bridge.onBook((id, json) => {
    if (id !== bookId) return;
    let output: { piece: string | null; candidates: string[] };
    try { output = JSON.parse(json) as typeof output; } catch { return; }
    const arrivals: [string, string][] = output.candidates.map((svg, i) => [`candidate-${i + 1}`, svg]);
    if (output.piece) arrivals.push(['piece', output.piece]);
    for (const [key, svg] of arrivals) {
      if (!svg.trim() || rejected.current.has(svg)) continue;
      const check = JSON.parse(codec.checkArt(svg)) as ArtCheck;
      if (!check.ok) { rejected.current.add(svg); bridge.note({ kind: 'rejected', text: `${arrivalLabel(key)}は ひらけませんでした（${check.error}）` }); continue; }
      const fresh = !runKeys.current.has(key);
      setDraft((current) => {
        if (current.versions.some((version) => version.svg === svg)) return current;
        const label = lastRequest.current;
        const slot = runKeys.current.get(key);
        const versions = [...current.versions];
        if (slot !== undefined && slot < versions.length) versions[slot] = { svg, label };
        else { runKeys.current.set(key, versions.length); versions.push({ svg, label }); }
        const index = runKeys.current.get(key)!;
        const first = key === 'piece' || key === 'candidate-1';
        return { ...current, versions, current: first ? index : current.current ?? index };
      });
      if (fresh && turnRef.current) {
        updateTurn((current) => ({ ...current, arrived: current.arrived + 1 }));
        bridge.note({ kind: 'applied', text: `${arrivalLabel(key)}が とどきました` });
      }
    }
  }), [bridge, bookId]);

  useEffect(() => {
    if (wasRunning.current && !state.running) {
      setSketching(false);
      setDraft((current) => ({ ...current, sketch: [] }));
      setMode('revise');
      const finished = turnRef.current;
      turnRef.current = null;
      setTurn(null);
      if (finished && !stopped.current) {
        if (finished.arrived === 0) bridge.note({ kind: 'rejected', text: 'えは とどきませんでした。ことばを かえて もういちど たのんでみてください。' });
        else if (finished.mode === 'revise') bridge.note({ kind: 'applied', text: 'なおした えが できました。' });
        else bridge.note({ kind: 'applied', text: `${finished.arrived}まいの えが できました。えらんで、パーツを タップすると なおせます。` });
      }
      stopped.current = false;
    }
    wasRunning.current = state.running;
  }, [state.running]);

  // The working card counts up while a turn runs, so a long silence still visibly moves.
  useEffect(() => {
    if (!state.running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.running]);

  const selectedBox = (): DOMRect | null => {
    const stage = stageRef.current?.getBoundingClientRect();
    const group = selected ? hitRef.current?.querySelector(`g[data-part="${CSS.escape(selected)}"]`) : null;
    if (!stage || !group) return null;
    const box = group.getBoundingClientRect();
    return new DOMRect((box.left - stage.left) / stage.width, (box.top - stage.top) / stage.height, box.width / stage.width, box.height / stage.height);
  };

  useLayoutEffect(() => {
    hitRef.current?.replaceChildren(...(inert ? [inert] : []));
    setBoxTick((tick) => tick + 1);
  }, [inert]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = Math.round(canvas.getBoundingClientRect().width * devicePixelRatio);
    if (!size) return;
    canvas.width = canvas.height = size;
    paint(canvas.getContext('2d')!, editor, size, piece, draft.sketch, null);
  }, [editor, piece, draft.sketch, boxTick]);

  const box = useMemo(() => (selected ? selectedBox() : null), [selected, boxTick, inert]);

  const choose = (index: number) => {
    setDraft((current) => ({ ...current, current: index }));
    setSelected(null);
    setSaved(null);
  };

  const pointAt = (event: ReactPointerEvent) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };
  const onPointerDown = (event: ReactPointerEvent) => {
    if (!sketching) {
      const svg = hitRef.current?.querySelector('svg');
      const id = svg ? partAt(svg as SVGSVGElement, event.clientX, event.clientY) : null;
      setSelected(id === selected ? null : id);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = { points: [pointAt(event)] };
    setDraft((current) => ({ ...current, sketch: [...current.sketch, drawing.current!] }));
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drawing.current) return;
    const stroke = { points: [...drawing.current.points, pointAt(event)] };
    drawing.current = stroke;
    setDraft((current) => ({ ...current, sketch: [...current.sketch.slice(0, -1), stroke] }));
  };
  const onPointerUp = () => { drawing.current = null; };

  const viewImage = (): string | null => {
    if (!piece && !draft.sketch.length) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = VIEW_PX;
      paint(canvas.getContext('2d')!, editor, VIEW_PX, piece, draft.sketch, box);
      const url = canvas.toDataURL('image/png');
      canvas.width = canvas.height = 0;
      return url;
    } catch { return null; }
  };

  const send = (text = request) => {
    const words = text.trim();
    if (!words || busy || readOnly) return;
    const image = viewImage();
    runKeys.current = new Map();
    lastRequest.current = words;
    stopped.current = false;
    turnRef.current = { started: Date.now(), mode: effectiveMode, expected: effectiveMode === 'new' ? CANDIDATES : 1, arrived: 0 };
    setTurn(turnRef.current);
    if (!draft.name) setDraft((current) => ({ ...current, name: words.slice(0, 16) }));
    bridge.sync(bookId, payload(piece));
    const chip = [effectiveMode === 'new' ? `あたらしい案 ×${CANDIDATES}` : 'なおす', selectedPart && `「${selectedPart.name}」`, draft.sketch.length > 0 && 'したがき'].filter(Boolean).join(' · ');
    bridge.ask(bookId, { text: words, mark: chip, image, spec: { title: editor.title, mode: effectiveMode, selected: effectiveMode === 'revise' ? selectedPart : null, sketched: draft.sketch.length > 0 } });
    setRequest('');
    setSaved(null);
  };

  const save = (place: boolean) => {
    if (!piece || readOnly) return;
    const name = draft.name.trim() || 'え';
    let partId: string | null | undefined = null;
    act(() => { partId = editor.addArt(name, piece, place ? PLACE_SIZE_PCT : null); });
    if (partId) setSaved(place ? 'ページに 置きました。' : '「この えほんの え」に 追加しました。');
    else setSaved(editor.artChars + piece.length > editor.maxArtChars ? 'この えほんの え が いっぱいです。いらない えを けしてから おためしください。' : 'この えは えほんに 入れられませんでした。');
  };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (event.target as Element | null)?.closest?.('textarea, input')) return;
      if (selected) setSelected(null); else onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [selected, onClose]);

  return <div className="atelier-backdrop">
    <div ref={dialogRef} className="atelier" role="dialog" aria-modal="true" aria-label="素材アトリエ" tabIndex={-1}>
      <header className="atelier-head">
        <h2><Icon name="sparkles" size={18} />素材アトリエ<CreditNudge /></h2>
        <label className="atelier-name">なまえ<input value={draft.name} maxLength={40} placeholder="くま" onChange={(event) => { const name = event.target.value; setDraft((current) => ({ ...current, name })); }} /></label>
        <button className="ghost" disabled={!piece || readOnly} onClick={() => save(false)}><Icon name="plus" size={15} />素材に追加</button>
        <button className="primary" disabled={!piece || readOnly} onClick={() => save(true)}><Icon name="check" size={15} />ページに置く</button>
        <button className="icon-button" aria-label="アトリエを とじる" onClick={onClose}><Icon name="close" size={16} /></button>
      </header>
      {saved && <p className="atelier-saved" role="status">{saved}</p>}
      <div className="atelier-body">
        <section className="atelier-stage-column">
          <div ref={stageRef} className="atelier-stage" data-sketching={sketching || undefined} aria-label="えの プレビュー" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <canvas ref={canvasRef} />
            <div ref={hitRef} className="atelier-hit" aria-hidden="true" />
            {box && <span className="atelier-selection" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />}
            {!piece && !draft.sketch.length && !working && <p className="atelier-empty">{sketching ? 'ここに したがきを かいてください' : 'つくりたい えを みぎに 書くか、「したがき」で かいてみましょう'}</p>}
            {working && <div className="atelier-stage-working" data-empty={!piece || undefined} aria-hidden="true"><span className="ai-pen"><Icon name="brush" size={piece ? 14 : 22} /></span><span>{working.step}</span><time>{working.elapsed}</time></div>}
          </div>
          <div className="atelier-tools">
            <button aria-pressed={sketching} onClick={() => { setSketching(!sketching); setSelected(null); }}><Icon name="brush" size={15} />したがき</button>
            <button disabled={!draft.sketch.length} onClick={() => setDraft((current) => ({ ...current, sketch: current.sketch.slice(0, -1) }))}><Icon name="undo" size={15} />ひとつ もどす</button>
            <button disabled={!draft.sketch.length} onClick={() => setDraft((current) => ({ ...current, sketch: [] }))}><Icon name="eraser" size={15} />したがきを けす</button>
          </div>
          {parts.length > 0 && <div className="atelier-parts" role="group" aria-label="えの パーツ">
            {parts.map((part) => <button key={part.id} aria-pressed={part.id === selected} onClick={() => { setSelected(part.id === selected ? null : part.id); setSketching(false); }}>{part.name}</button>)}
          </div>}
          {(draft.versions.length > 0 || working) && <div className="atelier-versions" role="listbox" aria-label="バージョン">
            {draft.versions.map((version, index) => <VersionTile key={index} editor={editor} svg={version.svg} label={`${index + 1}: ${version.label}`} selected={index === draft.current} onSelect={() => choose(index)} />)}
            {working && Array.from({ length: working.pending }, (_, i) => <span key={`pending-${i}`} className="atelier-pending" role="presentation" title="かいています…" />)}
          </div>}
        </section>
        <section className="atelier-chat">
          <div className="ai-session">
            <span className="ai-session-state" data-running={state.running || undefined}>{state.running ? 'AI が かいています…' : messages.length ? 'つづきの 会話' : '新しい会話'}</span>
            <button className="ghost" title="新しい会話を始める" disabled={busy || !messages.length} onClick={() => bridge.reset(bookId)}><Icon name="redo" size={14} />新しい会話</button>
          </div>
          <div ref={listRef} className="ai-messages" aria-live="polite">
            {messages.length === 0 && <div className="atelier-ideas">
              <p className="hint">どんな えを つくりますか？ AI が {CANDIDATES}つの 案を かきます。えらんだら、パーツを タップして「もっと 大きく」「ピンクに」と なおせます。</p>
              {ideas.map((idea) => <button key={idea} className="ghost" disabled={busy || readOnly} onClick={() => send(idea)}>{idea}</button>)}
            </div>}
            {messages.map((message, index) => <ChatMessage key={index} message={message} />)}
            {working && <WorkingCard step={working.step} elapsed={working.elapsed} long={working.long} fraction={working.fraction} steps={state.steps} count={turn && turn.expected > 1 ? `${turn.arrived} / ${turn.expected} まい` : undefined} />}
          </div>
          {outOfCredits ? <OutOfCredits /> : <div className="ai-compose">
            <div className="atelier-mode" role="radiogroup" aria-label="たのみかた">
              <button role="radio" aria-checked={effectiveMode === 'revise'} disabled={!piece} onClick={() => setMode('revise')}>なおす{selectedPart ? `「${selectedPart.name}」` : ''}</button>
              <button role="radio" aria-checked={effectiveMode === 'new'} onClick={() => setMode('new')}>あたらしい案 ×{CANDIDATES}</button>
            </div>
            <textarea aria-label="アトリエへの たのみごと" value={request} rows={3} disabled={readOnly || state.running}
              placeholder={state.running ? 'AI が かいています… おわったら つぎを たのめます' : effectiveMode === 'new' ? 'たとえば「ぼうしを かぶった くま」' : selectedPart ? `「${selectedPart.name}」を どう なおしますか？` : 'たとえば「みみを もっと 大きく」「ピンクに」'}
              onChange={(event) => setRequest(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
            <div className="ai-compose-actions">
              {state.running
                ? <button className="ghost" onClick={() => { stopped.current = true; bridge.stop(bookId); }}><Icon name="stop" size={15} />やめる</button>
                : <button className="primary" disabled={!request.trim() || busy || readOnly} onClick={() => send()}><Icon name="send" size={15} />頼む</button>}
            </div>
          </div>}
        </section>
      </div>
    </div>
  </div>;
}

/** Opens on the selected book picture when there is one, so a piece can be reworked rather than redrawn. */
function startDraft(editor: WebEditor, existing: Draft | undefined): Draft {
  const draft = existing ?? { versions: [], current: null, sketch: [], name: '' };
  const partId = editor.selectedPartId;
  const svg = partId ? editor.artSvg(partId) : null;
  if (!partId || !svg) return draft;
  const index = draft.versions.findIndex((version) => version.svg === svg);
  if (index >= 0) return { ...draft, current: index };
  return { ...draft, versions: [...draft.versions, { svg, label: 'えほんの え' }], current: draft.versions.length, name: editor.partName(partId, 'ja') };
}

function VersionTile({ editor, svg, label, selected, onSelect }: { editor: WebEditor; svg: string; label: string; selected: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = canvas.height = 128;
    paint(canvas.getContext('2d')!, editor, 128, svg, [], null);
  }, [editor, svg]);
  return <button role="option" aria-selected={selected} aria-label={label} title={label} onClick={onSelect}><canvas ref={ref} /></button>;
}
