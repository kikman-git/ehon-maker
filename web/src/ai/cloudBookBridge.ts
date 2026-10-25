import { AtelierError, bookTurn, credits, failureText, type BookInput } from '../cloud/credits';
import type { AiBridge } from './bridge';
import { referenceArt } from './art';
import { loadChat, saveChat, type Unfinished } from './history';
import { aiStore, appendStep, APPLIED_NOTE, type AiEntry } from './state';

interface Document { version?: number; book?: { art?: Record<string, { svg?: string; name?: string }> } }

/** The document as the model sees it: every picture reduced to its name, which keeps a turn to a few thousand tokens. */
export function withoutArt(json: string): { book: string; bookArt: string[] } {
  const document = JSON.parse(json) as Document;
  const art = document.book?.art ?? {};
  const bookArt = referenceArt(Object.values(art).map(entry => entry.svg));
  if (document.book) document.book.art = Object.fromEntries(Object.entries(art).map(([key, entry]) => [key, { name: entry.name ?? key }]));
  return { book: JSON.stringify(document), bookArt };
}

/**
 * The harness's answer with the book's own pictures put back and its new ones kept, so the studio validates a complete
 * document. `drawn` carries the pictures that arrived in their own chunks while the turn ran.
 */
export function withArtOf(original: string, answer: string, drawn: Record<string, { name: string; svg: string }> = {}): string {
  const art = (JSON.parse(original) as Document).book?.art ?? {};
  const document = JSON.parse(answer) as Document;
  if (document.book) {
    const carried = Object.fromEntries(Object.entries(document.book.art ?? {}).filter(([, entry]) => typeof entry?.svg === 'string'));
    document.book.art = { ...art, ...drawn, ...carried };
  }
  return JSON.stringify(document);
}

/** The book desk over the metered `bookTurn` callable: the picture-book harness edits the open book through its tools. */
export function cloudBookBridge(): AiBridge {
  const state = aiStore();
  const bookListeners = new Set<(bookId: string, json: string, draft?: boolean) => void>();
  let context: { bookId: string; json: string } | null = null;
  let turn = 0;
  // The request a turn was on when the page last went away, so returning can say it stopped partway.
  let unfinished: Unfinished | null = null;
  const remember = () => { if (context) saveChat(context.bookId, state.get().past, state.get().entries, unfinished); };
  const push = (entry: AiEntry) => { state.update({ entries: [...state.get().entries, entry] }); remember(); };
  return {
    state,
    open(bookId, json) {
      if (context?.bookId !== bookId) {
        const saved = loadChat(bookId);
        const entries = [...saved.entries];
        // A turn cut off by a reload: its finished steps are already in the book, so say so and show them.
        if (saved.unfinished) {
          if (saved.unfinished.steps.length) entries.push({ kind: 'steps', texts: saved.unfinished.steps });
          entries.push({ kind: 'notice', text: 'とちゅうで とまりました。ここまでは えほんに のこっています。' });
        }
        unfinished = null;
        context = { bookId, json };
        state.update({ bookId, past: saved.past, entries, running: false, progress: null, step: null, steps: [] });
        if (saved.unfinished) remember();
      }
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
      unfinished = { text: input.text, steps: [] };
      push({ kind: 'user', text: input.text, mark: input.mark, at: started });
      state.update({ running: true, progress: 0, step: null, steps: [] });
      const request: BookInput = { ...input.book, ...stripped, request: input.text, image: input.image };
      // Pictures arrive one at a time and drafts arrive without them, so the turn keeps its own art to merge into both.
      const drawn: Record<string, { name: string; svg: string }> = {};
      let applied: string | null = null;
      const apply = (answer: string, draft: boolean) => {
        let json: string;
        try { json = withArtOf(original, answer, drawn); } catch { if (!draft) push({ kind: 'rejected', text: '反映できませんでした: AI の こたえが えほんの かたちでは ありませんでした。' }); return; }
        // Drafts already put this on the page; say so without a second apply, which would cost another undo step.
        if (json === applied) { if (!draft) push({ kind: 'applied', text: APPLIED_NOTE }); return; }
        applied = json;
        for (const listener of [...bookListeners]) listener(bookId, json, draft);
      };
      void bookTurn(request, (progress) => { if (id === turn) state.update({ ...(progress.chars !== undefined ? { progress: progress.chars } : {}), ...(progress.step ? { step: progress.step, steps: appendStep(state.get().steps, progress.step) } : {}) }); if (id === turn && progress.step && unfinished) { unfinished.steps.push(progress.step); remember(); } }, (event) => {
        if (id !== turn) return;
        if (event.kind === 'art') { drawn[event.art.key] = { name: event.art.name, svg: event.art.svg }; return; }
        apply(event.book, true);
      }).then((result) => {
        if (id !== turn) return;
        if (result.book) apply(result.book, false);
        // The working card goes; its list stays in the transcript as the record of what this turn did.
        const did = state.get().steps.map((item) => item.text);
        if (did.length) push({ kind: 'steps', texts: did });
        if (result.say) push({ kind: 'assistant', text: result.say });
        push({ kind: 'notice', text: `${((Date.now() - started) / 1000).toFixed(1)}秒 · ${result.credits} クレジット · のこり ${result.balance}` });
        credits.update({ balance: result.balance });
      }).catch((error: unknown) => {
        if (id !== turn) return;
        const reason = error instanceof AtelierError ? error.reason : 'network';
        if (reason === 'credits') { credits.update({ balance: (error as AtelierError).balance ?? 0 }); push({ kind: 'notice', text: 'クレジットが たりません。' }); }
        else push({ kind: 'log', level: 'error', text: failureText[reason] + (error instanceof AtelierError && error.detail ? ` (${error.detail})` : '') });
      }).finally(() => { if (id === turn) { unfinished = null; state.update({ running: false, progress: null, step: null, steps: [] }); remember(); } });
    },
    stop() { turn++; unfinished = null; state.update({ running: false, progress: null, step: null, steps: [] }); remember(); },
    // 「新しい会話」 puts the old one away rather than throwing it out, so what the AI did stays readable.
    reset(bookId) {
      if (context?.bookId !== bookId) return;
      unfinished = null;
      const { past, entries } = state.get();
      state.update({ past: entries.length ? [...past, { at: Date.now(), entries }] : past, entries: [] });
      remember();
    },
    note: push,
    onBook(listener) { bookListeners.add(listener); return () => { bookListeners.delete(listener); }; },
  };
}
