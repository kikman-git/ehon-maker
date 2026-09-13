import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/app?template=doc-love-letter');
  await expect(page.getByText('1 / 25 ページ')).toBeVisible();
  await expect(page.locator('.desk-surface')).not.toHaveClass(/animate/);
});

test('the pages get the desk: chrome floats over it, and the panel and strip fold away', async ({ page }) => {
  const viewport = (await page.getByLabel('デスク').boundingBox())!;
  const before = (await page.locator('[data-frame="0"] canvas').boundingBox())!;
  // Both bars sit inside the desk, not above or below it.
  const bar = (await page.locator('.desk-bar').boundingBox())!;
  expect(bar.y).toBeGreaterThanOrEqual(viewport.y);
  expect(before.y).toBeGreaterThan(bar.y + bar.height - 1);
  expect(before.height / viewport.height).toBeGreaterThan(0.7);

  await page.getByRole('button', { name: 'ツールパネル' }).click();
  await expect(page.locator('.tool-panel')).toBeHidden();
  await page.getByRole('button', { name: 'ページ一覧' }).click();
  await expect(page.locator('.page-strip')).toBeHidden();
  // The desk refits once the strip's space is released.
  await expect.poll(async () => (await page.locator('[data-frame="0"] canvas').boundingBox())!.height).toBeGreaterThan(before.height * 1.08);

  // Without the strip, pages still turn from the view bar.
  await page.getByRole('button', { name: 'つぎの ページ', exact: true }).click();
  await expect(page.getByText('2 / 25 ページ')).toBeVisible();
  await page.getByRole('button', { name: 'つぎの ページ', exact: true }).click();
  await expect(page.getByText('3 / 25 ページ')).toBeVisible();
  await expect(page.locator('[data-frame="2"] canvas')).toBeInViewport();

  // Words need the panel, so the text tool brings it back; the choice survives a reload.
  await page.getByRole('button', { name: '文字', exact: true }).click();
  await expect(page.locator('.tool-panel')).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 / 25 ページ')).toBeVisible();
  await expect(page.locator('.tool-panel')).toBeVisible();
  await expect(page.locator('.page-strip')).toBeHidden();
  await page.getByRole('button', { name: 'ページ一覧' }).click();
  await expect(page.locator('.page-strip')).toBeVisible();
});

test('a book opens in the reader from the studio and prints as spreads', async ({ page }) => {
  await page.getByRole('button', { name: 'よむ', exact: true }).click();
  await expect(page).toHaveURL(/\/read\/b-/);
  await expect(page.locator('.read-page')).toHaveCount(4);
  await expect(page.getByRole('link', { name: '続きを描く' })).toBeVisible();

  await page.evaluate(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed++; window.dispatchEvent(new Event('afterprint')); }; });
  await page.getByRole('button', { name: '印刷' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await expect(page.locator('.read-page')).toHaveCount(4);

  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.read-page')).toHaveCount(25);
  const sheets = await page.locator('.spread').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { top: Math.round(rect.top), pages: element.querySelectorAll('.page-box').length, bg: getComputedStyle(element.closest('.stage')!).backgroundColor };
  }));
  expect(sheets).toHaveLength(13);
  expect(sheets.map((sheet) => sheet.pages)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1]);
  expect(sheets[1].top).toBeGreaterThan(sheets[0].top);
  expect(sheets[0].bg).toBe('rgb(255, 255, 255)');
  await expect(page.locator('.stage-bar')).toBeHidden();
});
