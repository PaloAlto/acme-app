import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://127.0.0.1:18789" },
  webServer: {
    command: "PORT=18789 node server.ts",
    url: "http://127.0.0.1:18789/login",
    reuseExistingServer: false,
  },
});
