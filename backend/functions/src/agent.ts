import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { usdFor, type CreditService, type TokenUsage } from './credits';
import { ModelError, textOf, toolCalls, type ChatModel, type Message, type StopReason, type ToolChoice, type ToolDef } from './model';
import { UsageService } from './usage';

// One harness for every AI feature (decision #67): a task brings its tools and rules, the agent runs the loop, credits meter the whole turn.

export const MAX_REQUEST_CHARS = 500;
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
  start(input: I): { state: S; messages: Message[] };
  tools(state: S): Tool<S>[];
  /** The call that ends the turn once it succeeds, if the task has one; otherwise the model ends by answering in text. */
  finishTool?: string;
  toolChoice(state: S, round: number): ToolChoice;
  finish(state: S, text: string, stop: 'end' | 'refusal' | 'length' | 'rounds'): O;
}

export type Metered<O> = O & { credits: number; balance: number };
export type Chunk<O> = { type: 'progress'; chars?: number; step?: string } | { type: 'result'; result: Metered<O> };

export const text = (value: unknown, max: number) => (typeof value === 'string' && value.length <= max ? value : null);
export const imageOf = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string' && value.startsWith('data:image/png;base64,') && value.length <= MAX_IMAGE_BYTES * 4 / 3 + 64) return value;
  throw new HttpsError('invalid-argument', 'The image must be a PNG data URL under 1.5 MB.');
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
  lastStop: StopReason = 'end';
  constructor(readonly model: ChatModel, readonly send: (chunk: Chunk<never>) => Promise<unknown>, readonly signal?: AbortSignal) {}

  async run<I, S, O>(task: Task<I, S, O>, input: I): Promise<O> {
    const { state, messages } = task.start(input);
    let last = 0;
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
}

/** Metering and guards around the agent: hold credits, run, settle what the turn's tokens cost, record it. */
export class AiService {
  private readonly usage: UsageService;
  constructor(db: Firestore, private readonly credits: CreditService, private readonly model: ChatModel) { this.usage = new UsageService(db); }

  async turn<I, S, O>(task: Task<I, S, O>, uid: string, raw: unknown, send: (chunk: Chunk<O>) => Promise<unknown>, signal?: AbortSignal): Promise<Metered<O>> {
    const input = task.validate(raw);
    const guards = await this.usage.guards();
    if (!guards.aiEnabled) throw new HttpsError('unavailable', 'AI is paused right now.', { reason: 'paused' });
    await this.usage.checkDailyCap(guards.dailyUsdCap);
    await this.usage.checkRate(uid, guards.turnsPerHour);
    await this.credits.ensure(uid);
    const reservation = await this.credits.reserve(uid, task.id, task.hold);
    const agent = new Agent(this.model, send as (chunk: Chunk<never>) => Promise<unknown>, signal);
    const started = Date.now();
    const record = (status: 'ok' | 'refusal' | 'error', credits: number, error?: string) => this.usage.record({
      uid, task: task.id, model: agent.modelId || this.model.id, rounds: agent.rounds, drawings: agent.drawings, usage: agent.usage,
      usd: usdFor(agent.modelId || this.model.id, agent.usage), credits, durationMs: Date.now() - started, status, ...(error ? { error } : {}),
    });
    let output: O;
    try {
      output = await agent.run(task, input);
    } catch (error) {
      await this.credits.release(uid, reservation.id);
      const message = error instanceof Error ? error.message : String(error);
      await record('error', 0, error instanceof ModelError ? `${error.kind}: ${message}` : message);
      if (error instanceof ModelError) throw new HttpsError(error.kind === 'busy' ? 'unavailable' : 'internal', error.kind === 'busy' ? 'The AI is busy; try again in a moment.' : `The AI could not answer (${error.message}).`, { reason: error.kind });
      throw error;
    }
    const settled = await this.credits.settle(uid, reservation.id, { model: agent.modelId || this.model.id, usage: agent.usage });
    await record(agent.lastStop === 'refusal' ? 'refusal' : 'ok', settled.credits);
    const result: Metered<O> = { ...output, credits: settled.credits, balance: settled.balance };
    await send({ type: 'result', result });
    return result;
  }
}
