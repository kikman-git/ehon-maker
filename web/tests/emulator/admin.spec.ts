import { expect, test, type Page } from '@playwright/test';

const emulator = { firestore: 'http://127.0.0.1:8080/v1/projects/demo-ehon/databases/(default)/documents' };

async function signIn(page: Page, account: string) {
  await page.goto('/');
  await page.getByLabel('エミュレーター アカウント').fill(account);
  await page.getByRole('button', { name: 'エミュレーターで サインイン' }).click();
  await expect(page.getByRole('button', { name: `${account}@example.invalid` })).toBeVisible();
}

/** The Firestore emulator takes `Bearer owner` as the console would. */
async function makeAdmin(uid: string) {
  const response = await fetch(`${emulator.firestore}/config/admins`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { uids: { arrayValue: { values: [{ stringValue: uid }] } } } }),
  });
  if (!response.ok) throw new Error(`could not seed admins: ${response.status}`);
}

test('the admin page shows the day and the turns, flips the kill switch, and grants credits; others are turned away', async ({ page }) => {
  const account = `admin-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await signIn(page, account);
  await page.goto('/admin');
  await expect(page.getByRole('alert')).toContainText('管理者のみ ひらけます');
  // The refusal names the uid to list, which is also how the owner finds theirs.
  const uid = (await page.getByRole('alert').locator('code').last().textContent())!.trim();
  await makeAdmin(uid);

  await page.goto('/');
  await page.getByRole('button', { name: '白紙から描きはじめる' }).click();
  await page.waitForURL(/\/app\/[A-Za-z0-9_-]+$/);
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByRole('button', { name: /AIで 素材を つくる/ }).click();
  const atelier = page.getByRole('dialog', { name: '素材アトリエ' });
  await atelier.getByLabel('アトリエへの たのみごと').fill('ぼうしの くま');
  await atelier.getByRole('button', { name: '頼む' }).click();
  await expect(atelier.locator('.ai-message.status', { hasText: '6 クレジット · のこり 94' })).toBeVisible();

  await page.goto('/admin');
  const cards = page.getByLabel('きょう');
  await expect(cards).toContainText('きょうの ターン');
  await expect(page.getByLabel('日ごと').locator('tbody tr').first()).toContainText('atelier 1');
  const recent = page.getByLabel('さいきんの ターン').locator('tbody tr');
  await expect(recent).toHaveCount(1);
  await expect(recent.first()).toContainText('atelier');
  await expect(recent.first()).toContainText('ok');

  await recent.first().getByRole('button').click();
  await page.getByRole('button', { name: 'しらべる' }).click();
  await expect(page.getByRole('region', { name: 'アカウント' })).toContainText('のこり 94');
  await page.getByLabel('クレジットを 足す').fill('50');
  await page.getByRole('button', { name: '足す' }).click();
  await expect(page.getByRole('region', { name: 'アカウント' })).toContainText('のこり 144');
  await page.getByRole('button', { name: 'プラスに する' }).click();
  await expect(page.getByRole('region', { name: 'アカウント' })).toContainText('プラン plus');

  await page.getByRole('button', { name: 'AI を 止める' }).click();
  await expect(page.getByRole('button', { name: 'AI を 再開する' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: /AI クレジット/ }).click();
  await expect(page.getByRole('dialog', { name: 'アカウント' })).toContainText('144');
  await page.getByRole('button', { name: 'とじる' }).click();
  await page.getByRole('button', { name: '白紙から描きはじめる' }).click();
  await page.waitForURL(/\/app\/[A-Za-z0-9_-]+$/);
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByLabel('AIへの たのみごと').fill('ここに ねこを かいて');
  await page.getByRole('button', { name: '頼む' }).click();
  await expect(page.locator('.ai-message.status[data-error]')).toHaveText('AI は いま おやすみちゅうです。');

  await page.goto('/admin');
  await page.getByRole('button', { name: 'AI を 再開する' }).click();
  await expect(page.getByRole('button', { name: 'AI を 止める' })).toBeVisible();
});
