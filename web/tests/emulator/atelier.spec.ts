import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

interface Saved { book: { art: Record<string, { svg: string; name: string }>; pages: { items: { type: string; partId?: { value: string } }[] }[] } }

async function savedBook(page: Page): Promise<Saved> {
  await page.locator('.file-menu > summary').click();
  const next = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const file = await (await next).path();
  await page.locator('.file-menu > summary').click();
  return JSON.parse(await readFile(file, 'utf8')) as Saved;
}

/** Sign in through the emulator and open a blank book; the functions emulator has no key, so the harness answers with FakeModel. */
async function openAtelier(page: Page) {
  await page.goto('/');
  await page.getByLabel('エミュレーター アカウント').fill(`atelier-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  await page.getByRole('button', { name: 'エミュレーターで サインイン' }).click();
  await page.getByRole('button', { name: 'AI と つくりはじめる' }).click();
  await page.waitForURL(/\/app\/[A-Za-z0-9_-]+$/);
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByRole('button', { name: /AIで 素材を つくる/ }).click();
  const atelier = page.getByRole('dialog', { name: '素材アトリエ' });
  await expect(atelier.getByText('新しい会話', { exact: true }).first()).toBeVisible();
  return atelier;
}

test('candidates arrive, a tapped part is revised, and the piece lands on the page in one undo step', async ({ page }) => {
  const atelier = await openAtelier(page);
  const versions = atelier.getByRole('listbox', { name: 'バージョン' }).getByRole('option');
  await atelier.getByLabel('アトリエへの たのみごと').fill('ぼうしの くま');
  await atelier.getByRole('button', { name: '頼む' }).click();
  await expect(versions).toHaveCount(3);
  await expect(versions.first()).toHaveAttribute('aria-selected', 'true');
  await expect(atelier.locator('.ai-message.status[data-done]')).toHaveText(['1まいめの えが とどきました', '2まいめの えが とどきました', '3まいめの えが とどきました', '3まいの えが できました。えらんで、パーツを タップすると なおせます。']);
  await expect(atelier.locator('.ai-message.assistant').last()).toHaveText('3つ かきました。');
  await expect(atelier.getByRole('radio', { name: /^なおす/ })).toHaveAttribute('aria-checked', 'true');

  await versions.nth(1).click();
  const stage = (await atelier.getByLabel('えの プレビュー').boundingBox())!;
  await page.mouse.click(stage.x + stage.width * 0.3, stage.y + stage.height * 0.34);
  await expect(atelier.getByRole('button', { name: 'みみ' })).toHaveAttribute('aria-pressed', 'true');
  await expect(atelier.getByRole('radio', { name: 'なおす「みみ」' })).toHaveAttribute('aria-checked', 'true');
  await atelier.getByLabel('アトリエへの たのみごと').fill('ピンクに');
  await atelier.getByRole('button', { name: '頼む' }).click();
  await expect(versions).toHaveCount(4);
  await expect(versions.nth(3)).toHaveAttribute('aria-selected', 'true');
  await expect(atelier.locator('.ai-message.status[data-done]').last()).toHaveText('なおした えが できました。');

  await atelier.getByLabel('なまえ').fill('くま');
  await atelier.getByRole('button', { name: 'ページに置く' }).click();
  await expect(atelier.getByRole('status').filter({ hasText: 'ページに 置きました。' })).toBeVisible();
  await atelier.getByRole('button', { name: 'アトリエを とじる' }).click();
  await expect(atelier).toHaveCount(0);
  const book = await savedBook(page);
  const art = book.book.art['atelier-1'];
  expect(art.name).toBe('くま');
  expect(art.svg).toMatch(/<g id="body"[^>]*><circle[^>]*fill="#7a8a5e"/);
  expect(art.svg).toMatch(/<g id="ear"[^>]*><circle[^>]*fill="#e89cb0"/);
  expect(book.book.pages[0].items.at(-1)?.partId?.value).toBe('art:atelier-1');

  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  const undone = await savedBook(page);
  expect(undone.book.art ?? {}).toEqual({});
  expect(undone.book.pages[0].items).toHaveLength(0);
});

test('a candidate the painter cannot open is reported and left out', async ({ page }) => {
  const atelier = await openAtelier(page);
  await atelier.getByLabel('アトリエへの たのみごと').fill('break the second one');
  await atelier.getByRole('button', { name: '頼む' }).click();
  await expect(atelier.getByRole('listbox', { name: 'バージョン' }).getByRole('option')).toHaveCount(2);
  await expect(atelier.locator('.ai-message.status[data-done]').last()).toHaveText('2まいの えが できました。えらんで、パーツを タップすると なおせます。');
});

test('while the AI draws, the working card shows the step and clock, the tiles wait, and the compose box pauses', async ({ page }) => {
  const atelier = await openAtelier(page);
  const versions = atelier.getByRole('listbox', { name: 'バージョン' });
  await atelier.getByLabel('アトリエへの たのみごと').fill('slow くま');
  await atelier.getByRole('button', { name: '頼む' }).click();
  const working = atelier.getByRole('status', { name: 'AI の ようす' });
  await expect(working).toContainText('どんな えに するか かんがえています…');
  await expect(working).toContainText('0 / 3 まい');
  await expect(versions.locator('.atelier-pending')).toHaveCount(3);
  await expect(atelier.getByLabel('アトリエへの たのみごと')).toBeDisabled();
  await expect(atelier.getByRole('button', { name: 'やめる' })).toBeVisible();
  await expect(atelier.getByLabel('えの プレビュー')).toContainText('かんがえています');
  await expect(versions.getByRole('option')).toHaveCount(3);
  await expect(working).toHaveCount(0);
  await expect(versions.locator('.atelier-pending')).toHaveCount(0);
  await expect(atelier.getByLabel('アトリエへの たのみごと')).toBeEnabled();
});
