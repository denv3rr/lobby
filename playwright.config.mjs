import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;
const serverMode = process.env.PLAYWRIGHT_SERVER_MODE || "dev";
const webServerCommand =
  process.env.PLAYWRIGHT_SERVER_COMMAND ||
  (serverMode === "preview"
    ? `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`
    : `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: {
    timeout: 12_000
  },
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    browserName: "chromium",
    baseURL,
    headless: true,
    viewport: {
      width: 1366,
      height: 768
    },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"]
    }
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: serverMode === "dev" && !process.env.CI
  }
});
