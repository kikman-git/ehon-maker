import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Agent, AiService, imageOf, stopTurn, type Task, type Tool } from '../functions/src/agent.ts';
import { acceptableSvg, AtelierService, composePrompt, MAX_SVG_CHARS, validateInput, type AtelierChunk } from '../functions/src/atelier.ts';
import { AssetService, type BlobStore } from '../functions/src/assets.ts';
import { BookService, BOOK_SYSTEM, BOOK_TASK, bookSystem, bookTask, composeBookPrompt, validateBookInput, type BookChunk } from '../functions/src/book.ts';
import { CreditService, pricesFor, WELCOME_CREDITS } from '../functions/src/credits.ts';
import { FakeImageModel, FakeModel } from '../functions/src/fake.ts';
import { findPictures, LibraryPainter, MATERIAL_IDS, materialOf, posePrompt } from '../functions/src/library.ts';
import { STYLE_DIRECTION } from '../functions/src/materials.ts';
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
  assert.throws(() => validateInput({ request: 'x'.repeat(10001) }), { code: 'invalid-argument' });
  assert.throws(() => validateInput({ request: 'ok', mode: 'revise' }), { code: 'invalid-argument' });
  assert.equal(validateInput({ request: 'ok', image: 'data:image/jpeg;base64,AAAA' }).image, null);
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

test('a stopped turn settles what was done, records it as stopped, and answers cancelled', async () => {
  const service = new BookService(db, credits, new FakeModel());
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 300);
  await assert.rejects(service.turn('gina', { request: 'ねこを かいて slow8', book: book(), pageId: 'p1' }, collect().send, controller.signal), { code: 'cancelled' });
  const account = (await db.doc('credits/gina').get()).data()!;
  assert.equal(account.reserved, 0);
  assert.equal(account.balance, WELCOME_CREDITS - 1, 'a turn that reached the model costs at least one credit');
  const turn = (await db.collection('aiTurns').where('uid', '==', 'gina').get()).docs[0].data();
  assert.equal(turn.status, 'stopped');

  // The same through the stop document, for a connection a proxy keeps open after the browser let go.
  setTimeout(() => void stopTurn(db, 'hana', 'turn-stop-test-1'), 300);
  await assert.rejects(service.turn('hana', { request: 'ねこを かいて slow8', book: book(), pageId: 'p1', turnId: 'turn-stop-test-1' }, collect().send), { code: 'cancelled' });
  assert.equal((await db.doc('credits/hana').get()).data()!.reserved, 0);
  assert.equal((await db.doc('turnStops/hana_turn-stop-test-1').get()).exists, false, 'the stop is cleared with the turn');
  await assert.rejects(stopTurn(db, 'hana', 'x'), { code: 'invalid-argument' });
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
  assert.deepEqual(validateBookInput({ request: 'x', book: book(), bookArt: ['<svg><image/></svg>'] }).bookArt, []);
});

test('the book tools edit the document in place, refuse what the format forbids, and say so to the model', async () => {
  const { state } = BOOK_TASK.start(validateBookInput({ request: 'x', book: book(2), pageId: 'p1' }), 'dave');
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
  // The retired procedural shapes are unknown; the painted library and the aliases saved books carry are placed.
  assert.match(await errorOf('add_part', { pageId: 'p1', partId: 'いきもの:ねこ', x: 50, y: 50, sizePct: 20 }), /Unknown picture "いきもの:ねこ"\. Use "pack\.storybook:<slug>"/);
  assert.match(await errorOf('add_part', { pageId: 'p1', partId: 'pack.storybook:dragon', x: 50, y: 50, sizePct: 20 }), /Unknown picture/);
  const added = await run('add_part', { pageId: 'p2', partId: 'pack.storybook:bird', x: 30, y: 40, sizePct: 25 });
  assert.deepEqual(added.result, { ok: true, id: 'ai-p1' });
  assert.deepEqual((await run('set_part', { id: 'ai-p1', partId: 'うみと そら:ことり' })).result, { ok: true });
  assert.match(await errorOf('add_part', { pageId: 'p1', partId: 'lib:nope', x: 50, y: 50, sizePct: 20 }), /Paint it with paint_pose first/);
  assert.ok(MATERIAL_IDS.has('pack.storybook:forest-scene') && !MATERIAL_IDS.has('かたち:ほし'));
  // The library is looked up on demand, so the prompt names the tool, not the pictures.
  assert.match(BOOK_SYSTEM, /find_pictures looks it up by word/);
  assert.ok(BOOK_SYSTEM.includes('paint_pose') && !bookSystem(false).includes('paint_pose') && !BOOK_SYSTEM.includes('pack.storybook:bird'));
  assert.ok(!BOOK_TASK.tools(state).some(tool => tool.name === 'paint_pose'), 'no painter, no paint_pose');
  const found = (await run('find_pictures', { words: ['ねこ', 'cat'] })).result as { characters: { character: string; name: string; look: string; pictures: { slug: string; pose: string }[] }[] };
  assert.equal(found.characters.length, 1);
  assert.equal(found.characters[0].name, 'ねこ');
  assert.match(found.characters[0].look, /ginger tabby cat/);
  assert.ok(found.characters[0].pictures.some(picture => picture.slug === 'cat'));
  assert.ok(((await run('find_pictures', { words: ['ドラゴン'] })).result as { hint?: string }).hint);
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


class MemoryBlobs implements BlobStore {
  files = new Map<string, Buffer>();
  async presignPut(key: string) { return { url: `https://upload.invalid/${key}`, headers: {} }; }
  async presignGet(key: string) { return `https://private.invalid/${key}`; }
  async read(key: string) { const bytes = this.files.get(key); if (!bytes) throw Error(`missing ${key}`); return bytes; }
  async write(key: string, bytes: Buffer) { this.files.set(key, bytes); }
}
const painterFor = (blobs: MemoryBlobs) => new LibraryPainter(db, new FakeImageModel(), new AssetService(db, blobs), async () => Buffer.alloc(0));

test('a pose is painted from the character\'s own prompt, kept as the account\'s picture, charged as a painting and placed', async () => {
  const cat = materialOf('cat-sitting') ?? materialOf('cat')!;
  const prompt = posePrompt(cat, 'sleeping curled up');
  assert.ok(prompt.startsWith(STYLE_DIRECTION));
  assert.match(prompt, /Create one new pose of this same character: sleeping curled up\./);
  assert.match(prompt, /The character was painted as: .*ginger tabby cat/);
  assert.equal(findPictures(['fox']).length, findPictures(['きつね']).length);
  assert.equal(findPictures([]).length, 0);

  const blobs = new MemoryBlobs();
  const task = bookTask(painterFor(blobs));
  const { state } = task.start(validateBookInput({ request: 'x', book: book(), pageId: 'p1' }), 'erin');
  const agent = new Agent(new FakeModel(), async () => {});
  const tools = Object.fromEntries(task.tools(state).map(tool => [tool.name, tool])) as Record<string, Tool<typeof state>>;
  const run = async (name: string, input: Record<string, unknown>) => { try { return await tools[name].run(input, state, agent); } catch (error) { return { result: { error: (error as Error).message }, isError: true }; } };
  assert.match(((await run('paint_pose', { slug: 'dragon', pose: 'x', name: 'x' })).result as { error: string }).error, /No such slug/);
  const painted = (await run('paint_pose', { slug: 'cat', pose: 'sleeping curled up', name: 'ねこ・ねむる' })).result as { partId: string; square: boolean };
  assert.match(painted.partId, /^lib:/);
  assert.ok(painted.square);
  assert.equal(agent.paintings, 1);
  const illustration = (await db.doc(`illustrations/${painted.partId.slice(4)}`).get()).data()!;
  assert.equal(illustration.ownerId, 'erin');
  assert.equal(illustration.title, 'ねこ・ねむる');
  assert.deepEqual(illustration.library, { material: 'pack.storybook:cat', pose: 'sleeping curled up', model: 'gpt-image-1' });
  assert.ok(blobs.files.has(`${illustration.masterRef}/m.png`) && blobs.files.has(`${illustration.masterRef}/256.webp`));
  assert.equal((await db.doc('storageUsage/erin').get()).data()!.bytes, [...blobs.files.values()].reduce((sum, bytes) => sum + bytes.length, 0));
  assert.deepEqual((await run('add_part', { pageId: 'p1', partId: painted.partId, x: 50, y: 50, sizePct: 40 })).result, { ok: true, id: 'ai-p1' });
  for (let n = 1; n < 4; n++) await run('paint_pose', { slug: 'cat', pose: `pose ${n}`, name: 'ねこ' });
  assert.match(((await run('paint_pose', { slug: 'cat', pose: 'one more', name: 'ねこ' })).result as { error: string }).error, /Only 4 poses/);
  // 1,000 image tokens in and 4,000 out on gpt-image-1 are $0.17 a painting.
  assert.equal(Math.round(agent.usd() * 100), 68);
});

test('a book turn looks the library up, paints the pose and settles the painting beside the chat tokens', async () => {
  const service = new BookService(db, credits, new FakeModel(), painterFor(new MemoryBlobs()));
  const { chunks, send } = collect();
  const result = await service.turn('frank', { request: 'ねこの ねている ポーズを おいて', book: book(), pageIndex: 0, pageId: 'p1', pageCount: 1 }, send);
  const document = JSON.parse(result.book!) as { book: { pages: { items: { type: string; partId?: { value: string } }[] }[] } };
  assert.ok(document.book.pages[0].items.some(item => item.partId?.value.startsWith('lib:')));
  assert.equal(result.say, 'ねむる ねこを かいて おきました。');
  // Four rounds of chat at $0.054 and one painting at $0.17.
  assert.equal(result.credits, 39);
  assert.deepEqual(chunks.filter(chunk => chunk.step).map(chunk => chunk.step), ['えを さがしました', '「ねこ・ねむる」を かいています…', '「ねこ・ねむる」が できました', 'えを おきました']);
  const turn = (await db.collection('aiTurns').where('uid', '==', 'frank').get()).docs[0].data();
  assert.equal(turn.paintings, 1);
  assert.equal(Math.round(turn.usd * 1000), 386);
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

test('a heavy page image or a picture that is not plain SVG is left out of the turn instead of refusing it', () => {
  const heavy = `<svg viewBox="0 0 1 1">${'<g/>'.repeat(MAX_SVG_CHARS / 4)}</svg>`;
  const styled = '<svg viewBox="0 0 1 1"><style>g{fill:red}</style><g/></svg>';
  const bookInput = validateBookInput({ request: 'くまを かいて', book: book(), pageIndex: 0, pageId: 'p1', pageCount: 1, bookArt: [heavy, sprite, styled], image: `data:image/png;base64,${'A'.repeat(2_100_000)}` });
  assert.deepEqual(bookInput.bookArt, [sprite]);
  assert.equal(bookInput.image, null);
  assert.deepEqual(validateInput({ request: 'くま', bookArt: [styled, sprite], image: 'data:image/jpeg;base64,AAAA' }).bookArt, [sprite]);
  assert.equal(imageOf('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(imageOf(undefined), null);
});
