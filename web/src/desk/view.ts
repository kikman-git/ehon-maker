/** Desk geometry: frames are pages laid out in reading order, in desk units (CSS px at 100%). */
export interface View { x: number; y: number; scale: number }
export interface Frame { x: number; y: number; w: number; h: number }

export const FRAME_WIDTH = 640;
export const FRAME_GAP = 72;
export const SPREAD_GAP = 8;
export const MIN_SCALE = 0.08;
export const MAX_SCALE = 4;

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

export function frameRects(pageCount: number, aspect: number, spread = false): Frame[] {
  const h = FRAME_WIDTH / aspect;
  return Array.from({ length: pageCount }, (_, index) => ({
    x: spread
      ? Math.floor(index / 2) * (2 * FRAME_WIDTH + SPREAD_GAP + FRAME_GAP) + (index % 2) * (FRAME_WIDTH + SPREAD_GAP)
      : index * (FRAME_WIDTH + FRAME_GAP),
    y: 0, w: FRAME_WIDTH, h,
  }));
}

export const firstVisiblePage = (index: number, spread: boolean) => spread ? index - index % 2 : index;

/** Zooms about a viewport point so the desk under the pointer stays put. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return { x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio, scale };
}

/** Centres one frame at the largest scale that keeps it within the given share of the viewport. */
export function focusOn(frame: Frame, viewport: { w: number; h: number }, share = 0.78, maxScale = 1.5): View {
  const scale = clampScale(Math.min(maxScale, (viewport.h * share) / frame.h, (viewport.w * 0.9) / frame.w));
  return { x: viewport.w / 2 - (frame.x + frame.w / 2) * scale, y: viewport.h / 2 - (frame.y + frame.h / 2) * scale, scale };
}

export function fitAll(frames: Frame[], viewport: { w: number; h: number }, margin = 48): View {
  if (frames.length === 0) return { x: 0, y: 0, scale: 1 };
  const minX = Math.min(...frames.map((f) => f.x));
  const maxX = Math.max(...frames.map((f) => f.x + f.w));
  const minY = Math.min(...frames.map((f) => f.y));
  const maxY = Math.max(...frames.map((f) => f.y + f.h));
  const scale = clampScale(Math.min((viewport.w - margin * 2) / (maxX - minX), (viewport.h - margin * 2) / (maxY - minY)));
  return { x: viewport.w / 2 - ((minX + maxX) / 2) * scale, y: viewport.h / 2 - ((minY + maxY) / 2) * scale, scale };
}

export const toDesk = (view: View, px: number, py: number) => ({ x: (px - view.x) / view.scale, y: (py - view.y) / view.scale });
