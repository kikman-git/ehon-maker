import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { defaultPick, defaultProvider, providerIds, providers, type Pick, type Provider, type ProviderId, type StudioEvent } from './ai-providers.ts';

// Dev-only AI layer (decision #64): a workspace per open book where Claude Code or Codex runs one non-interactive turn per chat message.

/** What a workspace holds: the whole book for the AI desk, one picture for the 素材アトリエ. */
interface Kind {
  ns: 'ai' | 'atelier';
  suffix: string;
  imageFile: string;
  instructions: string;
  /** The browser's payload, written as files the CLI reads. */
  write(dir: string, json: string): void;
  /** What the CLI produced, as the payload the browser validates. */
  read(dir: string): string | null;
  watches(file: string): boolean;
  beforeRun?(dir: string): void;
}

interface Session {
  bookId: string;
  kind: Kind;
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
const SESSION_FILE = 'session.json';
const PIECE_FILE = 'piece.svg';
const BOOK_ART_DIR = 'book-art';
const CANDIDATE = /^candidate-(\d{1,2})\.svg$/;

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
- Write the whole document back at \`"version": 6\`.
- \`page.png\`, when present, is the page the user is looking at with the marked area outlined in red.

Do not run build tools or commands here; the studio validates the file itself. Answer in the user's
language with one or two sentences about what you changed.
`;

const ATELIER_INSTRUCTIONS = `# ぺたぺた 素材アトリエ workspace

You draw one illustration (素材) for a picture book as SVG. Each prompt from the studio says what to
draw or change.

- \`FORMAT.md\`: read its "## Art" section first. It is the SVG subset the app paints, the house
  palette and the sprite rules.
- \`${BOOK_ART_DIR}/*.svg\`, when present: pictures already in this book. Match their palette, line weight
  and shapes so the new piece belongs in the same book.
- \`${PIECE_FILE}\`, when present: the current illustration.
- \`view.png\`, when present: what the user sees, the current illustration or blank paper, the part they
  selected outlined in red, and anything they sketched on top in blue.

Rules:

- A sprite is one character or prop on a transparent background, centred in \`viewBox="0 0 100 100"\`
  with a margin of about 6 so a rotated piece is not clipped.
- Group the drawing into \`<g id="…" data-name="…">\` parts the user can tap, one per meaningful part
  (head, ear-left, hat, wheel), ids in English kebab-case and \`data-name\` a short hiragana name
  (みみ, ぼうし). Keep ids stable across edits.
- Flat colours and only the supported elements; no text, images, filters, masks or clip paths.
- Keep one illustration under 6,000 characters: collapse whitespace, no comments or editor metadata.
- When the prompt asks for candidates, write each to its own \`candidate-N.svg\` and make them clearly
  different takes on the request.
- When the prompt asks to change the current illustration, edit \`${PIECE_FILE}\` in place and change only
  what was asked, keeping every other group as it is.

Do not run build tools or commands here; the studio checks each file itself. Write no text before or
between tool calls: the studio shows the user what you are doing. Your only words are one short
sentence after the last file is written, in the language of the request.
`;

const readText = (path: string) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
const candidatesIn = (dir: string) => readdirSync(dir).map((file) => CANDIDATE.exec(file)).filter((match) => match !== null)
  .sort((a, b) => Number(a[1]) - Number(b[1])).map((match) => match[0]);

const bookKind: Kind = {
  ns: 'ai', suffix: '', imageFile: 'page.png', instructions: INSTRUCTIONS,
  write: (dir, json) => writeFileSync(join(dir, BOOK_FILE), json),
  read: (dir) => readText(join(dir, BOOK_FILE)),
  watches: (file) => file === BOOK_FILE,
};

/** In `{piece, art: {key: svg}}`, out `{piece, candidates}`; the browser keeps the versions. */
const atelierKind: Kind = {
  ns: 'atelier', suffix: '.atelier', imageFile: 'view.png', instructions: ATELIER_INSTRUCTIONS,
  write(dir, json) {
    const payload = JSON.parse(json) as { piece?: unknown; art?: Record<string, unknown> };
    const piece = join(dir, PIECE_FILE);
    if (typeof payload.piece === 'string') writeFileSync(piece, payload.piece);
    else rmSync(piece, { force: true });
    const artDir = join(dir, BOOK_ART_DIR);
    rmSync(artDir, { recursive: true, force: true });
    const art = Object.entries(payload.art ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    if (art.length) {
      mkdirSync(artDir);
      for (const [key, svg] of art) writeFileSync(join(artDir, safeName(key) + '.svg'), svg);
    }
  },
  read: (dir) => JSON.stringify({ piece: readText(join(dir, PIECE_FILE)), candidates: candidatesIn(dir).map((file) => readText(join(dir, file)) ?? '') }),
  watches: (file) => file === PIECE_FILE || CANDIDATE.test(file),
  beforeRun: (dir) => { for (const file of candidatesIn(dir)) rmSync(join(dir, file), { force: true }); },
};

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
  const keyOf = (kind: Kind, bookId: string) => `${kind.ns}:${bookId}`;

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
    broadcast(session, `ehon:${session.kind.ns}:entry`, { bookId: session.bookId, entry });
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
  const broadcastState = (session: Session) => broadcast(session, `ehon:${session.kind.ns}:state`, state(session));

  const writeBook = (session: Session, json: string) => {
    try { session.kind.write(session.dir, json); } catch (error) { log(session, `could not write the workspace: ${(error as Error).message}`, 'error'); return; }
    session.lastSynced = session.kind.read(session.dir) ?? '';
  };
  const rememberSession = (session: Session) => writeFileSync(join(session.dir, SESSION_FILE), JSON.stringify({ provider: session.provider, sessions: session.sessionIds, picks: session.picks }));

  /** The CLI writes the file; the browser is the validator, so every distinct save is forwarded. */
  const forwardBook = (session: Session) => {
    const json = session.kind.read(session.dir);
    if (!json?.trim() || json === session.lastSynced) return;
    session.lastSynced = json;
    broadcast(session, `ehon:${session.kind.ns}:book`, { bookId: session.bookId, json });
  };
  const watchBook = (session: Session) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    session.watcher = watch(session.dir, (_type, file) => {
      if (file && !session.kind.watches(file)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; forwardBook(session); }, 250);
    });
  };

  const open = (kind: Kind, bookId: string, json: string, client: Client): Session => {
    let session = sessions.get(keyOf(kind, bookId));
    if (!session) {
      const dir = join(workspaces, safeName(bookId) + kind.suffix);
      mkdirSync(dir, { recursive: true });
      let provider = initialProvider;
      const sessionIds = noSessions();
      const picks = noPicks();
      try {
        const saved = JSON.parse(readFileSync(join(dir, SESSION_FILE), 'utf8')) as { provider?: ProviderId; sessions?: Partial<Record<ProviderId, string | null>>; picks?: Partial<Record<ProviderId, unknown>> };
        if (saved.provider && providerIds.includes(saved.provider) && all[saved.provider].available) provider = saved.provider;
        for (const id of providerIds) { sessionIds[id] = saved.sessions?.[id] ?? null; picks[id] = cleanPick(saved.picks?.[id]); }
      } catch { /* first conversation */ }
      session = { bookId, kind, dir, provider, sessionIds, picks, running: null, lastSynced: '', watcher: null, transcript: [], clients: new Set() };
      sessions.set(keyOf(kind, bookId), session);
      for (const id of providerIds) for (const file of all[id].instructionFiles) writeFileSync(join(dir, file), kind.instructions);
      if (existsSync(formatDoc)) writeFileSync(join(dir, 'FORMAT.md'), readFileSync(formatDoc));
      writeBook(session, json);
      watchBook(session);
    } else if (!session.running) writeBook(session, json);
    session.clients.add(client);
    client.send(`ehon:${kind.ns}:state`, { ...state(session), transcript: session.transcript });
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
    if (!retried) session.kind.beforeRun?.(session.dir);
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

  const attach = (server: ViteDevServer, kind: Kind) => {
    const on = <T>(event: string, handler: (data: T, client: Client) => void) => server.ws.on(`ehon:${kind.ns}:${event}`, handler);
    const sessionOf = (data: { bookId?: unknown } | undefined) => typeof data?.bookId === 'string' ? sessions.get(keyOf(kind, data.bookId)) : undefined;
    on<{ bookId: string; json: string }>('open', (data, client) => {
      if (typeof data?.bookId !== 'string' || typeof data.json !== 'string') return;
      open(kind, data.bookId, data.json, client);
    });
    on<{ bookId: string; json: string }>('sync', (data) => {
      const session = sessionOf(data);
      // While the CLI is writing the file the browser's copy waits; it is refreshed from the result anyway.
      if (!session || session.running || typeof data.json !== 'string' || data.json === session.lastSynced) return;
      writeBook(session, data.json);
    });
    on<{ bookId: string; prompt: string; text: string; mark: string | null; image: string | null }>('ask', (data, client) => {
      const session = sessionOf(data);
      if (!session || typeof data.prompt !== 'string') return;
      if (session.running) { client.send(`ehon:${kind.ns}:entry`, { bookId: session.bookId, entry: { kind: 'log', text: 'a turn is still running', level: 'error' } }); return; }
      const image = join(session.dir, kind.imageFile);
      const hasImage = typeof data.image === 'string' && data.image.startsWith('data:image/png;base64,');
      if (hasImage) writeFileSync(image, Buffer.from(data.image!.slice('data:image/png;base64,'.length), 'base64'));
      else rmSync(image, { force: true });
      push(session, { kind: 'user', text: data.text, mark: data.mark, at: Date.now() });
      run(session, data.prompt, hasImage ? kind.imageFile : null);
    });
    on<{ bookId: string; provider: ProviderId }>('provider', (data) => {
      const session = sessionOf(data);
      if (!session || session.running || !providerIds.includes(data.provider) || !all[data.provider].available || session.provider === data.provider) return;
      session.provider = data.provider;
      rememberSession(session);
      log(session, `provider: ${data.provider}`);
      broadcastState(session);
    });
    // Each control sends only its own field, so two quick changes cannot overwrite each other.
    on<{ bookId: string; model?: unknown; effort?: unknown }>('pick', (data) => {
      const session = sessionOf(data);
      if (!session || session.running) return;
      const pick = { ...session.picks[session.provider] };
      if ('model' in data) pick.model = cleanField(data.model);
      if ('effort' in data) pick.effort = cleanField(data.effort);
      if (pick.effort && !all[session.provider].efforts.includes(pick.effort)) pick.effort = '';
      session.picks[session.provider] = pick;
      rememberSession(session);
      broadcastState(session);
    });
    on<{ bookId: string }>('stop', (data) => {
      const session = sessionOf(data);
      if (session?.running) { log(session, 'stopped'); session.running.kill('SIGTERM'); }
    });
    on<{ bookId: string }>('reset', (data) => {
      const session = sessionOf(data);
      if (!session || session.running) return;
      session.sessionIds[session.provider] = null;
      rememberSession(session);
      session.transcript = [];
      log(session, 'new conversation');
      broadcast(session, `ehon:${kind.ns}:state`, { ...state(session), transcript: session.transcript });
    });
  };

  return {
    name: 'ehon-ai-desk',
    apply: 'serve',
    configureServer(server) {
      attach(server, bookKind);
      attach(server, atelierKind);
      server.httpServer?.on('close', () => {
        for (const session of sessions.values()) { session.running?.kill('SIGTERM'); session.watcher?.close(); }
        sessions.clear();
      });
      const found = providerIds.filter((id) => all[id].available).map((id) => `${id} (${all[id].command.join(' ')})`);
      server.config.logger.info(`  ai desk: ${basename(workspaces)}/<book> → ${found.join(', ') || 'no CLI found: install claude or codex, or set EHON_CLAUDE_COMMAND / EHON_CODEX_COMMAND'}; default ${initialProvider}`);
    },
  };
}
