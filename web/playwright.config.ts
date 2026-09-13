import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: 'emulator/**',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 1 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: { command: 'pnpm dev --port 4173 --strictPort', url: 'http://127.0.0.1:4173/app.html', reuseExistingServer: !process.env.CI },
});
