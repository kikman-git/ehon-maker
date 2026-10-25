import { SUBMIT } from './atelier';
import { DEFAULT_MODEL, type ChatModel, type Content, type ModelReply, type ModelRequest } from './model';

// The emulator's stand-in model: scripted answers through the same tools, so the whole flow runs without a key.

const sprite = (body: string, hat: string) => `<svg viewBox="0 0 100 100"><g id="body" data-name="からだ"><circle cx="50" cy="60" r="28" fill="${body}"/></g><g id="ear" data-name="みみ"><circle cx="30" cy="34" r="9" fill="${body}"/><circle cx="70" cy="34" r="9" fill="${body}"/></g><g id="hat" data-name="ぼうし"><rect x="34" y="12" width="32" height="16" rx="4" fill="${hat}"/></g></svg>`;
const call = (name: string, input: unknown, n: number): Content => ({ type: 'tool_call', id: `fake-${name}-${n}`, name, input });

export class FakeModel implements ChatModel {
  readonly id = DEFAULT_MODEL.anthropic;
  private calls = 0;

  async reply(request: ModelRequest): Promise<ModelReply> {
    const first = request.messages[0]?.content.find((block): block is Extract<Content, { type: 'text' }> => block.type === 'text')?.text ?? '';
    const prompt = first;
    const text = request.messages.map(message => message.content.map(block => block.type === 'text' ? block.text : '').join('\n')).join('\n');
    const wants = /Request:\n([\s\S]*)$/.exec(first)?.[1]?.trim() ?? '';
    const content: Content[] = request.tools.some(tool => tool.name === SUBMIT) ? this.atelier(prompt, wants) : this.book(request, prompt, wants);
    // `slow` paces the answer so a browser test can watch the working card.
    if (/slow/i.test(wants)) { request.onProgress?.(0); await new Promise(resolve => setTimeout(resolve, 2_000)); }
    const answer = JSON.stringify(content);
    request.onProgress?.(answer.length);
    const expensive = /expensive/i.test(text);
    const stop = content.some(block => block.type === 'tool_call') ? 'tool' : 'end';
    return { message: { role: 'assistant', content }, stop, model: this.id, usage: { input: expensive ? 2_000_000 : 6_000, output: expensive ? 400_000 : 1_500, cacheRead: 0, cacheWrite: 0 } };
  }

  /** Three sprites, the selected part recoloured, or a refusal; `break` makes the second candidate unusable. */
  private atelier(prompt: string, request: string): Content[] {
    let output: { candidates: string[]; piece: string | null; say: string };
    if (/unsafe/i.test(request)) output = { candidates: [], piece: null, say: 'その えは かけません。' };
    else if (prompt.includes('Change the current illustration')) {
      const part = /<g id="([^"]+)">/.exec(prompt)?.[1] ?? 'body';
      const piece = /Current illustration:\n([\s\S]*?)\n(?:\n|The image|The user|Pictures|Request:)/.exec(prompt)?.[1] ?? sprite('#8c491a', '#c67139');
      output = { candidates: [], piece: piece.replace(new RegExp(`(<g id="${part}"[^>]*>.*?</g>)`), group => group.replace(/fill="#[0-9a-f]{6}"/g, 'fill="#e89cb0"')), say: 'なおしました。' };
    } else if (prompt.includes('as the only candidate')) output = { candidates: [sprite('#7a8a5e', '#c8553d')], piece: null, say: 'かきました。' };
    else output = { candidates: [sprite('#8c491a', '#c67139'), /break/i.test(request) ? '<svg viewBox="0 0 100 100"><script>x</script></svg>' : sprite('#7a8a5e', '#c8553d'), sprite('#c67139', '#2e2b25')], piece: null, say: '3つ かきました。' };
    return [call(SUBMIT, output, ++this.calls)];
  }

  /** A caption on the page in view; `つくって` builds a page with a drawn picture; `break` targets an item that does not exist. */
  private book(request: ModelRequest, prompt: string, wants: string): Content[] {
    const last = request.messages.at(-1)!;
    const results = last.content.filter((block): block is Extract<Content, { type: 'tool_result' }> => block.type === 'tool_result');
    const pageId = /\(id "([^"]+)"\)/.exec(prompt)?.[1] ?? 'p1';
    if (!results.length) {
      if (/break/i.test(wants)) return [call('set_text', { id: 'nope', text: 'x' }, ++this.calls)];
      if (/つくって/.test(wants)) return [call('add_page', {}, ++this.calls), call('draw_picture', { name: 'くま', description: 'a small bear waving' }, ++this.calls)];
      return [call('add_text', { pageId, text: 'AI が かきました', x: 50, y: 50, font: 'maru' }, ++this.calls)];
    }
    if (results.some(result => result.isError)) return [{ type: 'text', text: 'うまく いきませんでした。' }];
    const made = request.messages.flatMap(message => message.content).filter((block): block is Extract<Content, { type: 'tool_result' }> => block.type === 'tool_result')
      .map(result => JSON.parse(result.output) as { pageId?: string; partId?: string; id?: string });
    const page = made.find(result => result.pageId)?.pageId;
    const part = made.find(result => result.partId)?.partId;
    const placed = made.some(result => result.id?.startsWith('ai-p'));
    if (page && part && !placed) return [call('add_part', { pageId: page, partId: part, x: 50, y: 45, sizePct: 40 }, ++this.calls), call('add_text', { pageId: page, text: 'くまが てを ふった。', x: 50, y: 84 }, ++this.calls)];
    return [call('finish', { say: page ? 'あたらしい ページに くまを かきました。' : 'ページに ことばを たしました。' }, ++this.calls)];
  }
}
