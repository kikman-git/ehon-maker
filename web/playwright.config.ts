import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: 'emulator/**',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 1 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  // A developer's .env.local may point at a real project; this suite is the no-cloud one.
  webServer: {
    command: 'pnpm dev --port 4173 --strictPort', url: 'http://127.0.0.1:4173/app.html', reuseExistingServer: !process.env.CI,
    env: { VITE_EMULATOR_HOST: '', VITE_FIREBASE_PROJECT_ID: '' },
  },
});
