import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
  fullyParallel: true,
  // Capped: many specs still sign in directly against the real Supabase project via
  // makeApiClient() (for setup/teardown as a specific user), whose password-auth rate
  // limit gets tripped by too many concurrent sign-ins, causing flaky login timeouts.
  // Page-level auth no longer contributes to this — login() reuses a session cached by
  // global-setup.js instead of driving a real sign-in per test.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // App is used almost exclusively on mobile — mobile viewport is the primary target.
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
