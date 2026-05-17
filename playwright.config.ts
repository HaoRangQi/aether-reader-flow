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
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'PORT=3001 npm run dev',
    url: 'http://localhost:3001',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
