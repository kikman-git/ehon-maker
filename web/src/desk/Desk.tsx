import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PartLibrary } from '../cloud/library';
import { createStore, useStore } from '../cloud/store';
import type { ScratchItem, Workspace, WorkspaceState } from '../cloud/workspace';
import { fonts, type WebEditor } from '../core';
import { repaint } from '../ui/repaint';
import { Icon } from '../ui/Icon';
import { Thumbnail } from '../ui/Thumbnail';
import type { DrawingTool } from './tools';
import { firstVisiblePage, focusOn, frameRects, toDesk, zoomAt, type Frame, type View } from './view';

export interface DeskHandle {
  /** A part released at a screen point: onto a frame it joins that page; onto the desk it becomes a scratch item. */
  drop(partId: string, clientX: number, clientY: number): boolean;
  zoomBy(factor: number): void;
}

interface Props {
  editor: WebEditor;
  revision: number;
  readOnly: boolean;
  onChange: () => void;
  workspace: Workspace | null;
  library: PartLibrary;
  assetsUrl: string | null;
  tool: DrawingTool;
  /** The thumbnail strip is optional chrome; without it pages change by arrows, keys and the frame labels. */
  showStrip: boolean;
}

interface Engine {
  markAll(): void;
  revealPage(index: number): void;
  focusPage(): void;
  cancel(): void;
  zoomBy(factor: number): void;
  drop(partId: string, clientX: number, clientY: number): boolean;
}

type Gesture =
  | { kind: 'stroke'; pointerId: number; index: number; canvas: HTMLCanvasElement }
  | { kind: 'pan'; pointerId: number; last: { x: number; y: number } }
  | { kind: 'item'; pointerId: number; index: number; canvas: HTMLCanvasElement; offset: { x: number; y: number }; moved: boolean; pending: { x: number; y: number } | null }
  | { kind: 'scratch'; pointerId: number; item: ScratchItem; element: HTMLElement; grab: { x: number; y: number }; moved: boolean }
  | { kind: 'pinch'; distance: number; centre: { x: number; y: number } };

const noWorkspace = createStore<WorkspaceState>({ items: [] });
const SCRATCH_WIDTH = 220;
const MAX_BACKING = 4096;
// The view bar and the hint float over the viewport's edges, so a fitted page stays clear of them.
const BAR_INSET = 52;
const HINT_INSET = 30;

/**
 * A page or a facing-page spread, with thumbnails for navigation. Both canvases pan and zoom
 * with one CSS transform. Pointer samples stay outside React; a stroke repaints once per
 * animation frame and commits to the shared document as one undo step.
 */
export const Desk = forwardRef<DeskHandle, Props>(function Desk({ editor, revision, readOnly, onChange, workspace, library, assetsUrl, tool, showStrip }, ref) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLButtonElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const engine = useRef<Engine | null>(null);
  const [selectedScratch, setSelectedScratch] = useState<string | null>(null);
  const [viewChoice, setViewChoice] = useState<{ bookId: string; spread: boolean } | null>(null);
  const spreadView = viewChoice?.bookId === editor.bookId
    ? viewChoice.spread
    : editor.pageAspect < 1 && editor.artJson() !== '[]';
  const live = useRef({ readOnly, onChange, workspace, selectedScratch, tool });
  live.current = { readOnly, onChange, workspace, selectedScratch, tool };
  const tick = useStore(repaint).n;
  const epoch = useStore(fonts).epoch;
  const scratch = useStore(workspace?.state ?? noWorkspace).items;
  const libraryParts = useStore(library.state).parts;
  const frames = frameRects(editor.pageCount, editor.pageAspect, spreadView);
  const pageIndex = editor.pageIndex;
  const firstPage = firstVisiblePage(pageIndex, spreadView);

  useImperativeHandle(ref, () => ({
    drop: (partId, x, y) => engine.current?.drop(partId, x, y) ?? false,
    zoomBy: (factor) => engine.current?.zoomBy(factor),
  }), []);

  useEffect(() => {
    const viewport = viewportRef.current!;
    const surface = surfaceRef.current!;
    const lifetime = new AbortController();
    const { signal } = lifetime;
    let view: View = { x: 0, y: 0, scale: 1 };
    let gesture: Gesture | null = null;
    let frameRequest = 0;
    let paintRequest = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let spaceHeld = false;
    const touches = new Map<number, { x: number; y: number }>();
    const painted = new Map<string, { json: string; scale: number; dpr: number; selected: string | null }>();

    const layout = () => frameRects(editor.pageCount, editor.pageAspect, spreadView);
    const viewportSize = () => ({ w: viewport.clientWidth || 1, h: viewport.clientHeight || 1 });
    const inViewport = (clientX: number, clientY: number) => { const rect = viewport.getBoundingClientRect(); return { x: clientX - rect.left, y: clientY - rect.top }; };
    const pagePoint = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100, w: rect.width, h: rect.height };
    };
    const frameOf = (target: EventTarget | Element | null) => (target as Element | null)?.closest?.('[data-frame]') as HTMLElement | null | undefined;
    const frameCanvas = (index: number) => canvases.current.get(editor.pageId(index));
    const notify = () => live.current.onChange();

    const screenRect = (frame: Frame) => ({ left: view.x + frame.x * view.scale, top: view.y + frame.y * view.scale, width: frame.w * view.scale, height: frame.h * view.scale });
    const isVisible = (frame: Frame) => {
      const { w, h } = viewportSize();
      const r = screenRect(frame);
      return r.left + r.width > -w * 0.25 && r.left < w * 1.25 && r.top + r.height > -h * 0.25 && r.top < h * 1.25;
    };

    const paintFrame = (index: number, frame: Frame, rescale: boolean) => {
      const first = firstVisiblePage(editor.pageIndex, spreadView);
      if (index < first || index >= first + (spreadView ? 2 : 1)) return;
      const id = editor.pageId(index);
      const canvas = canvases.current.get(id);
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const json = editor.pageJson(index);
      const selected = index === editor.pageIndex ? editor.selectedId ?? null : null;
      const previous = painted.get(id);
      if (previous && previous.json === json && previous.selected === selected && previous.dpr === dpr && (previous.scale === view.scale || !rescale)) return;
      const w = frame.w * view.scale;
      const h = frame.h * view.scale;
      const pw = Math.max(1, Math.min(MAX_BACKING, Math.round(w * dpr)));
      const ph = Math.max(1, Math.min(MAX_BACKING, Math.round(h * dpr)));
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      const context = canvas.getContext('2d')!;
      context.setTransform(pw / w, 0, 0, ph / h, 0, 0);
      context.clearRect(0, 0, w, h);
      editor.render(context, w, h, index, false);
      painted.set(id, { json, scale: view.scale, dpr, selected });
    };
    const paintVisible = (rescale: boolean) => { layout().forEach((frame, index) => { if (isVisible(frame)) paintFrame(index, frame, rescale); }); };
    const repaintPage = (index: number) => { painted.delete(editor.pageId(index)); const frame = layout()[index]; if (frame) paintFrame(index, frame, true); };
    const markAll = () => { painted.clear(); paintVisible(true); };
    const schedulePaint = () => { if (!paintRequest) paintRequest = requestAnimationFrame(() => { paintRequest = 0; paintVisible(false); }); };

    // Pan and zoom only touch the transform; frames are re-rasterised once the view settles.
    const applyView = (next: View, animate = false) => {
      const moved = next.x !== view.x || next.y !== view.y || next.scale !== view.scale;
      view = next;
      const transition = animate && moved && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      surface.classList.toggle('animate', transition);
      surface.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      surface.style.setProperty('--inv', String(1 / view.scale));
      if (zoomRef.current) zoomRef.current.textContent = `${Math.round(view.scale * 100)}%`;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => { settleTimer = null; surface.classList.remove('animate'); paintVisible(true); }, transition ? 200 : 120);
      schedulePaint();
    };
    const zoomBy = (factor: number) => { const { w, h } = viewportSize(); applyView(zoomAt(view, factor, w / 2, h / 2), true); };
    const focusPage = () => {
      const first = firstVisiblePage(editor.pageIndex, spreadView);
      const visible = layout().slice(first, first + (spreadView ? 2 : 1));
      const left = visible[0];
      const right = visible.at(-1)!;
      const { w, h } = viewportSize();
      const fitted = focusOn({ ...left, w: right.x + right.w - left.x }, { w, h: Math.max(1, h - BAR_INSET - HINT_INSET) }, 0.96);
      applyView({ ...fitted, y: fitted.y + BAR_INSET });
    };
    const revealPage = () => focusPage();

    const place = (partId: string, index: number, p: { x: number; y: number }): boolean => {
      if (live.current.readOnly) return false;
      try {
        if (index !== editor.pageIndex) editor.goToPage(index);
        const size = partId.startsWith('lib:') || partId.startsWith('pack.') ? 30 : 26;
        editor.addPartAt(partId, p.x, p.y, size, editor.partHeightPct(partId, size));
      } catch { return false; }
      markAll();
      notify();
      return true;
    };

    const drop = (partId: string, clientX: number, clientY: number): boolean => {
      const rect = viewport.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
      const frame = frameOf(document.elementFromPoint(clientX, clientY));
      if (frame) {
        const index = Number(frame.dataset.frame);
        const canvas = frameCanvas(index);
        return !!canvas && place(partId, index, pagePoint(canvas, clientX, clientY));
      }
      const workspace = live.current.workspace;
      if (!workspace || live.current.readOnly || !partId.startsWith('lib:')) return false;
      const part = library.find(partId);
      const aspect = part ? part.w / part.h : 1;
      const d = toDesk(view, clientX - rect.left, clientY - rect.top);
      setSelectedScratch(workspace.add({ partId, x: d.x - SCRATCH_WIDTH / 2, y: d.y - SCRATCH_WIDTH / aspect / 2, w: SCRATCH_WIDTH }));
      return true;
    };

    const startPan = (event: PointerEvent) => {
      gesture = { kind: 'pan', pointerId: event.pointerId, last: { x: event.clientX, y: event.clientY } };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('panning');
    };
    const appendSample = (stroke: Extract<Gesture, { kind: 'stroke' }>, event: PointerEvent) => {
      const p = pagePoint(stroke.canvas, event.clientX, event.clientY);
      editor.appendStroke(p.x / 100, p.y / 100);
    };
    const flushItem = () => {
      frameRequest = 0;
      if (!gesture || gesture.kind !== 'item') return;
      if (gesture.pending) { editor.dragTo(gesture.pending.x, gesture.pending.y); gesture.pending = null; }
      repaintPage(gesture.index);
    };
    const cancel = (clearTouches = true) => {
      const ended = gesture;
      gesture = null;
      if (clearTouches) touches.clear();
      cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      viewport.classList.remove('panning');
      cursorRef.current?.setAttribute('hidden', '');
      if (!ended) return;
      if (ended.kind !== 'pinch' && viewport.hasPointerCapture(ended.pointerId)) viewport.releasePointerCapture(ended.pointerId);
      if (ended.kind === 'stroke') { editor.cancelStroke(); repaintPage(ended.index); notify(); }
      else if (ended.kind === 'item') { editor.cancelDrag(); repaintPage(ended.index); notify(); }
      else if (ended.kind === 'scratch') { ended.element.classList.remove('dragging'); ended.element.style.left = `${ended.item.x}px`; ended.element.style.top = `${ended.item.y}px`; }
      else paintVisible(true);
    };

    viewport.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' && gesture && gesture.kind !== 'pinch' && gesture.kind !== 'pan' && event.pointerId !== gesture.pointerId && touches.size === 0) return;
      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size === 2) {
          cancel(false);
          const [a, b] = [...touches.values()];
          for (const id of touches.keys()) viewport.setPointerCapture(id);
          gesture = { kind: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
          return;
        }
      }
      if (gesture || (event.button !== 0 && event.button !== 1)) return;
      if ((event.target as Element).closest('button')) return;
      viewport.focus({ preventScroll: true });
      if (event.button === 1 || spaceHeld || live.current.tool === 'hand') { event.preventDefault(); startPan(event); return; }
      const scratchElement = (event.target as Element).closest('[data-scratch]') as HTMLElement | null;
      if (scratchElement) {
        const id = scratchElement.dataset.scratch!;
        setSelectedScratch(id);
        const item = live.current.workspace?.state.get().items.find((entry) => entry.id === id);
        if (!item || live.current.readOnly) { startPan(event); return; }
        const d = toDesk(view, ...Object.values(inViewport(event.clientX, event.clientY)) as [number, number]);
        gesture = { kind: 'scratch', pointerId: event.pointerId, item, element: scratchElement, grab: { x: d.x - item.x, y: d.y - item.y }, moved: false };
        viewport.setPointerCapture(event.pointerId);
        scratchElement.classList.add('dragging');
        return;
      }
      setSelectedScratch(null);
      const frame = frameOf(event.target);
      const canvas = frame?.querySelector('canvas');
      if (!frame || !canvas) { startPan(event); return; }
      const index = Number(frame.dataset.frame);
      if (index !== editor.pageIndex) editor.goToPage(index);
      const p = pagePoint(canvas, event.clientX, event.clientY);
      if ((live.current.tool === 'brush' || live.current.tool === 'eraser') && !live.current.readOnly) {
        event.preventDefault();
        editor.setEraser(live.current.tool === 'eraser');
        editor.beginStroke(p.x / 100, p.y / 100);
        gesture = { kind: 'stroke', pointerId: event.pointerId, index, canvas };
        viewport.setPointerCapture(event.pointerId);
        repaintPage(index);
        return;
      }
      const hit = editor.selectAt(p.x, p.y, p.w, p.h);
      if (hit && !live.current.readOnly) {
        gesture = { kind: 'item', pointerId: event.pointerId, index, canvas, offset: { x: p.x - (editor.selectedX ?? p.x), y: p.y - (editor.selectedY ?? p.y) }, moved: false, pending: null };
        viewport.setPointerCapture(event.pointerId);
        editor.beginDrag();
      } else startPan(event);
      markAll();
      notify();
    }, { signal });

    viewport.addEventListener('pointermove', (event) => {
      const cursor = cursorRef.current;
      const canvas = frameCanvas(editor.pageIndex);
      if (cursor && canvas) {
        const rect = canvas.getBoundingClientRect();
        const drawing = live.current.tool === 'brush' || live.current.tool === 'eraser';
        cursor.hidden = !drawing || live.current.readOnly || gesture?.kind === 'pan' || gesture?.kind === 'pinch' || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
        if (!cursor.hidden) {
          const at = inViewport(event.clientX, event.clientY);
          const diameter = Math.max(4, rect.width * editor.brushStep * 3.2 / 322);
          cursor.style.width = cursor.style.height = diameter + 'px';
          cursor.style.transform = 'translate(' + at.x + 'px,' + at.y + 'px) translate(-50%, -50%)';
        }
      }
      if (event.pointerType === 'touch' && touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!gesture) return;
      if (gesture.kind === 'pinch') {
        if (touches.size !== 2) return;
        const [a, b] = [...touches.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const at = inViewport(centre.x, centre.y);
        const zoomed = zoomAt(view, distance / (gesture.distance || distance), at.x, at.y);
        applyView({ ...zoomed, x: zoomed.x + centre.x - gesture.centre.x, y: zoomed.y + centre.y - gesture.centre.y });
        gesture.distance = distance;
        gesture.centre = centre;
        return;
      }
      if (event.pointerId !== gesture.pointerId) return;
      if (gesture.kind === 'pan') {
        applyView({ ...view, x: view.x + event.clientX - gesture.last.x, y: view.y + event.clientY - gesture.last.y });
        gesture.last = { x: event.clientX, y: event.clientY };
      } else if (gesture.kind === 'stroke') {
        const samples = event.getCoalescedEvents?.();
        for (const sample of samples?.length ? samples : [event]) appendSample(gesture, sample);
        if (!frameRequest) frameRequest = requestAnimationFrame(() => { frameRequest = 0; if (gesture?.kind === 'stroke') repaintPage(gesture.index); });
      } else if (gesture.kind === 'item') {
        gesture.moved = true;
        const last = event.getCoalescedEvents?.().at(-1) ?? event;
        const p = pagePoint(gesture.canvas, last.clientX, last.clientY);
        gesture.pending = { x: p.x - gesture.offset.x, y: p.y - gesture.offset.y };
        if (!frameRequest) frameRequest = requestAnimationFrame(flushItem);
      } else {
        gesture.moved = true;
        const at = inViewport(event.clientX, event.clientY);
        const d = toDesk(view, at.x, at.y);
        gesture.element.style.left = `${d.x - gesture.grab.x}px`;
        gesture.element.style.top = `${d.y - gesture.grab.y}px`;
      }
    }, { signal });

    viewport.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'touch') touches.delete(event.pointerId);
      if (!gesture) return;
      if (gesture.kind === 'pinch') { if (touches.size < 2) { gesture = null; paintVisible(true); } return; }
      if (event.pointerId !== gesture.pointerId) return;
      const ended = gesture;
      gesture = null;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      if (ended.kind === 'pan') { viewport.classList.remove('panning'); paintVisible(true); return; }
      if (ended.kind === 'stroke') {
        cancelAnimationFrame(frameRequest);
        frameRequest = 0;
        appendSample(ended, event);
        editor.endStroke();
        repaintPage(ended.index);
        notify();
        return;
      }
      if (ended.kind === 'item') {
        cancelAnimationFrame(frameRequest);
        frameRequest = 0;
        if (ended.moved) { const p = pagePoint(ended.canvas, event.clientX, event.clientY); editor.dragTo(p.x - ended.offset.x, p.y - ended.offset.y); }
        editor.endDrag();
        repaintPage(ended.index);
        notify();
        return;
      }
      // Hit-test while the dragged item still ignores pointer events, or it hides the frame beneath it.
      const frame = frameOf(document.elementFromPoint(event.clientX, event.clientY));
      ended.element.classList.remove('dragging');
      const workspace = live.current.workspace;
      if (!workspace || !ended.moved) return;
      if (frame && !live.current.readOnly) {
        const index = Number(frame.dataset.frame);
        const canvas = frameCanvas(index);
        if (canvas && place(ended.item.partId, index, pagePoint(canvas, event.clientX, event.clientY))) { workspace.remove(ended.item.id); setSelectedScratch(null); return; }
      }
      const at = inViewport(event.clientX, event.clientY);
      const d = toDesk(view, at.x, at.y);
      workspace.update(ended.item.id, { x: d.x - ended.grab.x, y: d.y - ended.grab.y });
    }, { signal });

    viewport.addEventListener('pointercancel', (event) => { if (gesture && (gesture.kind === 'pinch' || event.pointerId === gesture.pointerId)) cancel(); }, { signal });
    viewport.addEventListener('lostpointercapture', (event) => { if (gesture && gesture.kind !== 'pinch' && event.pointerId === gesture.pointerId) cancel(); }, { signal });
    viewport.addEventListener('pointerleave', () => { cursorRef.current?.setAttribute('hidden', ''); }, { signal });
    window.addEventListener('blur', () => { spaceHeld = false; cancel(); }, { signal });

    viewport.addEventListener('wheel', (event) => {
      event.preventDefault();
      if (gesture?.kind === 'stroke' || gesture?.kind === 'item') return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      if (event.ctrlKey || event.metaKey) { const at = inViewport(event.clientX, event.clientY); applyView(zoomAt(view, Math.exp(-event.deltaY * unit * 0.01), at.x, at.y)); }
      else applyView({ ...view, x: view.x - event.deltaX * unit, y: view.y - event.deltaY * unit });
    }, { passive: false, signal });

    viewport.addEventListener('keydown', (event) => {
      if ((event.target as Element).closest('input, textarea, select')) return;
      if (gesture) { if (event.key === 'Escape') { event.preventDefault(); cancel(); } return; }
      if (event.key === ' ') { spaceHeld = true; event.preventDefault(); return; }
      if (event.key === '+' || event.key === '=') zoomBy(1.25);
      else if (event.key === '-') zoomBy(0.8);
      else if (event.key === '0') focusPage();
      else if (event.key === '1') zoomBy(1 / view.scale);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const next = editor.pageIndex + (event.key === 'ArrowRight' ? 1 : -1);
        if (next < 0 || next >= editor.pageCount) return;
        editor.goToPage(next);
        markAll();
        notify();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (live.current.readOnly) return;
        const { selectedScratch: scratchId, workspace } = live.current;
        if (scratchId && workspace) { workspace.remove(scratchId); setSelectedScratch(null); }
        else if (editor.selectedId) { editor.deleteSelected(); markAll(); notify(); }
        else return;
      } else if (event.key === 'Escape') { editor.clearSelection(); setSelectedScratch(null); markAll(); notify(); }
      else return;
      event.preventDefault();
    }, { signal });
    viewport.addEventListener('keyup', (event) => { if (event.key === ' ') spaceHeld = false; }, { signal });

    surface.addEventListener('transitionend', () => surface.classList.remove('animate'), { signal });
    const observer = new ResizeObserver(() => { if (!gesture) focusPage(); paintVisible(true); });
    observer.observe(viewport);
    focusPage();
    paintVisible(true);
    engine.current = { markAll, revealPage, focusPage, cancel, zoomBy, drop };
    return () => {
      lifetime.abort();
      observer.disconnect();
      if (settleTimer) clearTimeout(settleTimer);
      cancelAnimationFrame(paintRequest);
      cancelAnimationFrame(frameRequest);
      if (gesture?.kind === 'item') editor.cancelDrag();
      if (gesture?.kind === 'stroke') editor.cancelStroke();
      engine.current = null;
      painted.clear();
      for (const canvas of canvases.current.values()) canvas.width = canvas.height = 0;
    };
  }, [editor, library, spreadView]);

  useEffect(() => { engine.current?.markAll(); }, [revision, tick]);
  useEffect(() => { if (readOnly) engine.current?.cancel(); }, [readOnly]);
  useEffect(() => { editor.clearMeasurements(); engine.current?.markAll(); }, [editor, epoch]);
  useEffect(() => { engine.current?.revealPage(firstPage); }, [firstPage, editor.pageCount, spreadView]);

  const partsById = new Map(libraryParts.map((part) => [part.partId, part]));
  const act = (action: () => void) => { if (readOnly || editor.isGestureActive) return; action(); onChange(); };
  const goTo = (index: number) => { if (editor.isGestureActive || index < 0 || index >= editor.pageCount) return; editor.goToPage(index); onChange(); };
  const bookJson = editor.bookJson();

  return <>
    <div ref={viewportRef} className="desk-viewport" tabIndex={0} aria-label="デスク" data-tool={tool} data-spread={spreadView || undefined} data-readonly={readOnly || undefined}>
      <div ref={surfaceRef} className="desk-surface">
        {frames.slice(firstPage, firstPage + (spreadView ? 2 : 1)).map((frame, offset) => {
          const index = firstPage + offset;
          const id = editor.pageId(index);
          const current = index === pageIndex;
          return <div key={id} className="frame" data-frame={index} data-current={current || undefined} style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
            {spreadView && <div className="frame-chrome"><button aria-label={`${index + 1} ページを選択`} aria-current={current ? 'page' : undefined} onClick={() => {
              if (editor.isGestureActive) return;
              editor.goToPage(index); onChange();
            }}>{index + 1} ページ{current ? ' · 編集中' : ''}</button></div>}
            <canvas ref={(element) => { if (element) canvases.current.set(id, element); else canvases.current.delete(id); }} className="page-canvas" aria-label={current ? 'えほんの ページ' : `${index + 1} ページ`} />
          </div>;
        })}
        {scratch.map((item) => {
          const part = partsById.get(item.partId);
          const aspect = part ? part.w / part.h : 1;
          const selected = item.id === selectedScratch;
          return <div key={item.id} className="scratch-item" data-scratch={item.id} data-selected={selected || undefined} style={{ left: item.x, top: item.y, width: item.w, height: item.w / aspect }}>
            {part && assetsUrl ? <img src={`${assetsUrl}/${part.masterRef}/1024.webp`} alt={part.title} draggable={false} /> : <span className="scratch-missing">{part?.title || 'イラスト'}</span>}
            {selected && workspace && !readOnly && <div className="scratch-tools">
              <button aria-label="ちいさく" onClick={() => workspace.update(item.id, { w: Math.max(40, item.w * 0.84) })}><Icon name="minus" size={14} /></button>
              <button aria-label="おおきく" onClick={() => workspace.update(item.id, { w: Math.min(2000, item.w * 1.18) })}><Icon name="plus" size={14} /></button>
              <button aria-label="デスクから けす" onClick={() => { workspace.remove(item.id); setSelectedScratch(null); }}><Icon name="trash" size={14} /></button>
            </div>}
          </div>;
        })}
      </div>
      <div ref={cursorRef} className="brush-cursor" hidden />
      <div className="desk-bar">
        <div className="desk-bar-group page-nav">
          <button aria-label="まえの ページ" title="前のページ (←)" disabled={pageIndex === 0} onClick={() => goTo(pageIndex - 1)}><Icon name="chevronLeft" size={16} /></button>
          <span className="page-label">{pageIndex + 1} / {editor.pageCount} ページ</span>
          <button aria-label="つぎの ページ" title="次のページ (→)" disabled={pageIndex >= editor.pageCount - 1} onClick={() => goTo(pageIndex + 1)}><Icon name="chevron" size={16} /></button>
        </div>
        <div className="desk-bar-group view-tools">
          <button aria-label="1ページ表示" aria-pressed={!spreadView} onClick={() => { if (!editor.isGestureActive) setViewChoice({ bookId: editor.bookId, spread: false }); }}><Icon name="page" size={15} /><span>1ページ</span></button>
          <button aria-label="見開き表示" aria-pressed={spreadView} onClick={() => { if (!editor.isGestureActive) setViewChoice({ bookId: editor.bookId, spread: true }); }}><Icon name="spread" size={15} /><span>見開き</span></button>
          <button title="ページに合わせる (0)" onClick={() => engine.current?.focusPage()}><Icon name="fit" size={15} /><span>{spreadView ? '見開きに合わせる' : 'ページに合わせる'}</span></button>
        </div>
        <div className="desk-bar-group zoom">
          <button aria-label="ちいさく みる" onClick={() => engine.current?.zoomBy(0.8)}><Icon name="minus" size={14} /></button>
          <button ref={zoomRef} className="zoom-level" title="100%で表示" onClick={() => engine.current?.zoomBy(640 / (canvases.current.get(editor.pageId(pageIndex))?.getBoundingClientRect().width || 640))}>100%</button>
          <button aria-label="おおきく みる" onClick={() => engine.current?.zoomBy(1.25)}><Icon name="plus" size={14} /></button>
        </div>
      </div>
      <p className="desk-hint">{readOnly ? '閲覧モード' : tool === 'brush' ? 'ここに自由に描いてみましょう' : tool === 'eraser' ? '線をなぞって消す' : tool === 'hand' ? 'ドラッグして移動' : 'イラストや文字をクリックして選択'}<span>Space：移動 · ⌘ / Ctrl + スクロール：ズーム</span></p>
    </div>
    {showStrip && <nav className="page-strip" aria-label="ページ">
      <div className="page-strip-title"><Icon name="book" size={17} /><span>ページ</span><small>{editor.pageCount}</small></div>
      <div className="page-thumbnails" data-spread={spreadView || undefined}>{frames.map((_, index) => <button key={editor.pageId(index)} className="page-thumbnail" data-facing={spreadView && index >= firstPage && index < firstPage + 2 || undefined} aria-label={`${index + 1} ページを編集`} aria-current={index === pageIndex ? 'page' : undefined} onClick={() => {
        if (editor.isGestureActive) return;
        editor.goToPage(index); onChange(); engine.current?.focusPage();
      }}><Thumbnail json={bookJson} library={library} pageIndex={index} /><span>{String(index + 1).padStart(2, '0')}</span></button>)}</div>
      <button className="add-page" disabled={readOnly} aria-label="ページを ふやす" onClick={() => act(() => { editor.addPage(); engine.current?.focusPage(); })}><Icon name="plus" size={20} /><span>ページ追加</span></button>
      {frames.length > 1 && <div className="page-order" role="group" aria-label="ページの並べ替え">
        <button disabled={readOnly || pageIndex === 0} aria-label="まえの ページへ" title="このページを前へ移動" onClick={() => act(() => editor.movePage(pageIndex, pageIndex - 1))}><Icon name="arrowLeft" size={15} /></button>
        <span>並べ替え</span>
        <button disabled={readOnly || pageIndex === frames.length - 1} aria-label="つぎの ページへ" title="このページを後ろへ移動" onClick={() => act(() => editor.movePage(pageIndex, pageIndex + 1))}><Icon name="arrowRight" size={15} /></button>
      </div>}
    </nav>}
  </>;
});
