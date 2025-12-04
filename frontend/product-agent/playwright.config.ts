import { defineConfig, devices, type ReporterDescription } from '@playwright/test';

const reporters: ReporterDescription[] = [['list']];

if (process.env.CI) {
  reporters.push(['github']);
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: reporters,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3010',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: 'PORT=3010 HOSTNAME=127.0.0.1 npm run start',
        url: 'http://127.0.0.1:3010',
        reuseExistingServer: !process.env.CI,
      },
});
