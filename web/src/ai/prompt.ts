export interface Point { x: number; y: number }
export interface MarkBox { x0: number; y0: number; x1: number; y1: number }

/** A freehand loop drawn over one page, in percent of that page. */
export interface Mark { pageIndex: number; pageId: string; points: Point[]; box: MarkBox }

/** One item's unrotated box on the page, as `WebEditor.itemBoundsJson` reports it. */
export interface ItemBox { id: string; kind: 'part' | 'text'; ref: string; x: number; y: number; w: number; h: number; rotationDeg: number }

export function markBox(points: Point[]): MarkBox {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export const markPath = (points: Point[]) => points.length ? points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z' : '';

/** Items whose box overlaps the mark; rotation is ignored, which is generous rather than wrong. */
export function itemsInMark(items: ItemBox[], box: MarkBox): ItemBox[] {
  return items.filter((item) => item.x + item.w / 2 > box.x0 && item.x - item.w / 2 < box.x1 && item.y + item.h / 2 > box.y0 && item.y - item.h / 2 < box.y1);
}

/** The chip over the compose box: which page and how many items the loop caught; the exact box travels to the model separately. */
export const describeMark = (mark: Mark, items: ItemBox[]) =>
  `${mark.pageIndex + 1}ページの かこんだ ところ` + (items.length ? ` · ${items.length}こ` : '');
