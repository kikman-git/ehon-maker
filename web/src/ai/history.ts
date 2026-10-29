import type { AiEntry, ChatSession } from './state';

/**
 * The AI conversations of one book, kept in this browser so a reload comes back to what was said and done.
 * The edits themselves live in the book; this is only the record beside them.
 */
const MAX_ENTRIES = 60;
const MAX_SESSIONS = 8;
const key = (bookId: string) => `ehon-ai-chat:${bookId}`;

/** A turn that was running when the page went away: its request and how far it had got. */
export interface Unfinished { text: string; steps: string[]; turnId?: string }
export interface SavedChat { past: ChatSession[]; entries: AiEntry[]; unfinished: Unfinished | null }

const str = (value: unknown, max: number): string | null => (typeof value === 'string' && value.length <= max ? value : null);

/** Storage is this browser's own, but a stale or hand-edited copy must never break the panel. */
function parseEntry(raw: unknown): AiEntry | null {
  const entry = raw as Partial<AiEntry> & Record<string, unknown>;
  const text = str(entry?.text, 4_000);
  switch (entry?.kind) {
    case 'user': return text === null ? null : { kind: 'user', text, mark: str(entry.mark, 400), at: typeof entry.at === 'number' ? entry.at : 0 };
    case 'assistant': case 'notice': case 'applied': case 'rejected': return text === null ? null : { kind: entry.kind, text };
    case 'log': return text === null ? null : { kind: 'log', text, level: entry.level === 'error' ? 'error' : 'info' };
    case 'steps': {
      const texts = Array.isArray(entry.texts) ? entry.texts.map((item) => str(item, 400)).filter((item): item is string => item !== null) : [];
      return texts.length ? { kind: 'steps', texts } : null;
    }
    default: return null;
  }
}

const parseEntries = (raw: unknown): AiEntry[] =>
  (Array.isArray(raw) ? raw.map(parseEntry).filter((entry): entry is AiEntry => entry !== null) : []).slice(-MAX_ENTRIES);

function parseSessions(raw: unknown): ChatSession[] {
  if (!Array.isArray(raw)) return [];
  const sessions: ChatSession[] = [];
  for (const item of raw.slice(-MAX_SESSIONS)) {
    const session = item as Partial<ChatSession>;
    const entries = parseEntries(session?.entries);
    if (entries.length) sessions.push({ at: typeof session.at === 'number' ? session.at : 0, entries });
  }
  return sessions;
}

export function loadChat(bookId: string): SavedChat {
  try {
    const saved = JSON.parse(localStorage.getItem(key(bookId)) ?? '{}') as { past?: unknown; entries?: unknown; unfinished?: unknown };
    const raw = saved.unfinished as Partial<Unfinished> | undefined;
    const text = str(raw?.text, 10_000);
    const steps = Array.isArray(raw?.steps) ? raw.steps.map((item) => str(item, 400)).filter((item): item is string => item !== null) : [];
    const turnId = str(raw?.turnId, 64) ?? undefined;
    return { past: parseSessions(saved.past), entries: parseEntries(saved.entries), unfinished: text === null ? null : { text, steps, ...(turnId ? { turnId } : {}) } };
  } catch { return { past: [], entries: [], unfinished: null }; }
}

export function saveChat(bookId: string, past: ChatSession[], entries: AiEntry[], unfinished: Unfinished | null): void {
  try { localStorage.setItem(key(bookId), JSON.stringify({ past: past.slice(-MAX_SESSIONS), entries: entries.slice(-MAX_ENTRIES), unfinished })); }
  catch { /* a full or blocked store only costs the record, not the work */ }
}

export function clearChat(bookId: string): void {
  try { localStorage.removeItem(key(bookId)); } catch { /* nothing to clear */ }
}
