import { createStore } from '../cloud/store';

/** What the studio says once a turn's edits are on the page, whether they landed as drafts or all at the end. */
export const APPLIED_NOTE = 'えほんに 反映しました。「元に戻す」で 取り消せます。';

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
  | { kind: 'rejected'; text: string }
  /** What a finished or interrupted turn did, kept in the transcript after its working card is gone. */
  | { kind: 'steps'; texts: string[] };

/** A conversation that has been put away: 「新しい会話」 keeps the old one rather than throwing it out. */
export interface ChatSession { at: number; entries: AiEntry[] }

export interface AiState {
  bookId: string | null;
  /** Earlier conversations about this book, oldest first. */
  past: ChatSession[];
  running: boolean;
  /** Characters of the answer streamed so far, or null before the first chunk. */
  progress: number | null;
  /** The harness's latest word on what it is doing, in the user's language. */
  step: string | null;
  /** Every step of the turn in order, so the working card shows where the AI is, not just the last line. */
  steps: TurnStep[];
  entries: AiEntry[];
}

export const aiStore = () => createStore<AiState>({ bookId: null, past: [], running: false, progress: null, step: null, steps: [], entries: [] });
