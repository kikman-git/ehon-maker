import { useState } from 'react';
import { Icon } from '../ui/Icon';
import type { AiEntry, AiState, ChatSession, TurnStep } from './state';

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
  | { role: 'steps'; texts: string[] }
  | { role: 'status'; text: string; error?: boolean; done?: boolean };

/** The transcript as the chat shows it. */
export function chatMessages(entries: AiEntry[]): Message[] {
  const out: Message[] = [];
  for (const entry of entries) {
    switch (entry.kind) {
      case 'user': out.push({ role: 'user', text: entry.text, mark: entry.mark }); break;
      case 'assistant': if (entry.text.trim()) out.push({ role: 'assistant', text: entry.text }); break;
      case 'notice': out.push({ role: 'status', text: entry.text }); break;
      case 'steps': out.push({ role: 'steps', texts: entry.texts }); break;
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
  if (message.role === 'steps') return <ol className="ai-message record">
    {message.texts.map((text, index) => <li key={index}><Icon name="check" size={12} />{text}</li>)}
  </ol>;
  return <div className="ai-message status" data-error={message.error || undefined} data-done={message.done || undefined} role={message.error ? 'alert' : undefined}>{message.done && <Icon name="check" size={12} />}{message.text}</div>;
}

const when = (at: number) => {
  const date = new Date(at);
  return Number.isFinite(at) && at > 0 ? `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '';
};

/** What this conversation was about: the first thing that was asked. */
const sessionTitle = (session: ChatSession) => session.entries.find((entry) => entry.kind === 'user')?.text ?? 'AI と つくりました';

/** Earlier conversations about this book, folded away until someone wants to read one. */
export function PastSessions({ sessions }: { sessions: ChatSession[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!sessions.length) return null;
  return <div className="ai-past">
    <p className="ai-past-title">まえの 会話</p>
    {[...sessions].reverse().map((session, index) => {
      const showing = open === index;
      return <div key={index} className="ai-past-item">
        <button aria-expanded={showing} onClick={() => setOpen(showing ? null : index)}>
          <Icon name="chevron" size={13} style={{ transform: showing ? 'rotate(90deg)' : undefined }} />
          <span>{sessionTitle(session)}</span>
          <small>{when(session.at)}</small>
        </button>
        {showing && <div className="ai-past-messages">
          {chatMessages(session.entries).map((message, position) => <ChatMessage key={position} message={message} />)}
        </div>}
      </div>;
    })}
  </div>;
}

interface WorkingProps { step: string; elapsed: string; count?: string; long: boolean; fraction: number | null; steps?: TurnStep[] }

/** The card that shows a turn is alive: each page and picture as it is worked on, a clock, and a bar that fills while the answer streams. */
export function WorkingCard({ step, elapsed, count, long, fraction, steps }: WorkingProps) {
  const list = steps && steps.length ? steps : null;
  return <div className="ai-working" role="status" aria-label="AI の ようす">
    {list
      ? <ol className="ai-steps">
          {list.map((item, index) => <li key={index} data-active={item.active || undefined}>
            <span className="ai-step-mark"><Icon name={item.active ? 'brush' : 'check'} size={13} /></span>
            <span>{item.text}</span>
          </li>)}
        </ol>
      : <div className="ai-working-head"><span className="ai-pen"><Icon name="brush" size={16} /></span><strong>{step}</strong></div>}
    <div className="ai-working-foot">
      <small><time>{elapsed}</time>{count && ` · ${count}`}{long && ' · ていねいに するので 1〜3分 かかります'}</small>
      <span className="ai-bar" data-indeterminate={fraction === null || undefined}><i style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }} /></span>
    </div>
  </div>;
}
