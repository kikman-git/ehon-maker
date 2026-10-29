import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

test('new catalog artwork is inserted and cached across asset-source outages', async ({ page }) => {
  const catalog = JSON.parse(await readFile('../shared/materials/catalog.json', 'utf8'));
  const bird = catalog.assets.find((item: { slug: string }) => item.slug === 'bird');
  const png = await readFile('../shared/materials/masters/bird.png');
  const ref = `a/${hash(png)}`;
  const json = JSON.stringify({ ...catalog, assets: [...catalog.assets, { ...bird, id: 'pack.storybook:delivery-test', name: '新しいことり', masterRef: ref, legacyIds: [] }] });
  const revision = hash(json);
  const pointer = { version: 1, revision, file: `catalogs/${revision}.json`, bytes: Buffer.byteLength(json) };
  const bundledJson = JSON.stringify(catalog);
  const bundledRevision = hash(bundledJson);
  const bundledPointer = { version: 1, revision: bundledRevision, file: `catalogs/${bundledRevision}.json`, bytes: Buffer.byteLength(bundledJson) };
  let expanded = false;
  let offline = false;
  let corrupt = false;
  let imageRequests = 0;
  await page.route('**/materials/index.json', route => offline ? route.abort() : route.fulfill({ json: expanded ? pointer : bundledPointer }));
  await page.route(`**/materials/catalogs/${bundledRevision}.json`, route => route.fulfill({ body: bundledJson, contentType: 'application/json' }));
  await page.route(`**/materials/catalogs/${revision}.json`, route => offline ? route.abort() : route.fulfill({ body: corrupt ? '{}' : json, contentType: 'application/json' }));
  await page.route(`**/${ref}/*`, async route => {
    imageRequests++;
    if (offline) return route.abort();
    const name = route.request().url().split('/').at(-1)!;
    const bytes = name === 'm.png' ? png : await readFile(`public/materials/${bird.masterRef}/${name}`);
    await route.fulfill({ body: bytes, contentType: name.endsWith('.png') ? 'image/png' : 'image/webp' });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await expect(page.getByRole('button', { name: '素材を更新', exact: true })).toBeEnabled();
  await expect(page.locator('.material-grid button')).toHaveCount(catalog.assets.length);
  expanded = true;
  await page.getByRole('button', { name: '素材を更新', exact: true }).click();
  await page.getByLabel('素材をさがす').fill('新しいことり');
  const tile = page.getByRole('button', { name: '新しいことり', exact: true });
  await expect(tile).toBeVisible();
  await expect.poll(() => tile.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(256);
  await tile.click();
  await expect.poll(() => imageRequests).toBe(2);
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す', exact: true }).click();
  await download;
  expect(imageRequests).toBe(3);
  corrupt = true;
  await page.getByRole('button', { name: '素材を更新', exact: true }).click();
  await expect(page.getByRole('button', { name: '素材を更新', exact: true })).toBeEnabled();
  await expect(tile).toBeVisible();
  offline = true;
  await page.reload();
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByLabel('素材をさがす').fill('新しいことり');
  await expect(tile).toBeVisible();
  await expect.poll(() => tile.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(256);
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す', exact: true }).click();
  const file = await (await download).path();
  expect((await readFile(file!)).length).toBeGreaterThan(100_000);
  expect(imageRequests).toBe(3);
});

test('unsupported catalogs retain the starter library and corrupt masters are rejected', async ({ page }) => {
  const catalog = JSON.parse(await readFile('../shared/materials/catalog.json', 'utf8'));
  await page.route('**/materials/index.json', route => route.fulfill({ json: { version: 99 } }));
  await page.goto('/app');
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await expect(page.getByRole('button', { name: '素材を更新', exact: true })).toBeEnabled();
  await expect(page.locator('.material-grid button')).toHaveCount(catalog.assets.length);
  const ref = `a/${'0'.repeat(64)}/m.png`;
  const bytes = await readFile('../shared/materials/masters/bird.png');
  await page.route(`**/${ref}`, route => route.fulfill({ body: bytes, contentType: 'image/png' }));
  const rejected = await page.evaluate(async key => {
    const modulePath = '/src/cloud/assetBytes.ts';
    const { assetBytes } = await import(modulePath);
    try { await assetBytes(`/${key}`, key); return false; } catch { return true; }
  }, ref);
  expect(rejected).toBe(true);
  const cached = await page.evaluate(async key => (await (await caches.open('ehon-images-v1')).match(new URL(`/${key}`, location.href).href)) !== undefined, ref);
  expect(cached).toBe(false);
});

test('damaged cached previews are replaced and failed downloads remain retryable', async ({ page }) => {
  await page.goto('/app');
  const catalog = JSON.parse(await readFile('../shared/materials/catalog.json', 'utf8'));
  const key = `a/${'f'.repeat(64)}/256.webp`;
  const bytes = await readFile(`public/materials/${catalog.assets[0].masterRef}/256.webp`);
  let broken = true;
  let requests = 0;
  await page.route(`**/${key}`, route => {
    requests++;
    return route.fulfill({ body: broken ? Buffer.from('broken image') : bytes, contentType: 'image/webp' });
  });
  await page.evaluate(async key => {
    const cache = await caches.open('ehon-images-v1');
    await cache.put(new URL(`/${key}`, location.href).href, new Response('broken cached image'));
  }, key);
  const fetchImage = () => page.evaluate(async key => {
    const modulePath = '/src/cloud/assetBytes.ts';
    const { decodeAsset } = await import(modulePath);
    try { return (await decodeAsset(`/${key}`, key)).naturalWidth; } catch { return 0; }
  }, key);
  expect(await fetchImage()).toBe(0);
  broken = false;
  expect(await fetchImage()).toBe(256);
  expect(requests).toBe(2);
  await page.route(`**/${key}`, route => route.abort());
  expect(await fetchImage()).toBe(256);
});

test('personal uploads retain their configured asset source and offline masters', async ({ page }) => {
  const bytes = await readFile('../shared/materials/masters/bird.png');
  const ref = `a/${hash(bytes)}`;
  let offline = false;
  let requests = 0;
  await page.route(`**/account-assets/${ref}/m.png`, route => {
    requests++;
    return offline ? route.abort() : route.fulfill({ body: bytes, contentType: 'image/png' });
  });
  await page.goto('/app');
  const load = () => page.evaluate(async ref => {
    const modulePath = '/src/cloud/assetLoader.ts';
    const { AssetLoader } = await import(modulePath);
    return (await new AssetLoader(() => '/account-assets').loadMaster(ref)).naturalWidth;
  }, ref);
  const width = await load();
  expect(width).toBeGreaterThanOrEqual(1024);
  offline = true;
  expect(await load()).toBe(width);
  expect(requests).toBe(1);
});
