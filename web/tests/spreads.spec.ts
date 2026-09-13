import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function documentOf(page: Page) {
  await page.locator('.file-menu > summary').click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const file = await (await downloaded).path();
  await page.locator('.file-menu > summary').click();
  return JSON.parse(await readFile(file!, 'utf8')) as {
    version: number;
    book: {
      id: { value: string };
      art: Record<string, { svg: string }>;
      pages: { id: string; items: { id: { value: string }; x: number; y: number; text?: string }[]; strokes: unknown[] }[];
    };
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/app?template=doc-love-letter');
  await expect(page.getByText('1 / 25 ページ')).toBeVisible();
  await expect(page.locator('[data-frame]')).toHaveCount(2);
});

test('a facing caption and an illustration edit independently and survive reopening', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const original = await documentOf(page);
  // The cover and title page come first; the beach spread is pages 3 and 4.
  await page.getByRole('button', { name: '3 ページを編集', exact: true }).click();
  const left = page.locator('[data-frame="2"] canvas');
  const right = page.locator('[data-frame="3"] canvas');
  const before = (await left.boundingBox())!;
  const words = (await right.boundingBox())!;

  // Changing the active page inside a spread must leave the view still.
  await page.mouse.click(words.x + words.width * .5, words.y + words.height * .16);
  await expect(page.getByLabel('ことば', { exact: true })).toHaveValue('いつもの ぼく');
  const after = (await left.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.width).toBeCloseTo(before.width, 1);
  await page.getByLabel('ことば', { exact: true }).fill('いつもの わたし');
  await page.getByRole('button', { name: 'ことばを はる', exact: true }).click();
  const reworded = await documentOf(page);
  expect(reworded.book.pages[2]).toEqual(original.book.pages[2]);
  expect(reworded.book.pages[3].items[0].text).toBe('いつもの わたし');

  // The volleyball is its own piece, with its own drag undo step.
  const start = original.book.pages[2].items.find((item) => item.id.value.includes('-volleyball-'))!;
  await page.mouse.move(before.x + before.width * start.x / 100, before.y + before.height * start.y / 100);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width * (start.x - 8) / 100, before.y + before.height * (start.y - 5) / 100, { steps: 10 });
  await page.mouse.up();
  const moved = await documentOf(page);
  const ball = moved.book.pages[2].items.find((item) => item.id.value.includes('-volleyball-'))!;
  expect(ball.x).toBeCloseTo(start.x - 8, 0);
  expect(ball.y).toBeCloseTo(start.y - 5, 0);
  expect(moved.book.pages[3]).toEqual(reworded.book.pages[3]);
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  const undone = await documentOf(page);
  expect(undone.book.pages).toEqual(reworded.book.pages);

  await page.locator('input[type=file]').setInputFiles({ name: 'letter.ehon', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(undone)) });
  await expect(page.locator('[data-frame]')).toHaveCount(2);
  expect((await documentOf(page)).book).toEqual(undone.book);
  expect(Object.keys(undone.book.art)).toHaveLength(Object.keys(original.book.art).length);
  expect(errors).toEqual([]);
});

test('drawing and placing a material on the facing page leave the illustration page intact', async ({ page }) => {
  const original = await documentOf(page);
  await page.getByRole('button', { name: '3 ページを編集', exact: true }).click();
  await page.getByRole('button', { name: '描く', exact: true }).click();
  const right = (await page.locator('[data-frame="3"] canvas').boundingBox())!;
  await page.mouse.move(right.x + right.width * .3, right.y + right.height * .92);
  await page.mouse.down();
  await page.mouse.move(right.x + right.width * .7, right.y + right.height * .93, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText('4 / 25 ページ')).toBeVisible();
  const drawn = await documentOf(page);
  expect(drawn.book.pages[3].strokes).toHaveLength(1);
  expect(drawn.book.pages[2]).toEqual(original.book.pages[2]);
  await page.getByRole('button', { name: 'もどす', exact: true }).click();

  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByRole('button', { name: /^あいの かたち/ }).click();
  const placed = await documentOf(page);
  expect(placed.book.pages[2]).toEqual(original.book.pages[2]);
  expect(placed.book.pages[3].items).toHaveLength(original.book.pages[3].items.length + 1);
  expect(placed.book.pages[3].strokes).toHaveLength(0);
});

test('page view, spread navigation and an unpaired last page stay usable', async ({ page }) => {
  const original = await documentOf(page);
  await page.getByRole('button', { name: '1ページ表示', exact: true }).click();
  await expect(page.locator('[data-frame]')).toHaveCount(1);
  await page.getByRole('button', { name: '見開き表示', exact: true }).click();
  await expect(page.locator('[data-frame]')).toHaveCount(2);
  expect((await documentOf(page)).book).toEqual(original.book);

  // The back cover is the book's unpaired last page.
  await page.getByRole('button', { name: '25 ページを編集', exact: true }).click();
  await expect(page.locator('[data-frame]')).toHaveCount(1);
  await expect(page.locator('[data-frame="24"] canvas')).toBeInViewport();
  await page.getByRole('button', { name: 'ページを ふやす', exact: true }).click();
  await expect(page.getByText('26 / 26 ページ')).toBeVisible();
  await expect(page.locator('[data-frame]')).toHaveCount(2);
  await expect(page.locator('[data-frame="24"] canvas')).toBeInViewport();
  await expect(page.locator('[data-frame="25"] canvas')).toBeInViewport();
  await page.getByRole('button', { name: 'ページを ふやす', exact: true }).click();
  await expect(page.getByText('27 / 27 ページ')).toBeVisible();
  await expect(page.locator('[data-frame]')).toHaveCount(1);
  await expect(page.locator('[data-frame="26"] canvas')).toBeInViewport();
});
