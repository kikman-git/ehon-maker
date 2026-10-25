import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Item = { type: string; color?: number | string | null; text?: string; ruby?: string | null; font?: string; sizePct?: number; bold?: boolean; colorIndex?: number; rotationDeg?: number };
type Book = { book: { pages: { items: Item[] }[] } };

async function savedBook(page: Page): Promise<Book> {
  await page.locator('.file-menu > summary').click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const path = await (await downloaded).path();
  await page.locator('.file-menu > summary').click();
  return JSON.parse(await readFile(path!, 'utf8')) as Book;
}

const toolbar = (page: Page) => page.getByRole('toolbar', { name: '文字の書式' });

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByText('1 / 1 ページ')).toBeVisible();
  await page.getByRole('button', { name: '文字', exact: true }).click();
  await page.getByLabel('ことば', { exact: true }).fill('もりへ いこう');
  await page.getByRole('button', { name: 'ことばを はる', exact: true }).click();
});

test('the toolbar over selected text sets its font, size, bold and colour', async ({ page }) => {
  const bar = toolbar(page);
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: /^フォント:/ }).click();
  await bar.getByRole('listbox', { name: 'フォント' }).getByRole('option').nth(2).click();
  await expect(bar.getByRole('listbox')).toHaveCount(0);
  const size = bar.getByRole('spinbutton', { name: '文字の大きさ（数値）' });
  await size.fill('12');
  await size.press('Enter');
  await bar.getByRole('button', { name: '文字を大きく' }).click();
  await bar.getByRole('button', { name: '太字' }).click();
  await expect(bar.getByRole('button', { name: '太字' })).toHaveAttribute('aria-pressed', 'true');
  await bar.getByRole('button', { name: 'セージ' }).click();
  const text = (await savedBook(page)).book.pages[0].items[0];
  expect(text).toMatchObject({ type: 'text', sizePct: 12.5, bold: true, colorIndex: 2, color: null });
  await bar.getByLabel('文字の好きな色').fill('#1f6fd1');
  await expect(bar.getByRole('button', { name: 'セージ' })).toHaveAttribute('aria-pressed', 'false');
  expect((await savedBook(page)).book.pages[0].items[0]).toMatchObject({ color: 0xff1f6fd1 | 0 });
  expect(text.font).not.toBe('yomogi');
  await page.getByLabel('デスク').focus();
  await page.keyboard.press('ControlOrMeta+b');
  expect((await savedBook(page)).book.pages[0].items[0].bold).toBe(false);
});

test('double-clicking text edits its words and furigana right above it', async ({ page }) => {
  const bounds = (await page.getByLabel('えほんの ページ').boundingBox())!;
  await page.getByRole('button', { name: '選択', exact: true }).click();
  await page.mouse.dblclick(bounds.x + bounds.width * .5, bounds.y + bounds.height * .78);
  const words = toolbar(page).getByRole('textbox', { name: '文字', exact: true });
  await expect(words).toBeFocused();
  await words.fill('うみへ いこう');
  await toolbar(page).getByRole('textbox', { name: 'ふりがな（よみ）' }).fill('うみへ いこう');
  await words.press('Enter');
  await expect(words).toHaveCount(0);
  expect((await savedBook(page)).book.pages[0].items[0]).toMatchObject({ text: 'うみへ いこう', ruby: 'うみへ いこう' });
});

test('the rotate handle turns the selection with the mouse in one undo step, snapping with Shift', async ({ page }) => {
  const handle = page.getByRole('button', { name: 'ドラッグして回転' });
  await expect(handle).toBeVisible();
  await page.locator('.desk').screenshot({ path: test.info().outputPath('toolbar.png') });
  const box = (await handle.boundingBox())!;
  const bounds = (await page.getByLabel('えほんの ページ').boundingBox())!;
  const centre = { x: bounds.x + bounds.width * .5, y: bounds.y + bounds.height * .78 };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(centre.x + 200, centre.y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect((await savedBook(page)).book.pages[0].items[0].rotationDeg).toBe(90);
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  expect((await savedBook(page)).book.pages[0].items[0].rotationDeg ?? 0).toBe(0);
});
