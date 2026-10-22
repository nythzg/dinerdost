import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: {
    baseURL: process.env.QA_BASE_URL ?? "http://localhost:5091",
    viewport: { width: 1440, height: 1000 },
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
    screenshot: "only-on-failure",
  },
  webServer: process.env.QA_BASE_URL
    ? undefined
    : {
        command: "node ../../node_modules/next/dist/bin/next dev --port 5091",
        cwd: resolve("apps/web"),
        url: "http://localhost:5091",
        reuseExistingServer: false,
        timeout: 120000,
        env: {
          DATABASE_URL: "",
          VERCEL: "",
          LOCAL_DATABASE_PATH: ".data/browser-" + Date.now(),
          DD_NEXT_DIST_DIR: ".next-e2e",
        },
      },
});
