import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export async function savedBook(page: Page) {
  await page.locator('.file-menu > summary').click();
  const next = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const file = await (await next).path();
  await page.locator('.file-menu > summary').click();
  if (!file) throw new Error('No book downloaded.');
  return JSON.parse(await readFile(file, 'utf8')) as {
    version: number;
    book: { pages: { id: string; items: { id: { value: string }; x: number; y: number; type: string; text?: string; ruby?: string }[] }[] };
  };
}

// /app saves a blank book to the shelf and edits it: one square frame, no items, so each test sees exactly
// what it adds. The two story tests open a published story as a preview instead, where the template picker lives.
test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'ぺたぺた', exact: true })).toBeVisible();
  await expect(page.getByText('1 / 1 ページ')).toBeVisible();
});

test('placing and dragging can be undone independently', async ({ page }) => {
  const original = await savedBook(page);
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByRole('button', { name: 'まる', exact: true }).click();
  const added = await savedBook(page);
  expect(added.version).toBe(4);
  expect(added.book.pages[0].items).toHaveLength(original.book.pages[0].items.length + 1);
  const bounds = (await page.getByLabel('えほんの ページ').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .52);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .3, bounds.y + bounds.height * .3, { steps: 20 });
  await page.mouse.up();
  const moved = await savedBook(page);
  expect(moved.book.pages[0].items.at(-1)!.x).toBeCloseTo(30, 0);
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  expect((await savedBook(page)).book.pages[0].items).toEqual(added.book.pages[0].items);
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  expect((await savedBook(page)).book.pages[0].items).toEqual(original.book.pages[0].items);
});

test('ruby text and page identities survive file reopening', async ({ page }) => {
  await page.getByRole('button', { name: '文字', exact: true }).click();
  await page.getByLabel('ことば', { exact: true }).fill('森で あそぼう');
  await page.getByLabel('ふりがな', { exact: true }).fill('もりで あそぼう');
  await page.getByRole('button', { name: 'ことばを はる', exact: true }).click();
  await page.getByRole('button', { name: 'ページを ふやす', exact: true }).click();
  const book = await savedBook(page);
  expect(new Set(book.book.pages.map((item) => item.id)).size).toBe(2);
  expect(book.book.pages[0].items.at(-1)).toMatchObject({ type: 'text', text: '森で あそぼう', ruby: 'もりで あそぼう' });
  // Undo both edits; reopening the saved file on this shelf book brings them back.
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  await expect(page.getByText('1 / 1 ページ')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'book.ehon', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(book)) });
  await expect(page.getByText('1 / 2 ページ')).toBeVisible();
  expect((await savedBook(page)).book).toEqual(book.book);
});

test('malformed and future books do not replace the current book', async ({ page }) => {
  const original = await savedBook(page);
  for (const content of ['not a book', JSON.stringify({ ...original, version: 99 })]) {
    await page.locator('input[type=file]').setInputFiles({ name: 'book.ehon', mimeType: 'application/json', buffer: Buffer.from(content) });
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await savedBook(page)).book).toEqual(original.book);
  }
});

test('switching stories in the file menu reloads the book without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/app?template=doc-leaf-umbrella');
  await expect(page.getByText('1 / 19 ページ')).toBeVisible();
  const aspect = async () => {
    const box = (await page.getByLabel('えほんの ページ').boundingBox())!;
    return Math.round(box.width / box.height * 100);
  };
  await expect.poll(aspect).toBe(75);
  await page.locator('.file-menu > summary').click();
  await page.getByRole('combobox', { name: 'テンプレート', exact: true }).selectOption('doc-love-letter');
  await page.locator('.file-menu > summary').click();
  await expect(page.getByText('1 / 25 ページ')).toBeVisible();
  await expect.poll(aspect).toBe(75);
  // A portrait story with art opens as facing pages.
  await expect(page.locator('[data-frame]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('the desk pans and zooms without touching the book', async ({ page }) => {
  const original = await savedBook(page);
  const frame = page.getByLabel('えほんの ページ');
  const before = (await frame.boundingBox())!;
  const viewport = (await page.getByLabel('デスク').boundingBox())!;
  // Empty desk left of the frame: dragging there moves the view, not an item.
  await page.mouse.move(viewport.x + 30, viewport.y + viewport.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.x + 230, viewport.y + viewport.height / 2 - 100, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await frame.boundingBox())!.x - before.x)).toBe(200);
  await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -50);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(before.width * 1.5);
  await page.getByTitle('ページに合わせる (0)').click();
  await expect(page.locator('.desk-surface')).not.toHaveClass(/animate/);
  await expect(page.locator('.frame')).toHaveCount(1);
  await expect(frame).toBeInViewport();
  expect((await savedBook(page)).book).toEqual(original.book);
});

test('a library part lands on the active page', async ({ page }) => {
  await page.getByRole('button', { name: 'ページを ふやす', exact: true }).click();
  await expect(page.getByText('2 / 2 ページ')).toBeVisible();
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await expect(page.locator('.desk-surface')).not.toHaveClass(/animate/);
  const target = page.locator('[data-frame="1"] canvas');
  await expect(target).toBeInViewport();
  const box = (await target.boundingBox())!;
  const source = (await page.getByRole('button', { name: 'まる', exact: true }).boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.4, { steps: 12 });
  await expect(page.locator('.drag-ghost')).toHaveText('まる');
  await page.mouse.up();
  await expect(page.getByText('2 / 2 ページ')).toBeVisible();
  const book = await savedBook(page);
  expect(book.book.pages[1].items.at(-1)).toMatchObject({ type: 'part' });
  expect(book.book.pages[1].items.at(-1)!.x).toBeCloseTo(25, 0);
  expect(book.book.pages[1].items.at(-1)!.y).toBeCloseTo(40, 0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('adding a page appends a frame and makes it current', async ({ page }) => {
  await page.getByRole('button', { name: 'ページを ふやす', exact: true }).click();
  await expect(page.getByText('2 / 2 ページ')).toBeVisible();
  await expect(page.locator('[data-frame]')).toHaveCount(1);
  await expect(page.locator('.page-thumbnail')).toHaveCount(2);
  await expect(page.getByLabel('えほんの ページ')).toBeInViewport();
  await page.getByRole('button', { name: '1 ページを編集', exact: true }).click();
  await expect(page.getByText('1 / 2 ページ')).toBeVisible();
});

test('a story template opens as a bound book: vector pieces on the picture pages, editable words facing them', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/app?template=doc-leaf-umbrella');
  await expect(page.getByText('1 / 19 ページ')).toBeVisible();
  const { book } = await savedBook(page);
  // Cover and title page, then the storyboard's picture-left, words-right spreads, then the back cover.
  expect(book.pages.slice(0, 4).map((current) => current.id)).toEqual(['cover', 'title', 'p1', 'p2']);
  expect(book.pages.at(-1)!.id).toBe('back');
  const picture = book.pages[2];
  expect(picture.items[0]).toMatchObject({ type: 'part', x: 50 });
  expect(picture.items.filter((item) => item.type === 'part').length).toBeGreaterThan(3);
  const words = book.pages[3];
  expect(words.items.every((item) => item.type === 'text')).toBe(true);
  expect(words.items[0].text).toBe('ぽつ、ぽつ、ぽつ。');
  // The bear on the cover is vector art painted by the core: brown fur where he stands.
  const cover = page.locator('[data-frame="0"] canvas');
  const bear = await cover.evaluate((element) => {
    const c = element as HTMLCanvasElement;
    const [r, g, b] = c.getContext('2d')!.getImageData(Math.round(c.width * .5), Math.round(c.height * .72), 1, 1).data;
    return { r, g, b };
  });
  expect(bear.r).toBeGreaterThan(bear.b + 40);
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await expect(page.getByRole('button', { name: /^かえるの ケロ/ })).toBeVisible();
  await page.getByRole('button', { name: '選択', exact: true }).click();
  const box = (await cover.boundingBox())!;
  await page.mouse.click(box.x + box.width * .5, box.y + box.height * .14);
  await expect(page.getByLabel('ことば', { exact: true })).toHaveValue('はっぱの かさ');
  expect(errors).toEqual([]);
});
