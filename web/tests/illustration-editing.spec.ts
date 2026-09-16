import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const illustration = {
  version: 4,
  book: {
    id: { value: 'illustration-test' }, title: 'Illustration repair', shape: 'SQUARE', contentLocale: 'ja-JP', updatedAtEpochMs: 0,
    art: {
      bear: { name: 'くま', svg: '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#a56f45"/></svg>' },
      scenery: { name: '背景', svg: '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#7a8a5e"/></svg>' },
      foreground: { name: '前景', svg: '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#0066cc"/></svg>' },
    },
    pages: [{ id: 'p1', background: '#ffffff', items: [
      { type: 'part', id: { value: 'scenery' }, partId: { value: 'art:scenery' }, x: 50, y: 50, sizePct: 100 },
      { type: 'part', id: { value: 'other-bear' }, partId: { value: 'art:bear' }, x: 15, y: 50, sizePct: 15 },
      { type: 'part', id: { value: 'bear' }, partId: { value: 'art:bear' }, x: 50, y: 50, sizePct: 40 },
      { type: 'part', id: { value: 'foreground' }, partId: { value: 'art:foreground' }, x: 50, y: 50, sizePct: 5 },
    ] }],
  },
};

const brown = [165, 111, 69, 255];
const green = [122, 138, 94, 255];
const blue = [0, 102, 204, 255];
const canvas = (page: Page) => page.getByLabel('えほんの ページ', { exact: true });
const pixel = (page: Page, x: number, y: number, selector = '[aria-label="えほんの ページ"]') => page.locator(selector).first().evaluate((element, at) => {
  const c = element as HTMLCanvasElement;
  return [...c.getContext('2d')!.getImageData(Math.floor(c.width * at.x), Math.floor(c.height * at.y), 1, 1).data];
}, { x, y });

async function draw(page: Page, from: number[], to: number[]) {
  await expect(page.locator('.desk-surface')).not.toHaveClass(/animate/);
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 12 });
  await page.mouse.up();
}

async function saved(page: Page) {
  await page.locator('.file-menu > summary').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const bytes = await readFile((await (await download).path())!);
  await page.locator('.file-menu > summary').click();
  return JSON.parse(bytes.toString());
}

async function openFixture(page: Page) {
  await page.goto('/app?template=doc-love-letter');
  await expect(page.locator('[data-frame="0"] canvas')).toBeVisible();
  await page.locator('input[accept=".ehon,application/json"]').setInputFiles({
    name: 'illustration.ehon', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(illustration)),
  });
  await expect(page.locator('.document-title strong')).toHaveText('Illustration repair');
  await page.locator('.file-menu > summary').click();
  await page.getByRole('button', { name: 'ほんだなに ほぞん', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/illustration-test$/);
  await expect.poll(() => pixel(page, .5, .55)).toEqual(brown);
  await page.getByRole('button', { name: '選択', exact: true }).click();
  const box = (await canvas(page).boundingBox())!;
  await canvas(page).click({ position: { x: box.width * .6, y: box.height * .55 } });
  await page.getByRole('button', { name: 'イラストを編集', exact: true }).click();
  await expect(page.getByText('くまを編集中', { exact: true })).toBeVisible();
}

test('erase and redraw one illustration, undo, move, export, save and reopen it', async ({ page }) => {
  await openFixture(page);
  await draw(page, [.5, .4], [.5, .6]);
  await expect.poll(() => pixel(page, .5, .55)).toEqual(green);
  expect(await pixel(page, .5, .5)).toEqual(blue);
  expect(await pixel(page, .15, .5)).toEqual(brown);
  const erased = await saved(page);
  expect(erased.version).toBe(5);
  expect(erased.book.pages[0].strokes).toEqual([]);
  expect(erased.book.pages[0].items[2].drawing.strokes).toHaveLength(1);
  expect(erased.book.pages[0].items[1].drawing).toBeNull();
  expect(erased.book.art).toEqual(illustration.book.art);
  await page.keyboard.press('Control+z');
  await expect.poll(() => pixel(page, .5, .55)).toEqual(brown);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => pixel(page, .5, .55)).toEqual(green);

  await page.keyboard.press('b');
  await page.getByLabel('好きな色', { exact: true }).fill('#a56f45');
  await draw(page, [.47, .55], [.53, .55]);
  await expect.poll(() => pixel(page, .5, .55)).toEqual(brown);
  await expect.poll(() => pixel(page, .5, .58)).toEqual(green);
  await page.getByRole('button', { name: '編集を完了', exact: true }).click();
  await draw(page, [.6, .55], [.7, .55]); // Move the selected character 10% to the right.
  await expect.poll(() => pixel(page, .6, .55)).toEqual(brown);
  await expect.poll(() => pixel(page, .6, .58)).toEqual(green);
  await expect.poll(() => pixel(page, .5, .58)).toEqual(brown);
  const edited = await saved(page);
  expect(edited.book.pages[0].items[2].drawing.strokes).toHaveLength(2);
  expect(edited.book.pages[0].items[2].drawing.strokes[1].ink).toEqual({ type: 'solid', color: -5935291 });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す', exact: true }).click();
  const png = await readFile((await (await download).path())!);
  const exportedPixels = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
    const ctx = c.getContext('2d')!; ctx.drawImage(image, 0, 0);
    return [.55, .58].map((y) => [...ctx.getImageData(Math.floor(c.width * .6), Math.floor(c.height * y), 1, 1).data]);
  }, png.toString('base64'));
  expect(exportedPixels).toEqual([brown, green]);

  await page.reload();
  await expect(page.locator('.document-title strong')).toHaveText('Illustration repair');
  expect((await saved(page)).book).toEqual(edited.book);
  await expect.poll(() => pixel(page, .6, .58)).toEqual(green);
  await page.getByRole('button', { name: 'よむ', exact: true }).click();
  await expect.poll(() => pixel(page, .6, .55, '.read-page')).toEqual(brown);
  await expect.poll(() => pixel(page, .6, .58, '.read-page')).toEqual(green);
});

test('cancelled edits and returning to page drawing keep illustration corrections separate', async ({ page }) => {
  await openFixture(page);
  const before = (await saved(page)).book;
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .6);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await saved(page)).book).toEqual(before);
  await draw(page, [.5, .4], [.5, .6]);
  await page.keyboard.press('v');
  await page.keyboard.press('b');
  await draw(page, [.45, .55], [.55, .55]);
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '太い', exact: true }).click();
  await draw(page, [.5, .4], [.5, .6]);
  await expect.poll(() => pixel(page, .5, .55)).toEqual(green);
  await expect.poll(() => pixel(page, .5, .5)).toEqual(blue);
  const result = (await saved(page)).book.pages[0];
  expect(result.items[2].drawing.strokes).toHaveLength(1);
  expect(result.strokes).toHaveLength(2);
});

test('the Love Letter bear can be edited directly in its template', async ({ page }) => {
  await page.goto('/app?template=doc-love-letter');
  const bearPage = page.locator('[data-frame="0"] canvas');
  await expect(bearPage).toBeVisible();
  const box = (await bearPage.boundingBox())!;
  await bearPage.click({ position: { x: box.width * .5, y: box.height * .65 } });
  await page.getByRole('button', { name: 'イラストを編集', exact: true }).click();
  const from = { x: box.x + box.width * .5, y: box.y + box.height * .65 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + box.height * .1, { steps: 10 });
  await page.mouse.up();
  const book = (await saved(page)).book;
  expect(book.pages[0].items.find((item: { partId?: { value: string } }) => item.partId?.value === 'art:bear-astronaut').drawing.strokes).toHaveLength(1);
  expect(book.pages[0].strokes).toEqual([]);
  expect(book.pages.slice(1).every((p: { items: { drawing?: unknown }[] }) => p.items.every((item) => !item.drawing))).toBe(true);
});

test('illustration editing controls remain usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page);
  await expect(canvas(page)).toBeInViewport();
  await expect(page.getByRole('button', { name: '編集を完了', exact: true })).toBeInViewport();
  await draw(page, [.5, .4], [.5, .6]);
  await expect.poll(() => pixel(page, .5, .55)).toEqual(green);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
