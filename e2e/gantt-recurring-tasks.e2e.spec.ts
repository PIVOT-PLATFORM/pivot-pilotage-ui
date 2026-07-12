import { test, expect, Route } from '@playwright/test';

// US22.4.6 — jalons & tâches périodiques, second half ("given une tâche périodique (fréquence,
// occurrences), when je la crée, then les occurrences sont générées selon le calendrier"). Same
// stubbing approach as `gantt-dependencies.e2e.spec.ts`: no live `pivot-pilotage-core` backend
// here, every HTTP call is stubbed via `page.route`. Runs against the real Transloco catalogue
// (`public/assets/i18n/fr.json`).

const TENANT_PATH = '/tenants/1/teams/2/projects/3/gantt/tasks/recurring';
const GANTT_BASE = '**/api/pilotage/tenants/1/teams/2/projects/3/gantt';

async function fulfillJson(route: Route, status: number, json: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

const TREE_RESPONSE = {
  projectId: 3,
  ariaRole: 'tree',
  nodes: [{ taskId: 10, parentTaskId: null, wbsCode: '1', name: 'Lot A', nodeKind: 'SUMMARY', nodeKindLabel: 'Summary task', position: 0 }],
};

const RECURRING_RESPONSE = {
  series: {
    taskId: 501,
    parentTaskId: null,
    wbsCode: '2',
    name: 'Comité hebdo',
    nodeKind: 'RECURRING',
    nodeKindLabel: 'Recurring task series',
    position: 1,
  },
  recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=2;DTSTART=2026-08-01',
  occurrences: [
    {
      taskId: 502,
      parentTaskId: 501,
      wbsCode: '2.1',
      name: 'Comité hebdo — occurrence 1/2',
      nodeKind: 'MILESTONE',
      nodeKindLabel: 'Milestone',
      startDate: '2026-08-03T00:00:00Z',
    },
    {
      taskId: 503,
      parentTaskId: 501,
      wbsCode: '2.2',
      name: 'Comité hebdo — occurrence 2/2',
      nodeKind: 'MILESTONE',
      nodeKindLabel: 'Milestone',
      startDate: '2026-08-10T00:00:00Z',
    },
  ],
};

test.describe('Tâches périodiques — happy path (US22.4.6)', () => {
  test('crée une série périodique et affiche les occurrences générées', async ({ page }) => {
    await page.route(`${GANTT_BASE}/tree`, route => fulfillJson(route, 200, TREE_RESPONSE));
    let requestBody: unknown;
    await page.route(`${GANTT_BASE}/tasks/recurring`, async route => {
      requestBody = route.request().postDataJSON();
      await fulfillJson(route, 201, RECURRING_RESPONSE);
    });

    await page.goto(TENANT_PATH);

    await expect(page.getByRole('heading', { name: 'Nouvelle série de tâches périodiques' })).toBeVisible();

    await page.locator('#rt-name').fill('Comité hebdo');
    await page.locator('#rt-first-date').fill('2026-08-01');
    await page.locator('#rt-frequency').selectOption('WEEKLY');
    await page.locator('#rt-occurrence-count').fill('2');
    await page.getByRole('button', { name: 'Créer la série' }).click();

    await expect.poll(() => requestBody).toEqual({
      name: 'Comité hebdo',
      parentTaskId: undefined,
      firstOccurrenceDate: '2026-08-01',
      frequency: 'WEEKLY',
      intervalCount: 1,
      occurrenceCount: 2,
      durationMinutes: undefined,
    });

    await expect(page.getByRole('heading', { name: 'Série créée' })).toBeVisible();
    const occurrences = page.locator('.recurring-task__occurrence');
    await expect(occurrences).toHaveCount(2);
    await expect(occurrences.first()).toContainText('Comité hebdo — occurrence 1/2');
    await expect(occurrences.first().locator('svg.node-kind-icon__glyph--milestone')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('Tâches périodiques — cas d\'erreur (US22.4.6)', () => {
  test('Error AC : une fréquence manquante est refusée côté client avec un message explicite, sans appel réseau', async ({
    page,
  }) => {
    await page.route(`${GANTT_BASE}/tree`, route => fulfillJson(route, 200, TREE_RESPONSE));
    let createCalled = false;
    await page.route(`${GANTT_BASE}/tasks/recurring`, async route => {
      createCalled = true;
      await fulfillJson(route, 201, RECURRING_RESPONSE);
    });

    await page.goto(TENANT_PATH);

    await page.locator('#rt-name').fill('Comité hebdo');
    await page.locator('#rt-first-date').fill('2026-08-01');
    await page.locator('#rt-occurrence-count').fill('2');
    await page.getByRole('button', { name: 'Créer la série' }).click();

    await expect(page.getByRole('alert')).toContainText('Une fréquence est requise pour créer une tâche périodique.');
    expect(createCalled).toBe(false);
  });

  test('Security AC : un 403 (WbsEditPolicy fail-closed) affiche un message explicite sans afficher de résultat', async ({
    page,
  }) => {
    await page.route(`${GANTT_BASE}/tree`, route => fulfillJson(route, 200, TREE_RESPONSE));
    await page.route(`${GANTT_BASE}/tasks/recurring`, route => route.fulfill({ status: 403 }));

    await page.goto(TENANT_PATH);

    await page.locator('#rt-name').fill('Comité hebdo');
    await page.locator('#rt-first-date').fill('2026-08-01');
    await page.locator('#rt-frequency').selectOption('WEEKLY');
    await page.locator('#rt-occurrence-count').fill('2');
    await page.getByRole('button', { name: 'Créer la série' }).click();

    await expect(page.getByRole('alert')).toContainText(
      "Vous n'avez pas les droits pour créer une tâche périodique dans ce projet.",
    );
    await expect(page.getByRole('heading', { name: 'Série créée' })).toHaveCount(0);
  });
});
