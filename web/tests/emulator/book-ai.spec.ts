import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

interface Saved { book: { art?: Record<string, { svg: string; name: string }>; pages: { id: string; items: { id: { value: string }; type: string; text?: string; partId?: { value: string } }[] }[] } }

async function savedBook(page: Page): Promise<Saved> {
  await page.locator('.file-menu > summary').click();
  const next = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const file = await (await next).path();
  await page.locator('.file-menu > summary').click();
  return JSON.parse(await readFile(file, 'utf8')) as Saved;
}

/** Sign in through the emulator, open a blank book and the AI tool; without a key the harness answers with FakeModel. */
async function openAi(page: Page) {
  await page.goto('/');
  await page.getByLabel('エミュレーター アカウント').fill(`book-ai-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  await page.getByRole('button', { name: 'エミュレーターで サインイン' }).click();
  await page.getByRole('button', { name: '白紙から描きはじめる' }).click();
  await page.waitForURL(/\/app\/[A-Za-z0-9_-]+$/);
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await expect(page.getByTestId('ai-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI と つくる' })).toBeVisible();
}

async function drawMark(page: Page, corners: [number, number][]) {
  const bounds = (await page.getByLabel('えほんの ページ').boundingBox())!;
  const at = ([x, y]: [number, number]) => [bounds.x + bounds.width * x, bounds.y + bounds.height * y] as const;
  await page.mouse.move(...at(corners[0]));
  await page.mouse.down();
  for (const corner of corners.slice(1)) await page.mouse.move(...at(corner), { steps: 8 });
  await page.mouse.up();
}

test('the panel is a plain chat: a marked request edits the page through the harness and lands as one undo step', async ({ page }) => {
  await openAi(page);
  const panel = page.getByTestId('ai-panel');
  await expect(panel.getByLabel('モデル')).toHaveCount(0);
  await expect(panel.getByLabel('AIの種類')).toHaveCount(0);
  await expect(page.locator('.ai-terminal')).toHaveCount(0);
  await expect(panel.getByText(/はじめの 100 クレジットは 無料/)).toBeVisible();
  await drawMark(page, [[0.3, 0.3], [0.6, 0.3], [0.6, 0.6], [0.3, 0.6], [0.3, 0.3]]);
  await expect(page.getByTestId('mark')).toBeVisible();
  await expect(page.locator('.ai-mark')).toContainText('x 30%–60%');

  await panel.getByLabel('AIへの たのみごと').fill('ここに ねこを かいて');
  await panel.getByRole('button', { name: '頼む' }).click();
  await expect(panel.locator('.ai-message.user')).toContainText('ここに ねこを かいて');
  await expect(panel.locator('.ai-message.user .ai-mark-chip')).toContainText('x 30%–60%');
  await expect(panel.locator('.ai-message.status[data-done]')).toHaveText('えほんに 反映しました。「元に戻す」で 取り消せます。');
  await expect(panel.locator('.ai-message.assistant').last()).toHaveText('ページに ことばを たしました。');
  await expect(panel.locator('.ai-message.status', { hasText: /11 クレジット · のこり 89/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^AI クレジット/ })).toHaveText(/89/);

  const edited = await savedBook(page);
  expect(edited.book.pages[0].items.map((item) => item.text)).toContain('AI が かきました');
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  expect((await savedBook(page)).book.pages[0].items).toHaveLength(0);
  await page.getByRole('button', { name: 'やりなおす', exact: true }).click();
  expect((await savedBook(page)).book.pages[0].items).toHaveLength(1);
});

test('a story request makes a page with a drawn picture and words, and the steps show while it works', async ({ page }) => {
  await openAi(page);
  const panel = page.getByTestId('ai-panel');
  await panel.getByLabel('AIへの たのみごと').fill('slow くまの えほんを つくって');
  await panel.getByRole('button', { name: '頼む' }).click();
  const working = panel.getByRole('status', { name: 'AI の ようす' });
  await expect(working).toContainText('えほんを よんで、どう するか かんがえています…');
  await expect(panel.getByLabel('AIへの たのみごと')).toBeDisabled();
  // The stand-in draws instantly, so the drawing step may already read できました by the time the chunk lands.
  await expect(working).toContainText(/「くま」の えを かいています…|「くま」の えが できました/);
  await expect(working).toContainText('ことばを かきました');
  await expect(panel.locator('.ai-message.status[data-done]')).toHaveText('えほんに 反映しました。「元に戻す」で 取り消せます。');
  await expect(panel.locator('.ai-message.assistant').last()).toHaveText('あたらしい ページに くまを かきました。');
  await expect(page.getByText('1 / 2 ページ')).toBeVisible();
  const book = await savedBook(page);
  expect(book.book.pages).toHaveLength(2);
  expect(Object.values(book.book.art ?? {}).map((entry) => entry.name)).toEqual(['くま']);
  expect(book.book.pages[1].items.map((item) => item.type)).toEqual(['part', 'text']);
  expect(book.book.pages[1].items[0].partId?.value).toBe('art:art');
});

test('the page appears while the turn is still running, not only when it ends', async ({ page }) => {
  await openAi(page);
  const panel = page.getByTestId('ai-panel');
  await panel.getByLabel('AIへの たのみごと').fill('slow くまの えほんを つくって');
  await panel.getByRole('button', { name: '頼む' }).click();
  const working = panel.getByRole('status', { name: 'AI の ようす' });
  await expect(working).toBeVisible();
  // The second page lands from a draft, so it is on the strip before the turn says it has finished.
  await expect(page.getByText('1 / 2 ページ')).toBeVisible();
  await expect(working).toBeVisible();
  await expect(panel.locator('.ai-message.status[data-done]')).toHaveCount(0);
  await expect(panel.locator('.ai-message.status[data-done]')).toHaveText('えほんに 反映しました。「元に戻す」で 取り消せます。');
});

test('a turn that changes nothing says so, and the book is left alone', async ({ page }) => {
  await openAi(page);
  const panel = page.getByTestId('ai-panel');
  const before = await savedBook(page);
  await panel.getByLabel('AIへの たのみごと').fill('break it');
  await panel.getByRole('button', { name: '頼む' }).click();
  await expect(panel.locator('.ai-message.assistant').last()).toHaveText('うまく いきませんでした。');
  await expect(panel.locator('.ai-message.status[data-done]')).toHaveCount(0);
  expect((await savedBook(page)).book.pages).toEqual(before.book.pages);
});

test('a tap clears the mark and turning the page drops it', async ({ page }) => {
  await openAi(page);
  await drawMark(page, [[0.2, 0.2], [0.5, 0.2], [0.5, 0.5], [0.2, 0.2]]);
  await expect(page.getByTestId('mark')).toBeVisible();
  await drawMark(page, [[0.8, 0.8]]);
  await expect(page.getByTestId('mark')).toHaveCount(0);
  await drawMark(page, [[0.2, 0.2], [0.5, 0.2], [0.5, 0.5], [0.2, 0.2]]);
  await expect(page.getByTestId('mark')).toBeVisible();
  await page.getByRole('button', { name: 'ページを ふやす' }).click();
  await expect(page.getByText('2 / 2 ページ')).toBeVisible();
  await expect(page.getByTestId('mark')).toHaveCount(0);
});
