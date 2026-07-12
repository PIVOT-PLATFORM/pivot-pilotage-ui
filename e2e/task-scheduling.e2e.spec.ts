import { test, expect, Route } from '@playwright/test';

// US22.4.2 — durées, effort, planification auto vs manuelle. Same approach as
// `gantt-dependencies.e2e.spec.ts`: no live `pivot-pilotage-core` backend, every HTTP call stubbed
// at the network level via `page.route`. The app runs with its real Transloco catalogue here —
// assertions check the actual rendered French copy from `public/assets/i18n/fr.json`.

const TASK_PATH = '/tenants/1/teams/2/projects/3/gantt/tasks/100/scheduling';
const GANTT_BASE = '**/api/pilotage/tenants/1/teams/2/projects/3/gantt';

async function fulfillJson(route: Route, status: number, json: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

const TREE_RESPONSE = {
  projectId: 3,
  ariaRole: 'tree',
  nodes: [
    {
      taskId: 100,
      parentTaskId: null,
      wbsCode: '1',
      name: 'Développement',
      nodeKind: 'LEAF',
      position: 0,
      startDate: '2026-01-05T09:00:00Z',
      finishDate: '2026-01-05T17:00:00Z',
      durationMinutes: 480,
      percentComplete: 0,
      progressLabel: '0%',
      readOnly: false,
      ariaRole: 'treeitem',
      ariaLevel: 1,
      ariaSetSize: 1,
      ariaPosInSet: 1,
      ariaReadOnly: false,
      revision: 0,
    },
  ],
};

test.describe('Durées/effort/planification — happy path (US22.4.2)', () => {
  test('edits the duration, sets the effort, then switches to manual scheduling and sees the variance', async ({ page }) => {
    await page.route(`${GANTT_BASE}/tree`, route => fulfillJson(route, 200, TREE_RESPONSE));
    await page.route(`${GANTT_BASE}/tasks/100/duration`, route =>
      fulfillJson(route, 200, {
        taskId: 100,
        schedulingMode: null,
        effectiveMode: 'AUTO',
        durationMinutes: 960,
        workMinutes: null,
        startDate: '2026-01-05T09:00:00Z',
        finishDate: '2026-01-06T17:00:00Z',
        plannedManual: null,
        wouldBeAuto: null,
        deltaMinutes: 0,
        revision: 1,
      }),
    );
    await page.route(`${GANTT_BASE}/tasks/100/effort`, route =>
      fulfillJson(route, 200, {
        taskId: 100,
        schedulingMode: null,
        effectiveMode: 'AUTO',
        durationMinutes: 960,
        workMinutes: 480,
        startDate: '2026-01-05T09:00:00Z',
        finishDate: '2026-01-06T17:00:00Z',
        plannedManual: null,
        wouldBeAuto: null,
        deltaMinutes: 0,
        revision: 2,
      }),
    );
    await page.route(`${GANTT_BASE}/tasks/100/scheduling-mode`, route =>
      fulfillJson(route, 200, {
        taskId: 100,
        schedulingMode: 'MANUAL',
        effectiveMode: 'MANUAL',
        durationMinutes: 960,
        workMinutes: 480,
        startDate: '2026-01-08T09:00:00Z',
        finishDate: '2026-01-09T17:00:00Z',
        plannedManual: '2026-01-08T09:00:00Z',
        wouldBeAuto: '2026-01-05T09:00:00Z',
        deltaMinutes: 480,
        revision: 3,
      }),
    );

    await page.goto(TASK_PATH);

    await expect(page.getByRole('heading', { name: 'Durée, effort & planification' })).toBeVisible();
    await expect(page.getByText('Développement')).toBeVisible();

    // AC — duration edit.
    await page.locator('#task-scheduling-duration').fill('960');
    await page.getByRole('button', { name: 'Enregistrer la durée' }).click();
    await expect(page.getByText('Durée mise à jour : 960 minutes ouvrées.')).toBeVisible();

    // AC — effort edit derives the planned work.
    await page.locator('#task-scheduling-resource-ref').fill('alice');
    await page.locator('#task-scheduling-units').fill('50');
    await page.getByRole('button', { name: "Enregistrer l'effort" }).click();
    await expect(page.getByText(/Effort mis à jour pour alice/)).toBeVisible();

    // AC2 — switching to manual pins the dates and surfaces the variance, never silently overwritten.
    // Scoped dt/dd locators, not a bare text match: the pinned start (2026-01-08) legitimately
    // repeats between the "current start" and "manually pinned start" rows once MANUAL.
    await page.getByRole('button', { name: 'Manuel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Manuel', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('dt:has-text("Début figé manuellement") + dd')).toHaveText('2026-01-08');
    await expect(page.locator('dt:has-text("mode automatique") + dd')).toHaveText('2026-01-05');
  });
});

test.describe('Durées/effort/planification — error case (US22.4.2)', () => {
  test('Error AC: a negative duration is rejected client-side, without calling the API, and the task keeps its previous value', async ({
    page,
  }) => {
    await page.route(`${GANTT_BASE}/tree`, route => fulfillJson(route, 200, TREE_RESPONSE));
    let durationCalled = false;
    await page.route(`${GANTT_BASE}/tasks/100/duration`, async route => {
      durationCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(TASK_PATH);

    await page.locator('#task-scheduling-duration').fill('-10');
    await page.getByRole('button', { name: 'Enregistrer la durée' }).click();

    await expect(page.getByRole('alert')).toContainText('La durée ne peut pas être négative.');
    expect(durationCalled).toBe(false);
    // The task keeps its previous value — the input reverts to the last confirmed duration.
    await expect(page.locator('#task-scheduling-duration')).toHaveValue('480');
  });
});
