// Stand-in for `claude -p --output-format stream-json`; args.txt and prompt.txt record what the studio sent.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const prompt = readFileSync(0, 'utf8');
appendFileSync('args.txt', args.join(' ') + '\n');
writeFileSync('prompt.txt', prompt);

const resume = args.indexOf('--resume');
const sessionId = resume >= 0 ? args[resume + 1] : 'fake-session-1';
const out = (event) => process.stdout.write(JSON.stringify({ ...event, session_id: sessionId }) + '\n');

out({ type: 'system', subtype: 'init', cwd: process.cwd(), model: 'fake-claude', tools: ['Read', 'Edit'] });
const request = prompt.split('Request:\n')[1] ?? prompt;
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
for (const piece of ['ページに ', 'ことばを ', 'たしました。']) out({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: piece } } });
out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ページに ことばを たしました。' }] } });
out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1234, num_turns: 1, total_cost_usd: 0.0123, result: 'ページに ことばを たしました。' });
