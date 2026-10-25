import type { AiEntry } from './state';

/**
 * The AI conversation of one book, kept in this browser so a reload comes back to what was said and done.
 * The edits themselves live in the book; this is only the record beside them.
 */
const MAX_ENTRIES = 60;
const key = (bookId: string) => `ehon-ai-chat:${bookId}`;

/** A turn that was running when the page went away: its request and how far it had got. */
export interface Unfinished { text: string; steps: string[] }
export interface SavedChat { entries: AiEntry[]; unfinished: Unfinished | null }

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

export function loadChat(bookId: string): SavedChat {
  try {
    const saved = JSON.parse(localStorage.getItem(key(bookId)) ?? '{}') as { entries?: unknown; unfinished?: unknown };
    const entries = Array.isArray(saved.entries) ? saved.entries.map(parseEntry).filter((entry): entry is AiEntry => entry !== null) : [];
    const raw = saved.unfinished as Partial<Unfinished> | undefined;
    const text = str(raw?.text, 10_000);
    const steps = Array.isArray(raw?.steps) ? raw.steps.map((item) => str(item, 400)).filter((item): item is string => item !== null) : [];
    return { entries: entries.slice(-MAX_ENTRIES), unfinished: text === null ? null : { text, steps } };
  } catch { return { entries: [], unfinished: null }; }
}

export function saveChat(bookId: string, entries: AiEntry[], unfinished: Unfinished | null): void {
  try { localStorage.setItem(key(bookId), JSON.stringify({ entries: entries.slice(-MAX_ENTRIES), unfinished })); }
  catch { /* a full or blocked store only costs the record, not the work */ }
}

export function clearChat(bookId: string): void {
  try { localStorage.removeItem(key(bookId)); } catch { /* nothing to clear */ }
}
