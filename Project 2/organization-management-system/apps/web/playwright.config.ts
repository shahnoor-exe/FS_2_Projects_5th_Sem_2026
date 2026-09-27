import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm --workspace=@orgsphere/api run start',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: true,
      cwd: '../..',
      timeout: 30000,
    },
    {
      command: 'npm --workspace=@orgsphere/web run dev -- --port 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      cwd: '../..',
      timeout: 30000,
    },
  ],
});
