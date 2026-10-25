import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Book = { book: { pages: { items: { type: string; x: number; text?: string }[] }[] } };

async function savedBook(page: Page): Promise<Book> {
  await page.locator('.file-menu > summary').click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const path = await (await downloaded).path();
  await page.locator('.file-menu > summary').click();
  return JSON.parse(await readFile(path!, 'utf8')) as Book;
}

async function placeCircle(page: Page) {
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByRole('button', { name: 'まる', exact: true }).click();
}

async function dragFrom(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByText('1 / 1 ページ')).toBeVisible();
  await page.getByRole('button', { name: 'ページを ふやす', exact: true }).click();
  await page.getByRole('button', { name: '1 ページを編集' }).click();
  await expect(page.getByText('1 / 2 ページ')).toBeVisible();
});

test('the keyboard copies, cuts and pastes an illustration and text onto another page', async ({ page }) => {
  await placeCircle(page);
  await page.getByLabel('デスク').focus();
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  let book = await savedBook(page);
  expect(book.book.pages[0].items).toHaveLength(2);
  expect(book.book.pages[0].items[1].x).toBeCloseTo(book.book.pages[0].items[0].x + 3, 3);

  await page.getByRole('button', { name: '文字', exact: true }).click();
  await page.getByLabel('ことば', { exact: true }).fill('もりへ いこう');
  await page.getByRole('button', { name: 'ことばを はる', exact: true }).click();
  await page.getByLabel('デスク').focus();
  await page.keyboard.press('ControlOrMeta+x');
  await page.getByRole('button', { name: '2 ページを編集' }).click();
  await page.getByLabel('デスク').focus();
  await page.keyboard.press('ControlOrMeta+v');
  book = await savedBook(page);
  expect(book.book.pages[0].items.map((item) => item.type)).toEqual(['part', 'part']);
  expect(book.book.pages[1].items).toMatchObject([{ type: 'text', text: 'もりへ いこう' }]);
});

test('the panel copies and pastes, and moves the selection to a chosen page', async ({ page }) => {
  await placeCircle(page);
  await page.getByRole('button', { name: 'コピー', exact: true }).click();
  await page.getByRole('button', { name: '貼り付け', exact: true }).click();
  await page.getByLabel('ページへ移動').selectOption({ label: '2 ページへ' });
  await expect(page.getByText('2 / 2 ページ')).toBeVisible();
  const book = await savedBook(page);
  expect(book.book.pages[0].items).toHaveLength(1);
  expect(book.book.pages[1].items).toHaveLength(1);
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  expect((await savedBook(page)).book.pages[0].items).toHaveLength(2);
});

test('dragging an item onto a page thumbnail moves it there in one undo step', async ({ page }) => {
  await placeCircle(page);
  const before = await savedBook(page);
  const bounds = (await page.getByLabel('えほんの ページ').boundingBox())!;
  const thumbnail = page.getByRole('button', { name: '2 ページを編集' });
  const box = (await thumbnail.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .52);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await expect(thumbnail).toHaveAttribute('data-drop', '');
  await page.mouse.up();
  await expect(thumbnail).not.toHaveAttribute('data-drop', '');
  await expect(page.getByText('2 / 2 ページ')).toBeVisible();
  const moved = await savedBook(page);
  expect(moved.book.pages[0].items).toHaveLength(0);
  expect(moved.book.pages[1].items).toEqual(before.book.pages[0].items);
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  expect((await savedBook(page)).book.pages).toEqual(before.book.pages);
});

test('in a spread, dragging onto the facing page moves the item to where it was dropped', async ({ page }) => {
  await page.getByRole('button', { name: '見開き表示' }).click();
  await placeCircle(page);
  const left = (await page.locator('[data-frame="0"] canvas').boundingBox())!;
  const right = (await page.locator('[data-frame="1"] canvas').boundingBox())!;
  await dragFrom(page, { x: left.x + left.width * .5, y: left.y + left.height * .52 }, { x: right.x + right.width * .4, y: right.y + right.height * .5 });
  const book = await savedBook(page);
  expect(book.book.pages[0].items).toHaveLength(0);
  expect(book.book.pages[1].items[0].x).toBeCloseTo(40, 0);
});
