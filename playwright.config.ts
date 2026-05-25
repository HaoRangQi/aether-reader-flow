import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config.
 *
 * Single Chromium project — the app is desktop-Web first and we don't have
 * the bandwidth in P3 for cross-browser. P5 can add Firefox + WebKit.
 */
export default defineConfig({
  testDir: './src/tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3137',
    locale: 'zh-CN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run start -- -H 127.0.0.1 -p 3137',
    url: 'http://127.0.0.1:3137',
    timeout: 120_000,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
