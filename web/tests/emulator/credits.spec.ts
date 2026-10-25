import { expect, test, type Page } from '@playwright/test';

/** Sign in through the emulator; the account chip appears once the session is known. */
async function signIn(page: Page, account: string) {
  await page.goto('/');
  await page.getByLabel('エミュレーター アカウント').fill(account);
  await page.getByRole('button', { name: 'エミュレーターで サインイン' }).click();
  await expect(page.getByRole('button', { name: `${account}@example.invalid` })).toBeVisible();
}

// The functions emulator has no Anthropic key, so atelierTurn draws with FakeModel: three sprites at six credits a turn.
test('a new account gets 100 credits, the atelier spends them per turn, and the offers take over when they run out', async ({ page }) => {
  const account = `credits-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await signIn(page, account);
  const chip = page.getByRole('button', { name: /^AI クレジット/ });
  await expect(chip).toHaveText(/100/);
  // A reload mounts the gate after the session is already known; the watcher must still start.
  await page.reload();
  await expect(chip).toHaveText(/100/);
  await chip.click();
  const dialog = page.getByRole('dialog', { name: 'アカウント' });
  await expect(dialog.getByText('100', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /ぺたぺた プラス/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /600 クレジットを 買う/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'とじる' }).click();

  await page.getByRole('button', { name: '白紙から描きはじめる' }).click();
  await page.waitForURL(/\/app\/[A-Za-z0-9_-]+$/);
  await page.getByRole('button', { name: '素材', exact: true }).click();
  const entry = page.getByRole('button', { name: /AIで 素材を つくる/ });
  await expect(entry).toContainText('無料クレジット のこり 100');
  await entry.click();
  const atelier = page.getByRole('dialog', { name: '素材アトリエ' });
  await atelier.getByLabel('アトリエへの たのみごと').fill('ぼうしの くま');
  await atelier.getByRole('button', { name: '頼む' }).click();
  await expect(atelier.getByRole('listbox', { name: 'バージョン' }).getByRole('option')).toHaveCount(3);
  await expect(atelier.locator('.ai-message.status', { hasText: '6 クレジット · のこり 94' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^AI クレジット/ })).toHaveText(/94/);

  await atelier.getByRole('radio', { name: 'あたらしい案 ×3' }).click();
  await atelier.getByLabel('アトリエへの たのみごと').fill('expensive くま');
  await atelier.getByRole('button', { name: '頼む' }).click();
  await expect(atelier.getByRole('status').filter({ hasText: '無料クレジットを つかいきりました' })).toBeVisible();
  await expect(atelier.getByLabel('アトリエへの たのみごと')).toHaveCount(0);
  await expect(atelier.getByRole('button', { name: /ぺたぺた プラス/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^AI クレジット/ })).toHaveText(/\b0\b/);
  await atelier.getByRole('button', { name: 'アトリエを とじる' }).click();
  await expect(page.getByRole('button', { name: /AIで 素材を つくる/ })).toContainText('クレジットが なくなりました');
});
