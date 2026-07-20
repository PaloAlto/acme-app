import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://127.0.0.1:8789' },
  webServer: {
    command: 'node server.ts',
    url: 'http://127.0.0.1:8789/login',
    reuseExistingServer: true,
  },
});
