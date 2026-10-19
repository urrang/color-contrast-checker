import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  use: { trace: 'retain-on-failure', viewport: { width: 1100, height: 800 } },
  webServer: {
    command: 'node tests/fixtures/server.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
