// Stand-in for `claude -p --output-format stream-json`; args.txt and prompt.txt record what the studio sent.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const prompt = readFileSync(0, 'utf8');
appendFileSync('args.txt', args.join(' ') + '\n');
writeFileSync('prompt.txt', prompt);

const resume = args.indexOf('--resume');
const sessionId = resume >= 0 ? args[resume + 1] : 'fake-session-1';
const out = (event) => process.stdout.write(JSON.stringify({ ...event, session_id: sessionId }) + '\n');
const say = (text, pieces) => {
  for (const piece of pieces) out({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: piece } } });
  out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1234, num_turns: 1, total_cost_usd: 0.0123, result: text });
};

out({ type: 'system', subtype: 'init', cwd: process.cwd(), model: 'fake-claude', tools: ['Read', 'Edit'] });
const request = prompt.split('Request:\n')[1] ?? prompt;
const sprite = (body, hat) => `<svg viewBox="0 0 100 100"><g id="body" data-name="からだ"><circle cx="50" cy="60" r="28" fill="${body}"/></g><g id="ear" data-name="みみ"><circle cx="30" cy="34" r="9" fill="${body}"/><circle cx="70" cy="34" r="9" fill="${body}"/></g><g id="hat" data-name="ぼうし"><rect x="34" y="12" width="32" height="16" rx="4" fill="${hat}"/></g></svg>`;
if (prompt.includes('素材アトリエ')) {
  // The real CLI thinks, then writes one file per picture; `slow` in the request paces it so the studio's working card can be watched.
  const pause = /slow/i.test(request) ? 2000 : 0;
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } } });
  await sleep(pause);
  const files = prompt.includes('`candidate-1.svg`')
    ? [['candidate-1.svg', sprite('#8c491a', '#c67139')], ['candidate-2.svg', /break/i.test(request) ? '<svg viewBox="0 0 100 100"><g>' : sprite('#7a8a5e', '#c8553d')], ['candidate-3.svg', sprite('#c67139', '#2e2b25')]]
    : [['piece.svg', readFileSync('piece.svg', 'utf8').replace(new RegExp(`(<g id="${/<g id="([^"]+)">/.exec(prompt)?.[1] ?? 'body'}"[^>]*>.*?</g>)`), (group) => group.replace(/fill="#[0-9a-f]{6}"/g, 'fill="#e89cb0"'))]];
  for (const [file, svg] of files) {
    out({ type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', name: 'Write' } } });
    await sleep(pause);
    writeFileSync(file, svg);
    out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: `tool-${file}`, name: 'Write', input: { file_path: `${process.cwd()}/${file}` } }] } });
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `tool-${file}`, content: 'ok' }] } });
  }
  await sleep(pause);
  say('かきました。', ['かきました。']);
} else {
  if (/break/i.test(request)) {
    writeFileSync('book.ehon.json', '{"version": 99, "book": {}}');
  } else {
    const document = JSON.parse(readFileSync('book.ehon.json', 'utf8'));
    const pageId = /\(id "([^"]+)"\)/.exec(prompt)?.[1];
    const page = document.book.pages.find((entry) => entry.id === pageId) ?? document.book.pages[0];
    page.items.push({ type: 'text', id: { value: `ai-${page.items.length + 1}` }, x: 50, y: 50, text: 'AI が かきました', font: 'maru', sizePct: 5 });
    document.version = 5;
    writeFileSync('book.ehon.json', JSON.stringify(document));
  }
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'Edit' } } });
  out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tool-1', name: 'Edit', input: { file_path: `${process.cwd()}/book.ehon.json` } }] } });
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'ok' }] } });
  say('ページに ことばを たしました。', ['ページに ', 'ことばを ', 'たしました。']);
}
