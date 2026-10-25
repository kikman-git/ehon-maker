import { useEffect, useMemo, useRef, useState } from 'react';
import { credits as creditStore, MIN_TURN_CREDITS } from '../cloud/credits';
import { useStore } from '../cloud/store';
import type { WebEditor } from '../core';
import { CreditNudge, OutOfCredits } from '../ui/Credits';
import { Icon } from '../ui/Icon';
import type { AiBridge } from './bridge';
import { ChatMessage, chatMessages, formatElapsed, LONG_TURN_MS, stepText, WorkingCard } from './feedback';
import { describeMark, itemsInMark, type ItemBox, type Mark } from './prompt';

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

const ideas = ['この ページの ことばを やさしく', 'つぎの ページを つくって', 'うさぎと かめの えほんを つくって', 'タイトルを かんがえて'];

interface Props {
  bridge: AiBridge;
  editor: WebEditor;
  revision: number;
  mark: Mark | null;
  onClearMark: () => void;
  readOnly: boolean;
}

/** A chat over the open book: point at a part of the page by drawing on it, then say what should change. */
export function AiPanel({ bridge, editor, revision, mark, onClearMark, readOnly }: Props) {
  const state = useStore(bridge.state);
  const wallet = useStore(creditStore);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const started = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const messages = useMemo(() => chatMessages(state.entries), [state.entries]);
  const pageItems = useMemo(() => {
    try { return JSON.parse(editor.itemBoundsJson(1000, 1000 / editor.pageAspect)) as ItemBox[]; } catch { return []; }
  }, [editor, revision]);
  const marked = mark && mark.pageIndex === editor.pageIndex ? itemsInMark(pageItems, mark.box) : [];
  // The server refuses a turn under the minimum, so the offers take the compose box's place before a request fails.
  const outOfCredits = wallet.ready && wallet.balance < MIN_TURN_CREDITS;
  const busy = state.running || outOfCredits;
  const working = state.running ? { step: stepText(state, 'book'), elapsed: formatElapsed(now - started.current), long: now - started.current > LONG_TURN_MS, fraction: null } : null;

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages.length, working?.step, working?.long]);
  useEffect(() => {
    if (!state.running) return;
    if (!started.current) started.current = Date.now();
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); started.current = 0; };
  }, [state.running]);

  const send = (text = draft) => {
    const request = text.trim();
    if (!request || busy || readOnly) return;
    const activeMark = mark && mark.pageIndex === editor.pageIndex ? mark : null;
    const image = renderPage(editor, editor.pageIndex, activeMark);
    const selected = pageItems.find((item) => item.id === editor.selectedId) ?? null;
    started.current = Date.now();
    bridge.ask(editor.bookId, {
      text: request, mark: activeMark ? describeMark(activeMark, marked) : null, image,
      book: { title: editor.title, pageIndex: editor.pageIndex, pageId: editor.pageId(editor.pageIndex), pageCount: editor.pageCount, mark: activeMark ? { pageIndex: activeMark.pageIndex, pageId: activeMark.pageId, ...activeMark.box } : null, items: activeMark ? marked : pageItems, selected },
    });
    setDraft('');
  };

  return <div className="ai-panel" data-testid="ai-panel">
    <div className="ai-session">
      <span className="ai-session-state" data-running={state.running || undefined}>{state.running ? 'AI が はたらいています…' : messages.length ? 'つづきの 会話' : '新しい会話'}</span>
      <CreditNudge />
      <button className="ghost" title="新しい会話を始める" disabled={busy || !messages.length} onClick={() => bridge.reset(editor.bookId)}><Icon name="redo" size={14} />新しい会話</button>
    </div>
    <div ref={listRef} className="ai-messages" aria-live="polite">
      {messages.length === 0 && <div className="ai-ideas">
        <p className="hint">直したいところを ページの上で 囲んでから、ここに 頼みごとを 書きます。囲まなければ、いま見ている ページ全体が 対象です。おはなしを 書けば、えも ことばも AI が つくります。</p>
        {ideas.map((idea) => <button key={idea} className="ghost" disabled={busy || readOnly} onClick={() => send(idea)}>{idea}</button>)}
      </div>}
      {messages.map((message, index) => <ChatMessage key={index} message={message} />)}
      {working && <WorkingCard {...working} />}
    </div>
    {outOfCredits ? <OutOfCredits /> : <div className="ai-compose">
      {mark && mark.pageIndex === editor.pageIndex
        ? <div className="ai-mark" role="status"><Icon name="select" size={14} /><span>{describeMark(mark, marked)}</span><button aria-label="囲みを消す" onClick={onClearMark}><Icon name="close" size={13} /></button></div>
        : <p className="hint ai-mark-hint">{editor.pageIndex + 1}ページ全体 · ドラッグで囲むと その部分だけ</p>}
      <textarea
        aria-label="AIへの たのみごと"
        value={draft}
        placeholder={readOnly ? '閲覧モードでは使えません' : state.running ? 'AI が はたらいています… おわったら つぎを たのめます' : 'たとえば「くまを もう少し 小さく」「この ことばを やさしく」'}
        disabled={readOnly || state.running}
        rows={3}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}
      />
      <div className="ai-compose-actions">
        {state.running
          ? <button className="ghost" onClick={() => bridge.stop(editor.bookId)}><Icon name="stop" size={15} />やめる</button>
          : <button className="primary" disabled={!draft.trim() || busy || readOnly} onClick={() => send()}><Icon name="send" size={15} />頼む</button>}
      </div>
    </div>}
  </div>;
}
