import { useEffect, useMemo, useRef, useState } from 'react';
import { credits as creditStore, MIN_TURN_CREDITS, PLUS_CREDITS, WELCOME_CREDITS } from '../cloud/credits';
import { useStore } from '../cloud/store';
import type { WebEditor } from '../core';
import { CreditNudge, OutOfCredits } from '../ui/Credits';
import { Icon, type IconName } from '../ui/Icon';
import { MAX_IMAGE_CHARS, MAX_REQUEST_CHARS } from './art';
import type { AiBridge } from './bridge';
import { ChatMessage, chatMessages, formatElapsed, LONG_TURN_MS, stepText, WorkingCard } from './feedback';
import { describeMark, itemsInMark, type ItemBox, type Mark } from './prompt';

/** The page as the user sees it, with the mark outlined in red for the model to look at; a photo-heavy page is sent smaller so it stays under the harness's limit. */
function renderPage(editor: WebEditor, pageIndex: number, mark: Mark | null): string | null {
  for (const width of [1024, 640, 400]) {
    const url = renderPageAt(editor, pageIndex, mark, width);
    if (url && url.length <= MAX_IMAGE_CHARS) return url;
  }
  return null;
}

function renderPageAt(editor: WebEditor, pageIndex: number, mark: Mark | null, w: number): string | null {
  try {
    const h = Math.round(w / editor.pageAspect);
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

/** What the harness does for a book, shown before the first request because the AI is the paid part of ぺたぺた. */
const benefits: { icon: IconName; title: string; text: string }[] = [
  { icon: 'brush', title: 'えを かく', text: 'ページに あう イラストを、本の タッチで' },
  { icon: 'text', title: 'ことばを ととのえる', text: 'やさしく、みじかく、ふりがなつきで' },
  { icon: 'book', title: 'おはなしを えほんに', text: 'ひとこと 書けば、ページを まるごと' },
];
const ideas: { icon: IconName; text: string }[] = [
  { icon: 'plus', text: 'つぎの ページを つくって' },
  { icon: 'text', text: 'この ページの ことばを やさしく' },
  { icon: 'book', text: 'うさぎと かめの えほんを つくって' },
  { icon: 'sparkles', text: 'タイトルを かんがえて' },
];

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

  const activeMark = mark && mark.pageIndex === editor.pageIndex ? mark : null;
  return <div className="ai-panel" data-testid="ai-panel">
    <div className="ai-head">
      <h2><span className="ai-head-mark"><Icon name="sparkles" size={15} /></span>AI と つくる</h2>
      {messages.length > 0 && <button className="ghost ai-reset" aria-label="新しい会話を始める" title="新しい会話" disabled={busy} onClick={() => bridge.reset(editor.bookId)}><Icon name="redo" size={14} />新しい会話</button>}
    </div>
    <div ref={listRef} className="ai-messages" aria-live="polite">
      {messages.length === 0 && <div className="ai-intro">
        <p className="ai-intro-lead">この えほんを 見ながら、AI が いっしょに つくります。</p>
        <ul className="ai-benefits">
          {benefits.map((benefit) => <li key={benefit.title}><Icon name={benefit.icon} size={16} /><div><strong>{benefit.title}</strong><span>{benefit.text}</span></div></li>)}
        </ul>
        <p className="ai-intro-cue">まずは ひとつ、たのんでみる</p>
        <div className="ai-starters">
          {ideas.map((idea) => <button key={idea.text} className="ai-starter" disabled={busy || readOnly} onClick={() => send(idea.text)}><Icon name={idea.icon} size={15} /><span>{idea.text}</span><Icon name="chevron" size={14} /></button>)}
        </div>
        <p className="ai-intro-tip"><Icon name="select" size={13} />ページの上を ドラッグで 囲むと、その部分だけを たのめます。</p>
        {wallet.ready && wallet.plan !== 'plus' && <p className="ai-intro-plan">はじめの {WELCOME_CREDITS} クレジットは 無料。ぺたぺた プラスなら 毎月 {PLUS_CREDITS.toLocaleString()} クレジットで、つくりほうだい。</p>}
      </div>}
      {messages.map((message, index) => <ChatMessage key={index} message={message} />)}
      {working && <WorkingCard {...working} />}
    </div>
    {outOfCredits ? <OutOfCredits /> : <div className="ai-compose">
      <div className="ai-scope">
        {activeMark
          ? <span className="ai-mark" role="status"><Icon name="select" size={13} /><span>{describeMark(activeMark, marked)}</span><button aria-label="囲みを消す" onClick={onClearMark}><Icon name="close" size={12} /></button></span>
          : <span className="ai-scope-page"><Icon name="page" size={13} />{editor.pageIndex + 1}ページ ぜんぶ</span>}
        <CreditNudge />
      </div>
      <div className="ai-input" data-running={state.running || undefined}>
        <textarea
          aria-label="AIへの たのみごと"
          value={draft}
          placeholder={readOnly ? '閲覧モードでは使えません' : state.running ? 'AI が はたらいています…' : 'なにを してほしい？'}
          disabled={readOnly || state.running}
          rows={2}
          maxLength={MAX_REQUEST_CHARS}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}
        />
        {state.running
          ? <button className="ai-send" aria-label="やめる" title="やめる" onClick={() => bridge.stop(editor.bookId)}><Icon name="stop" size={16} /></button>
          : <button className="ai-send ai-cta" aria-label="頼む" title="頼む (Enter)" disabled={!draft.trim() || busy || readOnly} onClick={() => send()}><Icon name="send" size={16} /></button>}
      </div>
    </div>}
  </div>;
}
