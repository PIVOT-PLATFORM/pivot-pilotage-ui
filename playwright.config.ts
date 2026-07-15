import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // testDir global conservé pour rétro-compat ; chaque projet cible explicitement son dossier.
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  // CI runner ubuntu-latest = 4 vCPU. 2 workers parallélisent les specs sans saturer
  // le backend pivot-core (conteneur unique). Local : Playwright auto-détecte (undefined).
  workers: process.env['CI'] ? 2 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    // --- Éphémère (mocké, page.route) — joué par e2e.yml sur chaque PR/push -----------------
    // Scopé explicitement à ./e2e pour ne JAMAIS ramasser les specs recette de ./e2e-recette.
    {
      name: 'chromium',
      testDir: './e2e',
      use: { ...devices['Desktop Chrome'] },
    },

    // --- Recette (infra RÉELLE) — joué par e2e-recette.yml après déploiement ----------------
    // Se connecte une fois avec le compte de recette dédié, sauvegarde la session, puis les
    // specs @recette la réutilisent. baseURL = site déployé, jamais localhost.
    {
      name: 'recette-setup',
      testDir: './e2e-recette',
      testMatch: /recette\.setup\.ts/,
      use: {
        baseURL: process.env['RECETTE_BASE_URL'] ?? 'https://recette.pivot-platform.fr',
      },
    },
    {
      name: 'recette',
      testDir: './e2e-recette',
      testIgnore: /recette\.setup\.ts/,
      dependencies: ['recette-setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['RECETTE_BASE_URL'] ?? 'https://recette.pivot-platform.fr',
        storageState: 'e2e-recette/.auth/recette.json',
      },
    },
  ],
});
