import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Stroke = { ink: { type: string; index?: number }; brushStep: number; points: { x: number; y: number }[] };
type Book = { book: { pages: { items: unknown[]; strokes: Stroke[] }[] } };

async function savedBook(page: Page): Promise<Book> {
  await page.locator('.file-menu > summary').click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const path = await (await downloaded).path();
  await page.locator('.file-menu > summary').click();
  return JSON.parse(await readFile(path!, 'utf8')) as Book;
}

async function stroke(page: Page, from = [.25, .5], to = [.75, .5]) {
  await expect(page.locator('.desk-surface')).not.toHaveClass(/animate/);
  const box = (await page.getByLabel('えほんの ページ').boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 24 });
  await page.mouse.up();
}

const pixel = (page: Page, x: number, y: number) => page.getByLabel('えほんの ページ').evaluate((element, point) => {
  const canvas = element as HTMLCanvasElement;
  return [...canvas.getContext('2d')!.getImageData(Math.floor(canvas.width * point.x), Math.floor(canvas.height * point.y), 1, 1).data];
}, { x, y });

test('start drawing from the shelf in one click, with a readable UI and one blank page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '白紙から描きはじめる' }).click();
  await expect(page).toHaveURL(/\/app\/b-/);
  await expect(page.getByRole('button', { name: '描く', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '消しゴム', exact: true })).toBeVisible();
  await expect(page.locator('.frame')).toHaveCount(1);
  expect(await page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily)).not.toContain('Ehon-');
  const book = await savedBook(page);
  expect(book.book.pages).toHaveLength(1);
  expect(book.book.pages[0]).toMatchObject({ items: [], strokes: [] });
  await stroke(page);
  expect((await savedBook(page)).book.pages[0].strokes).toHaveLength(1);
  await expect.poll(() => pixel(page, .5, .5)).toEqual([46, 43, 37, 255]);
});

test('drawing, erasing and keyboard undo work without moving the paper', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByLabel('えほんの ページ')).toBeVisible();
  await expect(page.locator('.desk-surface')).not.toHaveClass(/animate/);
  const bounds = await page.getByLabel('えほんの ページ').boundingBox();
  await stroke(page);
  const drawn = await savedBook(page);
  expect(drawn.book.pages[0].strokes).toHaveLength(1);
  expect(drawn.book.pages[0].strokes[0].points[0].x).toBeCloseTo(.25, 2);
  expect(await page.getByLabel('えほんの ページ').boundingBox()).toEqual(bounds);
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: '消しゴム', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '太い', exact: true }).click();
  await stroke(page, [.5, .4], [.5, .6]);
  await expect.poll(() => pixel(page, .5, .5)).toEqual([255, 255, 255, 255]);
  await expect.poll(() => pixel(page, .3, .5)).toEqual([46, 43, 37, 255]);
  expect((await savedBook(page)).book.pages[0].strokes.at(-1)!.ink.type).toBe('eraser');
  await page.keyboard.press('Control+z');
  await expect.poll(() => pixel(page, .5, .5)).toEqual([46, 43, 37, 255]);
  await page.keyboard.press('Control+z');
  expect((await savedBook(page)).book.pages[0].strokes).toHaveLength(0);
  await page.keyboard.press('Control+Shift+z');
  expect((await savedBook(page)).book.pages[0].strokes).toEqual(drawn.book.pages[0].strokes);
});

test('page switching keeps exactly one canvas and saves drawings across reload and reading', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByLabel('えほんの ページ')).toBeVisible();
  await stroke(page);
  await page.getByRole('button', { name: 'ページを ふやす', exact: true }).click();
  await expect(page.getByText('2 / 2 ページ')).toBeVisible();
  await expect(page.locator('.frame')).toHaveCount(1);
  await page.getByRole('button', { name: '青', exact: true }).click();
  await stroke(page, [.2, .25], [.8, .25]);
  const expected = (await savedBook(page)).book;
  expect(expected.pages[0].strokes[0].ink.index).toBe(6);
  expect(expected.pages[1].strokes[0].ink.index).toBe(4);
  await page.getByRole('button', { name: '1 ページを編集', exact: true }).click();
  await expect(page.locator('.frame')).toHaveCount(1);
  await expect.poll(() => pixel(page, .5, .5)).toEqual([46, 43, 37, 255]);
  // Reload immediately: pagehide flushes the debounced local save.
  await page.reload();
  await expect(page.getByLabel('えほんの ページ')).toBeVisible();
  expect((await savedBook(page)).book).toEqual(expected);
  const id = page.url().split('/').pop()!;
  await page.goto('/read/' + id);
  await expect.poll(() => page.locator('.read-page').first().evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return [...canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data];
  })).toEqual([46, 43, 37, 255]);
});

test('erasing reveals the illustration below and PNG export includes the drawing', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByRole('button', { name: 'まる', exact: true }).click();
  await page.getByRole('button', { name: '描く', exact: true }).click();
  const original = await pixel(page, .5, .5);
  await stroke(page);
  await expect.poll(() => pixel(page, .5, .5)).toEqual([46, 43, 37, 255]);
  await page.getByRole('button', { name: '消しゴム', exact: true }).click();
  await page.getByRole('button', { name: '太い', exact: true }).click();
  await stroke(page, [.5, .4], [.5, .6]);
  await expect.poll(() => pixel(page, .5, .5)).toEqual(original);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す', exact: true }).click();
  const png = await readFile((await (await downloaded).path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(2048);
  expect(png.readUInt32BE(20)).toBe(2048);
});

test('a cancelled stroke is discarded and Space pans without drawing', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByLabel('えほんの ページ')).toBeVisible();
  await stroke(page);
  const original = (await savedBook(page)).book;
  const box = (await page.getByLabel('えほんの ページ').boundingBox())!;
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .2);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await savedBook(page)).book).toEqual(original);
  await page.getByLabel('デスク', { exact: true }).focus();
  await page.keyboard.down('Space');
  await stroke(page, [.4, .4], [.6, .6]);
  await page.keyboard.up('Space');
  expect((await savedBook(page)).book).toEqual(original);
  expect((await page.getByLabel('えほんの ページ').boundingBox())!.x).toBeGreaterThan(box.x);
});

test('tool shortcuts do not intercept typing', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: '文字', exact: true }).click();
  await page.getByLabel('ことば', { exact: true }).fill('Best view of the river');
  await page.getByLabel('ことば', { exact: true }).pressSequentially(' bees');
  await expect(page.getByRole('button', { name: '文字', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('ことば', { exact: true })).toHaveValue('Best view of the river bees');
});

test('small screens keep drawing tools and the single page visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');
  for (const name of ['描く', '消しゴム', '文字', '素材']) await expect(page.getByRole('button', { name, exact: true })).toBeInViewport();
  await expect(page.getByLabel('えほんの ページ')).toBeInViewport();
  await expect(page.getByRole('button', { name: '青', exact: true })).toBeInViewport();
  await expect(page.getByRole('link', { name: 'ホーム', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await stroke(page);
  expect((await savedBook(page)).book.pages[0].strokes).toHaveLength(1);
  const url = page.url();
  await page.getByRole('link', { name: 'ホーム', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: '続きを描く', exact: true }).click();
  await expect(page).toHaveURL(url);
  expect((await savedBook(page)).book.pages[0].strokes).toHaveLength(1);
});

test('a pen tap draws a dot and touch pinch cancels an accidental stroke', async ({ page, context }) => {
  await page.goto('/app');
  await expect(page.getByLabel('えほんの ページ')).toBeVisible();
  await expect(page.locator('.desk-surface')).not.toHaveClass(/animate/);
  const box = (await page.getByLabel('えほんの ページ').boundingBox())!;
  const x = box.x + box.width * .5;
  const y = box.y + box.height * .5;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: .5 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  await expect.poll(() => pixel(page, .5, .5)).toEqual([46, 43, 37, 255]);
  const original = (await savedBook(page)).book;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: x - 80, y: y - 80 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - 70, y: y - 70 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: x - 70, y: y - 70 }, { id: 2, x: x + 70, y: y + 70 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - 100, y: y - 100 }, { id: 2, x: x + 100, y: y + 100 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(errors).toEqual([]);
  expect((await savedBook(page)).book).toEqual(original);
  expect((await page.getByLabel('えほんの ページ').boundingBox())!.width).toBeGreaterThan(box.width);
});
