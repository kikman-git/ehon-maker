import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { acceptableSvg, AtelierService, composePrompt, FakeModel, MAX_SVG_CHARS, validateInput, type AtelierChunk, type Model, type ModelInput } from '../functions/src/ai.ts';
import { CreditService, WELCOME_CREDITS } from '../functions/src/credits.ts';

const app = initializeApp({ projectId: 'demo-ehon-ai' }, 'ai-tests');
const db = getFirestore(app);
const credits = new CreditService(db);
const sprite = '<svg viewBox="0 0 100 100"><g id="body" data-name="からだ"><circle cx="50" cy="60" r="28" fill="#8c491a"/></g></svg>';

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ehon-ai/databases/(default)/documents`, { method: 'DELETE' });
});
after(async () => { await db.terminate(); await deleteApp(app); });

const collect = () => { const chunks: AtelierChunk[] = []; return { chunks, send: async (chunk: AtelierChunk) => { chunks.push(chunk); } }; };

test('input is bounded and only plain SVG passes', () => {
  assert.ok(acceptableSvg(sprite));
  assert.ok(!acceptableSvg('<svg viewBox="0 0 1 1"><script>x</script></svg>'));
  assert.ok(!acceptableSvg('<svg viewBox="0 0 1 1"><image href="x"/></svg>'));
  assert.ok(!acceptableSvg('<svg viewBox="0 0 1 1"><a href="x"/></svg>'));
  assert.ok(!acceptableSvg('<svg viewBox="0 0 1 1"><rect onclick="x()"/></svg>'));
  assert.ok(!acceptableSvg(`<svg viewBox="0 0 1 1">${'<g/>'.repeat(MAX_SVG_CHARS / 4)}</svg>`));
  assert.ok(!acceptableSvg('<div/>'));
  const input = validateInput({ title: 'くま', request: ' ぼうしの くま ', mode: 'new', piece: sprite, selected: { id: 'ear', name: 'みみ' }, sketched: true, bookArt: [sprite] });
  assert.equal(input.request, 'ぼうしの くま');
  assert.deepEqual(input.selected, { id: 'ear', name: 'みみ' });
  const prompt = composePrompt(input);
  assert.match(prompt, /Draw 3 candidate illustrations/);
  assert.match(prompt, /<g id="ear"> \(みみ\)/);
  assert.match(prompt, /Pictures already in this book \(1\)/);
  assert.throws(() => validateInput({ request: '' }), { code: 'invalid-argument' });
  assert.throws(() => validateInput({ request: 'x'.repeat(501) }), { code: 'invalid-argument' });
  assert.throws(() => validateInput({ request: 'ok', mode: 'revise' }), { code: 'invalid-argument' });
  assert.throws(() => validateInput({ request: 'ok', piece: '<svg><script/></svg>' }), { code: 'invalid-argument' });
  assert.throws(() => validateInput({ request: 'ok', image: 'data:image/jpeg;base64,AAAA' }), { code: 'invalid-argument' });
  assert.throws(() => validateInput({ request: 'ok', bookArt: ['<svg><image/></svg>'] }), { code: 'invalid-argument' });
});

test('a turn grants the welcome credits, charges the tokens, streams progress and drops drawings the painter rejects', async () => {
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
  const account = (await db.doc('credits/alice').get()).data()!;
  assert.equal(account.balance, WELCOME_CREDITS - 6); assert.equal(account.reserved, 0);

  const revised = await service.turn('alice', { title: 'くま', request: 'ピンクに', mode: 'revise', piece: sprite, selected: { id: 'body', name: 'からだ' }, bookArt: [] }, send);
  assert.match(revised.piece!, /fill="#e89cb0"/);
  assert.deepEqual(revised.candidates, []);
});

test('an empty account is refused before the model runs, a costly turn is clamped, and a model failure returns the hold', async () => {
  let runs = 0;
  class Failing implements Model { async run(_input: ModelInput) { runs++; throw new Error('boom'); } }
  const failing = new AtelierService(db, credits, new Failing());
  await assert.rejects(failing.turn('alice', { request: 'くま', bookArt: [] }, collect().send), { message: 'boom' });
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

test('a declined request returns nothing to place and still costs its tokens', async () => {
  const service = new AtelierService(db, credits, new FakeModel());
  const result = await service.turn('alice', { request: 'unsafe thing', bookArt: [] }, collect().send);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.piece, null);
  assert.equal(result.say, 'その えは かけません。');
  assert.equal(result.credits, 6);
});
