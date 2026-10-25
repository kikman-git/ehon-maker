import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { AiService, imageOf, requestOf, text, type Agent, type Chunk, type Metered, type Task, type Tool } from './agent';
import type { CreditService } from './credits';
import { toolCalls, type ChatModel, type Message } from './model';

// The 素材アトリエ (decision #65) on the harness: one forced tool call carries the drawings, so any model answers in the same shape.

export const CANDIDATES = 3;
export const MAX_SVG_CHARS = 8_000;
export const MAX_BOOK_ART = 6;

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
export interface AtelierOutput { candidates: string[]; piece: string | null; say: string }
export type AtelierResult = Metered<AtelierOutput>;
export type AtelierChunk = Chunk<AtelierOutput>;

interface AtelierState { input: AtelierInput; output: AtelierOutput | null }

export const SUBMIT = 'submit_drawings';
const SUBMIT_SCHEMA = {
  type: 'object',
  properties: {
    candidates: { type: 'array', items: { type: 'string' }, description: 'New illustrations as complete SVG documents; empty when revising or declining.' },
    piece: { type: ['string', 'null'], description: 'The revised illustration as a complete SVG document; null when drawing candidates or declining.' },
    say: { type: 'string', description: 'One short sentence to the user, in the language of the request.' },
  },
  required: ['candidates', 'piece', 'say'],
  additionalProperties: false,
};

export const DRAWING_RULES = `Drawing rules:
- A sprite is one character or prop on a transparent background, centred in viewBox="0 0 100 100" with a margin of about 6 so a rotated piece is not clipped. A backdrop fills the viewBox and fades its lower fifth to the paper colour #f9f4ed so captions sit on paper.
- Group the drawing into <g id="…" data-name="…"> parts the user can tap, one per meaningful part (head, ear-left, hat, wheel): ids in English kebab-case, data-name a short hiragana name (みみ, ぼうし). Keep ids stable across edits.
- Use only: svg, g, defs, path, rect, circle, ellipse, line, polyline, polygon, with fill, stroke, stroke-width, stroke-linecap, stroke-linejoin, fill-rule, opacity and transform. No text, image, use, filter, mask, clipPath, pattern, gradients, style, script or external references. Flat colours as #rrggbb.
- Keep one illustration under ${MAX_SVG_CHARS} characters: collapse whitespace, no comments.
- House palette: paper #f9f4ed, ivory #f5ead8, sage #7a8a5e, terracotta #c67139, brown #8c491a, ink #2e2b25, red #c8553d, with gentle accents when the request names a colour. Rounded forms and dot eyes read well small and in print. When pictures from the book are given, match their palette, line weight and shapes.`;

export const SAFETY = 'This is for young children. Draw nothing violent, frightening, sexual, hateful or otherwise unsuitable for a picture book, and no real people, brands or logos.';

export const SYSTEM = `You draw illustrations (素材) for a children's picture book in the ぺたぺた studio. Each request asks for new candidates or a change to the current illustration. You answer only by calling ${SUBMIT} once, with every drawing complete.

${DRAWING_RULES}
- Candidates are ${CANDIDATES} clearly different takes on the request. A revision changes only what was asked and keeps every other group as it is.

${SAFETY} If a request asks for that, submit no candidates and a null piece, and say gently in the user's language that you cannot draw it, offering a friendly alternative.`;

export function composePrompt(input: AtelierInput): string {
  const lines = [`The book is "${input.title}".`];
  if (input.mode === 'new') {
    lines.push(`Draw ${CANDIDATES} candidate illustrations for the request.`);
    if (input.piece) lines.push('The user has an illustration already (below); the candidates are new takes on the request, not edits of it.');
  } else {
    lines.push('Change the current illustration (below) as the request asks and submit it as `piece`. Change nothing else.');
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
  const request = requestOf(data.request);
  const mode = data.mode === 'revise' ? 'revise' : 'new';
  const piece = data.piece == null ? null : data.piece;
  if (piece !== null && !acceptableSvg(piece)) throw new HttpsError('invalid-argument', 'The current illustration is not a plain SVG.');
  if (mode === 'revise' && !piece) throw new HttpsError('invalid-argument', 'A revision needs the current illustration.');
  const image = imageOf(data.image);
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

/** Reads a submission, keeping only drawings the painter accepts; the count of what was dropped goes back to the model. */
export function readSubmission(input: Record<string, unknown>, wantCandidates: boolean): { output: AtelierOutput; dropped: number } {
  const offered = Array.isArray(input.candidates) ? input.candidates : [];
  const candidates = offered.filter(acceptableSvg).slice(0, CANDIDATES);
  const piece = acceptableSvg(input.piece) ? input.piece : null;
  const dropped = (offered.length - candidates.length) + (input.piece != null && piece === null ? 1 : 0);
  const say = typeof input.say === 'string' ? input.say.slice(0, 300) : '';
  return { output: { candidates: wantCandidates ? candidates : [], piece: wantCandidates ? null : piece, say }, dropped };
}

const submitTool: Tool<AtelierState> = {
  name: SUBMIT, description: 'Hands the finished drawings to the studio. Call it exactly once, with complete SVG documents.', schema: SUBMIT_SCHEMA,
  run(input, state) {
    const wantCandidates = state.input.mode === 'new';
    const { output, dropped } = readSubmission(input, wantCandidates);
    const nothing = wantCandidates ? output.candidates.length === 0 : output.piece === null;
    if (nothing && dropped > 0) return { result: { error: `${dropped} drawing(s) were not plain SVG (only the listed elements and attributes, under ${MAX_SVG_CHARS} characters, no text/image/style). Submit again.` }, isError: true };
    state.output = output;
    return { result: { ok: true, kept: wantCandidates ? output.candidates.length : (output.piece ? 1 : 0), dropped } };
  },
};

export const ATELIER_TASK: Task<AtelierInput, AtelierState, AtelierOutput> = {
  id: 'atelier', hold: 30, maxRounds: 3, system: SYSTEM, finishTool: SUBMIT,
  validate: validateInput,
  start(input) {
    const content: Message['content'] = [];
    if (input.image) content.push({ type: 'image', dataUrl: input.image });
    content.push({ type: 'text', text: composePrompt(input) });
    return { state: { input, output: null }, messages: [{ role: 'user', content }] };
  },
  tools: () => [submitTool],
  toolChoice: () => ({ name: SUBMIT }),
  finish(state, text, stop) {
    if (state.output) return state.output;
    if (stop === 'refusal') return { candidates: [], piece: null, say: 'その えは かけません。べつの えを かんがえてみましょう。' };
    return { candidates: [], piece: null, say: text || 'うまく かけませんでした。ことばを かえて もういちど たのんでみてください。' };
  },
};

export class AtelierService {
  private readonly service: AiService;
  constructor(db: Firestore, credits: CreditService, model: ChatModel) { this.service = new AiService(db, credits, model); }
  turn(uid: string, raw: unknown, send: (chunk: AtelierChunk) => Promise<unknown>, signal?: AbortSignal): Promise<AtelierResult> {
    return this.service.turn(ATELIER_TASK, uid, raw, send, signal);
  }
}

/** One drawing for another task, such as the book harness, on the same turn's tokens. */
export async function drawOne(agent: Agent, spec: { title: string; description: string; kind: 'sprite' | 'backdrop'; bookArt: string[] }): Promise<string | null> {
  const prompt = [`The book is "${spec.title}".`, `Draw 1 ${spec.kind === 'backdrop' ? 'backdrop (the scene with no characters, filling the viewBox)' : 'sprite'} for the description, as the only candidate.`];
  if (spec.bookArt.length) prompt.push('', `Pictures already in this book (${spec.bookArt.length}); match their palette, line weight and shapes:`, ...spec.bookArt);
  prompt.push('', 'Request:', spec.description);
  const reply = await agent.ask({ system: SYSTEM, messages: [{ role: 'user', content: [{ type: 'text', text: prompt.join('\n') }] }], tools: [submitTool], toolChoice: { name: SUBMIT } });
  const call = toolCalls(reply.message).find(candidate => candidate.name === SUBMIT);
  if (!call) return null;
  const { output } = readSubmission((call.input ?? {}) as Record<string, unknown>, true);
  return output.candidates[0] ?? null;
}
