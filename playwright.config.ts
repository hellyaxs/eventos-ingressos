import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    // WebGL headless precisa do SwiftShader para o mapa de assentos 3D.
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
    },
  },
  webServer: [
    {
      command: 'pnpm --filter @eventos/api dev',
      url: 'http://localhost:3000/api/events',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter @eventos/web dev',
      url: 'http://localhost:5173/login',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});