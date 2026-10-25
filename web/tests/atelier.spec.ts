import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

interface Saved { book: { art: Record<string, { svg: string; name: string }>; pages: { items: { type: string; partId?: { value: string } }[] }[] } }

async function savedBook(page: Page): Promise<Saved> {
  await page.locator('.file-menu > summary').click();
  const next = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const file = await (await next).path();
  await page.locator('.file-menu > summary').click();
  return JSON.parse(await readFile(file, 'utf8')) as Saved;
}

// The dev server runs tests/fixtures/fake-claude.mjs, which draws three sprites or recolours the selected part.
const workspaceOf = (page: Page) => join(process.cwd(), '.ehon-ai', new URL(page.url()).pathname.split('/').pop()! + '.atelier');

async function openAtelier(page: Page) {
  await page.goto('/app');
  await expect(page.getByText('1 / 1 ページ')).toBeVisible();
  await page.waitForURL(/\/app\/b-/);
  await rm(workspaceOf(page), { recursive: true, force: true });
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByRole('button', { name: 'AIで 素材を つくる' }).click();
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
  await expect(atelier.locator('.ai-message.assistant').last()).toHaveText('かきました。');
  await expect(atelier.locator('.ai-message.tool')).toHaveCount(0);
  const workspace = workspaceOf(page);
  const first = await readFile(join(workspace, 'prompt.txt'), 'utf8');
  expect(first).toContain('`candidate-1.svg`');
  expect(first).toContain('ぼうしの くま');
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
  const second = await readFile(join(workspace, 'prompt.txt'), 'utf8');
  expect(second).toContain('`<g id="ear">` (みみ)');
  expect(second).not.toContain('candidate-1');
  expect(existsSync(join(workspace, 'view.png'))).toBe(true);

  await atelier.getByLabel('なまえ').fill('くま');
  await atelier.getByRole('button', { name: 'ページに置く' }).click();
  await expect(atelier.getByRole('status')).toHaveText('ページに 置きました。');
  await atelier.getByRole('button', { name: 'アトリエを とじる' }).click();
  await expect(atelier).toHaveCount(0);
  const book = await savedBook(page);
  const art = book.book.art['atelier-1'];
  expect(art.name).toBe('くま');
  expect(art.svg).toMatch(/<g id="body"[^>]*><circle[^>]*fill="#7a8a5e"/);
  expect(art.svg).toMatch(/<g id="ear"[^>]*><circle[^>]*fill="#e89cb0"/);
  expect(book.book.pages[0].items.at(-1)?.partId?.value).toBe('art:atelier-1');
  await expect(page.getByRole('option', { name: 'この えほんの え' })).toHaveCount(1);

  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  const undone = await savedBook(page);
  expect(undone.book.art ?? {}).toEqual({});
  expect(undone.book.pages[0].items).toHaveLength(0);
});

test('a candidate the painter cannot open is reported and left out', async ({ page }) => {
  const atelier = await openAtelier(page);
  await atelier.getByLabel('アトリエへの たのみごと').fill('break the second one');
  await atelier.getByRole('button', { name: '頼む' }).click();
  await expect(atelier.getByRole('alert')).toContainText('2まいめの えは ひらけませんでした');
  await expect(atelier.getByRole('listbox', { name: 'バージョン' }).getByRole('option')).toHaveCount(2);
  await expect(atelier.locator('.ai-message.status[data-done]').last()).toHaveText('2まいの えが できました。えらんで、パーツを タップすると なおせます。');
});

test('while the AI draws, the working card names the step, the tiles fill in, and the compose box waits', async ({ page }) => {
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
  await expect(working).toContainText('1まいめを かいています…');
  await expect(working).toContainText('1 / 3 まい');
  await expect(versions.getByRole('option')).toHaveCount(1);
  await expect(versions.locator('.atelier-pending')).toHaveCount(2);
  await expect(working).toContainText('2まいめを かいています…');
  await expect(versions.getByRole('option')).toHaveCount(3);
  await expect(working).toHaveCount(0);
  await expect(versions.locator('.atelier-pending')).toHaveCount(0);
  await expect(atelier.getByLabel('アトリエへの たのみごと')).toBeEnabled();
  await expect(atelier.locator('.ai-message.status[data-done]').last()).toHaveText(/3まいの えが できました/);
});
