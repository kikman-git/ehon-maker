import { Icon } from '../ui/Icon';
import type { AiEntry, AiState } from './state';

/** Which desk is asking: the words differ, the mechanics do not. */
export type Flavour = 'book' | 'new' | 'revise';

const WORDS: Record<Flavour, { think: string; write: string }> = {
  book: { think: 'えほんを よんで、どう するか かんがえています…', write: 'えほんを かきかえています…' },
  new: { think: 'どんな えに するか かんがえています…', write: 'えを かいています…' },
  revise: { think: 'どう なおすか かんがえています…', write: 'えを なおしています…' },
};

/** One line a child can read: the harness's own step when it sent one, otherwise thinking or writing by whether anything has streamed. */
export function stepText(state: AiState, flavour: Flavour): string {
  if (state.step) return state.step;
  return state.progress ? WORDS[flavour].write : WORDS[flavour].think;
}

export const formatElapsed = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const LONG_TURN_MS = 45_000;

export type Message =
  | { role: 'user'; text: string; mark: string | null }
  | { role: 'assistant'; text: string }
  | { role: 'status'; text: string; error?: boolean; done?: boolean };

/** The transcript as the chat shows it. */
export function chatMessages(entries: AiEntry[]): Message[] {
  const out: Message[] = [];
  for (const entry of entries) {
    switch (entry.kind) {
      case 'user': out.push({ role: 'user', text: entry.text, mark: entry.mark }); break;
      case 'assistant': if (entry.text.trim()) out.push({ role: 'assistant', text: entry.text }); break;
      case 'notice': out.push({ role: 'status', text: entry.text }); break;
      case 'applied': out.push({ role: 'status', text: entry.text, done: true }); break;
      case 'rejected': out.push({ role: 'status', text: entry.text, error: true }); break;
      case 'log': if (entry.level === 'error') out.push({ role: 'status', text: entry.text, error: true }); break;
    }
  }
  return out;
}

export const arrivalLabel = (key: string) => (key === 'piece' ? 'なおした え' : `${key.slice('candidate-'.length)}まいめの え`);

export function ChatMessage({ message }: { message: Message }) {
  if (message.role === 'user') return <div className="ai-message user"><p>{message.text}</p>{message.mark && <span className="ai-mark-chip"><Icon name="select" size={12} />{message.mark}</span>}</div>;
  if (message.role === 'assistant') return <div className="ai-message assistant"><p>{message.text}</p></div>;
  return <div className="ai-message status" data-error={message.error || undefined} data-done={message.done || undefined} role={message.error ? 'alert' : undefined}>{message.done && <Icon name="check" size={12} />}{message.text}</div>;
}

interface WorkingProps { step: string; elapsed: string; count?: string; long: boolean; fraction: number | null }

/** The card that shows a turn is alive: the step, a clock, and a bar that fills while the answer streams. */
export function WorkingCard({ step, elapsed, count, long, fraction }: WorkingProps) {
  return <div className="ai-working" role="status" aria-label="AI の ようす">
    <span className="ai-pen"><Icon name="brush" size={16} /></span>
    <div className="ai-working-text">
      <strong>{step}</strong>
      <small><time>{elapsed}</time>{count && ` · ${count}`}{long && ' · ていねいに するので 1〜3分 かかります'}</small>
    </div>
    <span className="ai-bar" data-indeterminate={fraction === null || undefined}><i style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }} /></span>
  </div>;
}
