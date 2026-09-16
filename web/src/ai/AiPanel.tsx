import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../cloud/store';
import type { WebEditor } from '../core';
import { Icon } from '../ui/Icon';
import type { AiBridge, AiEntry, AiProvider, ContentBlock } from './bridge';
import { composePrompt, describeMark, itemsInMark, type ItemBox, type Mark } from './prompt';

type Message =
  | { role: 'user'; text: string; mark: string | null }
  | { role: 'assistant'; text: string; live?: boolean }
  | { role: 'tool'; text: string }
  | { role: 'status'; text: string; error?: boolean };

const providerNames: Record<AiProvider, string> = { claude: 'Claude', codex: 'Codex' };

const basename = (value: unknown) => (typeof value === 'string' ? value.split('/').pop() ?? value : '');
const toolText = (block: ContentBlock) => {
  const input = block.input ?? {};
  const detail = basename(input.file_path) || (typeof input.command === 'string' ? input.command.slice(0, 60) : '');
  return `${block.name}${detail ? ' · ' + detail : ''}`;
};

/** Text deltas gather into one live bubble until the completed block replaces them. */
export function messagesOf(entries: AiEntry[]): Message[] {
  const out: Message[] = [];
  let live = '';
  const flush = () => { if (live.trim()) out.push({ role: 'assistant', text: live }); live = ''; };
  for (const entry of entries) {
    if (entry.kind === 'user') { flush(); out.push({ role: 'user', text: entry.text, mark: entry.mark }); continue; }
    if (entry.kind === 'applied') { flush(); out.push({ role: 'status', text: entry.text }); continue; }
    if (entry.kind === 'rejected') { flush(); out.push({ role: 'status', text: entry.text, error: true }); continue; }
    if (entry.kind === 'log') { if (entry.level === 'error') { flush(); out.push({ role: 'status', text: entry.text, error: true }); } continue; }
    const { event } = entry;
    if (event.type === 'stream_event') { if (event.event?.type === 'content_block_delta' && event.event.delta?.text) live += event.event.delta.text; continue; }
    if (event.type === 'assistant') {
      for (const block of event.message?.content ?? []) {
        if (block.type === 'text') { live = ''; if (block.text?.trim()) out.push({ role: 'assistant', text: block.text }); }
        else if (block.type === 'tool_use') { flush(); out.push({ role: 'tool', text: toolText(block) }); }
      }
      continue;
    }
    if (event.type === 'result') {
      flush();
      const time = typeof event.duration_ms === 'number' ? `${(event.duration_ms / 1000).toFixed(1)}秒` : '';
      const cost = typeof event.total_cost_usd === 'number' ? `$${event.total_cost_usd.toFixed(3)}` : '';
      if (event.is_error) out.push({ role: 'status', text: event.result || event.subtype || 'エラー', error: true });
      else out.push({ role: 'status', text: [time, cost].filter(Boolean).join(' · ') });
      continue;
    }
    if (event.type === 'notice' && event.text) { flush(); out.push({ role: 'status', text: event.text }); continue; }
    if (event.type === 'exit' && (event.signal || (event.code !== 0 && event.code !== null))) { flush(); out.push({ role: 'status', text: `CLI が終了しました (${event.signal ?? event.code})`, error: true }); }
  }
  if (live.trim()) out.push({ role: 'assistant', text: live, live: true });
  return out;
}

/** The page as the user sees it, at 1024px, with the mark outlined in red for the model to look at. */
function renderPage(editor: WebEditor, pageIndex: number, mark: Mark | null): string | null {
  try {
    const w = 1024;
    const h = Math.round(1024 / editor.pageAspect);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d')!;
    editor.render(context, w, h, pageIndex, true);
    if (mark && mark.pageIndex === pageIndex && mark.points.length > 2) {
      context.beginPath();
      mark.points.forEach((p, i) => (i ? context.lineTo : context.moveTo).call(context, p.x / 100 * w, p.y / 100 * h));
      context.closePath();
      context.fillStyle = 'rgba(220, 60, 40, 0.12)';
      context.fill();
      context.lineWidth = 5;
      context.lineJoin = 'round';
      context.strokeStyle = 'rgba(220, 60, 40, 0.95)';
      context.stroke();
    }
    const url = canvas.toDataURL('image/png');
    canvas.width = canvas.height = 0;
    return url;
  } catch { return null; }
}

interface Props {
  bridge: AiBridge;
  editor: WebEditor;
  revision: number;
  mark: Mark | null;
  onClearMark: () => void;
  readOnly: boolean;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
}

export function AiPanel({ bridge, editor, revision, mark, onClearMark, readOnly, terminalOpen, onToggleTerminal }: Props) {
  const state = useStore(bridge.state);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => messagesOf(state.entries), [state.entries]);
  const pageItems = useMemo(() => {
    try { return JSON.parse(editor.itemBoundsJson(1000, 1000 / editor.pageAspect)) as ItemBox[]; } catch { return []; }
  }, [editor, revision]);
  const marked = mark && mark.pageIndex === editor.pageIndex ? itemsInMark(pageItems, mark.box) : [];
  const busy = state.running || !state.connected;
  const [model, setModel] = useState<string | null>(null);
  const modelValue = model ?? state.model;
  const commitModel = () => { if (model !== null && model.trim() !== state.model) bridge.setPick(editor.bookId, { model: model.trim() }); setModel(null); };

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages.length, messages.at(-1)?.text]);

  const send = () => {
    const request = draft.trim();
    if (!request || busy || readOnly) return;
    const activeMark = mark && mark.pageIndex === editor.pageIndex ? mark : null;
    const image = renderPage(editor, editor.pageIndex, activeMark);
    const selected = pageItems.find((item) => item.id === editor.selectedId) ?? null;
    const prompt = composePrompt({
      title: editor.title, pageIndex: editor.pageIndex, pageId: editor.pageId(editor.pageIndex), pageCount: editor.pageCount,
      request, mark: activeMark, items: activeMark ? marked : pageItems, selected, image: image !== null,
    });
    bridge.ask(editor.bookId, { prompt, text: request, mark: activeMark ? describeMark(activeMark, marked) : null, image });
    setDraft('');
  };

  return <div className="ai-panel" data-testid="ai-panel">
    <div className="ai-session">
      <select className="ai-provider" aria-label="AIの種類" value={state.provider} disabled={busy || state.providers.length < 2} onChange={(event) => bridge.setProvider(editor.bookId, event.target.value as AiProvider)}>
        {(state.providers.length ? state.providers : [state.provider]).map((id) => <option key={id} value={id}>{providerNames[id]}</option>)}
      </select>
      <span className="ai-session-state" data-running={state.running || undefined}>{!state.connected ? '接続中…' : state.running ? `${providerNames[state.provider]} が作業中…` : state.sessionId ? `会話 ${state.sessionId.slice(0, 8)}` : '新しい会話'}</span>
      <button className="ghost" title="新しい会話を始める" disabled={busy} onClick={() => bridge.reset(editor.bookId)}><Icon name="redo" size={14} />新しい会話</button>
      <button className="ghost" aria-pressed={terminalOpen} title="ターミナルの表示" onClick={onToggleTerminal}><Icon name="flask" size={14} />ターミナル</button>
    </div>
    <div className="ai-options">
      <label>モデル<input list="ai-models" aria-label="モデル" placeholder="既定" value={modelValue} disabled={busy} onChange={(event) => setModel(event.target.value)} onBlur={commitModel} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitModel(); } }} /></label>
      <datalist id="ai-models">{state.models.map((id) => <option key={id} value={id} />)}</datalist>
      <label>効果<select aria-label="効果" value={state.effort} disabled={busy} onChange={(event) => bridge.setPick(editor.bookId, { effort: event.target.value })}>
        <option value="">既定</option>
        {state.efforts.map((id) => <option key={id} value={id}>{id}</option>)}
      </select></label>
    </div>
    <div ref={listRef} className="ai-messages" aria-live="polite">
      {messages.length === 0 && <p className="hint">直したいところを ページの上で 囲んでから、ここに 頼みごとを 書きます。囲まなければ、いま見ている ページ全体が 対象です。</p>}
      {messages.map((message, index) => {
        if (message.role === 'user') return <div key={index} className="ai-message user"><p>{message.text}</p>{message.mark && <span className="ai-mark-chip"><Icon name="select" size={12} />{message.mark}</span>}</div>;
        if (message.role === 'assistant') return <div key={index} className="ai-message assistant" data-live={message.live || undefined}><p>{message.text}</p></div>;
        if (message.role === 'tool') return <div key={index} className="ai-message tool"><Icon name="save" size={12} />{message.text}</div>;
        return <div key={index} className="ai-message status" data-error={message.error || undefined} role={message.error ? 'alert' : undefined}>{message.text}</div>;
      })}
    </div>
    <div className="ai-compose">
      {mark && mark.pageIndex === editor.pageIndex
        ? <div className="ai-mark" role="status"><Icon name="select" size={14} /><span>{describeMark(mark, marked)}</span><button aria-label="囲みを消す" onClick={onClearMark}><Icon name="close" size={13} /></button></div>
        : <p className="hint ai-mark-hint">{editor.pageIndex + 1}ページ全体 · ドラッグで囲むと その部分だけ</p>}
      <textarea
        aria-label="AIへの たのみごと"
        value={draft}
        placeholder={readOnly ? '閲覧モードでは使えません' : 'たとえば「くまを もう少し 小さく」「この ことばを やさしく」'}
        disabled={readOnly}
        rows={3}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}
      />
      <div className="ai-compose-actions">
        {state.running
          ? <button className="ghost" onClick={() => bridge.stop(editor.bookId)}><Icon name="stop" size={15} />停止</button>
          : <button className="primary" disabled={!draft.trim() || busy || readOnly} onClick={send}><Icon name="send" size={15} />頼む</button>}
      </div>
    </div>
  </div>;
}
