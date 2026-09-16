// Stand-in for `codex exec --json`; args.txt and prompt.txt record what the studio sent.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const prompt = readFileSync(0, 'utf8');
appendFileSync('args.txt', args.join(' ') + '\n');
writeFileSync('prompt.txt', prompt);

const resume = args.indexOf('resume');
const threadId = resume >= 0 ? args[resume + 1] : 'fake-thread-1';
const out = (event) => process.stdout.write(JSON.stringify(event) + '\n');
process.stderr.write('Reading prompt from stdin...\n');

out({ type: 'thread.started', thread_id: threadId });
out({ type: 'turn.started' });
const document = JSON.parse(readFileSync('book.ehon.json', 'utf8'));
const pageId = /\(id "([^"]+)"\)/.exec(prompt)?.[1];
const page = document.book.pages.find((entry) => entry.id === pageId) ?? document.book.pages[0];
page.items.push({ type: 'text', id: { value: `codex-${page.items.length + 1}` }, x: 50, y: 40, text: 'Codex が かきました', font: 'maru', sizePct: 5 });
document.version = 5;
out({ type: 'item.started', item: { id: 'item_0', type: 'command_execution', command: "/bin/zsh -lc 'printf x'", status: 'in_progress' } });
out({ type: 'item.completed', item: { id: 'item_0', type: 'command_execution', command: "/bin/zsh -lc 'printf x'", exit_code: 0, status: 'completed' } });
writeFileSync('book.ehon.json', JSON.stringify(document));
out({ type: 'item.completed', item: { id: 'item_1', type: 'file_change', changes: [{ path: `${process.cwd()}/book.ehon.json`, kind: 'update' }], status: 'completed' } });
out({ type: 'item.completed', item: { id: 'item_2', type: 'agent_message', text: 'ことばを たしました。' } });
out({ type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 20 } });
