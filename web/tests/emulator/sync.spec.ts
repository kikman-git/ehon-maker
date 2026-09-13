import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Hooked = { __ehonRepository: () => Promise<{ bookJson(id: string): string | null; close(): void; state: { get(): { pendingChanges: boolean; readOnly: boolean } } }> };

const subject = () => `web-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function signIn(page: Page, account: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'サインイン' }).click();
  await page.getByLabel('エミュレーター アカウント').fill(account);
  await page.getByRole('button', { name: 'エミュレーターで サインイン' }).click();
  await expect(page.getByRole('button', { name: `${account}@example.invalid` })).toBeVisible();
  await page.getByRole('button', { name: 'とじる' }).click();
}

async function createBook(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'あたらしい えほん' }).first().click();
  await page.locator('.template').first().click();
  await page.waitForURL(/\/app\/[A-Za-z0-9_-]+$/);
  await expect(page.getByLabel('えほんの ページ')).toBeVisible();
  await page.getByRole('button', { name: '素材', exact: true }).click();
  return page.url().split('/').pop()!;
}

const bookJson = (page: Page, id: string) => page.evaluate(async (bookId) => (await (window as unknown as Hooked).__ehonRepository()).bookJson(bookId), id);
const pending = (page: Page) => page.evaluate(async () => (await (window as unknown as Hooked).__ehonRepository()).state.get().pendingChanges);
const itemCount = (json: string | null, pageIndex = 0) => (JSON.parse(json ?? '{"book":{"pages":[]}}') as { book: { pages: { items: unknown[] }[] } }).book.pages[pageIndex]?.items.length ?? -1;

async function peer(browser: Browser, account: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, account);
  return { context, page };
}

test('two browsers on one account converge, coalesce bursts and catch up after going offline', async ({ browser }) => {
  const account = subject();
  const a = await peer(browser, account);
  const b = await peer(browser, account);
  const id = await createBook(a.page);
  await expect(b.page.locator('.book-card')).toHaveCount(1);
  await b.page.goto(`/read/${id}`);
  await expect(b.page.locator('.read-page').first()).toBeVisible();

  const before = itemCount(await bookJson(a.page, id));
  await a.page.getByRole('button', { name: 'まる', exact: true }).click();
  await expect.poll(() => bookJson(b.page, id).then((json) => itemCount(json)), { timeout: 20_000 }).toBe(before + 1);
  await expect.poll(() => pending(a.page)).toBe(false);

  await a.context.setOffline(true);
  for (const name of ['さんかく', 'しかく', 'ほし']) await a.page.getByRole('button', { name, exact: true }).click();
  await a.page.waitForTimeout(2500);
  expect(await pending(a.page)).toBe(true);
  await a.context.setOffline(false);
  await expect.poll(() => bookJson(b.page, id).then((json) => itemCount(json)), { timeout: 30_000 }).toBe(before + 4);
  await expect.poll(() => pending(a.page), { timeout: 30_000 }).toBe(false);
  expect(await bookJson(b.page, id)).toBe(await bookJson(a.page, id));
  await a.context.close();
  await b.context.close();
});

test('an edit lease makes the second composer read-only until the first one closes', async ({ browser }) => {
  const account = subject();
  const a = await peer(browser, account);
  const b = await peer(browser, account);
  const id = await createBook(a.page);
  await expect.poll(() => pending(a.page)).toBe(false);
  await b.page.goto(`/app/${id}`);
  await expect(b.page.getByText('ほかの たんまつで へんしゅうちゅう')).toBeVisible({ timeout: 20_000 });
  await b.page.getByRole('button', { name: '素材', exact: true }).click();
  await expect(b.page.getByRole('button', { name: 'まる', exact: true })).toBeDisabled();
  await expect(a.page.getByText('ほかの たんまつで へんしゅうちゅう')).toHaveCount(0);

  await a.page.evaluate(async () => (await (window as unknown as Hooked).__ehonRepository()).close());
  await b.page.reload();
  await expect(b.page.getByLabel('えほんの ページ')).toBeVisible();
  await expect(b.page.getByText('ほかの たんまつで へんしゅうちゅう')).toHaveCount(0);
  await b.page.getByRole('button', { name: '素材', exact: true }).click();
  await expect(b.page.getByRole('button', { name: 'まる', exact: true })).toBeEnabled();
  await a.context.close();
  await b.context.close();
});

test('a guest link opens the book without an account and dies when revoked', async ({ browser }) => {
  const account = subject();
  const a = await peer(browser, account);
  const id = await createBook(a.page);
  await expect.poll(() => pending(a.page)).toBe(false);
  await a.page.goto('/');
  await expect(a.page.locator('.book-card')).toHaveCount(1);
  const title = (await a.page.locator('.book-meta h2').first().textContent())!;
  await a.page.getByRole('button', { name: 'おくる' }).click();
  await a.page.getByLabel('だれに').fill('ばあば');
  await a.page.getByRole('button', { name: 'リンクを つくる' }).click();
  const url = await a.page.locator('.share-url').first().textContent();
  const token = /\/g\/([A-Za-z0-9_-]{32})$/.exec(url ?? '')?.[1];
  expect(token).toBeTruthy();

  const guest = await browser.newContext();
  const page = await guest.newPage();
  await page.goto(`/g/${token}`);
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.locator('.read-page').first()).toBeVisible();
  await expect(page.getByText('ぺたぺた から とどきました')).toBeVisible();
  await expect(page.locator('.voice-chip')).toHaveCount(0);
  expect(id).toBeTruthy();

  await a.page.getByRole('button', { name: 'とめる' }).click();
  await expect(a.page.getByText('まだ リンクは ありません。')).toBeVisible();
  await page.reload();
  await expect(page.getByText('この リンクは つかえません。')).toBeVisible();
  await guest.close();
  await a.context.close();
});

test('an uploaded PNG becomes a library part that renders on every device', async ({ browser }) => {
  const account = subject();
  const a = await peer(browser, account);
  const id = await createBook(a.page);
  await a.page.getByLabel('なまえ').fill('ねこ');
  await a.page.locator('input[type=file][accept="image/png,image/webp"]').setInputFiles({
    name: 'oval.png', mimeType: 'image/png', buffer: await readFile(new URL('./oval.png', import.meta.url)),
  });
  const part = a.page.locator('.library-parts button', { hasText: 'ねこ' });
  await expect(part).toBeVisible({ timeout: 30_000 });
  await part.click();
  await expect.poll(() => bookJson(a.page, id).then((json) => (json ?? '').includes('lib:')), { timeout: 10_000 }).toBe(true);
  const painted = async (page: Page) => page.locator('canvas.page-canvas[aria-label="えほんの ページ"], canvas.read-page').first().evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const pixel = canvas.getContext('2d')!.getImageData(Math.round(canvas.width / 2), Math.round(canvas.height * 0.52), 1, 1).data;
    return pixel[0] > 150 && pixel[1] < 90 && pixel[2] < 90;
  });
  await expect.poll(() => painted(a.page), { timeout: 20_000 }).toBe(true);

  const b = await peer(browser, account);
  await b.page.goto(`/read/${id}`);
  await expect(b.page.locator('.read-page').first()).toBeVisible();
  await expect.poll(() => painted(b.page), { timeout: 30_000 }).toBe(true);
  await a.context.close();
  await b.context.close();
});

test('illustrations parked on the desk follow the account and can be placed later', async ({ browser }) => {
  const account = subject();
  const a = await peer(browser, account);
  const id = await createBook(a.page);
  await a.page.getByLabel('なまえ').fill('ねこ');
  await a.page.locator('input[type=file][accept="image/png,image/webp"]').setInputFiles({
    name: 'oval.png', mimeType: 'image/png', buffer: await readFile(new URL('./oval.png', import.meta.url)),
  });
  const part = a.page.locator('.library-parts button', { hasText: 'ねこ' });
  await expect(part).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => pending(a.page)).toBe(false);

  const frame = (await a.page.getByLabel('えほんの ページ').boundingBox())!;
  const source = (await part.boundingBox())!;
  await a.page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(frame.x - 70, frame.y + frame.height / 2, { steps: 12 });
  await a.page.mouse.up();
  await expect(a.page.locator('.scratch-item')).toHaveCount(1);
  expect((await bookJson(a.page, id))!.includes('lib:')).toBe(false);

  await a.page.reload();
  await expect(a.page.getByLabel('えほんの ページ')).toBeVisible();
  await expect(a.page.locator('.scratch-item')).toHaveCount(1);

  const b = await peer(browser, account);
  await b.page.goto(`/app/${id}`);
  await expect(b.page.locator('.scratch-item')).toHaveCount(1, { timeout: 30_000 });

  const item = (await a.page.locator('.scratch-item').boundingBox())!;
  const target = (await a.page.getByLabel('えほんの ページ').boundingBox())!;
  await a.page.mouse.move(item.x + item.width / 2, item.y + item.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(target.x + target.width * 0.5, target.y + target.height * 0.5, { steps: 12 });
  await a.page.mouse.up();
  await expect(a.page.locator('.scratch-item')).toHaveCount(0);
  await expect.poll(() => bookJson(a.page, id).then((json) => (json ?? '').includes('lib:')), { timeout: 10_000 }).toBe(true);
  await expect(b.page.locator('.scratch-item')).toHaveCount(0, { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});
