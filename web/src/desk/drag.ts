import type { PointerEvent as ReactPointerEvent } from 'react';
import { createStore } from '../cloud/store';

/** The part being dragged out of the library, with the ghost's screen position. */
export const dragging = createStore<{ active: { partId: string; label: string; x: number; y: number } | null }>({ active: null });

const THRESHOLD = 6;

/**
 * A library button places on tap and drags with a ghost once the pointer moves. The element
 * keeps pointer capture so leaving it never ends the gesture; `data-dragged` tells the
 * button's click handler to ignore the click a completed drag still produces.
 */
export function startPartDrag(event: ReactPointerEvent<HTMLElement>, partId: string, label: string, onDrop: (clientX: number, clientY: number) => void): void {
  if (event.button !== 0) return;
  const source: HTMLElement = event.currentTarget;
  const pointerId = event.pointerId;
  const origin = { x: event.clientX, y: event.clientY };
  const lifetime = new AbortController();
  const { signal } = lifetime;
  let moved = false;
  delete source.dataset.dragged;
  source.setPointerCapture(pointerId);
  const finish = () => { lifetime.abort(); dragging.set({ active: null }); };
  source.addEventListener('pointermove', (move) => {
    if (move.pointerId !== pointerId) return;
    if (!moved && Math.hypot(move.clientX - origin.x, move.clientY - origin.y) < THRESHOLD) return;
    moved = true;
    dragging.set({ active: { partId, label, x: move.clientX, y: move.clientY } });
  }, { signal });
  source.addEventListener('pointerup', (up) => {
    if (up.pointerId !== pointerId) return;
    finish();
    if (moved) { source.dataset.dragged = '1'; onDrop(up.clientX, up.clientY); }
  }, { signal });
  source.addEventListener('pointercancel', finish, { signal });
  source.addEventListener('lostpointercapture', finish, { signal });
}
