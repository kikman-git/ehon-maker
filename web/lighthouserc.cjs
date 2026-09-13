// Byte budgets from WEB_BACKEND_PLAN.md §11, checked on a production build served with gzip
// (tools/serve-dist.mjs). `make web-budget` locally, the web job in CI.
const { chromium } = require('@playwright/test');

const origin = 'http://127.0.0.1:4175';
const budget = (script, font, total) => ({
  'resource-summary:script:size': ['error', { maxNumericValue: script }],
  'resource-summary:font:size': ['error', { maxNumericValue: font }],
  'resource-summary:total:size': ['error', { maxNumericValue: total }],
  // A children's app: nothing loads from a host we do not run.
  'resource-summary:third-party:count': ['error', { maxNumericValue: 0 }],
});

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node tools/serve-dist.mjs 4175',
      startServerReadyPattern: 'listening',
      url: [`${origin}/`, `${origin}/app`, `${origin}/g/00000000000000000000000000000000`],
      numberOfRuns: 1,
      chromePath: process.env.CHROME_PATH || chromium.executablePath(),
      settings: { preset: 'desktop', onlyCategories: ['performance'] },
    },
    assert: {
      assertMatrix: [
        { matchingUrlPattern: '/g/', assertions: budget(300_000, 250_000, 700_000) },
        { matchingUrlPattern: '(/|/app)$', assertions: budget(600_000, 250_000, 1_000_000) },
      ],
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
