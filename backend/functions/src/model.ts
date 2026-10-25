import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { TokenUsage } from './credits';

// The harness speaks one neutral chat-and-tools shape (decision #67); each provider is a thin adapter under it.

export type Content =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; callId: string; output: string; isError?: boolean };
export interface Message { role: 'user' | 'assistant'; content: Content[] }
export interface ToolDef { name: string; description: string; schema: Record<string, unknown> }
export type ToolChoice = 'auto' | 'required' | { name: string };
export type StopReason = 'end' | 'tool' | 'refusal' | 'length';

export interface ModelRequest {
  system: string;
  messages: Message[];
  tools: ToolDef[];
  toolChoice: ToolChoice;
  signal?: AbortSignal;
  /** Characters of the answer so far, text and tool arguments alike. */
  onProgress?: (chars: number) => void;
}
export interface ModelReply { message: Message; usage: TokenUsage; model: string; stop: StopReason }

export interface ChatModel { readonly id: string; reply(request: ModelRequest): Promise<ModelReply> }

export type Provider = 'anthropic' | 'openai';
export const DEFAULT_MODEL: Record<Provider, string> = { anthropic: 'claude-opus-5-5', openai: 'gpt-5.5' };
const MAX_OUTPUT_TOKENS = 32_000;

export const toolCalls = (message: Message) => message.content.filter((block): block is Extract<Content, { type: 'tool_call' }> => block.type === 'tool_call');
export const textOf = (message: Message) => message.content.filter((block): block is Extract<Content, { type: 'text' }> => block.type === 'text').map(block => block.text).join('');
const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);

/** Errors a provider raises that the harness turns into a friendly refusal or retry hint. */
export class ModelError extends Error {
  constructor(readonly kind: 'busy' | 'failed', message: string) { super(message); }
}

export class AnthropicModel implements ChatModel {
  private readonly client: Anthropic;
  constructor(apiKey: string, readonly id = DEFAULT_MODEL.anthropic) { this.client = new Anthropic({ apiKey }); }

  async reply(request: ModelRequest): Promise<ModelReply> {
    const messages: Anthropic.MessageParam[] = request.messages.map(message => ({
      role: message.role,
      content: message.content.map((block): Anthropic.ContentBlockParam => {
        switch (block.type) {
          case 'text': return { type: 'text', text: block.text };
          case 'image': return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Of(block.dataUrl) } };
          case 'tool_call': return { type: 'tool_use', id: block.id, name: block.name, input: block.input ?? {} };
          case 'tool_result': return { type: 'tool_result', tool_use_id: block.callId, content: block.output, is_error: block.isError };
        }
      }),
    }));
    const toolChoice: Anthropic.ToolChoice = request.toolChoice === 'auto' ? { type: 'auto' } : request.toolChoice === 'required' ? { type: 'any' } : { type: 'tool', name: request.toolChoice.name };
    let chars = 0;
    const progress = (delta: string) => { chars += delta.length; request.onProgress?.(chars); };
    try {
      const stream = this.client.messages.stream({
        model: this.id,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        tools: request.tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.schema as Anthropic.Tool.InputSchema })),
        tool_choice: toolChoice,
        messages,
      }, { signal: request.signal });
      stream.on('text', progress);
      stream.on('inputJson', progress);
      const message = await stream.finalMessage();
      const content: Content[] = [];
      for (const block of message.content) {
        if (block.type === 'text') content.push({ type: 'text', text: block.text });
        else if (block.type === 'tool_use') content.push({ type: 'tool_call', id: block.id, name: block.name, input: block.input });
      }
      const stop: StopReason = message.stop_reason === 'tool_use' ? 'tool' : message.stop_reason === 'refusal' ? 'refusal' : message.stop_reason === 'max_tokens' ? 'length' : 'end';
      const usage = message.usage;
      return { message: { role: 'assistant', content }, stop, model: message.model, usage: { input: usage.input_tokens, output: usage.output_tokens, cacheRead: usage.cache_read_input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0 } };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) throw new ModelError('busy', error.message);
      if (error instanceof Anthropic.APIError) throw new ModelError('failed', `${error.status ?? 'error'}: ${error.message}`);
      throw error;
    }
  }
}

export class OpenAIModel implements ChatModel {
  private readonly client: OpenAI;
  constructor(apiKey: string, readonly id = DEFAULT_MODEL.openai) { this.client = new OpenAI({ apiKey }); }

  async reply(request: ModelRequest): Promise<ModelReply> {
    const input: OpenAI.Responses.ResponseInputItem[] = [];
    for (const message of request.messages) {
      const parts: OpenAI.Responses.ResponseInputContent[] = [];
      let said = '';
      for (const block of message.content) {
        if (block.type === 'text') { if (message.role === 'user') parts.push({ type: 'input_text', text: block.text }); else said += block.text; }
        else if (block.type === 'image') parts.push({ type: 'input_image', image_url: block.dataUrl, detail: 'auto' });
        else if (block.type === 'tool_call') input.push({ type: 'function_call', call_id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) });
        else input.push({ type: 'function_call_output', call_id: block.callId, output: block.output });
      }
      if (parts.length) input.push({ role: 'user', content: parts });
      if (said) input.push({ role: 'assistant', content: said });
    }
    let chars = 0;
    const progress = (delta: string) => { chars += delta.length; request.onProgress?.(chars); };
    try {
      const stream = this.client.responses.stream({
        model: this.id,
        instructions: request.system,
        input,
        tools: request.tools.map(tool => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.schema, strict: false })),
        tool_choice: request.toolChoice === 'auto' ? 'auto' : request.toolChoice === 'required' ? 'required' : { type: 'function', name: request.toolChoice.name },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
      }, { signal: request.signal });
      stream.on('response.output_text.delta', (event) => progress(event.delta));
      stream.on('response.function_call_arguments.delta', (event) => progress(event.delta));
      const response = await stream.finalResponse();
      const content: Content[] = [];
      let refused = false;
      for (const item of response.output) {
        if (item.type === 'message') for (const part of item.content) { if (part.type === 'output_text') content.push({ type: 'text', text: part.text }); else if (part.type === 'refusal') { refused = true; content.push({ type: 'text', text: part.refusal }); } }
        else if (item.type === 'function_call') { let parsed: unknown = {}; try { parsed = JSON.parse(item.arguments || '{}'); } catch { /* the harness reports the unreadable call to the model */ } content.push({ type: 'tool_call', id: item.call_id, name: item.name, input: parsed }); }
      }
      const stop: StopReason = refused ? 'refusal' : content.some(block => block.type === 'tool_call') ? 'tool' : response.incomplete_details?.reason === 'max_output_tokens' ? 'length' : 'end';
      const usage = response.usage;
      const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
      return { message: { role: 'assistant', content }, stop, model: response.model, usage: { input: (usage?.input_tokens ?? 0) - cached, output: usage?.output_tokens ?? 0, cacheRead: cached, cacheWrite: 0 } };
    } catch (error) {
      if (error instanceof OpenAI.RateLimitError) throw new ModelError('busy', error.message);
      if (error instanceof OpenAI.APIError) throw new ModelError('failed', `${error.status ?? 'error'}: ${error.message}`);
      throw error;
    }
  }
}

export function modelFor(provider: Provider, apiKey: string, id: string): ChatModel {
  return provider === 'openai' ? new OpenAIModel(apiKey, id || DEFAULT_MODEL.openai) : new AnthropicModel(apiKey, id || DEFAULT_MODEL.anthropic);
}
