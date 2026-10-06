// Prove end-to-end nel browser vero (Chromium), contro l'app costruita (npm run build)
// servita da "vite preview" e contro il finto Plexus. Serve l'app costruita perché
// il service worker (la parte che fa funzionare l'app offline) esiste solo nella build.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    locale: 'it-IT',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile/ },
    { name: 'telefono', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
  webServer: [
    {
      command: 'node finto-plexus/server.mjs',
      port: 8787,
      reuseExistingServer: !process.env.CI,
      env: { FINTO_PLEXUS_PORTA: '8787', FINTO_PLEXUS_SILENZIOSO: '1' },
    },
    {
      command: 'npm run preview',
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
