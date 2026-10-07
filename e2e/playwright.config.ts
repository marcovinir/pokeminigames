import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "4321";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // Un solo servidor y una sola base de datos: las pruebas se aíslan por usuario e IP, pero van de a una para que
  // los tiempos (cuenta atrás de 5 s, rondas) no dependan de la carga de la máquina.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-CR",
  },
  projects: [
    {
      name: "chromium",
      // Por defecto el Chromium de Playwright (`npx playwright install chromium`). Sin descargarlo, E2E_CHANNEL=msedge
      // o E2E_CHANNEL=chrome usan el navegador que ya tengas instalado.
      use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL || undefined },
    },
  ],
});
