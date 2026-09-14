import { expect, test, type Page } from '@playwright/test';

/** A finger's drag, not a teleport: Playwright's instant moves would otherwise read as a flick. */
async function drag(page: Page, from: [number, number], to: [number, number], release = true) {
  await page.mouse.move(...from);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(from[0] + (to[0] - from[0]) * step / 8, from[1] + (to[1] - from[1]) * step / 8);
    await page.waitForTimeout(30);
  }
  if (release) { await page.waitForTimeout(150); await page.mouse.up(); }
}

/** A shelf copy of the first story, opened in the reader: the cover and the title page face each other. */
async function openStory(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'あたらしい えほん' }).click();
  const first = page.locator('button.template').first();
  await first.waitFor();
  await first.click();
  await page.waitForURL(/\/app\//);
  await page.goto('/read/' + page.url().split('/app/')[1]);
  await expect(page.locator('.read-page')).toHaveCount(2);
  await expect(page.locator('.read-page').first()).toHaveAttribute('aria-label', '1 ページ');
}

test('keys, edges and dots turn the spread and the leaf settles', async ({ page }) => {
  await openStory(page);
  const dots = page.locator('.dot');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.leaf')).toHaveCount(0);
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.read-page').first()).toHaveAttribute('aria-label', '3 ページ');
  await page.getByRole('button', { name: 'まえの ページ', exact: true }).click();
  await expect(page.locator('.leaf')).toHaveCount(0);
  await expect(dots.first()).toHaveAttribute('aria-current', 'page');
  await dots.nth(3).click();
  await expect(page.locator('.leaf')).toHaveCount(0);
  await expect(page.locator('.read-page').first()).toHaveAttribute('aria-label', '7 ページ');
  await expect(page.locator('.read-page')).toHaveCount(2);
});

test('a drag folds the leaf under the pointer; past a third it commits, short of it falls back', async ({ page }) => {
  await openStory(page);
  const right = page.locator('.page-box').nth(1);
  const box = (await right.boundingBox())!;
  const y = box.y + box.height / 2;

  await drag(page, [box.x + box.width * 0.8, y], [box.x + box.width * 0.65, y], false);
  const leaf = page.locator('.leaf');
  await expect(leaf).toHaveAttribute('data-slot', 'right');
  // A held drag leaves the sheet mid-air: twelve hinged strips, hinged on the spine.
  await expect(leaf).toHaveAttribute('data-hinge', 'left');
  await expect(leaf.locator('.strip')).toHaveCount(12);
  await expect(leaf.locator('.strip-canvas[data-face="back"]')).toHaveCount(12);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(leaf).toHaveCount(0);
  await expect(page.locator('.dot').first()).toHaveAttribute('aria-current', 'page');

  await drag(page, [box.x + box.width * 0.8, y], [box.x + box.width * 0.2, y]);
  await expect(leaf).toHaveCount(0);
  await expect(page.locator('.dot').nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.read-page').first()).toHaveAttribute('aria-label', '3 ページ');

  // Dragging from the left page turns back, and the drag never doubles as an edge tap.
  const left = (await page.locator('.page-box').first().boundingBox())!;
  await drag(page, [left.x + left.width * 0.2, y], [left.x + left.width * 0.9, y], false);
  await expect(leaf).toHaveAttribute('data-slot', 'left');
  await page.mouse.up();
  await expect(leaf).toHaveCount(0);
  await expect(page.locator('.dot').first()).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.read-page').first()).toHaveAttribute('aria-label', '1 ページ');
});
