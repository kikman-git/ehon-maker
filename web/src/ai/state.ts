import { createStore } from '../cloud/store';

/** One thing the harness is doing or has done this turn; `active` is the step still in progress. */
export interface TurnStep { text: string; active: boolean }

/** Keeps the running step as its own line and collapses an "…ing" into its "done", so the card reads as a checklist. */
export function appendStep(steps: TurnStep[], text: string): TurnStep[] {
  const active = text.endsWith('…');
  const last = steps[steps.length - 1];
  const next = !active && last?.active ? [...steps.slice(0, -1), { text, active: false }] : [...steps, { text, active }];
  return next.slice(-40);
}

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
  /** Every step of the turn in order, so the working card shows where the AI is, not just the last line. */
  steps: TurnStep[];
  entries: AiEntry[];
}

export const aiStore = () => createStore<AiState>({ bookId: null, running: false, progress: null, step: null, steps: [], entries: [] });
