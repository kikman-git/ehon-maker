import { defineConfig } from '@playwright/test';

/** Runs inside `firebase emulators:exec` (make web-sync-test): Auth, Firestore and Functions on localhost. */
export default defineConfig({
  testDir: './tests/emulator',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 1 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'pnpm dev --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/app.html',
    reuseExistingServer: false,
    env: { VITE_EMULATOR_HOST: '127.0.0.1' },
  },
});
