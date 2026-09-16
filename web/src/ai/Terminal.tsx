import { useEffect, useRef } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import { useStore } from '../cloud/store';
import { Icon } from '../ui/Icon';
import type { AiBridge, AiEntry, ContentBlock } from './bridge';

const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[1;36m';
const RESET = '\x1b[0m';

const basename = (value: unknown) => (typeof value === 'string' ? value.split('/').pop() ?? value : '');
const toolLine = (block: ContentBlock) => {
  const input = block.input ?? {};
  const detail = basename(input.file_path) || (typeof input.command === 'string' ? input.command.slice(0, 80) : '') || (typeof input.pattern === 'string' ? input.pattern : '');
  return `${block.name}${detail ? ' ' + detail : ''}`;
};

/** Relayed CLI stream → terminal text; a complete text block prints only when no deltas already carried it. */
export class TerminalFormatter {
  private atLineStart = true;
  private streamed = '';

  format(entry: AiEntry): string {
    switch (entry.kind) {
      case 'user': return this.line(`${CYAN}› ${entry.text.replace(/\n/g, '\r\n  ')}${RESET}`) + (entry.mark ? this.line(`${DIM}  mark: ${entry.mark}${RESET}`) : '');
      case 'log': return this.line(entry.level === 'error' ? `${RED}${entry.text}${RESET}` : entry.text.startsWith('$ ') ? `${GREEN}${entry.text}${RESET}` : `${DIM}${entry.text}${RESET}`);
      case 'applied': return this.line(`${GREEN}✓ ${entry.text}${RESET}`);
      case 'rejected': return this.line(`${RED}✗ ${entry.text}${RESET}`);
      case 'event': return this.event(entry);
    }
  }

  private event({ event }: Extract<AiEntry, { kind: 'event' }>): string {
    if (event.type === 'system' && event.subtype === 'init') return this.line(`${DIM}session ${event.session_id ?? '?'}${event.model ? ' · ' + event.model : ''}${RESET}`);
    if (event.type === 'stream_event') {
      const inner = event.event;
      if (inner?.type === 'content_block_delta' && inner.delta?.text) { this.streamed += inner.delta.text; return this.raw(inner.delta.text); }
      if (inner?.type === 'content_block_start' && inner.content_block?.type === 'tool_use') return this.line(`${YELLOW}▸ ${inner.content_block.name}${RESET}`);
      return '';
    }
    if (event.type === 'assistant') {
      return (event.message?.content ?? []).map((block) => {
        if (block.type === 'text') {
          const skip = block.text !== undefined && this.streamed.trim() === block.text.trim();
          this.streamed = '';
          return skip ? this.newline() : this.line(block.text ?? '');
        }
        if (block.type === 'tool_use') return this.line(`${YELLOW}  ${toolLine(block)}${RESET}`);
        return '';
      }).join('');
    }
    if (event.type === 'user') {
      const results = (event.message?.content ?? []).filter((block) => block.type === 'tool_result');
      return results.map((block) => this.line(block.is_error ? `${RED}  ✗ tool error${RESET}` : `${DIM}  ✓${RESET}`)).join('');
    }
    if (event.type === 'result') {
      this.streamed = '';
      const cost = typeof event.total_cost_usd === 'number' ? ` · $${event.total_cost_usd.toFixed(3)}` : '';
      const time = typeof event.duration_ms === 'number' ? ` · ${(event.duration_ms / 1000).toFixed(1)}s` : '';
      const turns = typeof event.num_turns === 'number' ? ` · ${event.num_turns} turn${event.num_turns === 1 ? '' : 's'}` : '';
      const head = event.is_error ? `${RED}── ${event.subtype ?? 'error'}` : `${DIM}── ${event.subtype ?? 'done'}`;
      return this.line(`${head}${time}${cost}${turns}${RESET}`) + (event.is_error && event.result ? this.line(`${RED}${event.result}${RESET}`) : '');
    }
    if (event.type === 'notice') return this.line(`${YELLOW}${event.text ?? ''}${RESET}`);
    if (event.type === 'exit') return event.code === 0 || event.code === null && !event.signal ? this.newline() : this.line(`${RED}exit ${event.signal ?? event.code}${RESET}`);
    return '';
  }

  private raw(text: string) { this.atLineStart = text.endsWith('\n'); return text; }
  private newline() { if (this.atLineStart) return ''; this.atLineStart = true; return '\r\n'; }
  private line(text: string) { const out = this.newline() + text + '\r\n'; this.atLineStart = true; return out; }
}

interface Props { bridge: AiBridge; onClose: () => void }

/** The CLI's run, streamed into an xterm: read-only, so the chat stays the one place to type. */
export function AiTerminal({ bridge, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const state = useStore(bridge.state);

  useEffect(() => {
    const host = hostRef.current!;
    let disposed = false;
    let term: XTerm | null = null;
    let unsubscribe = () => {};
    let observer: ResizeObserver | null = null;
    void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/xterm/css/xterm.css')]).then(([{ Terminal }, { FitAddon }]) => {
      if (disposed) return;
      term = new Terminal({ convertEol: true, disableStdin: true, fontSize: 12, lineHeight: 1.25, scrollback: 5000, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', theme: { background: '#1d221f', foreground: '#e6ebe6', cursor: '#1d221f', selectionBackground: '#4f6a5a' } });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();
      const formatter = new TerminalFormatter();
      const write = (entry: AiEntry) => { const text = formatter.format(entry); if (text) term!.write(text); };
      bridge.state.get().entries.forEach(write);
      unsubscribe = bridge.onEntry(write);
      observer = new ResizeObserver(() => { try { fit.fit(); } catch { /* hidden while a layout settles */ } });
      observer.observe(host);
    });
    return () => { disposed = true; unsubscribe(); observer?.disconnect(); term?.dispose(); };
  }, [bridge]);

  return <div className="ai-terminal" role="log" aria-label="AI CLI">
    <div className="ai-terminal-bar">
      <span className="ai-terminal-title"><Icon name="flask" size={14} />{state.command || 'claude -p'}<small>{state.workspace}</small></span>
      {state.running && state.bookId && <button onClick={() => bridge.stop(state.bookId!)}><Icon name="stop" size={13} />停止</button>}
      <button aria-label="ターミナルを閉じる" onClick={onClose}><Icon name="close" size={14} /></button>
    </div>
    <div ref={hostRef} className="ai-terminal-screen" />
  </div>;
}
