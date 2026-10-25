import type { AiBridge, AiEntry, AiState } from '../ai/bridge';
import { atelierTurn, AtelierError, credits, type AtelierInput } from '../cloud/credits';
import { createStore } from '../cloud/store';

/** The atelier over the metered `atelierTurn` callable: the same bridge shape the dev CLI uses, so the panel does not care which drew. */
export function cloudAtelierBridge(): AiBridge {
  const state = createStore<AiState>({ bookId: null, connected: true, provider: 'claude', providers: ['claude'], sessionId: null, model: '', effort: '', models: [], efforts: [], running: false, progress: null, workspace: '', command: 'atelierTurn', entries: [] });
  const bookListeners = new Set<(bookId: string, json: string) => void>();
  const entryListeners = new Set<(entry: AiEntry) => void>();
  let context: { bookId: string; json: string } | null = null;
  let turn = 0;
  const push = (entry: AiEntry) => {
    state.update({ entries: [...state.get().entries, entry] });
    for (const listener of [...entryListeners]) listener(entry);
  };
  return {
    state,
    open(bookId, json) {
      if (context?.bookId !== bookId) state.update({ bookId, entries: [], running: false });
      context = { bookId, json };
    },
    sync(bookId, json) { if (context?.bookId === bookId) context = { bookId, json }; },
    ask(bookId, input) {
      if (!context || context.bookId !== bookId || state.get().running) return;
      let payload: { piece: string | null; art: Record<string, string> };
      try { payload = JSON.parse(context.json) as typeof payload; } catch { payload = { piece: null, art: {} }; }
      const words = input.text;
      const started = Date.now();
      const id = ++turn;
      push({ kind: 'user', text: words, mark: input.mark, at: started });
      state.update({ running: true, progress: 0 });
      const spec = input.spec ?? { title: '', mode: 'new' as const, selected: null, sketched: false };
      const request: AtelierInput = { ...spec, request: words, image: input.image, piece: payload.piece, bookArt: Object.values(payload.art) };
      void atelierTurn(request, (chars) => { if (id === turn) state.update({ progress: chars }); }).then((result) => {
        if (id !== turn) return;
        for (const listener of [...bookListeners]) listener(bookId, JSON.stringify({ piece: result.piece, candidates: result.candidates }));
        if (result.say) push({ kind: 'event', event: { type: 'assistant', message: { content: [{ type: 'text', text: result.say }] } } });
        push({ kind: 'event', event: { type: 'notice', text: `${((Date.now() - started) / 1000).toFixed(1)}秒 · ${result.credits} クレジット · のこり ${result.balance}` } });
        credits.update({ balance: result.balance });
      }).catch((error: unknown) => {
        if (id !== turn) return;
        const reason = error instanceof AtelierError ? error.reason : 'network';
        if (reason === 'credits') { credits.update({ balance: (error as AtelierError).balance ?? 0 }); push({ kind: 'event', event: { type: 'notice', text: 'クレジットが たりません。' } }); }
        else push({ kind: 'log', level: 'error', text: reason === 'paused' ? 'AI は いま おやすみちゅうです。' : reason === 'signedOut' ? 'サインインが きれました。' : 'AI に つながりませんでした。' });
      }).finally(() => { if (id === turn) state.update({ running: false, progress: null }); });
    },
    stop() { turn++; state.update({ running: false, progress: null }); },
    reset(bookId) { if (context?.bookId === bookId) state.update({ entries: [] }); },
    setProvider() {},
    setPick() {},
    note: push,
    onBook(listener) { bookListeners.add(listener); return () => { bookListeners.delete(listener); }; },
    onEntry(listener) { entryListeners.add(listener); return () => { entryListeners.delete(listener); }; },
  };
}
