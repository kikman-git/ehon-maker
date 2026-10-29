import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { AiService, imageOf, requestOf, text, type Chunk, type Metered, type Task, type Tool } from './agent';
import { acceptableSvg, drawOne, MAX_BOOK_ART, SAFETY } from './atelier';
import type { CreditService } from './credits';
import { findPictures, LIBRARY_PREFIX, MATERIAL_IDS, materialOf, MAX_WORDS, type LibraryPainter } from './library';
import { MATERIAL_CATEGORIES } from './materials';
import type { ChatModel, Message } from './model';

// The picture-book harness (decision #67): the model edits the open book through tools that know the format, looks up and extends the painted library (decision #70) and draws pictures with the atelier.

export const MAX_BOOK_CHARS = 200_000;
export const MAX_ITEMS_DESCRIBED = 40;
export const MAX_PICTURES_PER_TURN = 12;
export const MAX_PAINTINGS_PER_TURN = 4;
export const FORMAT_VERSION = 6;
export const FONTS = ['yomogi', 'maru', 'kiwi', 'pop', 'marker', 'futo'];
const LIB = /^lib:[A-Za-z0-9_-]{1,128}$/;

export interface ItemBox { id: string; kind: 'part' | 'text'; ref: string; x: number; y: number; w: number; h: number; rotationDeg: number }
export interface MarkBox { pageIndex: number; pageId: string; x0: number; y0: number; x1: number; y1: number }

export interface BookInput {
  title: string;
  request: string;
  pageIndex: number;
  pageId: string;
  pageCount: number;
  /** The document as JSON with every `art` entry reduced to its name; the browser keeps the drawings. */
  book: string;
  /** A few of the book's drawings, so new pictures match them. */
  bookArt: string[];
  mark: MarkBox | null;
  items: ItemBox[];
  selected: ItemBox | null;
  image: string | null;
}
/** `book` carries the whole document without the old drawings, plus any new `art` entries with their SVG. */
export interface BookOutput { book: string | null; say: string }
export type BookResult = Metered<BookOutput>;
export type BookChunk = Chunk<BookOutput>;

interface ArtEntry { name: string; svg?: string }
interface Item { type: 'part' | 'text'; id: { value: string }; x: number; y: number; [key: string]: unknown }
interface Page { id: string; background?: unknown; items: Item[]; [key: string]: unknown }
interface Doc { version: number; book: { title?: string; art?: Record<string, ArtEntry>; pages: Page[]; [key: string]: unknown } }

interface State {
  input: BookInput;
  uid: string;
  doc: Doc;
  /** Drawings made this turn; everything else in `art` stays as the browser has it. */
  newArt: Record<string, ArtEntry>;
  /** The account's own `lib:` pictures the book may place: those it already uses and the poses painted this turn. */
  libParts: Set<string>;
  changed: boolean;
  pictures: number;
  paintings: number;
  say: string | null;
}

export const bookSystem = (painting: boolean) => `You make and edit children's picture books in the ぺたぺた studio. Each turn brings the request and the open book; change the book only through the tools, then call finish with one or two short sentences in the request's language. Never mention JSON or ids to the user.

Format: pages in order, each a background colour and items painted in array order (backdrop, then pieces, then words). x and y are an item's centre in percent of the page, origin top-left. A part shows a library picture (${LIBRARY_PREFIX}<slug>)${painting ? ', a pose painted this turn (lib:<id>)' : ''} or one drawn for this book (art:<key>); sizePct is its width in percent of the page width. A text item is one caption or line: sizePct 2 to 30 (about sixteen characters fit at 5), fonts yomogi (handwriting), maru (rounded), kiwi, pop, marker, futo, optional ruby furigana with one line per text line.

Binding, for a new book or story: cover (title and the favourite picture), 扉 (title again, small), spreads with the picture on the odd page and the words on the even page, back cover with the colophon (発行 / さく / え). Words: one text item per line, sizePct 5, yomogi, about 7 percent apart, centred at x 50 in the lower part of the page. Picture page: a backdrop at x 50, y 50, sizePct 100, heightPct 100, each character a separate sprite 20 to 40 percent wide so the child can move it. Plan the whole story first: six to ten spreads, one idea each, a gentle ending, short warm Japanese in わかちがき when the book is Japanese.

Pictures: the painted library is the default (${MATERIAL_CATEGORIES.join(', ')}). find_pictures looks it up by word (ねこ, fox, でんしゃ) and answers with each character's look, as it was described to its painter, and the poses it comes in; look up every character and thing the story needs before planning, so the words match the pictures. Library pictures are square with a transparent surround, placed with add_part and sizePct only; おはなしの ばめん are whole scenes for backdrops.${painting ? ` When the story needs a pose the library lacks, paint_pose paints the character in that pose from its own prompt and keeps it with the family's pictures; place it like any other, at most ${MAX_PAINTINGS_PER_TURN} a turn.` : ''} draw_picture is for what the library has no character for, or for a book whose pictures are already drawn; describe the subject, pose, colours and mood. Place each picture with add_part before making the next, so the family watches the book fill in. At most ${MAX_PICTURES_PER_TURN} drawings a turn; reuse a picture across pages instead of remaking it.

Rules: change only what the request asks and keep everything else, including the family's own strokes and drawings. On a tool error keep what you have, read it, and try differently. ${SAFETY} Decline such a request gently with finish and change nothing.`;
export const BOOK_SYSTEM = bookSystem(true);

const pct = (value: number) => `${Math.round(value)}%`;
const shortText = (value: string, max = 60) => (value.length > max ? value.slice(0, max - 1) + '…' : value);
const describeItem = (item: ItemBox) =>
  `- ${item.id} (${item.kind === 'text' ? `text "${shortText(item.ref)}"` : `part ${item.ref}`}) centred at x ${item.x.toFixed(1)}, y ${item.y.toFixed(1)}, ${item.w.toFixed(1)}×${item.h.toFixed(1)}` + (item.rotationDeg ? `, rotated ${item.rotationDeg.toFixed(0)}°` : '');

export function composeBookPrompt(input: BookInput): string {
  const lines = [`The book is "${input.title}". The studio is showing page ${input.pageIndex + 1} of ${input.pageCount} (id "${input.pageId}").`];
  if (input.image) lines.push(input.mark ? 'The image is that page with the marked area outlined in red.' : 'The image is that page as the user sees it.');
  if (input.mark) {
    lines.push('', `The user marked an area on page ${input.mark.pageIndex + 1} (id "${input.mark.pageId}"): x ${pct(input.mark.x0)} to ${pct(input.mark.x1)}, y ${pct(input.mark.y0)} to ${pct(input.mark.y1)}. The request is about that area.`);
    lines.push(input.items.length ? 'Items whose box overlaps the mark:' : 'No item lies inside the mark; the request may be about the backdrop or something to add there.', ...input.items.map(describeItem));
  } else if (input.items.length) lines.push('', 'Items on this page:', ...input.items.map(describeItem));
  if (input.selected) lines.push('', `The user has selected ${input.selected.id} (${input.selected.kind === 'text' ? `text "${shortText(input.selected.ref)}"` : `part ${input.selected.ref}`}).`);
  lines.push('', 'Document:', input.book, '', 'Request:', input.request);
  return lines.join('\n');
}

const number = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
function itemBoxOf(value: unknown): ItemBox | null {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  const id = raw ? text(raw.id, 120) : null;
  if (!raw || !id) return null;
  return { id, kind: raw.kind === 'text' ? 'text' : 'part', ref: text(raw.ref, 200) ?? '', x: number(raw.x), y: number(raw.y), w: number(raw.w), h: number(raw.h), rotationDeg: number(raw.rotationDeg) };
}

/** The document as the model may see it: parsed, bounded, and with the drawings stripped from `art`. */
export function parseDocument(value: unknown): Doc {
  if (typeof value !== 'string' || value.length > MAX_BOOK_CHARS) throw new HttpsError('invalid-argument', `The book must be JSON under ${MAX_BOOK_CHARS} characters.`);
  let document: Doc;
  try { document = JSON.parse(value) as Doc; } catch { throw new HttpsError('invalid-argument', 'The book is not JSON.'); }
  if (typeof document?.version !== 'number' || !document.book || !Array.isArray(document.book.pages)) throw new HttpsError('invalid-argument', 'The book is not a ぺたぺた document.');
  for (const page of document.book.pages) { if (typeof page?.id !== 'string' || !Array.isArray(page.items)) throw new HttpsError('invalid-argument', 'A page is malformed.'); }
  document.book.art = Object.fromEntries(Object.entries(document.book.art ?? {}).map(([key, entry]) => [key, { name: typeof entry?.name === 'string' ? entry.name : key }]));
  return document;
}

export function validateBookInput(raw: unknown): BookInput {
  const data = (raw ?? {}) as Record<string, unknown>;
  const request = requestOf(data.request);
  const document = parseDocument(data.book);
  const markRaw = data.mark && typeof data.mark === 'object' ? data.mark as Record<string, unknown> : null;
  const mark: MarkBox | null = markRaw ? { pageIndex: number(markRaw.pageIndex), pageId: text(markRaw.pageId, 120) ?? '', x0: number(markRaw.x0), y0: number(markRaw.y0), x1: number(markRaw.x1), y1: number(markRaw.y1) } : null;
  const items = Array.isArray(data.items) ? data.items.slice(0, MAX_ITEMS_DESCRIBED).map(itemBoxOf).filter((item): item is ItemBox => item !== null) : [];
  // Reference art only sets the style; a picture that is not plain SVG is left out rather than failing the turn.
  const art = Array.isArray(data.bookArt) ? data.bookArt.filter(acceptableSvg).slice(0, MAX_BOOK_ART) : [];
  return {
    title: text(data.title, 120) || (typeof document.book.title === 'string' ? document.book.title : 'えほん'),
    request, book: JSON.stringify(document), bookArt: art as string[], mark, items,
    pageIndex: Math.max(0, Math.floor(number(data.pageIndex))),
    pageId: text(data.pageId, 120) ?? document.book.pages[0]?.id ?? '',
    pageCount: Math.max(1, Math.floor(number(data.pageCount, document.book.pages.length))),
    selected: itemBoxOf(data.selected),
    image: imageOf(data.image),
  };
}

// ── Tools ─────────────────────────────────────────────────────────────────────────────────────

class ToolError extends Error {}
const fail = (message: string): never => { throw new ToolError(message); };
const str = (input: Record<string, unknown>, key: string, max: number, required = true): string | undefined => {
  const value = input[key];
  if (value === undefined || value === null) return required ? fail(`"${key}" is required.`) : undefined;
  if (typeof value !== 'string') return fail(`"${key}" must be a string.`);
  if (value.length > max) return fail(`"${key}" is longer than ${max} characters.`);
  return value;
};
const num = (input: Record<string, unknown>, key: string, min: number, max: number, required = true): number | undefined => {
  const value = input[key];
  if (value === undefined || value === null) return required ? fail(`"${key}" is required.`) : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(`"${key}" must be a number.`);
  if (value < min || value > max) return fail(`"${key}" must be between ${min} and ${max}.`);
  return value;
};
const bool = (input: Record<string, unknown>, key: string): boolean | undefined => {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') return fail(`"${key}" must be true or false.`);
  return value;
};
const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (input: Record<string, unknown>, key: string): string | undefined => {
  const value = str(input, key, 7, false);
  if (value !== undefined && !HEX.test(value)) fail(`"${key}" must be a #rrggbb colour.`);
  return value;
};

const pageOf = (state: State, id: string): Page => state.doc.book.pages.find(page => page.id === id) ?? fail(`No page "${id}". Pages: ${state.doc.book.pages.map(page => page.id).join(', ')}.`);
function itemOf(state: State, id: string): { page: Page; item: Item; index: number } {
  for (const page of state.doc.book.pages) {
    const index = page.items.findIndex(item => item?.id?.value === id);
    if (index >= 0) return { page, item: page.items[index], index };
  }
  return fail(`No item "${id}".`);
}
const allIds = (state: State) => new Set(state.doc.book.pages.flatMap(page => page.items.map(item => item?.id?.value)));
function freshId(state: State, prefix: string): string {
  const taken = allIds(state);
  for (let n = 1; ; n++) { const id = `${prefix}${n}`; if (!taken.has(id)) return id; }
}
function freshPageId(state: State): string {
  const taken = new Set(state.doc.book.pages.map(page => page.id));
  for (let n = state.doc.book.pages.length + 1; ; n++) { const id = `p${n}`; if (!taken.has(id)) return id; }
}
function freshArtKey(state: State, name: string): string {
  const base = name.replace(/[^A-Za-z0-9_-]/g, '').toLowerCase() || 'art';
  const taken = new Set([...Object.keys(state.doc.book.art ?? {}), ...Object.keys(state.newArt)]);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) { const key = `${base}-${n}`; if (!taken.has(key)) return key; }
}
function partIdOk(state: State, partId: string) {
  if (partId.startsWith('art:')) { const key = partId.slice(4); if (!(key in (state.doc.book.art ?? {})) && !(key in state.newArt)) fail(`No picture "${partId}" in this book. Draw it with draw_picture first.`); }
  else if (partId.startsWith('lib:')) { if (!state.libParts.has(partId)) fail(`No picture "${partId}" in this book. Paint it with paint_pose first.`); }
  else if (!MATERIAL_IDS.has(partId)) fail(`Unknown picture "${partId}". Use "${LIBRARY_PREFIX}<slug>" from the library (find_pictures lists them), or an art: key.`);
}
const touched = (state: State) => { state.changed = true; };

function textFields(input: Record<string, unknown>, into: Item, creating: boolean) {
  const value = str(input, 'text', 2_000, creating);
  if (value !== undefined) into.text = value;
  const font = str(input, 'font', 20, false);
  if (font !== undefined) { if (!FONTS.includes(font)) fail(`"font" must be one of ${FONTS.join(', ')}.`); into.font = font; }
  else if (creating) into.font = 'yomogi';
  const size = num(input, 'sizePct', 2, 30, false);
  if (size !== undefined) into.sizePct = size; else if (creating) into.sizePct = 5;
  const ruby = str(input, 'ruby', 2_000, false);
  if (ruby !== undefined) into.ruby = ruby;
  const c = color(input, 'color');
  if (c !== undefined) into.color = c;
  const index = num(input, 'colorIndex', 0, 4, false);
  if (index !== undefined) into.colorIndex = Math.round(index);
  const bold = bool(input, 'bold');
  if (bold !== undefined) into.bold = bold;
  const lineHeight = num(input, 'lineHeight', 0.8, 3, false);
  if (lineHeight !== undefined) into.lineHeight = lineHeight;
}
function partFields(state: State, input: Record<string, unknown>, into: Item, creating: boolean) {
  const partId = str(input, 'partId', 120, creating);
  if (partId !== undefined) { partIdOk(state, partId); into.partId = { value: partId }; }
  const size = num(input, 'sizePct', 1, 100, creating);
  if (size !== undefined) into.sizePct = size;
  const height = num(input, 'heightPct', 1, 100, false);
  if (height !== undefined) into.heightPct = height;
  const rotation = num(input, 'rotationDeg', -360, 360, false);
  if (rotation !== undefined) into.rotationDeg = rotation;
}
function position(input: Record<string, unknown>, into: Item, creating: boolean) {
  const x = num(input, 'x', -50, 150, creating);
  const y = num(input, 'y', -50, 150, creating);
  if (x !== undefined) into.x = x;
  if (y !== undefined) into.y = y;
}

const PAGE = { pageId: { type: 'string', description: 'The id of a page in the book.' } };
const POSITION = { x: { type: 'number', description: 'Centre, percent of the page width.' }, y: { type: 'number', description: 'Centre, percent of the page height.' } };
const TEXT_FIELDS = {
  text: { type: 'string', description: 'The words; "\\n" starts a new line.' }, font: { type: 'string', enum: FONTS }, sizePct: { type: 'number', description: '2 to 30, percent of the page width.' },
  ruby: { type: 'string', description: 'Furigana for the whole string, "\\n" per line of text.' }, color: { type: 'string', description: '#rrggbb' }, colorIndex: { type: 'integer', description: '0 ink, 1 terracotta, 2 sage, 3 red, 4 violet.' },
  bold: { type: 'boolean' }, lineHeight: { type: 'number', description: '0.8 to 3 ems, default 1.5.' },
};
const PART_FIELDS = {
  partId: { type: 'string', description: `"${LIBRARY_PREFIX}<slug>" from the library or "art:<key>" drawn for this book.` }, sizePct: { type: 'number', description: 'Width, percent of the page width.' },
  heightPct: { type: 'number', description: 'Only for a non-square picture: height, percent of the page height.' }, rotationDeg: { type: 'number' },
};
const schema = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false });

const TOOLS: Tool<State>[] = [
  { name: 'set_title', description: 'Renames the book.', schema: schema({ title: { type: 'string' } }, ['title']), run(input, state) { state.doc.book.title = str(input, 'title', 80)!; touched(state); return { result: { ok: true }, step: 'だいめいを つけました' }; } },
  { name: 'add_page', description: 'Adds an empty page, after a page or at the end. Returns its id.', schema: schema({ afterPageId: { type: 'string', description: 'Insert after this page; omit to append.' }, background: { type: 'string', description: '#rrggbb, default paper #f9f4ed.' } }, []),
    run(input, state) {
      const after = str(input, 'afterPageId', 120, false);
      const page: Page = { id: freshPageId(state), background: color(input, 'background') ?? '#f9f4ed', items: [] };
      const index = after ? state.doc.book.pages.indexOf(pageOf(state, after)) + 1 : state.doc.book.pages.length;
      state.doc.book.pages.splice(index, 0, page);
      touched(state);
      return { result: { ok: true, pageId: page.id, pageNumber: index + 1 }, step: `${index + 1}ページめを つくりました` };
    } },
  { name: 'remove_page', description: 'Removes a page and everything on it. A book keeps at least one page.', schema: schema(PAGE, ['pageId']),
    run(input, state) {
      const page = pageOf(state, str(input, 'pageId', 120)!);
      if (state.doc.book.pages.length === 1) fail('The last page cannot be removed.');
      state.doc.book.pages.splice(state.doc.book.pages.indexOf(page), 1);
      touched(state);
      return { result: { ok: true }, step: 'ページを けしました' };
    } },
  { name: 'set_page', description: 'Changes a page\'s background colour.', schema: schema({ ...PAGE, background: { type: 'string', description: '#rrggbb' } }, ['pageId', 'background']),
    run(input, state) { pageOf(state, str(input, 'pageId', 120)!).background = color(input, 'background') ?? fail('"background" is required.'); touched(state); return { result: { ok: true }, step: 'ページの いろを かえました' }; } },
  { name: 'add_text', description: 'Adds words to a page. Returns the item id.', schema: schema({ ...PAGE, ...POSITION, ...TEXT_FIELDS }, ['pageId', 'text', 'x', 'y']),
    run(input, state) {
      const page = pageOf(state, str(input, 'pageId', 120)!);
      const item: Item = { type: 'text', id: { value: freshId(state, 'ai-t') }, x: 0, y: 0 };
      position(input, item, true); textFields(input, item, true);
      page.items.push(item); touched(state);
      return { result: { ok: true, id: item.id.value }, step: 'ことばを かきました' };
    } },
  { name: 'set_text', description: 'Changes words or their look, position or size. Only the given fields change.', schema: schema({ id: { type: 'string' }, ...POSITION, ...TEXT_FIELDS }, ['id']),
    run(input, state) {
      const { item } = itemOf(state, str(input, 'id', 120)!);
      if (item.type !== 'text') fail('That item is a picture; use set_part.');
      position(input, item, false); textFields(input, item, false); touched(state);
      return { result: { ok: true }, step: 'ことばを なおしました' };
    } },
  { name: 'add_part', description: 'Places a picture on a page: one from the painted library (pack.storybook:<slug>) or one drawn for this book (art:<key>). Returns the item id.', schema: schema({ ...PAGE, ...POSITION, ...PART_FIELDS }, ['pageId', 'partId', 'x', 'y', 'sizePct']),
    run(input, state) {
      const page = pageOf(state, str(input, 'pageId', 120)!);
      const item: Item = { type: 'part', id: { value: freshId(state, 'ai-p') }, x: 0, y: 0 };
      position(input, item, true); partFields(state, input, item, true);
      page.items.push(item); touched(state);
      return { result: { ok: true, id: item.id.value }, step: 'えを おきました' };
    } },
  { name: 'set_part', description: 'Moves, resizes, rotates or swaps a placed picture. Only the given fields change; its own corrections stay.', schema: schema({ id: { type: 'string' }, ...POSITION, ...PART_FIELDS }, ['id']),
    run(input, state) {
      const { item } = itemOf(state, str(input, 'id', 120)!);
      if (item.type !== 'part') fail('That item is text; use set_text.');
      position(input, item, false); partFields(state, input, item, false); touched(state);
      return { result: { ok: true }, step: 'えを うごかしました' };
    } },
  { name: 'set_layer', description: 'Sends an item to the back or brings it to the front of its page.', schema: schema({ id: { type: 'string' }, layer: { type: 'string', enum: ['back', 'front'] } }, ['id', 'layer']),
    run(input, state) {
      const { page, item, index } = itemOf(state, str(input, 'id', 120)!);
      page.items.splice(index, 1);
      if (str(input, 'layer', 5) === 'back') page.items.unshift(item); else page.items.push(item);
      touched(state);
      return { result: { ok: true }, step: 'かさなりを かえました' };
    } },
  { name: 'remove_item', description: 'Removes words or a picture from its page.', schema: schema({ id: { type: 'string' } }, ['id']),
    run(input, state) { const { page, index } = itemOf(state, str(input, 'id', 120)!); page.items.splice(index, 1); touched(state); return { result: { ok: true }, step: 'けしました' }; } },
  { name: 'move_item', description: 'Moves words or a picture to another page, keeping its position.', schema: schema({ id: { type: 'string' }, ...PAGE }, ['id', 'pageId']),
    run(input, state) {
      const target = pageOf(state, str(input, 'pageId', 120)!);
      const { page, item, index } = itemOf(state, str(input, 'id', 120)!);
      page.items.splice(index, 1); target.items.push(item); touched(state);
      return { result: { ok: true }, step: 'べつの ページに うつしました' };
    } },
  { name: 'draw_picture', description: 'Draws one new picture for this book in the house style and adds it to the book\'s art. Returns the partId to place with add_part.',
    schema: schema({ name: { type: 'string', description: 'A short hiragana name the family will see, such as くま.' }, description: { type: 'string', description: 'What to draw: the character or scene, pose, colours, mood.' }, kind: { type: 'string', enum: ['sprite', 'backdrop'] } }, ['name', 'description']),
    async run(input, state, agent) {
      const name = str(input, 'name', 40)!;
      const description = str(input, 'description', 600)!;
      const kind = str(input, 'kind', 10, false) === 'backdrop' ? 'backdrop' : 'sprite';
      if (state.pictures >= MAX_PICTURES_PER_TURN) fail(`Only ${MAX_PICTURES_PER_TURN} pictures can be drawn in one turn; place what exists or ask the user to continue next turn.`);
      state.pictures++;
      void agent.send({ type: 'progress', step: `「${name}」の えを かいています…` });
      const svg = await drawOne(agent, { title: state.input.title, description, kind, bookArt: [...state.input.bookArt, ...Object.values(state.newArt).map(entry => entry.svg!)].slice(-MAX_BOOK_ART) });
      if (!svg) return fail('The drawing did not come out as plain SVG; describe it again, more simply.');
      const key = freshArtKey(state, name);
      state.newArt[key] = { name, svg };
      touched(state);
      void agent.send({ type: 'art', key, name, svg });
      return { result: { ok: true, partId: `art:${key}`, square: kind === 'sprite' }, step: `「${name}」の えが できました` };
    } },
  { name: 'find_pictures', description: 'Looks up the painted library by word (ねこ, fox, でんしゃ). Answers with each matching character: how it looks, and every pose it comes in, with the slug to place as pack.storybook:<slug>.',
    schema: schema({ words: { type: 'array', items: { type: 'string' }, description: `Up to ${MAX_WORDS} words, Japanese or English.` } }, ['words']),
    run(input) {
      const words = Array.isArray(input.words) ? input.words.filter((word): word is string => typeof word === 'string').slice(0, MAX_WORDS) : fail('"words" must be a list of words.');
      const characters = findPictures(words);
      return { result: characters.length ? { characters } : { characters, hint: 'Nothing in the library matches; try another word, or draw it with draw_picture.' }, step: 'えを さがしました' };
    } },
  { name: 'finish', description: 'Ends the turn with your words to the user: one or two short sentences in the language of the request.', schema: schema({ say: { type: 'string' } }, ['say']),
    run(input, state) { state.say = str(input, 'say', 400)!; return { result: { ok: true } }; } },
];

/** Paints a library character in a new pose and keeps it as the account's own picture; only on offer when an image model is configured. */
const paintPose = (painter: LibraryPainter): Tool<State> => ({
  name: 'paint_pose', description: 'Paints a library character in a pose the library lacks, from the character\'s own prompt, and keeps it with the family\'s pictures. Returns the partId to place with add_part.',
  schema: schema({ slug: { type: 'string', description: 'A slug from find_pictures; any pose of the character will do.' }, pose: { type: 'string', description: 'The new pose, in English, such as "sleeping curled up, eyes closed".' }, name: { type: 'string', description: 'A short hiragana name the family will see, such as ねこ・ねむる.' } }, ['slug', 'pose', 'name']),
  async run(input, state, agent) {
    const material = materialOf(str(input, 'slug', 80)!) ?? fail('No such slug in the library; take one from find_pictures.');
    const pose = str(input, 'pose', 300)!;
    const name = str(input, 'name', 40)!;
    if (state.paintings >= MAX_PAINTINGS_PER_TURN) fail(`Only ${MAX_PAINTINGS_PER_TURN} poses can be painted in one turn; place what exists or ask the user to continue next turn.`);
    state.paintings++;
    void agent.send({ type: 'progress', step: `「${name}」を かいています…` });
    const painted = await painter.paint(agent, state.uid, material, pose, name);
    state.libParts.add(painted.partId);
    return { result: { ok: true, partId: painted.partId, square: painted.w === painted.h }, step: `「${name}」が できました` };
  },
});

export function bookTask(painter: LibraryPainter | null): Task<BookInput, State, BookOutput> {
  const tools = painter ? [...TOOLS, paintPose(painter)] : TOOLS;
  return {
    id: 'book', hold: 60, maxRounds: 40, system: bookSystem(painter !== null), finishTool: 'finish',
    validate: validateBookInput,
    start(input, uid) {
      const content: Message['content'] = [];
      if (input.image) content.push({ type: 'image', dataUrl: input.image });
      content.push({ type: 'text', text: composeBookPrompt(input) });
      const doc = JSON.parse(input.book) as Doc;
      const libParts = new Set(doc.book.pages.flatMap(page => page.items.map(item => (item?.partId as { value?: unknown } | undefined)?.value)).filter((id): id is string => typeof id === 'string' && LIB.test(id)));
      return { state: { input, uid, doc, newArt: {}, libParts, changed: false, pictures: 0, paintings: 0, say: null }, messages: [{ role: 'user', content }] };
    },
    tools: () => tools,
    toolChoice: () => 'auto',
  // Pictures travel in their own chunks, so the draft stays the small art-free document.
  draft: (state) => (state.changed ? JSON.stringify({ ...state.doc, version: FORMAT_VERSION }) : null),
  finish(state, text, stop) {
    const say = state.say ?? text ?? '';
    const fallback = stop === 'refusal' ? 'その おねがいは できません。べつの ことを たのんでみましょう。' : stop === 'rounds' || stop === 'length' ? 'とちゅうまで できました。つづきは もういちど たのんでください。' : state.changed ? 'できました。' : 'えほんは かわりませんでした。';
    if (!state.changed) return { book: null, say: say || fallback };
    const document: Doc = { ...state.doc, version: FORMAT_VERSION, book: { ...state.doc.book, art: { ...state.doc.book.art, ...state.newArt } } };
    return { book: JSON.stringify(document), say: say || fallback };
  },
  };
}
export const BOOK_TASK = bookTask(null);

export class BookService {
  private readonly service: AiService;
  private readonly task: Task<BookInput, State, BookOutput>;
  constructor(db: Firestore, credits: CreditService, model: ChatModel, painter: LibraryPainter | null = null) { this.service = new AiService(db, credits, model); this.task = bookTask(painter); }
  turn(uid: string, raw: unknown, send: (chunk: BookChunk) => Promise<unknown>, signal?: AbortSignal): Promise<BookResult> {
    return this.service.turn(this.task, uid, raw, send, signal);
  }
}
