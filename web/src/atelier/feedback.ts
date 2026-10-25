import { messagesOf } from '../ai/AiPanel';
import type { AiEntry } from '../ai/bridge';
import { CANDIDATES } from './prompt';

/** Where the current turn is, read from the relayed events: the chat shows this instead of tool chips. */
export type Phase = 'start' | 'look' | 'think' | 'draw' | 'say';
export interface TurnProgress { phase: Phase; writes: number }

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

export function turnProgress(entries: AiEntry[]): TurnProgress {
  let phase: Phase = 'start';
  let writes = 0;
  for (const entry of entries) {
    if (entry.kind === 'user') { phase = 'start'; writes = 0; continue; }
    if (entry.kind !== 'event') continue;
    const { event } = entry;
    if (event.type === 'stream_event') {
      const inner = event.event;
      if (inner?.type === 'content_block_start') {
        const block = inner.content_block;
        if (block?.type === 'thinking') phase = 'think';
        else if (block?.type === 'tool_use') phase = block.name && WRITE_TOOLS.has(block.name) ? 'draw' : 'look';
      } else if (inner?.type === 'content_block_delta' && inner.delta?.text) phase = 'say';
      continue;
    }
    if (event.type === 'assistant') {
      for (const block of event.message?.content ?? []) {
        if (block.type !== 'tool_use') continue;
        if (block.name && WRITE_TOOLS.has(block.name)) { writes++; phase = 'draw'; } else phase = 'look';
      }
      continue;
    }
    // Tool results mean the model is composing its next move, which is where the long silences are; between two pictures it stays drawing.
    if (event.type === 'user' && phase !== 'draw') phase = 'think';
  }
  return { phase, writes };
}

/** One line a child can read, for the working card and the stage. */
export function stepText(progress: TurnProgress, mode: 'new' | 'revise', chars: number | null): string {
  if (chars !== null) return chars > 0 ? (mode === 'new' ? 'えを かいています…' : 'えを なおしています…') : 'どんな えに するか かんがえています…';
  switch (progress.phase) {
    case 'start': return 'たのみごとを よんでいます…';
    case 'look': return 'えほんの えと ルールを みています…';
    case 'think': return mode === 'new' ? 'どんな えに するか かんがえています…' : 'どう なおすか かんがえています…';
    case 'draw': return mode === 'new' ? `${Math.min(progress.writes + 1, CANDIDATES)}まいめを かいています…` : 'えを なおしています…';
    case 'say': return 'ことばを まとめています…';
  }
}

/** Roughly how many characters the answer will be, so streamed characters can fill a bar. */
export const expectedChars = (mode: 'new' | 'revise', piece: string | null) => (mode === 'new' ? CANDIDATES * 2_400 : (piece?.length ?? 2_400) + 200);

export const formatElapsed = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const LONG_TURN_MS = 45_000;

/** The transcript without tool chips; what the tools did is told by the working card instead. */
export const atelierMessages = (entries: AiEntry[]) => messagesOf(entries).filter((message) => message.role !== 'tool');

export const arrivalLabel = (key: string) => (key === 'piece' ? 'なおした え' : `${key.slice('candidate-'.length)}まいめの え`);
