import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { usdFor, type Charge, type CreditService, type TokenUsage } from './credits';
import { ModelError, textOf, toolCalls, type ChatModel, type Message, type StopReason, type ToolChoice, type ToolDef } from './model';
import { UsageService, type TurnRecord } from './usage';

// One harness for every AI feature (decision #67): a task brings its tools and rules, the agent runs the loop, credits meter the whole turn.

export const MAX_REQUEST_CHARS = 10_000;
const TURN_ID = /^[A-Za-z0-9_-]{8,64}$/;
const STOP_TTL_MS = 3_600_000;
/** The id the browser chose for this turn, so its stop can be addressed; absent on an old client. */
export const turnIdOf = (raw: unknown): string | null => { const id = (raw as { turnId?: unknown } | null)?.turnId; return typeof id === 'string' && TURN_ID.test(id) ? id : null; };
const stopDoc = (db: Firestore, uid: string, turnId: string) => db.doc(`turnStops/${uid}_${turnId}`);
/** The user's stop for a turn: the turn watches this document beside its connection, which a proxy may keep open after the browser has gone. */
export async function stopTurn(db: Firestore, uid: string, turnId: unknown): Promise<{ ok: true }> {
  if (typeof turnId !== 'string' || !TURN_ID.test(turnId)) throw new HttpsError('invalid-argument', 'A turn id is required.');
  await stopDoc(db, uid, turnId).set({ uid, expiresAt: Timestamp.fromMillis(Date.now() + STOP_TTL_MS) });
  return { ok: true };
}
export const MAX_IMAGE_BYTES = 1_500_000;

export interface ToolOutcome { result: unknown; isError?: boolean; /** A line for the user's working card, in the user's language. */ step?: string }
export interface Tool<S> extends ToolDef { run(input: Record<string, unknown>, state: S, agent: Agent): Promise<ToolOutcome> | ToolOutcome }

export interface Task<I, S, O> {
  id: string;
  /** Credits held before the model runs; a big creation holds more than a small edit. */
  hold: number;
  maxRounds: number;
  system: string;
  validate(raw: unknown): I;
  /** `uid` is the signed-in account, for a tool that stores something on its behalf. */
  start(input: I, uid: string): { state: S; messages: Message[] };
  tools(state: S): Tool<S>[];
  /** The call that ends the turn once it succeeds, if the task has one; otherwise the model ends by answering in text. */
  finishTool?: string;
  toolChoice(state: S, round: number): ToolChoice;
  /** The book so far, for the studio to show while the turn runs; null until something has changed. */
  draft?(state: S): string | null;
  finish(state: S, text: string, stop: 'end' | 'refusal' | 'length' | 'rounds'): O;
}

export type Metered<O> = O & { credits: number; balance: number };
export type Chunk<O> =
  | { type: 'progress'; chars?: number; step?: string }
  /** The document as it stands mid-turn, pictures named but not carried; the studio applies it live. */
  | { type: 'draft'; book: string }
  /** One picture drawn this turn, sent once so a draft stays small. */
  | { type: 'art'; key: string; name: string; svg: string }
  | { type: 'result'; result: Metered<O> };

export const text = (value: unknown, max: number) => (typeof value === 'string' && value.length <= max ? value : null);
/** A PNG under the size limit, or nothing: a page too heavy to look at should not cost the user the whole turn. */
export const imageOf = (value: unknown): string | null => {
  if (typeof value === 'string' && value.startsWith('data:image/png;base64,') && value.length <= MAX_IMAGE_BYTES * 4 / 3 + 64) return value;
  if (value != null) logger.warn('ai.image.dropped', { length: typeof value === 'string' ? value.length : -1 });
  return null;
};
export const requestOf = (value: unknown): string => {
  const request = text(value, MAX_REQUEST_CHARS)?.trim();
  if (!request) throw new HttpsError('invalid-argument', `A request of up to ${MAX_REQUEST_CHARS} characters is needed.`);
  return request;
};

const add = (sum: TokenUsage, usage: TokenUsage): TokenUsage => ({ input: sum.input + usage.input, output: sum.output + usage.output, cacheRead: sum.cacheRead + usage.cacheRead, cacheWrite: sum.cacheWrite + usage.cacheWrite });

/** The loop: ask the model, run the tools it calls, hand back what they said, until it answers or the task's finish tool succeeds. */
export class Agent {
  usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  modelId = '';
  rounds = 0;
  drawings = 0;
  /** Other models' tokens on this turn, such as an image model's paintings; settled beside the chat model's. */
  charges: Charge[] = [];
  lastStop: StopReason = 'end';
  constructor(readonly model: ChatModel, readonly send: (chunk: Chunk<never>) => Promise<unknown>, readonly signal?: AbortSignal) {}

  async run<I, S, O>(task: Task<I, S, O>, input: I, uid = ''): Promise<O> {
    const { state, messages } = task.start(input, uid);
    let last = 0;
    let lastDraft = '';
    const onProgress = (chars: number) => { if (chars - last >= 400) { last = chars; void this.send({ type: 'progress', chars }); } };
    for (let round = 0; round < task.maxRounds; round++) {
      const tools = task.tools(state);
      const reply = await this.model.reply({ system: task.system, messages, tools, toolChoice: task.toolChoice(state, round), signal: this.signal, onProgress });
      this.usage = add(this.usage, reply.usage);
      this.modelId = reply.model;
      this.rounds++;
      this.lastStop = reply.stop;
      messages.push(reply.message);
      const calls = toolCalls(reply.message);
      if (!calls.length || reply.stop === 'refusal' || reply.stop === 'length') return task.finish(state, textOf(reply.message), reply.stop === 'tool' ? 'end' : reply.stop);
      const results: Message['content'] = [];
      let finished = false;
      for (const call of calls) {
        const tool = tools.find(candidate => candidate.name === call.name);
        let outcome: ToolOutcome;
        if (!tool) outcome = { result: { error: `Unknown tool "${call.name}".` }, isError: true };
        else {
          try { outcome = await tool.run((call.input && typeof call.input === 'object' ? call.input : {}) as Record<string, unknown>, state, this); }
          catch (error) { outcome = { result: { error: error instanceof Error ? error.message : String(error) }, isError: true }; }
        }
        results.push({ type: 'tool_result', callId: call.id, output: JSON.stringify(outcome.result), isError: outcome.isError });
        if (outcome.step) void this.send({ type: 'progress', step: outcome.step });
        if (tool && tool.name === task.finishTool && !outcome.isError) finished = true;
      }
      messages.push({ role: 'user', content: results });
      // One draft a round, only when it differs, so the studio shows the pages appearing without re-sending the book per tool.
      if (task.draft && !finished) {
        const draft = task.draft(state);
        if (draft && draft !== lastDraft) { lastDraft = draft; void this.send({ type: 'draft', book: draft }); }
      }
      if (finished) return task.finish(state, textOf(reply.message), 'end');
    }
    return task.finish(state, '', 'rounds');
  }

  /** A nested call for a tool that needs the model itself, such as drawing; its tokens count toward the same turn. */
  async ask(request: { system: string; messages: Message[]; tools: ToolDef[]; toolChoice: ToolChoice }) {
    const reply = await this.model.reply({ ...request, signal: this.signal });
    this.usage = add(this.usage, reply.usage);
    this.drawings++;
    return reply;
  }

  charge(charge: Charge) { this.charges.push(charge); }
  get paintings() { return this.charges.length; }
  usd() { return usdFor(this.modelId || this.model.id, this.usage) + this.charges.reduce((sum, charge) => sum + usdFor(charge.model, charge.usage), 0); }
}

/** Metering and guards around the agent: hold credits, run, settle what the turn's tokens cost, record it. */
export class AiService {
  private readonly usage: UsageService;
  constructor(private readonly db: Firestore, private readonly credits: CreditService, private readonly model: ChatModel) { this.usage = new UsageService(db); }

  async turn<I, S, O>(task: Task<I, S, O>, uid: string, raw: unknown, send: (chunk: Chunk<O>) => Promise<unknown>, signal?: AbortSignal): Promise<Metered<O>> {
    let input: I;
    try { input = task.validate(raw); }
    catch (error) { logger.warn('ai.reject', { uid, task: task.id, error: error instanceof Error ? error.message : String(error) }); throw error; }
    const guards = await this.usage.guards();
    if (!guards.aiEnabled) throw new HttpsError('unavailable', 'AI is paused right now.', { reason: 'paused' });
    await this.usage.checkDailyCap(guards.dailyUsdCap);
    await this.usage.checkRate(uid, guards.turnsPerHour);
    await this.credits.ensure(uid);
    const reservation = await this.credits.reserve(uid, task.id, task.hold);
    // Two ways to stop: the connection closing, and the stop document `aiStop` writes for this turn id.
    const stop = new AbortController();
    signal?.addEventListener('abort', () => stop.abort(), { once: true });
    const turnId = turnIdOf(raw);
    const unwatch = turnId ? stopDoc(this.db, uid, turnId).onSnapshot(snapshot => { if (snapshot.exists) stop.abort(); }, () => {}) : () => {};
    const agent = new Agent(this.model, send as (chunk: Chunk<never>) => Promise<unknown>, stop.signal);
    const started = Date.now();
    const record = (status: TurnRecord['status'], credits: number, error?: string) => this.usage.record({
      uid, task: task.id, model: agent.modelId || this.model.id, rounds: agent.rounds, drawings: agent.drawings, paintings: agent.paintings, usage: agent.usage,
      usd: agent.usd(), credits, durationMs: Date.now() - started, status, ...(error ? { error } : {}),
    });
    let output: O;
    try {
      output = await agent.run(task, input, uid);
    } catch (error) {
      // The user stopped the turn (or left): what the model already did is on their page and is charged; the rest is not.
      if (stop.signal.aborted) {
        const settled = await this.credits.settle(uid, reservation.id, { model: agent.modelId || this.model.id, usage: agent.usage, extras: agent.charges });
        await record('stopped', settled.credits);
        throw new HttpsError('cancelled', 'The turn was stopped.', { reason: 'stopped', credits: settled.credits, balance: settled.balance });
      }
      await this.credits.release(uid, reservation.id);
      const message = error instanceof Error ? error.message : String(error);
      await record('error', 0, error instanceof ModelError ? `${error.kind}: ${message}` : message);
      if (error instanceof ModelError) throw new HttpsError(error.kind === 'busy' ? 'unavailable' : 'internal', error.kind === 'busy' ? 'The AI is busy; try again in a moment.' : `The AI could not answer (${error.message}).`, { reason: error.kind });
      throw error;
    } finally {
      unwatch();
      if (turnId) void stopDoc(this.db, uid, turnId).delete().catch(() => {});
    }
    const settled = await this.credits.settle(uid, reservation.id, { model: agent.modelId || this.model.id, usage: agent.usage, extras: agent.charges });
    await record(agent.lastStop === 'refusal' ? 'refusal' : 'ok', settled.credits);
    const result: Metered<O> = { ...output, credits: settled.credits, balance: settled.balance };
    await send({ type: 'result', result });
    return result;
  }
}
