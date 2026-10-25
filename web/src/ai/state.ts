import { createStore } from '../cloud/store';

/** One line of the conversation; `applied` and `rejected` are the studio's own verdicts on what came back. */
export type AiEntry =
  | { kind: 'user'; text: string; mark: string | null; at: number }
  | { kind: 'assistant'; text: string }
  | { kind: 'notice'; text: string }
  | { kind: 'log'; text: string; level?: 'info' | 'error' }
  | { kind: 'applied'; text: string }
  | { kind: 'rejected'; text: string };

export interface AiState {
  bookId: string | null;
  running: boolean;
  /** Characters of the answer streamed so far, or null before the first chunk. */
  progress: number | null;
  /** The harness's latest word on what it is doing, in the user's language. */
  step: string | null;
  entries: AiEntry[];
}

export const aiStore = () => createStore<AiState>({ bookId: null, running: false, progress: null, step: null, entries: [] });
