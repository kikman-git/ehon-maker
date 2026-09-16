import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { defaultPick, defaultProvider, providerIds, providers, type Pick, type Provider, type ProviderId, type StudioEvent } from './ai-providers.ts';

// Dev-only AI layer (decision #64): a workspace per open book where Claude Code or Codex runs one non-interactive turn per chat message.

interface Session {
  bookId: string;
  dir: string;
  provider: ProviderId;
  sessionIds: Record<ProviderId, string | null>;
  picks: Record<ProviderId, Pick>;
  running: ChildProcess | null;
  lastSynced: string;
  watcher: FSWatcher | null;
  transcript: Entry[];
  clients: Set<Client>;
}

type Entry =
  | { kind: 'user'; text: string; mark: string | null; at: number }
  | { kind: 'event'; event: StudioEvent }
  | { kind: 'log'; text: string; level?: 'info' | 'error' };

interface Client { send(event: string, payload: unknown): void }

const MAX_TRANSCRIPT = 4000;
const BOOK_FILE = 'book.ehon.json';
const IMAGE_FILE = 'page.png';
const SESSION_FILE = 'session.json';

const INSTRUCTIONS = `# ぺたぺた studio workspace

\`${BOOK_FILE}\` is the picture book open in the browser right now. Each prompt from the studio says
what the user wants changed; edit that file in place. The moment you save it the studio applies the
change as one undoable step, validating it with the same code the app uses, and if it rejects the
document the next prompt tells you why.

Read \`FORMAT.md\` before the first edit: it is the whole contract for the document, its pages, items,
embedded SVG art, palette and binding. The rules that matter most:

- Keep every existing id. New items and pages get fresh ids that are unique across the book.
- Preserve \`strokes\`, \`drawing\` and \`reply\` fields wherever you find them: they are the family's own work.
- Positions are percent of the page and name an item's centre; \`sizePct\` is its width in percent.
- Write the whole document back at \`"version": 5\`.
- \`${IMAGE_FILE}\`, when present, is the page the user is looking at with the marked area outlined in red.

Do not run build tools or commands here; the studio validates the file itself. Answer in the user's
language with one or two sentences about what you changed.
`;

const safeName = (bookId: string) => bookId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'book';
const noSessions = (): Record<ProviderId, string | null> => ({ claude: null, codex: null });
const noPicks = (): Record<ProviderId, Pick> => ({ claude: defaultPick(), codex: defaultPick() });
const cleanField = (text: unknown) => (typeof text === 'string' ? text.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80) : '');
const cleanPick = (value: unknown): Pick => {
  const raw = (value ?? {}) as Partial<Pick>;
  return { model: cleanField(raw.model), effort: cleanField(raw.effort) };
};

export function aiDesk(): Plugin {
  const root = resolve(process.cwd());
  const workspaces = join(root, '.ehon-ai');
  const formatDoc = resolve(root, '../docs/EHON_FORMAT.md');
  const all = providers(root);
  const initialProvider = defaultProvider(all);
  const sessions = new Map<string, Session>();

  const providerOf = (session: Session): Provider => all[session.provider];
  // Vite's socket has no per-client close hook, so a reloaded tab is dropped when a send throws.
  const broadcast = (session: Session, event: string, payload: unknown) => {
    for (const client of session.clients) {
      try { client.send(event, payload); } catch { session.clients.delete(client); }
    }
  };
  const push = (session: Session, entry: Entry) => {
    session.transcript.push(entry);
    if (session.transcript.length > MAX_TRANSCRIPT) session.transcript.splice(0, session.transcript.length - MAX_TRANSCRIPT);
    broadcast(session, 'ehon:ai:entry', { bookId: session.bookId, entry });
  };
  const log = (session: Session, text: string, level: 'info' | 'error' = 'info') => push(session, { kind: 'log', text, level });
  const state = (session: Session) => {
    const provider = providerOf(session);
    return {
      bookId: session.bookId,
      provider: session.provider,
      providers: providerIds.filter((id) => all[id].available),
      sessionId: session.sessionIds[session.provider],
      model: session.picks[session.provider].model,
      effort: session.picks[session.provider].effort,
      models: provider.models,
      efforts: provider.efforts,
      running: session.running !== null,
      workspace: session.dir,
      command: [...provider.command, ...provider.args(session.sessionIds[session.provider], null, session.picks[session.provider])].join(' '),
    };
  };
  const broadcastState = (session: Session) => broadcast(session, 'ehon:ai:state', state(session));

  const writeBook = (session: Session, json: string) => {
    session.lastSynced = json;
    writeFileSync(join(session.dir, BOOK_FILE), json);
  };
  const rememberSession = (session: Session) => writeFileSync(join(session.dir, SESSION_FILE), JSON.stringify({ provider: session.provider, sessions: session.sessionIds, picks: session.picks }));

  /** The CLI writes the file; the browser is the validator, so every distinct save is forwarded. */
  const forwardBook = (session: Session) => {
    let json: string;
    try { json = readFileSync(join(session.dir, BOOK_FILE), 'utf8'); } catch { return; }
    if (!json.trim() || json === session.lastSynced) return;
    session.lastSynced = json;
    broadcast(session, 'ehon:ai:book', { bookId: session.bookId, json });
  };
  const watchBook = (session: Session) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    session.watcher = watch(session.dir, (_type, file) => {
      if (file && file !== BOOK_FILE) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; forwardBook(session); }, 250);
    });
  };

  const open = (bookId: string, json: string, client: Client): Session => {
    let session = sessions.get(bookId);
    if (!session) {
      const dir = join(workspaces, safeName(bookId));
      mkdirSync(dir, { recursive: true });
      let provider = initialProvider;
      const sessionIds = noSessions();
      const picks = noPicks();
      try {
        const saved = JSON.parse(readFileSync(join(dir, SESSION_FILE), 'utf8')) as { provider?: ProviderId; sessions?: Partial<Record<ProviderId, string | null>>; picks?: Partial<Record<ProviderId, unknown>> };
        if (saved.provider && providerIds.includes(saved.provider) && all[saved.provider].available) provider = saved.provider;
        for (const id of providerIds) { sessionIds[id] = saved.sessions?.[id] ?? null; picks[id] = cleanPick(saved.picks?.[id]); }
      } catch { /* first conversation */ }
      session = { bookId, dir, provider, sessionIds, picks, running: null, lastSynced: '', watcher: null, transcript: [], clients: new Set() };
      sessions.set(bookId, session);
      for (const id of providerIds) for (const file of all[id].instructionFiles) writeFileSync(join(dir, file), INSTRUCTIONS);
      if (existsSync(formatDoc)) writeFileSync(join(dir, 'FORMAT.md'), readFileSync(formatDoc));
      writeBook(session, json);
      watchBook(session);
    } else if (!session.running) writeBook(session, json);
    session.clients.add(client);
    client.send('ehon:ai:state', { ...state(session), transcript: session.transcript });
    return session;
  };

  const run = (session: Session, prompt: string, image: string | null, retried = false) => {
    const provider = providerOf(session);
    const [bin, ...prefix] = provider.command;
    const sessionId = session.sessionIds[provider.id];
    const args = [...prefix, ...provider.args(sessionId, image, session.picks[provider.id])];
    const env = { ...process.env };
    // A dev server started from inside Claude Code must not make the CLI think it is nested.
    for (const key of Object.keys(env)) if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_')) delete env[key];
    log(session, `$ ${[bin, ...args].join(' ')}`);
    let child: ChildProcess;
    try { child = spawn(bin, args, { cwd: session.dir, env, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { log(session, `could not start ${bin}: ${(error as Error).message}`, 'error'); return; }
    session.running = child;
    broadcastState(session);
    let sawInit = false;
    let buffered = '';
    const handleLine = (line: string) => {
      if (!line.trim()) return;
      let raw: Record<string, unknown>;
      try { raw = JSON.parse(line) as Record<string, unknown>; } catch { log(session, line); return; }
      const parsed = provider.parse(raw);
      if (parsed.sessionId) {
        sawInit = true;
        if (parsed.sessionId !== session.sessionIds[provider.id]) { session.sessionIds[provider.id] = parsed.sessionId; rememberSession(session); broadcastState(session); }
      }
      for (const event of parsed.events) push(session, { kind: 'event', event });
    };
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      buffered += chunk;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      lines.forEach(handleLine);
    });
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => {
      const text = chunk.replace(/\n$/, '');
      if (text.trim()) log(session, text, provider.stderrNoise?.test(text.trim()) ? 'info' : 'error');
    });
    child.on('error', (error) => { log(session, `${bin}: ${error.message}`, 'error'); });
    child.on('close', (code, signal) => {
      if (buffered.trim()) handleLine(buffered);
      buffered = '';
      if (session.running === child) session.running = null;
      // The run's last word on the file is read here, before any queued browser sync can overwrite it.
      forwardBook(session);
      // A session the CLI no longer knows is dropped and the turn retried once as a fresh conversation.
      if (code !== 0 && sessionId && !sawInit && !retried && !signal) {
        log(session, 'the previous conversation could not be resumed; starting a new one', 'error');
        session.sessionIds[provider.id] = null;
        rememberSession(session);
        run(session, prompt, image, true);
        return;
      }
      push(session, { kind: 'event', event: { type: 'exit', code, signal } });
      broadcastState(session);
    });
    child.stdin!.on('error', () => { /* the CLI exited before reading its prompt; the close handler reports it */ });
    child.stdin!.end(prompt);
  };

  const attach = (server: ViteDevServer) => {
    server.ws.on('ehon:ai:open', (data: { bookId: string; json: string }, client) => {
      if (typeof data?.bookId !== 'string' || typeof data.json !== 'string') return;
      open(data.bookId, data.json, client);
    });
    server.ws.on('ehon:ai:sync', (data: { bookId: string; json: string }) => {
      const session = sessions.get(data?.bookId);
      // While the CLI is writing the file the browser's copy waits; it is refreshed from the result anyway.
      if (!session || session.running || typeof data.json !== 'string' || data.json === session.lastSynced) return;
      writeBook(session, data.json);
    });
    server.ws.on('ehon:ai:ask', (data: { bookId: string; prompt: string; text: string; mark: string | null; image: string | null }, client) => {
      const session = sessions.get(data?.bookId);
      if (!session || typeof data.prompt !== 'string') return;
      if (session.running) { client.send('ehon:ai:entry', { bookId: session.bookId, entry: { kind: 'log', text: 'a turn is still running', level: 'error' } }); return; }
      const hasImage = typeof data.image === 'string' && data.image.startsWith('data:image/png;base64,');
      if (hasImage) writeFileSync(join(session.dir, IMAGE_FILE), Buffer.from(data.image!.slice('data:image/png;base64,'.length), 'base64'));
      push(session, { kind: 'user', text: data.text, mark: data.mark, at: Date.now() });
      run(session, data.prompt, hasImage ? IMAGE_FILE : null);
    });
    server.ws.on('ehon:ai:provider', (data: { bookId: string; provider: ProviderId }) => {
      const session = sessions.get(data?.bookId);
      if (!session || session.running || !providerIds.includes(data.provider) || !all[data.provider].available || session.provider === data.provider) return;
      session.provider = data.provider;
      rememberSession(session);
      log(session, `provider: ${data.provider}`);
      broadcastState(session);
    });
    // Each control sends only its own field, so two quick changes cannot overwrite each other.
    server.ws.on('ehon:ai:pick', (data: { bookId: string; model?: unknown; effort?: unknown }) => {
      const session = sessions.get(data?.bookId);
      if (!session || session.running) return;
      const pick = { ...session.picks[session.provider] };
      if ('model' in data) pick.model = cleanField(data.model);
      if ('effort' in data) pick.effort = cleanField(data.effort);
      if (pick.effort && !all[session.provider].efforts.includes(pick.effort)) pick.effort = '';
      session.picks[session.provider] = pick;
      rememberSession(session);
      broadcastState(session);
    });
    server.ws.on('ehon:ai:stop', (data: { bookId: string }) => {
      const session = sessions.get(data?.bookId);
      if (session?.running) { log(session, 'stopped'); session.running.kill('SIGTERM'); }
    });
    server.ws.on('ehon:ai:reset', (data: { bookId: string }) => {
      const session = sessions.get(data?.bookId);
      if (!session || session.running) return;
      session.sessionIds[session.provider] = null;
      rememberSession(session);
      session.transcript = [];
      log(session, 'new conversation');
      broadcast(session, 'ehon:ai:state', { ...state(session), transcript: session.transcript });
    });
    server.httpServer?.on('close', () => {
      for (const session of sessions.values()) { session.running?.kill('SIGTERM'); session.watcher?.close(); }
      sessions.clear();
    });
  };

  return {
    name: 'ehon-ai-desk',
    apply: 'serve',
    configureServer(server) {
      attach(server);
      const found = providerIds.filter((id) => all[id].available).map((id) => `${id} (${all[id].command.join(' ')})`);
      server.config.logger.info(`  ai desk: ${basename(workspaces)}/<book> → ${found.join(', ') || 'no CLI found: install claude or codex, or set EHON_CLAUDE_COMMAND / EHON_CODEX_COMMAND'}; default ${initialProvider}`);
    },
  };
}
