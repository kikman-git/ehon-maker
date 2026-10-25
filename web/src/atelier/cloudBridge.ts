import type { AiBridge } from '../ai/bridge';
import { aiStore, type AiEntry } from '../ai/state';
import { atelierTurn, AtelierError, credits, type AtelierInput } from '../cloud/credits';

/** The atelier over the metered `atelierTurn` callable. */
export function cloudAtelierBridge(): AiBridge {
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
    sync(bookId, json) { if (context?.bookId === bookId) context = { bookId, json }; },
    ask(bookId, input) {
      if (!context || context.bookId !== bookId || state.get().running) return;
      let payload: { piece: string | null; art: Record<string, string> };
      try { payload = JSON.parse(context.json) as typeof payload; } catch { payload = { piece: null, art: {} }; }
      const words = input.text;
      const started = Date.now();
      const id = ++turn;
      push({ kind: 'user', text: words, mark: input.mark, at: started });
      state.update({ running: true, progress: 0, step: null });
      const spec = input.spec ?? { title: '', mode: 'new' as const, selected: null, sketched: false };
      const request: AtelierInput = { ...spec, request: words, image: input.image, piece: payload.piece, bookArt: Object.values(payload.art) };
      void atelierTurn(request, (progress) => { if (id === turn) state.update({ ...(progress.chars !== undefined ? { progress: progress.chars } : {}), ...(progress.step ? { step: progress.step } : {}) }); }).then((result) => {
        if (id !== turn) return;
        for (const listener of [...bookListeners]) listener(bookId, JSON.stringify({ piece: result.piece, candidates: result.candidates }));
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
