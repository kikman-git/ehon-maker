import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { assets } from '../cloud/assetLoader';
import type { PartLibrary } from '../cloud/library';
import { registerParts, type LibraryPart, type LibraryState } from '../cloud/parts';
import { createStore, useStore } from '../cloud/store';
import { bookGlyphs, createReader, fonts, type WebReader } from '../core';
import { Icon } from './Icon';
import { repaint } from './repaint';

const noLibrary = createStore<LibraryState>({ owner: null, parts: [] });
const noGuestParts: LibraryPart[] = [];
const speechLang = (locale: string) => (locale.includes('-') ? locale : locale.startsWith('ja') ? 'ja-JP' : 'en-US');
const TURN_MS = 300;
const DRAG_SLOP = 6;
/** The leaf is a soft sheet: this many hinged strips, bowing up to BEND degrees at mid-turn. */
const STRIPS = 12;
const BEND = 42;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  json: string;
  library: PartLibrary | null;
  guestParts?: LibraryPart[];
  /** Resolves a `v/` voice reference to a playable URL; absent for guests. */
  resolveVoice?: (audioRef: string) => Promise<string>;
  caption?: string;
  backHref?: string;
  /** The owner's way back into the studio; absent for guests. */
  editHref?: string;
}

/** A leaf in flight toward `target`: progress 0 lies flat on the current spread, 1 has landed. */
interface Turn { target: number; progress: number }
interface Gesture { id: number; startX: number; lastX: number; lastT: number; speed: number; active: boolean }
type Spine = 'left' | 'right' | undefined;

/** Reading mode: the phone's drag-driven leaf fold (decision #6) in CSS 3D, keyboard and edge turning, read-aloud, family voices. */
export function Reader({ json, library, guestParts = noGuestParts, resolveVoice, caption, backHref, editHref }: Props) {
  const [reader, setReader] = useState<WebReader | null>(null);
  const [revision, setRevision] = useState(0);
  const [spread, setSpread] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const animation = useRef(0);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(() => window.innerWidth >= 900);
  // Printing lays every spread on its own sheet, so all pages must be painted, not just the neighbours.
  const [printing, setPrinting] = useState(false);
  const printRequested = useRef(false);
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState<{ index: number; audio: HTMLAudioElement } | null>(null);
  const parts = useStore(library?.state ?? noLibrary).parts;

  useEffect(() => {
    let next: WebReader;
    try { next = createReader(json); } catch { return; }
    next.setImageProvider((ref) => assets.image(ref));
    setReader(next);
    void bookGlyphs(json);
    return () => { next.dispose(); };
  }, [json]);

  const epoch = useStore(fonts).epoch;
  useEffect(() => {
    if (!reader) return;
    reader.clearMeasurements();
    setRevision((value) => value + 1);
  }, [reader, epoch]);

  useEffect(() => {
    if (!reader) return;
    if (library) library.apply(reader, guestParts);
    else registerParts(reader, guestParts);
    setRevision((value) => value + 1);
  }, [reader, library, parts, guestParts]);

  useEffect(() => {
    const lifetime = new AbortController();
    const media = matchMedia('(min-width: 900px)');
    media.addEventListener('change', () => setWide(media.matches), { signal: lifetime.signal });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') turnBy(1);
      else if (event.key === 'ArrowLeft') turnBy(-1);
    }, { signal: lifetime.signal });
    return () => lifetime.abort();
  });

  useEffect(() => () => { speechSynthesis.cancel(); voice?.audio.pause(); }, [voice]);
  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  useEffect(() => {
    const lifetime = new AbortController();
    const { signal } = lifetime;
    window.addEventListener('beforeprint', () => setPrinting(true), { signal });
    window.addEventListener('afterprint', () => { printRequested.current = false; setPrinting(false); }, { signal });
    document.addEventListener('fullscreenchange', () => setFullscreen(!!document.fullscreenElement), { signal });
    return () => lifetime.abort();
  }, []);

  // Two frames let the freshly mounted canvases paint before the print snapshot is taken.
  useEffect(() => {
    if (!printing || !reader || !printRequested.current) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => { if (printRequested.current) window.print(); }); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, [printing, reader]);

  if (!reader) return <p className="loading" role="status">じゅんび しています…</p>;
  const perSpread = (wide || printing) && reader.pageCount > 1 ? 2 : 1;
  const spreads = Math.ceil(reader.pageCount / perSpread);
  const current = Math.min(spread, spreads - 1);
  const pagesOf = (index: number) => Array.from({ length: perSpread }, (_, offset) => index * perSpread + offset).filter((page) => page < reader.pageCount);

  const applyTurn = (next: Turn | null) => { turnRef.current = next; setTurn(next); };

  function quiet() {
    speechSynthesis.cancel();
    setSpeaking(false);
    voice?.audio.pause();
    setVoice(null);
  }

  function land(target: number) {
    quiet();
    setSpread(target);
    applyTurn(null);
  }

  /** Eases the leaf from one progress to another over the phone's 300 ms, then settles. */
  function animateTurn(from: number, to: number, target: number, done: () => void) {
    cancelAnimationFrame(animation.current);
    const duration = reducedMotion() ? 0 : TURN_MS * Math.abs(to - from);
    const start = performance.now();
    const step = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const eased = 1 - (1 - t) ** 3;
      applyTurn({ target, progress: from + (to - from) * eased });
      if (t < 1) animation.current = requestAnimationFrame(step);
      else done();
    };
    animation.current = requestAnimationFrame(step);
  }

  /** Keys, edges and dots: one leaf swings to the target, however many spreads away. */
  function turnBy(delta: number) {
    const target = Math.max(0, Math.min(current + delta, spreads - 1));
    if (turnRef.current || target === current) return;
    if (reducedMotion()) { land(target); return; }
    applyTurn({ target, progress: 0 });
    animateTurn(0, 1, target, () => land(target));
  }

  const pageWidth = () => Math.max(1, pagesRef.current?.querySelector('.page-box')?.clientWidth ?? 300);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (event.button !== 0 || turnRef.current || (event.target as Element).closest('.voice-chip')) return;
    gesture.current = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, lastT: event.timeStamp, speed: 0, active: false };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = gesture.current;
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX;
    const dt = Math.max(1, event.timeStamp - drag.lastT);
    drag.speed = drag.speed * 0.6 + ((event.clientX - drag.lastX) / dt) * 0.4;
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;
    if (!drag.active) {
      if (Math.abs(dx) < DRAG_SLOP) return;
      drag.active = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    // Dragging toward the spine from the right turns forward; from the left, back.
    const target = current + (dx < 0 ? 1 : -1);
    if (target < 0 || target >= spreads) { applyTurn(null); return; }
    applyTurn({ target, progress: Math.min(Math.abs(dx) / pageWidth(), 1) });
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = gesture.current;
    if (!drag || event.pointerId !== drag.id) return;
    gesture.current = null;
    if (!drag.active) return;
    // The click that follows this pointerup belongs to the drag, not to an edge button.
    setTimeout(() => { suppressClick.current = false; }, 0);
    const inFlight = turnRef.current;
    if (!inFlight) return;
    const direction = inFlight.target > current ? 1 : -1;
    // Commit on either a decent distance or a flick, so a quick page turn works; a finger that paused has no flick left.
    const speed = event.timeStamp - drag.lastT > 80 ? 0 : drag.speed;
    const flick = Math.abs(speed) > 0.5 && Math.sign(-speed) === direction;
    if (event.type !== 'pointercancel' && (inFlight.progress > 0.3 || flick)) animateTurn(inFlight.progress, 1, inFlight.target, () => land(inFlight.target));
    else animateTurn(inFlight.progress, 0, inFlight.target, () => applyTurn(null));
  };

  const edgeTurn = (delta: number) => { if (!suppressClick.current) turnBy(delta); };

  const speak = () => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    const text = pagesOf(current).map((page) => reader.speechText(page)).filter(Boolean).join(reader.contentLocale.startsWith('ja') ? '。' : '. ');
    if (!text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLang(reader.contentLocale);
    utterance.rate = 0.85;
    utterance.onend = utterance.onerror = () => setSpeaking(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const print = () => { printRequested.current = true; setPrinting(true); };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  const playVoice = async (page: number, audioRef: string) => {
    if (!resolveVoice) return;
    if (voice?.index === page) { voice.audio.pause(); setVoice(null); return; }
    voice?.audio.pause();
    try {
      const audio = new Audio(await resolveVoice(audioRef));
      audio.onended = () => setVoice((state) => (state?.audio === audio ? null : state));
      await audio.play();
      setVoice({ index: page, audio });
    } catch { setVoice(null); }
  };

  const slot = (page: number | null | undefined, spine: Spine, chip = true) => <div className="page-box" data-spine={spine}>
    {page == null ? <div className="paper-back" data-spine={spine} /> : <>
      <StaticPage reader={reader} index={page} revision={revision} />
      {chip && <VoiceChip reader={reader} index={page} playing={voice?.index === page} canPlay={!!resolveVoice} onPlay={playVoice} />}
    </>}
  </div>;

  /** The two slots about the spine, and during a turn the leaf that swings between them, exactly as ReadView lays it out. */
  const book = () => {
    const direction = turn ? Math.sign(turn.target - current) : 0;
    const progress = turn?.progress ?? 0;
    const now = pagesOf(current);
    const then = pagesOf(turn?.target ?? current);
    if (perSpread === 1) {
      return <>
        {slot(direction > 0 ? then[0] : now[0], undefined)}
        {direction !== 0 && <Leaf reader={reader} revision={revision} slot="single" hinge="left" spine={false}
          angle={direction > 0 ? -180 * progress : -180 * (1 - progress)} front={direction > 0 ? now[0] : then[0]} back={null} />}
      </>;
    }
    return <>
      {slot(direction < 0 ? then[0] : now[0], 'right')}
      {slot(direction > 0 ? then[1] ?? null : now[1] ?? null, 'left')}
      {direction !== 0 && <>
        <div className="leaf-shadow" style={{ opacity: 0.28 * Math.sin(progress * Math.PI) }} />
        <Leaf reader={reader} revision={revision} slot={direction > 0 ? 'right' : 'left'} hinge={direction > 0 ? 'left' : 'right'} spine
          angle={direction > 0 ? -180 * progress : 180 * progress}
          front={direction > 0 ? now[1] ?? null : now[0]} back={direction > 0 ? then[0] : then[1] ?? null} />
      </>}
    </>;
  };

  return <div className="stage" style={{ '--aspect': reader.pageAspect, '--per-spread': perSpread } as React.CSSProperties}>
    <header className="stage-bar">
      <div className="stage-actions">
        {backHref ? <a className="button ghost" href={backHref}><Icon name="arrowLeft" size={17} /><span>ほんだな</span></a> : <span />}
        {editHref && <a className="button ghost" href={editHref}><Icon name="brush" size={17} /><span>続きを描く</span></a>}
      </div>
      <div className="stage-title">
        {caption && <span className="stage-caption">{caption}</span>}
        <span>{reader.title}</span>
      </div>
      <div className="stage-actions">
        <button className="ghost" onClick={print} title="見開きごとに1枚、横向きの用紙で印刷"><Icon name="print" size={17} /><span>印刷</span></button>
        {document.fullscreenEnabled && <button className="ghost" onClick={toggleFullscreen} aria-pressed={fullscreen} title={fullscreen ? '全画面をやめる' : '全画面で読む'}><Icon name={fullscreen ? 'compress' : 'expand'} size={17} /><span>全画面</span></button>}
        <button className="ghost" onClick={speak} aria-pressed={speaking}><Icon name={speaking ? 'stop' : 'speaker'} size={17} /><span>{speaking ? 'とめる' : 'よみあげ'}</span></button>
      </div>
    </header>
    {printing
      ? <div className="spread-viewport">
        <div className="spread-strip">
          {Array.from({ length: spreads }, (_, index) => <section key={index} className="spread" style={{ left: `${index * 100}%` }}>
            {pagesOf(index).map((page) => <div key={reader.pageId(page)} className="page-box"><StaticPage reader={reader} index={page} revision={revision} /></div>)}
          </section>)}
        </div>
      </div>
      : <div className="spread-viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <button className="turn-zone" aria-label="まえの ページ" disabled={current === 0} onClick={() => edgeTurn(-1)} />
        <section className="spread"><div className="book-pages" ref={pagesRef}>{book()}</div></section>
        <button className="turn-zone" aria-label="つぎの ページ" disabled={current >= spreads - 1} onClick={() => edgeTurn(1)} />
      </div>}
    <nav className="dots" aria-label="ページ">
      {Array.from({ length: spreads }, (_, index) => <button key={index} className="dot" aria-current={index === current ? 'page' : undefined} aria-label={`${index * perSpread + 1} ページ`} onClick={() => turnBy(index - current)} />)}
    </nav>
  </div>;
}

interface LeafProps {
  reader: WebReader;
  revision: number;
  slot: 'left' | 'right' | 'single';
  /** The edge the sheet hangs from: the spine side, or the left edge of a single page. */
  hinge: 'left' | 'right';
  spine: boolean;
  /** Where the outer edge is, in degrees: negative swings a left-hinged leaf over to the left. */
  angle: number;
  front: number | null;
  back: number | null;
}

/** The turning leaf as paper: STRIPS hinged slices, each rotated a little further, so the sheet bows off the outer edge and flattens as it lands. Faces are painted once; only transforms move per frame. */
function Leaf({ reader, revision, slot, hinge, spine, angle, front, back }: LeafProps) {
  const root = useRef<HTMLDivElement>(null);
  const tick = useStore(repaint).n;
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const host = root.current!;
    const box = host.parentElement!.querySelector<HTMLElement>('.page-box');
    const width = Math.max(1, box?.clientWidth ?? 1);
    const height = Math.max(1, box?.clientHeight ?? 1);
    setSize({ width, height });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const paint = (page: number | null) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#f9f4ed';
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (page != null) { context.setTransform(ratio, 0, 0, ratio, 0, 0); reader.render(context, width, height, page); }
      return canvas;
    };
    const images = { front: paint(front), back: paint(back) };
    const slice = width / STRIPS;
    host.querySelectorAll<HTMLCanvasElement>('.strip-canvas').forEach((canvas) => {
      const k = Number(canvas.dataset.strip);
      const face = canvas.dataset.face as 'front' | 'back';
      // Strip 0 sits at the hinge; the back face is mirrored by its rotation, so it takes the other page's slices from the far side.
      const fromHinge = (face === 'front') === (hinge === 'left');
      const index = fromHinge ? k : STRIPS - 1 - k;
      canvas.width = Math.ceil((slice + 1) * ratio);
      canvas.height = images.front.height;
      canvas.getContext('2d')!.drawImage(images[face], Math.round(index * slice * ratio), 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    });
  }, [reader, revision, tick, front, back, hinge]);

  const sign = hinge === 'left' ? -1 : 1;
  const bend = BEND * Math.sin(Math.min(1, Math.abs(angle) / 180) * Math.PI);
  const slice = size.width / STRIPS;
  const outer = 16;
  const inner = spine ? 6 : 16;
  const radius = (k: number, face: 'front' | 'back') => {
    // The back face is mirrored, so its rounded side is the opposite one.
    const side = k === 0 ? hinge : k === STRIPS - 1 ? (hinge === 'left' ? 'right' : 'left') : null;
    if (!side) return undefined;
    const r = k === 0 ? inner : outer;
    const onLeft = (side === 'left') === (face === 'front');
    return onLeft ? `${r}px 0 0 ${r}px` : `0 ${r}px ${r}px 0`;
  };
  let child: ReactNode = null;
  for (let k = STRIPS - 1; k >= 0; k--) {
    const total = angle - sign * bend * (1 - k / (STRIPS - 1));
    const own = k === 0 ? total : sign * bend / (STRIPS - 1);
    const facing = Math.cos(total * Math.PI / 180);
    child = <div key={k} className="strip" data-hinge={hinge} style={{ width: slice, transform: `rotateY(${own}deg)` }}>
      <canvas className="strip-canvas" data-face="front" data-strip={k} style={{ borderRadius: radius(k, 'front') }} />
      <div className="strip-shade" data-face="front" style={{ opacity: 0.4 * (1 - facing) / 2, borderRadius: radius(k, 'front') }} />
      <canvas className="strip-canvas" data-face="back" data-strip={k} style={{ borderRadius: radius(k, 'back') }} />
      <div className="strip-shade" data-face="back" style={{ opacity: 0.4 * (1 + facing) / 2, borderRadius: radius(k, 'back') }} />
      {child}
    </div>;
  }
  return <div ref={root} className="leaf" data-slot={slot} data-hinge={hinge} aria-hidden="true" style={{ '--slice': `${slice}px` } as React.CSSProperties}>{child}</div>;
}

function VoiceChip({ reader, index, playing, canPlay, onPlay }: { reader: WebReader; index: number; playing: boolean; canPlay: boolean; onPlay: (index: number, audioRef: string) => void }) {
  const raw = reader.replyJson(index);
  if (!raw) return null;
  const reply = JSON.parse(raw) as { from: string; seconds: number; audioRef: string | null };
  const remote = !!reply.audioRef?.startsWith('v/');
  if (!canPlay && !remote) return null;
  return <button className="voice-chip" disabled={!canPlay || !remote} onClick={() => reply.audioRef && onPlay(index, reply.audioRef)} title={remote ? undefined : 'この こえは スマホで きけます'}>
    <Icon name={playing ? 'stop' : 'play'} size={13} />{reply.from} の こえ · {reply.seconds.toFixed(1)}びょう
  </button>;
}

function StaticPage({ reader, index, revision }: { reader: WebReader; index: number; revision: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tick = useStore(repaint).n;
  useEffect(() => {
    const canvas = canvasRef.current!;
    const paint = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext('2d')!;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      reader.render(context, width, height, index);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => { observer.disconnect(); canvas.width = canvas.height = 0; };
  }, [reader, index, revision, tick]);
  return <canvas ref={canvasRef} className="read-page" aria-label={`${index + 1} ページ`} />;
}
