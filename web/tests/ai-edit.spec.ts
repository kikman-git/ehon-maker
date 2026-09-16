import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

interface Saved { book: { pages: { id: string; items: { id: { value: string }; type: string; text?: string }[] }[] } }

async function savedBook(page: Page): Promise<Saved> {
  await page.locator('.file-menu > summary').click();
  const next = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに ほぞん' }).click();
  const file = await (await next).path();
  await page.locator('.file-menu > summary').click();
  return JSON.parse(await readFile(file, 'utf8')) as Saved;
}

// The dev server runs tests/fixtures/fake-claude.mjs in place of the Claude CLI (playwright.config.ts).
const workspaceOf = (page: Page) => join(process.cwd(), '.ehon-ai', new URL(page.url()).pathname.split('/').pop()!);

async function openAi(page: Page) {
  await page.goto('/app');
  await expect(page.getByText('1 / 1 ページ')).toBeVisible();
  await page.waitForURL(/\/app\/b-/);
  await rm(workspaceOf(page), { recursive: true, force: true });
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await expect(page.getByTestId('ai-panel')).toBeVisible();
  await expect(page.getByText('新しい会話', { exact: true }).first()).toBeVisible();
}

async function drawMark(page: Page, corners: [number, number][]) {
  const bounds = (await page.getByLabel('えほんの ページ').boundingBox())!;
  const at = ([x, y]: [number, number]) => [bounds.x + bounds.width * x, bounds.y + bounds.height * y] as const;
  await page.mouse.move(...at(corners[0]));
  await page.mouse.down();
  for (const corner of corners.slice(1)) await page.mouse.move(...at(corner), { steps: 8 });
  await page.mouse.up();
}

test('a marked area and a request reach the CLI, and its document lands as one undo step', async ({ page }) => {
  await openAi(page);
  await expect(page.locator('.ai-terminal')).toBeVisible();
  await expect(page.locator('.ai-terminal-title')).toContainText('fake-claude.mjs');
  await drawMark(page, [[0.3, 0.3], [0.6, 0.3], [0.6, 0.6], [0.3, 0.6], [0.3, 0.3]]);
  await expect(page.getByTestId('mark')).toBeVisible();
  await expect(page.locator('.ai-mark')).toContainText('x 30%–60%');
  await page.getByLabel('モデル').fill('sonnet');
  await page.getByLabel('モデル').press('Enter');
  await page.getByLabel('効果').selectOption('low');
  await expect(page.locator('.ai-terminal-title')).toContainText('--model sonnet --effort low');

  await page.getByLabel('AIへの たのみごと').fill('ここに ねこを かいて');
  await page.getByRole('button', { name: '頼む' }).click();
  await expect(page.locator('.ai-message.user')).toContainText('ここに ねこを かいて');
  await expect(page.locator('.ai-message.assistant').last()).toHaveText('ページに ことばを たしました。');
  await expect(page.locator('.ai-message.status', { hasText: 'えほんに 反映しました' })).toHaveCount(1);
  await expect(page.locator('.ai-message.tool')).toContainText('Edit · book.ehon.json');

  const workspace = workspaceOf(page);
  const prompt = await readFile(join(workspace, 'prompt.txt'), 'utf8');
  expect(prompt).toContain('page 1 of 1 (id "');
  expect(prompt).toContain('x 30% to 60%, y 30% to 60%');
  expect(prompt).toContain('outlined in red');
  expect(prompt).toContain('Request:\nここに ねこを かいて');
  expect(existsSync(join(workspace, 'page.png'))).toBe(true);
  expect(existsSync(join(workspace, 'FORMAT.md'))).toBe(true);

  const edited = await savedBook(page);
  expect(edited.book.pages[0].items.map((item) => item.text)).toContain('AI が かきました');
  await page.getByRole('button', { name: 'もどす', exact: true }).click();
  expect((await savedBook(page)).book.pages[0].items).toHaveLength(0);
  await page.getByRole('button', { name: 'やりなおす', exact: true }).click();
  expect((await savedBook(page)).book.pages[0].items).toHaveLength(1);

  // The second turn resumes the session the first one reported, and the CLI sees the book as the studio has it.
  await page.getByLabel('AIへの たのみごと').fill('もう ひとつ');
  await page.getByLabel('AIへの たのみごと').press('Enter');
  await expect(page.locator('.ai-message.assistant')).toHaveCount(2);
  await expect(page.locator('.ai-message.status', { hasText: 'えほんに 反映しました' })).toHaveCount(2);
  const args = (await readFile(join(workspace, 'args.txt'), 'utf8')).trim().split('\n');
  expect(args).toHaveLength(2);
  expect(args[0]).toMatch(/--permission-mode acceptEdits --model sonnet --effort low$/);
  expect(args[1]).toContain('--resume fake-session-1 --model sonnet --effort low');
  expect((await savedBook(page)).book.pages[0].items).toHaveLength(2);
  await expect(page.locator('.ai-session-state')).toContainText('会話 fake-ses');
});

test('Codex can take the seat: its JSONL is read the same way and its thread is resumed', async ({ page }) => {
  await openAi(page);
  await page.getByLabel('AIの種類').selectOption('codex');
  await expect(page.locator('.ai-terminal-title')).toContainText('fake-codex.mjs');
  await page.getByLabel('効果').selectOption('high');
  await page.getByLabel('AIへの たのみごと').fill('タイトルを かえて');
  await page.getByRole('button', { name: '頼む' }).click();
  await expect(page.locator('.ai-message.tool').first()).toContainText('Bash · /bin/zsh');
  await expect(page.locator('.ai-message.tool').nth(1)).toContainText('Edit · book.ehon.json');
  await expect(page.locator('.ai-message.assistant').last()).toHaveText('ことばを たしました。');
  await expect(page.locator('.ai-message.status', { hasText: 'えほんに 反映しました' })).toHaveCount(1);
  expect((await savedBook(page)).book.pages[0].items.map((item) => item.text)).toContain('Codex が かきました');
  await page.getByLabel('AIへの たのみごと').fill('もう ひとつ');
  await page.getByRole('button', { name: '頼む' }).click();
  await expect(page.locator('.ai-message.status', { hasText: 'えほんに 反映しました' })).toHaveCount(2);
  const args = (await readFile(join(workspaceOf(page), 'args.txt'), 'utf8')).trim().split('\n');
  expect(args[0]).toMatch(/^exec --json --skip-git-repo-check -c sandbox_mode="workspace-write" -c model_reasoning_effort="high" -i page.png -$/);
  expect(args[1]).toMatch(/ resume fake-thread-1 -$/);
  await expect(page.locator('.ai-session-state')).toContainText('会話 fake-thr');
  // The Claude seat keeps its own session and settings: switching back starts it fresh at the defaults.
  await page.getByLabel('AIの種類').selectOption('claude');
  await expect(page.locator('.ai-session-state')).toHaveText('新しい会話');
  await expect(page.getByLabel('効果')).toHaveValue('');
  await expect(page.locator('.ai-terminal-title')).toContainText('fake-claude.mjs');
});

test('a document the studio cannot open is reported and leaves the book alone', async ({ page }) => {
  await openAi(page);
  const before = await savedBook(page);
  await page.getByLabel('AIへの たのみごと').fill('break it');
  await page.getByRole('button', { name: '頼む' }).click();
  await expect(page.locator('.ai-message.status[data-error]')).toContainText('反映できませんでした');
  expect((await savedBook(page)).book.pages).toEqual(before.book.pages);
  const prompt = await readFile(join(workspaceOf(page), 'prompt.txt'), 'utf8');
  expect(prompt).not.toContain('marked an area');
  expect(prompt).toContain('shows that page as the user sees it');
});

test('a tap clears the mark and turning the page drops it', async ({ page }) => {
  await openAi(page);
  await drawMark(page, [[0.2, 0.2], [0.5, 0.2], [0.5, 0.5], [0.2, 0.2]]);
  await expect(page.getByTestId('mark')).toBeVisible();
  await drawMark(page, [[0.8, 0.8]]);
  await expect(page.getByTestId('mark')).toHaveCount(0);
  await drawMark(page, [[0.2, 0.2], [0.5, 0.2], [0.5, 0.5], [0.2, 0.2]]);
  await expect(page.getByTestId('mark')).toBeVisible();
  await page.getByRole('button', { name: 'ページを ふやす' }).click();
  await expect(page.getByText('2 / 2 ページ')).toBeVisible();
  await expect(page.getByTestId('mark')).toHaveCount(0);
});
