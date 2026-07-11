import { test, expect, Route } from '@playwright/test';

// US22.4.3 — dépendances typées (FS/SS/FF/SF) + retard/avance. Same approach as
// `roadmap-share.e2e.spec.ts`: no live `pivot-pilotage-core` backend, every HTTP call stubbed at
// the network level via `page.route`. The app runs with its real Transloco catalogue here —
// assertions check the actual rendered French copy from `public/assets/i18n/fr.json`.

const TENANT_PATH = '/tenants/1/teams/2/projects/3/gantt/dependencies';
const GANTT_BASE = '**/api/pilotage/tenants/1/teams/2/projects/3/gantt';

async function fulfillJson(route: Route, status: number, json: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

const TREE_RESPONSE = {
  projectId: 3,
  ariaRole: 'tree',
  nodes: [
    { taskId: 10, parentTaskId: null, wbsCode: '1', name: 'Analyse', nodeKind: 'LEAF', position: 0 },
    { taskId: 20, parentTaskId: null, wbsCode: '2', name: 'Conception', nodeKind: 'LEAF', position: 1 },
  ],
};

test.describe('Dépendances typées — happy path (US22.4.3)', () => {
  test('creates a typed dependency between two tasks, lists it, then deletes it', async ({ page }) => {
    await page.route(`${GANTT_BASE}/tree`, route => fulfillJson(route, 200, TREE_RESPONSE));

    let dependencies: unknown[] = [];
    await page.route(`${GANTT_BASE}/dependencies`, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, dependencies);
        return;
      }
      const created = { dependencyId: 500, predecessorTaskId: 10, successorTaskId: 20, linkType: 'SS', lagMinutes: -480 };
      await fulfillJson(route, 201, created);
    });
    await page.route(`${GANTT_BASE}/dependencies/500`, async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 204 });
        return;
      }
      await route.continue();
    });

    await page.goto(TENANT_PATH);

    await expect(page.getByRole('heading', { name: 'Dépendances entre tâches' })).toBeVisible();
    await expect(page.getByText('Aucune dépendance pour l\'instant.')).toBeVisible();

    // AC1 — creates a typed (SS) link with a lead (-480 min = -1 working day).
    await page.locator('#gantt-deps-predecessor').selectOption('10');
    await page.locator('#gantt-deps-successor').selectOption('20');
    await page.locator('#gantt-deps-link-type').selectOption('SS');
    await page.locator('#gantt-deps-lag').fill('-480');
    await page.getByRole('button', { name: 'Créer la dépendance' }).click();

    // AC — the created link is now visible, correctly typed, with its lag/lead.
    const row = page.locator('tbody tr').first();
    await expect(row).toContainText('1 — Analyse');
    await expect(row).toContainText('2 — Conception');
    await expect(row).toContainText('Début → Début (SS)');
    await expect(row).toContainText('-480 min');

    // Security AC — delete requires an explicit confirmation, never a native confirm() dialog.
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
    await expect(page.getByText('Confirmer la suppression ?')).toBeVisible();
    await page.getByRole('button', { name: 'Oui, supprimer' }).click();

    await expect(page.getByText('Aucune dépendance pour l\'instant.')).toBeVisible();
  });
});

test.describe('Dépendances typées — error case (US22.4.3)', () => {
  test('Error AC: a cycle rejection (409 SCHEDULE_CYCLE) shows an explicit message, and creates nothing', async ({
    page,
  }) => {
    await page.route(`${GANTT_BASE}/tree`, route => fulfillJson(route, 200, TREE_RESPONSE));
    await page.route(`${GANTT_BASE}/dependencies`, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, []);
        return;
      }
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'SCHEDULE_CYCLE', message: 'This link would create a cycle' }),
      });
    });

    await page.goto(TENANT_PATH);

    await page.locator('#gantt-deps-predecessor').selectOption('20');
    await page.locator('#gantt-deps-successor').selectOption('10');
    await page.getByRole('button', { name: 'Créer la dépendance' }).click();

    await expect(page.getByRole('alert')).toContainText('Ce lien créerait un cycle de dépendances — création refusée.');
    // No row was ever added for the rejected attempt.
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });
});
