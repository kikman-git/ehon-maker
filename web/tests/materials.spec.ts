import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Material = { name: string; nameEn: string; category: string; characterId: string; pose: string; tags: string[] };
const loadCatalog = async () => JSON.parse(await readFile('../shared/materials/catalog.json', 'utf8')).assets as Material[];
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
const matching = (assets: Material[], query: string) =>
  assets.filter(part => normalize([part.name, part.nameEn, part.characterId, part.pose, ...part.tags].join(' ')).includes(normalize(query))).length;

test('painterly materials browse, search, place, and survive reopening', async ({ page }) => {
  const assets = await loadCatalog();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app');
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await expect(page.locator('#material-category option')).toHaveCount(11);
  await expect(page.getByRole('button', { name: 'まる', exact: true })).toHaveCount(0);
  await page.getByLabel('素材をさがす').fill('ペンギン');
  expect(matching(assets, 'ペンギン')).toBeGreaterThan(1);
  await expect(page.locator('.material-grid button')).toHaveCount(matching(assets, 'ペンギン'));
  await page.getByLabel('素材をさがす').fill('penguin waving');
  await expect(page.locator('.material-grid button')).toHaveCount(1);
  const preview = page.locator('.material-grid img');
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(256);
  const imageRequest = page.waitForResponse(response => response.url().includes('/materials/a/') && response.url().endsWith('/1024.webp'));
  await page.locator('.material-grid button').click();
  expect((await imageRequest).ok()).toBeTruthy();
  await expect(page.locator('.rotate-handle')).toBeVisible();
  await page.getByRole('button', { name: 'よむ', exact: true }).click();
  await expect(page.locator('.read-page')).toBeVisible();
  await page.getByRole('link', { name: '続きを描く' }).click();
  await page.reload();
  await expect(page.getByLabel('えほんの ページ')).toBeVisible();
  await page.locator('.file-menu > summary').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const file = await (await download).path();
  const saved = JSON.parse(await readFile(file!, 'utf8'));
  expect(saved.book.pages[0].items).toHaveLength(1);
  expect(saved.book.pages[0].items[0].partId.value).toBe('pack.storybook:penguin-waving');
  expect(errors).toEqual([]);
});

test('category filters and empty search do not fall back to old icons', async ({ page }) => {
  const nature = (await loadCatalog()).filter(part => part.category === 'しぜん').length;
  expect(nature).toBeGreaterThan(0);
  await page.goto('/app');
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByLabel('しゅるい').selectOption('しぜん');
  await expect(page.locator('.material-grid button')).toHaveCount(nature);
  await page.getByLabel('素材をさがす').fill('存在しない素材');
  await expect(page.locator('.material-grid button')).toHaveCount(0);
  await expect(page.getByText('素材が見つかりませんでした。別のことばや種類でさがしてみてね。')).toBeVisible();
});

test('retired materials can be replaced in place and undone', async ({ page }) => {
  await page.goto('/app');
  const save = async () => {
    await page.locator('.file-menu > summary').click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
    const path = await (await pending).path();
    await page.locator('.file-menu > summary').click();
    return JSON.parse(await readFile(path!, 'utf8'));
  };
  const book = await save();
  const old = { type: 'part', id: { value: 'retired-bear' }, partId: { value: 'いきもの:くま' }, x: 31, y: 64, sizePct: 42, heightPct: 29, rotationDeg: 27 };
  book.book.pages[0].items = [old];
  await page.locator('input[type=file]').setInputFiles({ name: 'old.ehon', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(book)) });
  await expect(page.locator('.material-migration')).toContainText('以前の素材 1 点');
  await page.getByRole('button', { name: '素材を置きかえる', exact: true }).click();
  await page.getByLabel('置きかえる素材', { exact: true }).selectOption({ label: '1 ページ · くま' });
  await page.getByRole('button', { name: 'ふくろう', exact: true }).click();
  await expect(page.locator('.material-migration')).toHaveCount(0);
  const replaced = (await save()).book.pages[0].items;
  expect(replaced).toHaveLength(1);
  expect(replaced[0]).toMatchObject({ ...old, partId: { value: 'pack.storybook:owl' } });
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  await expect(page.locator('.material-migration')).toContainText('以前の素材 1 点');
  expect((await save()).book.pages[0].items[0]).toMatchObject(old);
});

test('PNG export waits for full resolution paintings and reports failed loads', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByRole('button', { name: 'ことり', exact: true }).click();
  await page.route('**/materials/a/*/m.png', route => route.abort());
  await page.getByRole('button', { name: 'PNGを書き出す', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('PNGの書き出し');
  await page.unroute('**/materials/a/*/m.png');
  const master = page.waitForResponse(response => response.url().includes('/materials/a/') && response.url().endsWith('/m.png'));
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す', exact: true }).click();
  expect((await master).ok()).toBeTruthy();
  const path = await (await pending).path();
  const png = await readFile(path!);
  expect(png.readUInt32BE(16)).toBe(2048);
  expect(png.readUInt32BE(20)).toBe(2048);
  expect(png.length).toBeGreaterThan(100_000);
});
