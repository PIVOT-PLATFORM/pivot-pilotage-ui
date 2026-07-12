import { test, expect, Route } from '@playwright/test';

// US22.4.4 — contraintes de date & échéances. Same approach as `task-scheduling.e2e.spec.ts`/
// `gantt-dependencies.e2e.spec.ts`: no live `pivot-pilotage-core` backend, every HTTP call stubbed
// at the network level via `page.route`. The app runs with its real Transloco catalogue here —
// assertions check the actual rendered French copy from `public/assets/i18n/fr.json`.

const TASK_PATH = '/tenants/1/teams/2/projects/3/gantt/tasks/100/constraint';
const CONSTRAINT_URL = '**/api/pilotage/tenants/1/teams/2/projects/3/gantt/tasks/100/constraint';

async function fulfillJson(route: Route, status: number, json: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

const ASAP_NO_CONSTRAINT = {
  taskId: 100,
  constraintType: 'ASAP',
  constraintDate: null,
  deadline: null,
  warnings: [],
};

const MFO_WITH_CONFLICT = {
  taskId: 100,
  constraintType: 'MFO',
  constraintDate: '2026-08-14T17:00:00.000Z',
  deadline: null,
  warnings: [
    {
      type: 'CONSTRAINT_CONFLICT',
      detail: 'constraint MFO target 2026-08-14T17:00:00Z precedes hard dependency floor 2026-08-18T09:00:00Z; dependency honoured',
    },
  ],
};

test.describe('Contraintes de date & échéances — happy path (US22.4.4)', () => {
  test('AC1 — sets a "must finish on" constraint and sees the resulting conflict warning (icon + text, aria-live)', async ({
    page,
  }) => {
    let putBody: unknown;
    await page.route(CONSTRAINT_URL, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, ASAP_NO_CONSTRAINT);
        return;
      }
      putBody = route.request().postDataJSON();
      await fulfillJson(route, 200, MFO_WITH_CONFLICT);
    });

    await page.goto(TASK_PATH);

    await expect(page.getByRole('heading', { name: 'Contrainte de date & échéance' })).toBeVisible();
    await expect(page.locator('#task-constraint-type')).toHaveValue('ASAP');
    await expect(page.locator('#task-constraint-date')).toBeDisabled();

    // AC1 — "Doit finir le" (MFO) requires a date; picking it enables the date field.
    await page.locator('#task-constraint-type').selectOption('MFO');
    await expect(page.locator('#task-constraint-date')).toBeEnabled();
    await page.locator('#task-constraint-date').fill('2026-08-14T17:00');
    await page.getByRole('button', { name: 'Enregistrer la contrainte' }).click();

    expect(putBody).toEqual({
      constraintType: 'MFO',
      constraintDate: new Date('2026-08-14T17:00').toISOString(),
      deadline: null,
    });

    // Error AC — the conflict is honoured (dependency wins) but explicitly surfaced, icon + text,
    // never colour alone, inside the aria-live warnings region.
    const warning = page.locator('.task-constraint__warning');
    await expect(warning).toBeVisible();
    await expect(warning.locator('.task-constraint__warning-icon')).toHaveAttribute('aria-hidden', 'true');
    await expect(warning).toContainText('Conflit de contrainte');
    await expect(warning).toContainText('precedes hard dependency floor');
  });
});

test.describe('Contraintes de date & échéances — error case (US22.4.4)', () => {
  test('Error AC: a date-bearing type submitted without a date is rejected client-side, without calling the API', async ({
    page,
  }) => {
    let putCalled = false;
    await page.route(CONSTRAINT_URL, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, ASAP_NO_CONSTRAINT);
        return;
      }
      putCalled = true;
      await fulfillJson(route, 200, MFO_WITH_CONFLICT);
    });

    await page.goto(TASK_PATH);

    await page.locator('#task-constraint-type').selectOption('MSO');
    await page.getByRole('button', { name: 'Enregistrer la contrainte' }).click();

    await expect(page.getByRole('alert')).toContainText('Une date de contrainte est requise pour ce type de contrainte.');
    expect(putCalled).toBe(false);
  });
});
