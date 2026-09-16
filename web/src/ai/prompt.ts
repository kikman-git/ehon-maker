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

const pct = (value: number) => `${Math.round(value)}%`;
const shortText = (text: string, max = 40) => (text.length > max ? text.slice(0, max - 1) + '…' : text);

export const describeMark = (mark: Mark, items: ItemBox[]) =>
  `${mark.pageIndex + 1}ページ · x ${pct(mark.box.x0)}–${pct(mark.box.x1)} · y ${pct(mark.box.y0)}–${pct(mark.box.y1)}` + (items.length ? ` · ${items.length}こ` : '');

const describeItem = (item: ItemBox) =>
  `- ${item.id} (${item.kind === 'text' ? `text "${shortText(item.ref, 60)}"` : `part ${item.ref}`}) centred at x ${item.x.toFixed(1)}, y ${item.y.toFixed(1)}, ${item.w.toFixed(1)}×${item.h.toFixed(1)}` + (item.rotationDeg ? `, rotated ${item.rotationDeg.toFixed(0)}°` : '');

export interface PromptInput {
  title: string;
  pageIndex: number;
  pageId: string;
  pageCount: number;
  request: string;
  mark: Mark | null;
  /** Items of the marked page that overlap the mark, or the whole page when nothing is marked. */
  items: ItemBox[];
  selected: ItemBox | null;
  image: boolean;
}

/** The turn Claude receives: where the user is looking, what they marked, and their words verbatim. */
export function composePrompt(input: PromptInput): string {
  const lines = [
    `You are editing the picture book "${input.title}" that is open in the ぺたぺた studio. The book is \`book.ehon.json\` in this directory; \`FORMAT.md\` is its format and \`CLAUDE.md\` the house rules. The studio is showing page ${input.pageIndex + 1} of ${input.pageCount} (id "${input.pageId}").`,
  ];
  if (input.image) lines.push(input.mark ? '`page.png` shows that page with the marked area outlined in red.' : '`page.png` shows that page as the user sees it.');
  if (input.mark) {
    const { box } = input.mark;
    lines.push('', `The user marked an area on page ${input.mark.pageIndex + 1} (id "${input.mark.pageId}"): x ${pct(box.x0)} to ${pct(box.x1)}, y ${pct(box.y0)} to ${pct(box.y1)} of the page (percent of width and height, origin top-left). The request is about that area.`);
    lines.push(input.items.length ? 'Items whose box overlaps the mark:' : 'No item lies inside the mark; the request may be about the backdrop, the page ink or something to add there.', ...input.items.map(describeItem));
  } else if (input.items.length) {
    lines.push('', 'Items on this page:', ...input.items.map(describeItem));
  }
  if (input.selected) lines.push('', `The user has selected ${input.selected.id} (${input.selected.kind === 'text' ? `text "${shortText(input.selected.ref, 60)}"` : `part ${input.selected.ref}`}).`);
  lines.push('', 'Request:', input.request.trim(), '', 'Change only what the request asks for, keep every existing id, and write the whole document back to `book.ehon.json`. Then reply in the language of the request with one or two sentences about what you changed.');
  return lines.join('\n');
}
