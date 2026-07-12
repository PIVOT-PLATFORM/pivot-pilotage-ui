import { test, expect, Route } from '@playwright/test';

// US22.4.8 — suivi d'avancement (% réalisé, réel/restant). Same approach as
// `task-scheduling.e2e.spec.ts`/`task-constraint.e2e.spec.ts`: no live `pivot-pilotage-core`
// backend, every HTTP call stubbed at the network level via `page.route`. The app runs with its
// real Transloco catalogue here — assertions check the actual rendered French copy from
// `public/assets/i18n/fr.json`.

const TASK_PATH = '/tenants/1/teams/2/projects/3/gantt/tasks/100/progress';
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
      nodeKindLabel: 'Task',
      position: 0,
      startDate: '2026-01-05T09:00:00Z',
      finishDate: '2026-01-20T17:00:00Z',
      durationMinutes: 2400,
      percentComplete: 45,
      progressLabel: '45%',
      expectedPercentComplete: 60,
      late: true,
      progressVarianceLabel: '3d late',
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

test.describe('Suivi d\'avancement — happy path (US22.4.8)', () => {
  test('AC — records the percent complete, refreshes the bar and the actual/remaining work, and announces it', async ({
    page,
  }) => {
    let patchBody: unknown;
    await page.route(`${GANTT_BASE}/tree`, route => fulfillJson(route, 200, TREE_RESPONSE));
    await page.route(`${GANTT_BASE}/tasks/100/progress`, async route => {
      patchBody = route.request().postDataJSON();
      await fulfillJson(route, 200, {
        taskId: 100,
        percentComplete: 60,
        progressLabel: '60%',
        physicalPercentComplete: 55,
        actualWorkMinutes: 1440,
        remainingWorkMinutes: 960,
        totalWorkMinutes: 2400,
        actualStart: '2026-01-05T09:00:00.000Z',
        actualFinish: null,
        statusDate: '2026-01-15',
        revision: 1,
      });
    });

    await page.goto(TASK_PATH);

    await expect(page.getByRole('heading', { name: "Suivi d'avancement" })).toBeVisible();
    await expect(page.getByText('Développement')).toBeVisible();
    await expect(page.locator('#task-progress-percent')).toHaveValue('45');

    // AC — percent complete edit.
    await page.locator('#task-progress-percent').fill('60');
    await page.locator('#task-progress-physical-percent').fill('55');
    await page.locator('#task-progress-actor-ref').fill('jdupont');
    await page.getByRole('button', { name: "Enregistrer l'avancement" }).click();

    expect(patchBody).toEqual({
      percentComplete: 60,
      physicalPercentComplete: 55,
      actualStart: null,
      actualFinish: null,
      statusDate: null,
      actorRef: 'jdupont',
    });

    // AC — the bar and the actual/remaining work update together, exposed as text (A11y).
    await expect(page.locator('.task-progress-form__bar-label')).toHaveText('60%');
    await expect(page.getByText('Avancement mis à jour : 60%.')).toBeVisible();
    await expect(page.locator('dt:has-text("Travail réel") + dd')).toHaveText('1440');
    await expect(page.locator('dt:has-text("Travail restant") + dd')).toHaveText('960');
  });
});

test.describe('Suivi d\'avancement — error case (US22.4.8)', () => {
  test('Error AC: an out-of-range percent complete is rejected client-side, without calling the API', async ({ page }) => {
    await page.route(`${GANTT_BASE}/tree`, route => fulfillJson(route, 200, TREE_RESPONSE));
    let progressCalled = false;
    await page.route(`${GANTT_BASE}/tasks/100/progress`, async route => {
      progressCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(TASK_PATH);

    await page.locator('#task-progress-percent').fill('150');
    await page.locator('#task-progress-actor-ref').fill('jdupont');
    await page.getByRole('button', { name: "Enregistrer l'avancement" }).click();

    await expect(page.getByRole('alert')).toContainText('Le % réalisé doit être compris entre 0 et 100.');
    expect(progressCalled).toBe(false);
  });
});
