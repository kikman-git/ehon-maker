import { expect, test } from '@playwright/test';

test('even-odd masks and rotated layers paint correctly', async ({ page }) => {
  await page.goto('/app.html');
  await expect(page.getByRole('heading', { name: 'ぺたぺた', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const moduleUrl = '/vendor/ehon-core/ehon-shared.mjs';
    const { WebEditor, EhonCodec } = await import(moduleUrl) as typeof import('@ehon/core');
    const codec = EhonCodec.getInstance();
    const editor = new WebEditor(codec.instantiateTemplate('t5', 'masks', '', 'ja', 0, null), () => 0);
    editor.addPartAt('しぜん:たいよう', 25, 25, 35, null);
    editor.addPartAt('しぜん:おつきさま', 75, 25, 35, null);
    editor.addPartAt('かたち:にじ', 25, 75, 35, null);
    editor.addPartAt('しぜん:はっぱ', 75, 75, 35, null);
    editor.rotateSelected();
    const canvas = document.createElement('canvas');
    canvas.id = 'mask-fixture';
    canvas.width = canvas.height = 400;
    editor.render(canvas.getContext('2d')!, 400, 400, 0, true);
    document.body.replaceChildren(canvas);
    editor.dispose();
  });
  await expect(page.locator('#mask-fixture')).toHaveScreenshot('masks.png');
});

test('raster bounds, missing assets and context state are respected', async ({ page }) => {
  await page.goto('/app.html');
  await expect(page.getByRole('heading', { name: 'ぺたぺた', exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const moduleUrl = '/vendor/ehon-core/ehon-shared.mjs';
    const { WebEditor, EhonCodec } = await import(moduleUrl) as typeof import('@ehon/core');
    const codec = EhonCodec.getInstance();
    const editor = new WebEditor(codec.instantiateTemplate('t5', 'raster', '', 'ja', 0, 'LANDSCAPE'), () => 0);
    const beforeRegistration = editor.revision;
    editor.registerPart('lib:wide', 'a/fixture', 4, 'よこなが', 'Wide');
    const registrationRepaints = editor.revision > beforeRegistration && !editor.canUndo;
    editor.addPartAt('lib:wide', 50, 50, 80, editor.partHeightPct('lib:wide', 80));
    const source = document.createElement('canvas');
    source.width = 40; source.height = 10;
    source.getContext('2d')!.fillRect(0, 0, 40, 10);
    const image = new Image();
    image.src = source.toDataURL();
    await image.decode();
    editor.setImageProvider(() => image);
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(0, 255, 0)';
    editor.render(ctx, 600, 400, 0, true);
    const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    const rendered = { inside: pixel(300, 155), outside: pixel(300, 110), savedFill: ctx.fillStyle };
    editor.setImageProvider(() => null);
    editor.render(ctx, 600, 400, 0, true);
    const placeholder = pixel(300, 200);
    editor.dispose();
    source.width = source.height = 0;
    image.src = '';
    return { ...rendered, placeholder, registrationRepaints };
  });
  expect(result.inside).toEqual([0, 0, 0, 255]);
  expect(result.outside).toEqual([249, 244, 237, 255]);
  expect(result.savedFill).toBe('#00ff00');
  expect(result.placeholder).not.toEqual(result.inside);
  expect(result.registrationRepaints).toBe(true);
});

test('the facade rejects stale results and groups valid intents into one undo', async ({ page }) => {
  await page.goto('/app.html');
  const result = await page.evaluate(async () => {
    const moduleUrl = '/vendor/ehon-core/ehon-shared.mjs';
    const { WebEditor, EhonCodec } = await import(moduleUrl) as typeof import('@ehon/core');
    const codec = EhonCodec.getInstance();
    const editor = new WebEditor(codec.instantiateTemplate('t1', 'intents', '', 'ja', 0, null), () => 0);
    const original = editor.bookJson();
    const revision = editor.revision;
    editor.applyIntents(JSON.stringify({ bookId: 'intents', revision, intents: [
      { type: 'addPart', partId: 'かたち:まる', xPct: 30, yPct: 40 },
      { type: 'resizeSelected', bigger: true },
    ] }));
    const after = editor.bookJson();
    let rejected = false;
    try { editor.applyIntents(JSON.stringify({ bookId: 'intents', revision, intents: [{ type: 'addPage' }] })); }
    catch { rejected = true; }
    const unchanged = editor.bookJson() === after;
    editor.undo();
    const undone = editor.bookJson() === original;
    const canUndo = editor.canUndo;
    editor.dispose();
    return { rejected, unchanged, undone, canUndo };
  });
  expect(result).toEqual({ rejected: true, unchanged: true, undone: true, canUndo: false });
});

test('a document with embedded SVG art paints through the canvas painter', async ({ page }) => {
  await page.goto('/app.html');
  await expect(page.getByRole('heading', { name: 'ぺたぺた', exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const moduleUrl = '/vendor/ehon-core/ehon-shared.mjs';
    const { WebEditor, EhonCodec } = await import(moduleUrl) as typeof import('@ehon/core');
    const codec = EhonCodec.getInstance();
    const document = JSON.stringify({ version: 4, book: {
      id: { value: 'vector' }, title: 'v', shape: 'SQUARE', contentLocale: 'ja-JP', updatedAtEpochMs: 0,
      art: { square: { name: 'あか', svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0000"/><circle cx="5" cy="5" r="2" fill="rgb(0,0,255)" stroke="#000" stroke-width="1"/></svg>' } },
      pages: [{ id: 'p1', background: '#ffffff', items: [{ type: 'part', id: { value: 'i1' }, x: 50, y: 50, partId: { value: 'art:square' }, sizePct: 50 }] }],
    } });
    const check = JSON.parse(codec.checkDocument(document));
    const editor = new WebEditor(codec.instantiateDocument(document, 'painted', 0), () => 0);
    const canvas = window.document.createElement('canvas');
    canvas.width = canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    editor.render(ctx, 400, 400, 0, true);
    const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    const rendered = { corner: pixel(20, 20), red: pixel(120, 120), blue: pixel(200, 200), art: JSON.parse(editor.artJson()) };
    editor.dispose();
    return { ...rendered, check };
  });
  expect(result.check).toEqual({ ok: true, errors: [], warnings: [] });
  expect(result.corner).toEqual([255, 255, 255, 255]);
  expect(result.red).toEqual([255, 0, 0, 255]);
  expect(result.blue).toEqual([0, 0, 255, 255]);
  expect(result.art).toEqual([{ id: 'art:square', name: 'あか', aspect: 1 }]);
});
