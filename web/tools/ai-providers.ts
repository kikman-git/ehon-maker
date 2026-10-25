import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

export type ProviderId = 'claude' | 'codex';
export const providerIds: ProviderId[] = ['claude', 'codex'];

/** The browser speaks the Claude CLI's `stream-json` subset; Codex output is mapped onto it. */
export type StudioEvent = Record<string, unknown> & { type: string };

export interface Parsed { sessionId?: string; events: StudioEvent[] }

/** Empty strings mean the CLI's own default. */
export interface Pick { model: string; effort: string }
export const defaultPick = (): Pick => ({ model: '', effort: '' });

export interface Provider {
  id: ProviderId;
  /** Binary and any leading arguments, already resolved. */
  command: string[];
  /** Whether the binary can be found, so the studio offers only providers that will start. */
  available: boolean;
  /** Arguments for one turn. The prompt always arrives on stdin. */
  args(sessionId: string | null, image: string | null, pick: Pick): string[];
  /** Model names offered as suggestions and the effort levels the CLI accepts. */
  models: string[];
  efforts: string[];
  /** One JSON line of stdout, normalised. */
  parse(event: Record<string, unknown>): Parsed;
  /** Instruction files the CLI reads in its working directory. */
  instructionFiles: string[];
  /** stderr chatter that is not an error. */
  stderrNoise?: RegExp;
}

const split = (value: string | undefined) => (value ?? '').split(/\s+/).filter(Boolean);

const onPath = (bin: string) => (process.env.PATH ?? '').split(delimiter).some((dir) => dir && existsSync(join(dir, bin)));
const isFile = (path: string) => { try { return statSync(path).isFile(); } catch { return false; } };

// Path-like tokens are resolved against web/ because the CLI runs inside the book's workspace.
function commandFrom(root: string, value: string | undefined, fallback: string): { command: string[]; available: boolean } {
  const tokens = split(value);
  const command = (tokens.length ? tokens : [fallback]).map((token) => token.includes('/') && !isAbsolute(token) && existsSync(resolve(root, token)) ? resolve(root, token) : token);
  const [bin] = command;
  const available = bin.includes('/') ? isFile(bin) : onPath(bin);
  return { command, available };
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

function claude(root: string): Provider {
  const extra = split(process.env.EHON_CLAUDE_ARGS);
  return {
    id: 'claude',
    ...commandFrom(root, process.env.EHON_CLAUDE_COMMAND ?? process.env.EHON_AI_COMMAND, 'claude'),
    instructionFiles: ['CLAUDE.md'],
    models: ['fable', 'opus', 'sonnet', 'haiku'],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    // The page image is named in the prompt; Claude reads it with its own tool.
    args: (sessionId, _image, pick) => [
      '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-mode', 'acceptEdits',
      ...(sessionId ? ['--resume', sessionId] : []),
      ...(pick.model ? ['--model', pick.model] : []),
      ...(pick.effort ? ['--effort', pick.effort] : []),
      ...extra,
    ],
    parse(event) {
      if (event.type === 'system' && event.subtype === 'init') return { sessionId: text(event.session_id) || undefined, events: [event as StudioEvent] };
      if (event.type === 'stream_event') {
        const inner = event.event as { type?: string; delta?: { type?: string }; content_block?: { type?: string } } | undefined;
        // Block starts for tools and thinking tell the studio what the model is doing during a long silence.
        const keep = inner?.type === 'content_block_delta' ? inner.delta?.type === 'text_delta' : inner?.type === 'content_block_start' && (inner.content_block?.type === 'tool_use' || inner.content_block?.type === 'thinking');
        return { events: keep ? [event as StudioEvent] : [] };
      }
      return { events: [event as StudioEvent] };
    },
  };
}

interface CodexItem { type?: string; text?: string; command?: string; exit_code?: number | null; status?: string; changes?: { path?: string; kind?: string }[]; server?: string; tool?: string; query?: string; message?: string }

const assistant = (blocks: Record<string, unknown>[]): StudioEvent => ({ type: 'assistant', message: { role: 'assistant', content: blocks } });
const toolUse = (name: string, input: Record<string, unknown>): StudioEvent => assistant([{ type: 'tool_use', name, input }]);
const toolResult = (isError: boolean): StudioEvent => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', is_error: isError }] } });

// Codex names no models in its help, so the only suggestion is the one configured in ~/.codex/config.toml.
function codexConfiguredModel(): string[] {
  try { return [/^\s*model\s*=\s*"([^"]+)"/m.exec(readFileSync(join(homedir(), '.codex', 'config.toml'), 'utf8'))?.[1] ?? ''].filter(Boolean); } catch { return []; }
}

function codex(root: string): Provider {
  const extra = split(process.env.EHON_CODEX_ARGS);
  return {
    id: 'codex',
    ...commandFrom(root, process.env.EHON_CODEX_COMMAND, 'codex'),
    instructionFiles: ['AGENTS.md'],
    stderrNoise: /^Reading prompt from stdin/,
    models: codexConfiguredModel(),
    efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
    // Codex cannot open the image itself, so it is attached to the turn; the book folder is its writable sandbox.
    args: (sessionId, image, pick) => [
      'exec', '--json', '--skip-git-repo-check', '-c', 'sandbox_mode="workspace-write"',
      ...(pick.model ? ['-m', pick.model] : []),
      ...(pick.effort ? ['-c', `model_reasoning_effort="${pick.effort}"`] : []),
      ...(image ? ['-i', image] : []),
      ...extra,
      ...(sessionId ? ['resume', sessionId, '-'] : ['-']),
    ],
    parse(event) {
      const item = (event.item ?? {}) as CodexItem;
      switch (event.type) {
        case 'thread.started': {
          const id = text(event.thread_id);
          return { sessionId: id || undefined, events: [{ type: 'system', subtype: 'init', session_id: id, model: 'codex' }] };
        }
        case 'item.started':
          return { events: item.type === 'command_execution' ? [toolUse('Bash', { command: item.command })] : [] };
        case 'item.completed':
          switch (item.type) {
            case 'agent_message': return { events: item.text?.trim() ? [assistant([{ type: 'text', text: item.text }])] : [] };
            case 'command_execution': return { events: [toolResult(item.exit_code !== 0 && item.exit_code !== null && item.exit_code !== undefined)] };
            case 'file_change': return { events: (item.changes ?? []).map((change) => toolUse(change.kind === 'add' ? 'Write' : 'Edit', { file_path: change.path })) };
            case 'mcp_tool_call': return { events: [toolUse(`${item.server ?? 'mcp'}.${item.tool ?? 'tool'}`, {}), toolResult(item.status === 'failed')] };
            case 'web_search': return { events: [toolUse('WebSearch', { pattern: item.query })] };
            // Codex reports warnings as error items mid-turn; a failed turn still ends with turn.failed.
            case 'error': return { events: [{ type: 'notice', text: item.message ?? 'error' }] };
            default: return { events: [] };
          }
        case 'turn.completed': {
          const usage = (event.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
          return { events: [{ type: 'result', subtype: 'success', is_error: false, num_turns: 1, usage, result: '' }] };
        }
        case 'turn.failed': {
          const error = (event.error ?? {}) as { message?: string };
          return { events: [{ type: 'result', subtype: 'error', is_error: true, result: error.message ?? 'turn failed' }] };
        }
        case 'error':
          return { events: [{ type: 'result', subtype: 'error', is_error: true, result: text(event.message) || 'error' }] };
        default:
          return { events: [] };
      }
    },
  };
}

export function providers(root: string): Record<ProviderId, Provider> {
  return { claude: claude(root), codex: codex(root) };
}

export function defaultProvider(all: Record<ProviderId, Provider>): ProviderId {
  const wanted = process.env.EHON_AI_PROVIDER;
  if (wanted === 'claude' || wanted === 'codex') return wanted;
  return providerIds.find((id) => all[id].available) ?? 'claude';
}
