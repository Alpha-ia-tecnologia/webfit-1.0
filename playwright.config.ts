import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3107",
    headless: true,
    channel: "chrome",
    viewport: { width: 1365, height: 950 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --import tsx server/index.ts --production",
    url: "http://127.0.0.1:3107",
    env: {
      PORT: "3107",
      OPENAI_API_KEY: "",
      OPENAI_MODEL: "",
      DEEPSEEK_API_KEY: "",
      WEBFIT_LAN: "0",
    },
    reuseExistingServer: false,
    timeout: 60000,
  },
});
