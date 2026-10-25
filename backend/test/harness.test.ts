import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Agent, AiService, type Task, type Tool } from '../functions/src/agent.ts';
import { acceptableSvg, AtelierService, composePrompt, MAX_SVG_CHARS, validateInput, type AtelierChunk } from '../functions/src/atelier.ts';
import { BookService, BOOK_TASK, composeBookPrompt, validateBookInput, type BookChunk } from '../functions/src/book.ts';
import { CreditService, pricesFor, WELCOME_CREDITS } from '../functions/src/credits.ts';
import { FakeModel } from '../functions/src/fake.ts';
import type { ChatModel, ModelReply, ModelRequest } from '../functions/src/model.ts';

const app = initializeApp({ projectId: 'demo-ehon-ai' }, 'ai-tests');
const db = getFirestore(app);
const credits = new CreditService(db);
const sprite = '<svg viewBox="0 0 100 100"><g id="body" data-name="からだ"><circle cx="50" cy="60" r="28" fill="#8c491a"/></g></svg>';
const book = (pages = 1) => JSON.stringify({ version: 6, book: { id: { value: 'b1' }, title: 'くまの ほん', shape: 'SQUARE', contentLocale: 'ja-JP', updatedAtEpochMs: 0, art: { bear: { name: 'くま', svg: sprite } },
  pages: Array.from({ length: pages }, (_, i) => ({ id: `p${i + 1}`, background: '#f9f4ed', items: i === 0 ? [{ type: 'text', id: { value: 't1' }, x: 50, y: 80, text: 'こんにちは', font: 'maru', sizePct: 5 }, { type: 'part', id: { value: 'k1' }, x: 40, y: 40, partId: { value: 'art:bear' }, sizePct: 30, drawing: { strokes: [] } }] : [] })) } });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ehon-ai/databases/(default)/documents`, { method: 'DELETE' });
});
after(async () => { await db.terminate(); await deleteApp(app); });

const collect = <O>() => { const chunks: { type: string; step?: string; chars?: number; result?: O }[] = []; return { chunks, send: async (chunk: AtelierChunk | BookChunk) => { chunks.push(chunk as never); } }; };

test('atelier input is bounded and only plain SVG passes', () => {
  assert.ok(acceptableSvg(sprite));
  assert.ok(!acceptableSvg('<svg viewBox="0 0 1 1"><script>x</script></svg>'));
  assert.ok(!acceptableSvg('<svg viewBox="0 0 1 1"><image href="x"/></svg>'));
  assert.ok(!acceptableSvg('<svg viewBox="0 0 1 1"><rect onclick="x()"/></svg>'));
  assert.ok(!acceptableSvg(`<svg viewBox="0 0 1 1">${'<g/>'.repeat(MAX_SVG_CHARS / 4)}</svg>`));
  const input = validateInput({ title: 'くま', request: ' ぼうしの くま ', mode: 'new', piece: sprite, selected: { id: 'ear', name: 'みみ' }, sketched: true, bookArt: [sprite] });
  assert.equal(input.request, 'ぼうしの くま');
  assert.match(composePrompt(input), /Draw 3 candidate illustrations[\s\S]*<g id="ear"> \(みみ\)[\s\S]*Pictures already in this book \(1\)/);
  assert.throws(() => validateInput({ request: '' }), { code: 'invalid-argument' });
  assert.throws(() => validateInput({ request: 'x'.repeat(501) }), { code: 'invalid-argument' });
  assert.throws(() => validateInput({ request: 'ok', mode: 'revise' }), { code: 'invalid-argument' });
  assert.throws(() => validateInput({ request: 'ok', image: 'data:image/jpeg;base64,AAAA' }), { code: 'invalid-argument' });
});

test('an atelier turn grants the welcome credits, charges the tokens, streams progress and drops drawings the painter rejects', async () => {
  const service = new AtelierService(db, credits, new FakeModel());
  const { chunks, send } = collect();
  const result = await service.turn('alice', { title: 'くま', request: 'break one', mode: 'new', bookArt: [] }, send);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.piece, null);
  assert.equal(result.say, '3つ かきました。');
  // 6,000 input and 1,500 output tokens on Opus 5.5 are $0.054, so six credits.
  assert.equal(result.credits, 6);
  assert.equal(result.balance, WELCOME_CREDITS - 6);
  assert.ok(chunks.some(chunk => chunk.type === 'progress'));
  assert.deepEqual(chunks.at(-1), { type: 'result', result });
  const revised = await service.turn('alice', { title: 'くま', request: 'ピンクに', mode: 'revise', piece: sprite, selected: { id: 'body', name: 'からだ' }, bookArt: [] }, send);
  assert.match(revised.piece!, /fill="#e89cb0"/);
  const declined = await service.turn('alice', { request: 'unsafe thing', bookArt: [] }, send);
  assert.deepEqual(declined.candidates, []);
  assert.equal(declined.say, 'その えは かけません。');
});

test('an empty account is refused before the model runs, a costly turn is clamped, and a model failure returns the hold', async () => {
  let runs = 0;
  class Failing implements ChatModel { id = 'x'; async reply(_request: ModelRequest): Promise<ModelReply> { runs++; throw new Error('boom'); } }
  await assert.rejects(new AtelierService(db, credits, new Failing()).turn('alice', { request: 'くま', bookArt: [] }, collect().send), { message: 'boom' });
  assert.equal(runs, 1);
  const account = (await db.doc('credits/alice').get()).data()!;
  assert.equal(account.balance, WELCOME_CREDITS); assert.equal(account.reserved, 0);
  const service = new AtelierService(db, credits, new FakeModel());
  const costly = await service.turn('alice', { request: 'expensive くま', bookArt: [] }, collect().send);
  assert.equal(costly.balance, 0);
  assert.equal(costly.credits, WELCOME_CREDITS);
  await assert.rejects(service.turn('alice', { request: 'くま', bookArt: [] }, collect().send), { code: 'resource-exhausted' });
  await db.doc('config/flags').set({ aiEnabled: false });
  await assert.rejects(service.turn('bob', { request: 'くま', bookArt: [] }, collect().send), { code: 'unavailable' });
});

test('the book input strips drawings, keeps names, and describes the page the user is looking at', () => {
  const input = validateBookInput({ request: 'ことばを やさしく', book: book(), pageIndex: 0, pageId: 'p1', pageCount: 1, bookArt: [sprite], mark: { pageIndex: 0, pageId: 'p1', x0: 10, y0: 10, x1: 50, y1: 60 }, items: [{ id: 't1', kind: 'text', ref: 'こんにちは', x: 50, y: 80, w: 30, h: 6, rotationDeg: 0 }] });
  assert.equal(input.title, 'くまの ほん');
  assert.ok(!input.book.includes('<svg'));
  assert.ok(input.book.includes('"bear":{"name":"くま"}'));
  const prompt = composeBookPrompt(input);
  assert.match(prompt, /page 1 of 1 \(id "p1"\)[\s\S]*x 10% to 50%, y 10% to 60%[\s\S]*- t1 \(text "こんにちは"\)[\s\S]*Request:\nことばを やさしく/);
  assert.throws(() => validateBookInput({ request: 'x', book: '{"version":6}' }), { code: 'invalid-argument' });
  assert.throws(() => validateBookInput({ request: 'x', book: 'nope' }), { code: 'invalid-argument' });
  assert.throws(() => validateBookInput({ request: 'x', book: book(), bookArt: ['<svg><image/></svg>'] }), { code: 'invalid-argument' });
});

test('the book tools edit the document in place, refuse what the format forbids, and say so to the model', async () => {
  const { state } = BOOK_TASK.start(validateBookInput({ request: 'x', book: book(2), pageId: 'p1' }));
  const agent = new Agent(new FakeModel(), async () => {});
  const tools = Object.fromEntries(BOOK_TASK.tools(state).map(tool => [tool.name, tool])) as Record<string, Tool<typeof state>>;
  // Like the agent, a tool that throws is reported to the model as an error outcome.
  const run = async (name: string, input: Record<string, unknown>) => { try { return await tools[name].run(input, state, agent); } catch (error) { return { result: { error: (error as Error).message }, isError: true }; } };
  const errorOf = async (name: string, input: Record<string, unknown>) => ((await run(name, input)).result as { error?: string }).error ?? '';
  assert.deepEqual((await run('set_text', { id: 't1', text: 'やあ' })).result, { ok: true });
  assert.match(await errorOf('set_text', { id: 'nope', text: 'x' }), /No item "nope"/);
  assert.match(await errorOf('add_text', { pageId: 'p1', text: 'x', x: 50, y: 50, font: 'comic' }), /"font" must be one of/);
  assert.match(await errorOf('add_text', { pageId: 'p1', text: 'x', x: 50, y: 50, sizePct: 40 }), /between 2 and 30/);
  assert.match(await errorOf('add_part', { pageId: 'p1', partId: 'art:ghost', x: 50, y: 50, sizePct: 20 }), /Draw it with draw_picture/);
  assert.match(await errorOf('add_part', { pageId: 'p1', partId: 'いきもの:ドラゴン', x: 50, y: 50, sizePct: 20 }), /Unknown built-in part/);
  const added = await run('add_part', { pageId: 'p2', partId: 'いきもの:ねこ', x: 30, y: 40, sizePct: 25 });
  assert.deepEqual(added.result, { ok: true, id: 'ai-p1' });
  const page = await run('add_page', { afterPageId: 'p1', background: '#f0fae1' });
  assert.deepEqual(page.result, { ok: true, pageId: 'p3', pageNumber: 2 });
  assert.equal(page.step, '2ページめを つくりました');
  assert.match(await errorOf('set_page', { pageId: 'p3', background: 'red' }), /#rrggbb/);
  const drawn = await run('draw_picture', { name: 'くま', description: 'a bear' });
  assert.deepEqual(drawn.result, { ok: true, partId: 'art:art', square: true });
  assert.deepEqual((await run('add_part', { pageId: 'p3', partId: 'art:art', x: 50, y: 50, sizePct: 40 })).result, { ok: true, id: 'ai-p2' });
  await run('set_layer', { id: 'ai-p2', layer: 'back' });
  await run('move_item', { id: 'ai-p1', pageId: 'p1' });
  await run('remove_item', { id: 'ai-p1' });
  await run('finish', { say: 'できました。' });
  const output = BOOK_TASK.finish(state, '', 'end');
  const document = JSON.parse(output.book!) as { version: number; book: { art: Record<string, { name: string; svg?: string }>; pages: { id: string; items: { id: { value: string }; text?: string; drawing?: unknown }[] }[] } };
  assert.equal(document.version, 6);
  assert.deepEqual(document.book.pages.map(p => p.id), ['p1', 'p3', 'p2']);
  assert.equal(document.book.pages[0].items[0].text, 'やあ');
  assert.ok(document.book.pages[0].items[1].drawing, 'the family\'s corrections survive');
  assert.deepEqual(document.book.art.bear, { name: 'くま' });
  assert.match(document.book.art.art.svg!, /^<svg/);
  assert.equal(output.say, 'できました。');
  assert.ok(agent.usage.input > 0, 'drawing counted toward the turn');
});

test('a book turn runs the loop through the tools, meters every round, and reports its steps', async () => {
  const service = new BookService(db, credits, new FakeModel());
  const { chunks, send } = collect();
  const result = await service.turn('carol', { request: 'ここに ねこを かいて', book: book(), pageIndex: 0, pageId: 'p1', pageCount: 1 }, send);
  const document = JSON.parse(result.book!) as { book: { pages: { items: { text?: string }[] }[] } };
  assert.ok(document.book.pages[0].items.some(item => item.text === 'AI が かきました'));
  assert.equal(result.say, 'ページに ことばを たしました。');
  // Two rounds of 6,000 + 1,500 tokens.
  assert.equal(result.credits, 11);
  assert.deepEqual(chunks.filter(chunk => chunk.step).map(chunk => chunk.step), ['ことばを かきました']);

  const broken = await service.turn('carol', { request: 'break it', book: book(), pageId: 'p1' }, send);
  assert.equal(broken.book, null);
  assert.equal(broken.say, 'うまく いきませんでした。');

  const made = await service.turn('carol', { request: 'くまの えほんを つくって', book: book(), pageId: 'p1' }, send);
  const grown = JSON.parse(made.book!) as { book: { art: Record<string, { svg?: string }>; pages: { items: { type: string }[] }[] } };
  assert.equal(grown.book.pages.length, 2);
  assert.ok(grown.book.art['art'].svg);
  assert.deepEqual(grown.book.pages[1].items.map(item => item.type), ['part', 'text']);
  assert.ok(chunks.some(chunk => chunk.step === '「くま」の えを かいています…'));
  assert.ok(chunks.some(chunk => chunk.step === '「くま」の えが できました'));
});

test('the loop stops at the task\'s round limit and prices dated model ids by family', async () => {
  class Chatty implements ChatModel { id = 'gpt-5'; async reply(): Promise<ModelReply> { return { message: { role: 'assistant', content: [{ type: 'tool_call', id: 'c', name: 'noop', input: {} }] }, stop: 'tool', model: 'gpt-5-2026-03-01', usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 } }; } }
  const task: Task<null, { n: number }, { n: number }> = { id: 't', hold: 5, maxRounds: 3, system: '', validate: () => null, start: () => ({ state: { n: 0 }, messages: [] }), tools: () => [{ name: 'noop', description: '', schema: {}, run: (_i, s) => { s.n++; return { result: {} }; } }], toolChoice: () => 'auto', finish: (s) => s };
  const result = await new AiService(db, credits, new Chatty()).turn(task, 'dave', null, async () => {});
  assert.equal(result.n, 3);
  assert.equal(result.credits, 1);
  assert.equal(pricesFor('gpt-5-2026-03-01').input, 1.25);
  assert.equal(pricesFor('claude-opus-5-5-20260401').output, 20);
  assert.equal(pricesFor('something-new').output, 20);
});
