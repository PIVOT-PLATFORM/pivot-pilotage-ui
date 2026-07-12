import { test, expect, Route } from '@playwright/test';

// US22.4.9 — baselines multiples & analyse des écarts. Same approach as
// `gantt-dependencies.e2e.spec.ts`/`task-constraint.e2e.spec.ts`: no live `pivot-pilotage-core`
// backend, every HTTP call stubbed at the network level via `page.route`. The app runs with its
// real Transloco catalogue here — assertions check the actual rendered French copy from
// `public/assets/i18n/fr.json`, except for the backend-computed écarts labels
// (`*VarianceLabel`/`*DeltaLabel`), which are rendered verbatim from the mocked API response (see
// `baseline.models.ts`'s class TSDoc "rendered verbatim" note).

const TENANT_PATH = '/tenants/1/teams/2/projects/3/gantt/baselines';
const BASELINES_BASE = '**/api/pilotage/tenants/1/teams/2/projects/3/baselines';

async function fulfillJson(route: Route, status: number, json: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

test.describe('Baselines & écarts — happy path (US22.4.9)', () => {
  test('poses a baseline, then consults its per-task écarts vs the current plan', async ({ page }) => {
    let baselines: unknown[] = [];

    await page.route(BASELINES_BASE, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, baselines);
        return;
      }
      // AC1 — POST poses (auto-assigns slot 0, the request left the index blank).
      const posted = { id: 1, baselineIndex: 0, capturedAt: '2026-07-12T09:00:00.000Z', taskCount: 2 };
      baselines = [posted];
      await fulfillJson(route, 201, posted);
    });

    await page.route(`${BASELINES_BASE}/0/variance`, route =>
      fulfillJson(route, 200, {
        baselineIndex: 0,
        baselineCapturedAt: '2026-07-12T09:00:00.000Z',
        tasks: [
          {
            taskId: 10,
            taskName: 'Analyse',
            baselineStart: '2026-07-01T09:00:00Z',
            currentStart: '2026-07-04T09:00:00Z',
            startVarianceMinutes: 4320,
            startVarianceLabel: 'Début en retard de 3 j',
            baselineFinish: '2026-07-05T17:00:00Z',
            currentFinish: '2026-07-05T17:00:00Z',
            finishVarianceMinutes: 0,
            finishVarianceLabel: 'Fin sans écart',
            baselineDurationMinutes: 2400,
            currentDurationMinutes: 2400,
            durationVarianceMinutes: 0,
            durationVariancePercent: 0,
            durationVarianceLabel: 'Durée sans écart',
            baselineWorkMinutes: 4800,
            currentWorkMinutes: 4800,
            workVarianceMinutes: 0,
            workVariancePercent: 0,
            workVarianceLabel: 'Travail sans écart',
            baselineCostAmount: 1000,
            currentCostAmount: 1000,
            costVarianceAmount: 0,
            costVariancePercent: 0,
            costVarianceLabel: 'Coût sans écart',
            baselineTemporalPrecision: 'DAY',
            currentTemporalPrecision: 'DAY',
            temporalPrecisionChanged: false,
          },
        ],
      }),
    );

    await page.goto(TENANT_PATH);

    await expect(page.getByRole('heading', { name: 'Baselines & analyse des écarts' })).toBeVisible();
    await expect(page.getByText('Aucune baseline posée pour l\'instant.')).toBeVisible();

    // AC1 — pose a baseline, slot left blank (auto-assign).
    await page.getByRole('button', { name: 'Prendre la baseline' }).click();

    await expect(page.getByText('Baseline').first()).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'Baseline' }).first()).toContainText('2');

    // AC2 — pick that baseline as the active écarts reference; the table renders value + backend
    // colour-independent label side by side (A11y AC — never colour alone).
    await page.locator('#baseline-variance-select').selectOption('0');

    const row = page.locator('.baseline-panel__table--variance tbody tr').first();
    await expect(row).toContainText('Analyse');
    await expect(row).toContainText('Début en retard de 3 j');
  });
});

test.describe('Baselines & écarts — error case (US22.4.9)', () => {
  test('Error AC: refuses an auto-assigned 12th baseline and invites overwrite/delete', async ({ page }) => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      id: i + 1,
      baselineIndex: i,
      capturedAt: '2026-07-01T09:00:00.000Z',
      taskCount: 1,
    }));
    let postCalled = false;

    await page.route(BASELINES_BASE, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, eleven);
        return;
      }
      postCalled = true;
      await fulfillJson(route, 409, { code: 'BASELINE_LIMIT_EXCEEDED', message: 'all 11 baseline slots are already used' });
    });

    await page.goto(TENANT_PATH);

    await expect(
      page.getByText('Les 11 emplacements sont utilisés — écrasez ou supprimez une baseline existante avant d\'en poser une nouvelle.'),
    ).toBeVisible();

    // Pre-empted client-side (known from the already-loaded 11-baseline snapshot) — no round trip.
    await page.getByRole('button', { name: 'Prendre la baseline' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'Les 11 baselines possibles sont déjà utilisées — écrasez ou supprimez-en une avant d\'en poser une nouvelle.',
    );
    expect(postCalled).toBe(false);
  });
});
