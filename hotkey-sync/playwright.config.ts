import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Firefox runs a smaller smoke spec to keep CI fast — see
    // `tests/e2e/firefox-smoke.spec.ts`. KeyCapture is the highest-risk
    // surface for browser differences, so it owns most of the smoke.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /firefox-smoke\.spec\.ts$/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
