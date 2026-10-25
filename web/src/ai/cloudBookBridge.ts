import { AtelierError, bookTurn, credits, type BookInput } from '../cloud/credits';
import type { AiBridge } from './bridge';
import { aiStore, type AiEntry } from './state';

interface Document { version?: number; book?: { art?: Record<string, { svg?: string; name?: string }> } }
const BOOK_ART_SAMPLE = 6;

/** The document as the model sees it: every picture reduced to its name, which keeps a turn to a few thousand tokens. */
export function withoutArt(json: string): { book: string; bookArt: string[] } {
  const document = JSON.parse(json) as Document;
  const art = document.book?.art ?? {};
  const bookArt = Object.values(art).map(entry => entry.svg).filter((svg): svg is string => typeof svg === 'string').slice(0, BOOK_ART_SAMPLE);
  if (document.book) document.book.art = Object.fromEntries(Object.entries(art).map(([key, entry]) => [key, { name: entry.name ?? key }]));
  return { book: JSON.stringify(document), bookArt };
}

/** The harness's answer with the book's own pictures put back and its new ones kept, so the studio validates a complete document. */
export function withArtOf(original: string, answer: string): string {
  const art = (JSON.parse(original) as Document).book?.art ?? {};
  const document = JSON.parse(answer) as Document;
  if (document.book) {
    const drawn = Object.fromEntries(Object.entries(document.book.art ?? {}).filter(([, entry]) => typeof entry?.svg === 'string'));
    document.book.art = { ...art, ...drawn };
  }
  return JSON.stringify(document);
}

/** The book desk over the metered `bookTurn` callable: the picture-book harness edits the open book through its tools. */
export function cloudBookBridge(): AiBridge {
  const state = aiStore();
  const bookListeners = new Set<(bookId: string, json: string) => void>();
  let context: { bookId: string; json: string } | null = null;
  let turn = 0;
  const push = (entry: AiEntry) => state.update({ entries: [...state.get().entries, entry] });
  return {
    state,
    open(bookId, json) {
      if (context?.bookId !== bookId) state.update({ bookId, entries: [], running: false });
      context = { bookId, json };
    },
    sync(bookId, json) { if (context?.bookId === bookId && !state.get().running) context = { bookId, json }; },
    ask(bookId, input) {
      if (!context || context.bookId !== bookId || state.get().running || !input.book) return;
      const original = context.json;
      let stripped: { book: string; bookArt: string[] };
      try { stripped = withoutArt(original); } catch { push({ kind: 'log', level: 'error', text: 'えほんを おくれませんでした。' }); return; }
      const started = Date.now();
      const id = ++turn;
      push({ kind: 'user', text: input.text, mark: input.mark, at: started });
      state.update({ running: true, progress: 0, step: null });
      const request: BookInput = { ...input.book, ...stripped, request: input.text, image: input.image };
      void bookTurn(request, (progress) => { if (id === turn) state.update({ ...(progress.chars !== undefined ? { progress: progress.chars } : {}), ...(progress.step ? { step: progress.step } : {}) }); }).then((result) => {
        if (id !== turn) return;
        if (result.book) {
          let json: string | null = null;
          try { json = withArtOf(original, result.book); } catch { push({ kind: 'rejected', text: '反映できませんでした: AI の こたえが えほんの かたちでは ありませんでした。' }); }
          if (json) for (const listener of [...bookListeners]) listener(bookId, json);
        }
        if (result.say) push({ kind: 'assistant', text: result.say });
        push({ kind: 'notice', text: `${((Date.now() - started) / 1000).toFixed(1)}秒 · ${result.credits} クレジット · のこり ${result.balance}` });
        credits.update({ balance: result.balance });
      }).catch((error: unknown) => {
        if (id !== turn) return;
        const reason = error instanceof AtelierError ? error.reason : 'network';
        if (reason === 'credits') { credits.update({ balance: (error as AtelierError).balance ?? 0 }); push({ kind: 'notice', text: 'クレジットが たりません。' }); }
        else push({ kind: 'log', level: 'error', text: reason === 'paused' ? 'AI は いま おやすみちゅうです。' : reason === 'signedOut' ? 'サインインが きれました。' : 'AI に つながりませんでした。' });
      }).finally(() => { if (id === turn) state.update({ running: false, progress: null, step: null }); });
    },
    stop() { turn++; state.update({ running: false, progress: null, step: null }); },
    reset(bookId) { if (context?.bookId === bookId) state.update({ entries: [] }); },
    note: push,
    onBook(listener) { bookListeners.add(listener); return () => { bookListeners.delete(listener); }; },
  };
}
