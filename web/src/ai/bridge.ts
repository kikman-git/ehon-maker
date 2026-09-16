import { createStore, type Store } from '../cloud/store';

/** One line of the conversation as the dev server relays it; `applied` and `rejected` are the studio's own. */
export type AiEntry =
  | { kind: 'user'; text: string; mark: string | null; at: number }
  | { kind: 'event'; event: AiEvent }
  | { kind: 'log'; text: string; level?: 'info' | 'error' }
  | { kind: 'applied'; text: string }
  | { kind: 'rejected'; text: string };

export interface ContentBlock { type: string; text?: string; name?: string; input?: Record<string, unknown>; is_error?: boolean; content?: unknown }

/** The `claude -p --output-format stream-json` events the server forwards, plus its own `exit`. */
export interface AiEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  cwd?: string;
  message?: { content?: ContentBlock[] };
  event?: { type: string; delta?: { type: string; text?: string }; content_block?: ContentBlock };
  result?: string;
  text?: string;
  is_error?: boolean;
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
  code?: number | null;
  signal?: string | null;
}

export type AiProvider = 'claude' | 'codex';

export interface AiState {
  bookId: string | null;
  connected: boolean;
  provider: AiProvider;
  /** The CLIs the dev server found; switching keeps a separate resumable session per provider. */
  providers: AiProvider[];
  sessionId: string | null;
  /** Model and effort for the current provider; empty means the CLI's default. */
  model: string;
  effort: string;
  models: string[];
  efforts: string[];
  running: boolean;
  workspace: string;
  command: string;
  entries: AiEntry[];
}

export interface AskInput { prompt: string; text: string; mark: string | null; image: string | null }

export interface AiBridge {
  state: Store<AiState>;
  open(bookId: string, json: string): void;
  sync(bookId: string, json: string): void;
  ask(bookId: string, input: AskInput): void;
  stop(bookId: string): void;
  reset(bookId: string): void;
  setProvider(bookId: string, provider: AiProvider): void;
  setPick(bookId: string, pick: { model?: string; effort?: string }): void;
  /** A studio-side outcome shown in the chat and the terminal, never sent to the CLI. */
  note(entry: AiEntry): void;
  onBook(listener: (bookId: string, json: string) => void): () => void;
  onEntry(listener: (entry: AiEntry) => void): () => void;
}

interface StatePayload { bookId: string; provider: AiProvider; providers: AiProvider[]; sessionId: string | null; model: string; effort: string; models: string[]; efforts: string[]; running: boolean; workspace: string; command: string; transcript?: AiEntry[] }

const initial: AiState = { bookId: null, connected: false, provider: 'claude', providers: [], sessionId: null, model: '', effort: '', models: [], efforts: [], running: false, workspace: '', command: '', entries: [] };

function devBridge(hot: NonNullable<ImportMeta['hot']>): AiBridge {
  const state = createStore<AiState>(initial);
  const bookListeners = new Set<(bookId: string, json: string) => void>();
  const entryListeners = new Set<(entry: AiEntry) => void>();
  let opened: { bookId: string; json: string } | null = null;
  let lastSynced = '';
  const addEntry = (entry: AiEntry) => {
    state.update({ entries: [...state.get().entries, entry] });
    for (const listener of [...entryListeners]) listener(entry);
  };
  hot.on('ehon:ai:state', (data: StatePayload) => {
    if (data.bookId !== opened?.bookId) return;
    const patch: Partial<AiState> = { bookId: data.bookId, connected: true, provider: data.provider, providers: data.providers, sessionId: data.sessionId, model: data.model, effort: data.effort, models: data.models, efforts: data.efforts, running: data.running, workspace: data.workspace, command: data.command };
    if (data.transcript) patch.entries = data.transcript;
    state.update(patch);
  });
  hot.on('ehon:ai:entry', (data: { bookId: string; entry: AiEntry }) => { if (data.bookId === opened?.bookId) addEntry(data.entry); });
  hot.on('ehon:ai:book', (data: { bookId: string; json: string }) => {
    if (data.bookId !== opened?.bookId) return;
    lastSynced = data.json;
    for (const listener of [...bookListeners]) listener(data.bookId, data.json);
  });
  // A restarted dev server has forgotten every session; the open book announces itself again.
  hot.on('vite:ws:connect', () => { if (opened) hot.send('ehon:ai:open', opened); });
  return {
    state,
    open(bookId, json) {
      if (opened?.bookId !== bookId) state.set({ ...initial, bookId });
      opened = { bookId, json };
      lastSynced = json;
      hot.send('ehon:ai:open', opened);
    },
    sync(bookId, json) {
      if (opened?.bookId !== bookId || json === lastSynced) return;
      lastSynced = json;
      opened = { bookId, json };
      hot.send('ehon:ai:sync', { bookId, json });
    },
    ask(bookId, input) { hot.send('ehon:ai:ask', { bookId, ...input }); },
    stop(bookId) { hot.send('ehon:ai:stop', { bookId }); },
    reset(bookId) { hot.send('ehon:ai:reset', { bookId }); },
    setProvider(bookId, provider) { hot.send('ehon:ai:provider', { bookId, provider }); },
    setPick(bookId, pick) { hot.send('ehon:ai:pick', { bookId, ...pick }); },
    note: addEntry,
    onBook(listener) { bookListeners.add(listener); return () => { bookListeners.delete(listener); }; },
    onEntry(listener) { entryListeners.add(listener); return () => { entryListeners.delete(listener); }; },
  };
}

/** Present only on the dev server, where `tools/ai-desk.ts` runs the Claude CLI; production has no AI layer yet. */
export const aiBridge: AiBridge | null = import.meta.env.DEV && import.meta.hot ? devBridge(import.meta.hot) : null;
