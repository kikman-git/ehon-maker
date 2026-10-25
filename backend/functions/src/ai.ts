import Anthropic from '@anthropic-ai/sdk';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { type CreditService, type TokenUsage } from './credits';

// The production AI layer (decision #66): one metered Claude turn per 素材アトリエ request, paid in credits.

export const MODEL = 'claude-opus-5-5';
export const CANDIDATES = 3;
export const MAX_REQUEST_CHARS = 500;
export const MAX_SVG_CHARS = 8_000;
export const MAX_BOOK_ART = 6;
export const MAX_IMAGE_BYTES = 1_500_000;

export interface AtelierInput {
  title: string;
  request: string;
  mode: 'new' | 'revise';
  piece: string | null;
  selected: { id: string; name: string } | null;
  sketched: boolean;
  /** `data:image/png;base64,…` of what the user sees, or null. */
  image: string | null;
  bookArt: string[];
}

export interface AtelierResult { candidates: string[]; piece: string | null; say: string; credits: number; balance: number }
export type AtelierChunk = { type: 'progress'; chars: number } | { type: 'result'; result: AtelierResult };

export interface ModelTurn { text: string; usage: TokenUsage; model: string; stopReason: string | null }
export interface ModelInput { system: string; prompt: string; image: string | null; signal?: AbortSignal; onProgress?: (chars: number) => void }

/** What the service needs from a model, so tests and the emulator run without an API key. */
export interface Model { run(input: ModelInput): Promise<ModelTurn> }

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    candidates: { type: 'array', items: { type: 'string' }, description: 'New illustrations as complete SVG documents, empty when revising or declining.' },
    piece: { type: ['string', 'null'], description: 'The revised illustration as a complete SVG document, null when drawing candidates or declining.' },
    say: { type: 'string', description: 'One short sentence to the user, in the language of the request.' },
  },
  required: ['candidates', 'piece', 'say'],
  additionalProperties: false,
} as const;

export const SYSTEM = `You draw illustrations (素材) for a children's picture book in the ぺたぺた studio. Each request asks for new candidates or a change to the current illustration. You answer only with the JSON the schema describes.

Drawing rules:
- A sprite is one character or prop on a transparent background, centred in viewBox="0 0 100 100" with a margin of about 6 so a rotated piece is not clipped.
- Group the drawing into <g id="…" data-name="…"> parts the user can tap, one per meaningful part (head, ear-left, hat, wheel): ids in English kebab-case, data-name a short hiragana name (みみ, ぼうし). Keep ids stable across edits.
- Use only: svg, g, defs, path, rect, circle, ellipse, line, polyline, polygon, with fill, stroke, stroke-width, stroke-linecap, stroke-linejoin, fill-rule, opacity and transform. No text, image, use, filter, mask, clipPath, pattern, gradients, style, script or external references. Flat colours as #rrggbb.
- Keep one illustration under ${MAX_SVG_CHARS} characters: collapse whitespace, no comments.
- House palette: paper #f9f4ed, ivory #f5ead8, sage #7a8a5e, terracotta #c67139, brown #8c491a, ink #2e2b25, red #c8553d, with gentle accents when the request names a colour. Rounded forms and dot eyes read well small and in print. When pictures from the book are given, match their palette, line weight and shapes.
- Candidates are ${CANDIDATES} clearly different takes on the request. A revision changes only what was asked and keeps every other group as it is.

This is for young children. Draw nothing violent, frightening, sexual, hateful or otherwise unsuitable for a picture book, and no real people, brands or logos. If a request asks for that, return no candidates and a null piece, and say gently in the user's language that you cannot draw it, offering a friendly alternative.`;

export function composePrompt(input: AtelierInput): string {
  const lines = [`The book is "${input.title}".`];
  if (input.mode === 'new') {
    lines.push(`Draw ${CANDIDATES} candidate illustrations for the request.`);
    if (input.piece) lines.push('The user has an illustration already (below); the candidates are new takes on the request, not edits of it.');
  } else {
    lines.push('Change the current illustration (below) as the request asks and return it as `piece`. Change nothing else.');
  }
  if (input.piece) lines.push('', 'Current illustration:', input.piece);
  if (input.image) lines.push('', input.piece ? 'The image shows the illustration as the user sees it.' : 'The image is blank paper with the user\'s sketch on it.');
  if (input.selected) lines.push(`The user selected the part <g id="${input.selected.id}">${input.selected.name !== input.selected.id ? ` (${input.selected.name})` : ''}, outlined in red in the image. The request is about that part.`);
  if (input.sketched) lines.push('The user sketched in blue on the image. Follow its shapes, pose and placement; it is a guide, not a line to trace.');
  if (input.bookArt.length) lines.push('', `Pictures already in this book (${input.bookArt.length}); match their palette, line weight and shapes:`, ...input.bookArt);
  lines.push('', 'Request:', input.request.trim());
  return lines.join('\n');
}

const SVG_FORBIDDEN = /<\s*(script|image|use|foreignObject|text|style|iframe|a)\b|\bhref\s*=|\son[a-z]+\s*=|javascript:|url\(/i;

/** A drawing the painter will accept and the browser may hit-test: plain shapes, nothing that loads or runs. */
export function acceptableSvg(svg: unknown): svg is string {
  return typeof svg === 'string' && svg.length <= MAX_SVG_CHARS && /^\s*<svg[\s>]/.test(svg) && /<\/svg>\s*$/.test(svg) && !SVG_FORBIDDEN.test(svg);
}

export function validateInput(raw: unknown): AtelierInput {
  const data = (raw ?? {}) as Record<string, unknown>;
  const text = (value: unknown, max: number) => (typeof value === 'string' && value.length <= max ? value : null);
  const request = text(data.request, MAX_REQUEST_CHARS)?.trim();
  if (!request) throw new HttpsError('invalid-argument', `A request of up to ${MAX_REQUEST_CHARS} characters is needed.`);
  const mode = data.mode === 'revise' ? 'revise' : 'new';
  const piece = data.piece == null ? null : data.piece;
  if (piece !== null && !acceptableSvg(piece)) throw new HttpsError('invalid-argument', 'The current illustration is not a plain SVG.');
  if (mode === 'revise' && !piece) throw new HttpsError('invalid-argument', 'A revision needs the current illustration.');
  const image = data.image == null ? null : data.image;
  if (image !== null && !(typeof image === 'string' && image.startsWith('data:image/png;base64,') && image.length <= MAX_IMAGE_BYTES * 4 / 3 + 64)) {
    throw new HttpsError('invalid-argument', 'The image must be a PNG data URL under 1.5 MB.');
  }
  const art = Array.isArray(data.bookArt) ? data.bookArt.slice(0, MAX_BOOK_ART) : [];
  if (!art.every(acceptableSvg)) throw new HttpsError('invalid-argument', 'Book art must be plain SVG.');
  const selected = data.selected && typeof data.selected === 'object' ? data.selected as Record<string, unknown> : null;
  const selectedId = selected ? text(selected.id, 80) : null;
  return {
    title: text(data.title, 120) || 'えほん',
    request, mode, piece, image, bookArt: art as string[],
    selected: selectedId ? { id: selectedId, name: text(selected!.name, 40) || selectedId } : null,
    sketched: data.sketched === true,
  };
}

export class ClaudeModel implements Model {
  private readonly client: Anthropic;
  constructor(apiKey: string, readonly model = MODEL) { this.client = new Anthropic({ apiKey }); }

  async run(input: ModelInput): Promise<ModelTurn> {
    const content: Anthropic.ContentBlockParam[] = [];
    if (input.image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: input.image.slice('data:image/png;base64,'.length) } });
    content.push({ type: 'text', text: input.prompt });
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 32_000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> } },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    }, { signal: input.signal });
    let chars = 0;
    stream.on('text', (delta) => { chars += delta.length; input.onProgress?.(chars); });
    const message = await stream.finalMessage();
    const text = message.content.filter((block): block is Anthropic.TextBlock => block.type === 'text').map(block => block.text).join('');
    const usage = message.usage;
    return {
      text, model: message.model, stopReason: message.stop_reason,
      usage: { input: usage.input_tokens, output: usage.output_tokens, cacheRead: usage.cache_read_input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0 },
    };
  }
}

export interface Flags { aiEnabled: boolean }

export class AtelierService {
  constructor(private readonly db: Firestore, private readonly credits: CreditService, private readonly model: Model, private readonly feature = 'atelier') {}

  private async flags(): Promise<Flags> {
    const data = (await this.db.doc('config/flags').get()).data();
    return { aiEnabled: data?.aiEnabled !== false };
  }

  /** One metered turn: hold credits, ask the model, keep only drawings the painter accepts, settle what the tokens cost. */
  async turn(uid: string, raw: unknown, send: (chunk: AtelierChunk) => Promise<unknown>, signal?: AbortSignal): Promise<AtelierResult> {
    const input = validateInput(raw);
    if (!(await this.flags()).aiEnabled) throw new HttpsError('unavailable', 'AI is paused right now.');
    await this.credits.ensure(uid);
    const reservation = await this.credits.reserve(uid, this.feature);
    let turn: ModelTurn;
    try {
      let last = 0;
      turn = await this.model.run({
        system: SYSTEM, prompt: composePrompt(input), image: input.image, signal,
        onProgress: (chars) => { if (chars - last >= 400) { last = chars; void send({ type: 'progress', chars }); } },
      });
    } catch (error) {
      await this.credits.release(uid, reservation.id);
      if (error instanceof Anthropic.RateLimitError) throw new HttpsError('unavailable', 'The AI is busy; try again in a moment.');
      if (error instanceof Anthropic.APIError) throw new HttpsError('internal', `The AI could not answer (${error.status ?? 'error'}).`);
      throw error;
    }
    const settled = await this.credits.settle(uid, reservation.id, { model: turn.model, usage: turn.usage });
    const output = parseOutput(turn);
    const result: AtelierResult = { ...output, credits: settled.credits, balance: settled.balance };
    await send({ type: 'result', result });
    return result;
  }
}

function parseOutput(turn: ModelTurn): { candidates: string[]; piece: string | null; say: string } {
  if (turn.stopReason === 'refusal') return { candidates: [], piece: null, say: 'その えは かけません。べつの えを かんがえてみましょう。' };
  let parsed: { candidates?: unknown; piece?: unknown; say?: unknown };
  try { parsed = JSON.parse(turn.text) as typeof parsed; } catch { throw new HttpsError('internal', 'The AI answered in an unexpected form.'); }
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.filter(acceptableSvg).slice(0, CANDIDATES) : [];
  const piece = acceptableSvg(parsed.piece) ? parsed.piece : null;
  const say = typeof parsed.say === 'string' ? parsed.say.slice(0, 300) : '';
  return { candidates, piece, say };
}

/** The emulator's stand-in: three sprites, or the selected part recoloured; `expensive` in the request reports a costly turn. */
export class FakeModel implements Model {
  async run(input: ModelInput): Promise<ModelTurn> {
    const request = input.prompt.split('Request:\n')[1] ?? '';
    const sprite = (body: string, hat: string) => `<svg viewBox="0 0 100 100"><g id="body" data-name="からだ"><circle cx="50" cy="60" r="28" fill="${body}"/></g><g id="ear" data-name="みみ"><circle cx="30" cy="34" r="9" fill="${body}"/><circle cx="70" cy="34" r="9" fill="${body}"/></g><g id="hat" data-name="ぼうし"><rect x="34" y="12" width="32" height="16" rx="4" fill="${hat}"/></g></svg>`;
    let output: { candidates: string[]; piece: string | null; say: string };
    if (/unsafe/i.test(request)) output = { candidates: [], piece: null, say: 'その えは かけません。' };
    else if (input.prompt.includes('Change the current illustration')) {
      const part = /<g id="([^"]+)">/.exec(input.prompt)?.[1] ?? 'body';
      const piece = /Current illustration:\n([\s\S]*?)\n(?:\n|The image|The user|Pictures|Request:)/.exec(input.prompt)?.[1] ?? sprite('#8c491a', '#c67139');
      output = { candidates: [], piece: piece.replace(new RegExp(`(<g id="${part}"[^>]*>.*?</g>)`), group => group.replace(/fill="#[0-9a-f]{6}"/g, 'fill="#e89cb0"')), say: 'なおしました。' };
    } else output = { candidates: [sprite('#8c491a', '#c67139'), /break/i.test(request) ? '<svg viewBox="0 0 100 100"><script>x</script></svg>' : sprite('#7a8a5e', '#c8553d'), sprite('#c67139', '#2e2b25')], piece: null, say: '3つ かきました。' };
    const text = JSON.stringify(output);
    input.onProgress?.(text.length);
    const expensive = /expensive/i.test(request);
    return { text, model: MODEL, stopReason: 'end_turn', usage: { input: expensive ? 2_000_000 : 6_000, output: expensive ? 400_000 : 1_500, cacheRead: 0, cacheWrite: 0 } };
  }
}
