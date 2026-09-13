import { useEffect, useRef, useState } from 'react';
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

/** Reading mode: a transform-only spread, keyboard and tap turning, read-aloud, family voices. */
export function Reader({ json, library, guestParts = noGuestParts, resolveVoice, caption, backHref, editHref }: Props) {
  const [reader, setReader] = useState<WebReader | null>(null);
  const [revision, setRevision] = useState(0);
  const [spread, setSpread] = useState(0);
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
      if (event.key === 'ArrowRight') turn(1);
      else if (event.key === 'ArrowLeft') turn(-1);
    }, { signal: lifetime.signal });
    return () => lifetime.abort();
  });

  useEffect(() => () => { speechSynthesis.cancel(); voice?.audio.pause(); }, [voice]);

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

  function turn(delta: number) {
    const next = current + delta;
    if (next < 0 || next >= spreads) return;
    speechSynthesis.cancel();
    setSpeaking(false);
    voice?.audio.pause();
    setVoice(null);
    setSpread(next);
  }

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

  return <div className="stage" style={{ '--aspect': reader.pageAspect, '--per-spread': perSpread } as React.CSSProperties}>
    <header className="stage-bar">
      <div className="stage-actions">
        {backHref ? <a className="button ghost" href={backHref}>← ほんだな</a> : <span />}
        {editHref && <a className="button ghost" href={editHref}>続きを描く</a>}
      </div>
      <div className="stage-title">
        {caption && <span className="stage-caption">{caption}</span>}
        <span>{reader.title}</span>
      </div>
      <div className="stage-actions">
        <button className="ghost" onClick={print} title="見開きごとに1枚、横向きの用紙で印刷"><Icon name="print" size={17} /><span>印刷</span></button>
        {document.fullscreenEnabled && <button className="ghost" onClick={toggleFullscreen} aria-pressed={fullscreen} title={fullscreen ? '全画面をやめる' : '全画面で読む'}><Icon name={fullscreen ? 'compress' : 'expand'} size={17} /><span>全画面</span></button>}
        <button className="ghost" onClick={speak} aria-pressed={speaking}>{speaking ? 'とめる' : 'よみあげ'}</button>
      </div>
    </header>
    <div className="spread-viewport">
      <button className="turn-zone" aria-label="まえの ページ" disabled={current === 0} onClick={() => turn(-1)} />
      <div className="spread-strip" style={{ transform: `translateX(-${current * 100}%)` }}>
        {Array.from({ length: spreads }, (_, index) => <section key={index} className="spread" style={{ left: `${index * 100}%` }} aria-hidden={index !== current}>
          {pagesOf(index).map((page) => <div key={reader.pageId(page)} className="page-box">
            {(printing || Math.abs(index - current) <= 1) && <StaticPage reader={reader} index={page} revision={revision} />}
            {(printing || Math.abs(index - current) <= 1) && <VoiceChip reader={reader} index={page} playing={voice?.index === page} canPlay={!!resolveVoice} onPlay={playVoice} />}
          </div>)}
        </section>)}
      </div>
      <button className="turn-zone" aria-label="つぎの ページ" disabled={current >= spreads - 1} onClick={() => turn(1)} />
    </div>
    <nav className="dots" aria-label="ページ">
      {Array.from({ length: spreads }, (_, index) => <button key={index} className="dot" aria-current={index === current ? 'page' : undefined} aria-label={`${index * perSpread + 1} ページ`} onClick={() => turn(index - current)} />)}
    </nav>
  </div>;
}

function VoiceChip({ reader, index, playing, canPlay, onPlay }: { reader: WebReader; index: number; playing: boolean; canPlay: boolean; onPlay: (index: number, audioRef: string) => void }) {
  const raw = reader.replyJson(index);
  if (!raw) return null;
  const reply = JSON.parse(raw) as { from: string; seconds: number; audioRef: string | null };
  const remote = !!reply.audioRef?.startsWith('v/');
  if (!canPlay && !remote) return null;
  return <button className="voice-chip" disabled={!canPlay || !remote} onClick={() => reply.audioRef && onPlay(index, reply.audioRef)} title={remote ? undefined : 'この こえは スマホで きけます'}>
    {playing ? '■' : '▶'} {reply.from} の こえ · {reply.seconds.toFixed(1)}びょう
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
