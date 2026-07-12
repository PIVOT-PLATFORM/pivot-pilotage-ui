import { test, expect, Page, Route } from '@playwright/test';

// US22.4.1a/b/c — WBS (modèle arborescent & numérotation, indent/outdent & réordonnancement,
// agrégation des tâches récapitulatives). Same stubbing approach as `roadmap-board.e2e.spec.ts`:
// no live `pivot-pilotage-core` backend here, every HTTP call is stubbed via `page.route` against
// the static Angular production build. Locators are role/label-based — no `data-testid`.
//
// Runs against the real Transloco catalogue (`public/assets/i18n/fr.json`), unlike the Vitest
// specs which use `TranslocoTestingModule`'s raw-key stub.

const TENANT_PATH = '/tenants/1/teams/2/projects/3/gantt/tree';
const API_BASE = '**/api/pilotage/tenants/1/teams/2/projects/3/gantt';

interface WbsTaskDto {
  taskId: number;
  parentTaskId: number | null;
  wbsCode: string;
  name: string;
  nodeKind: 'SUMMARY' | 'LEAF' | 'MILESTONE' | 'RECURRING';
  nodeKindLabel: string;
  position: number;
  startDate: string | null;
  finishDate: string | null;
  durationMinutes: number | null;
  percentComplete: number | null;
  progressLabel: string | null;
  readOnly: boolean;
  ariaRole: string;
  ariaLevel: number;
  ariaSetSize: number;
  ariaPosInSet: number;
  ariaReadOnly: boolean;
  revision: number;
}

const SUMMARY: WbsTaskDto = {
  taskId: 1,
  parentTaskId: null,
  wbsCode: '1',
  name: 'Lot A',
  nodeKind: 'SUMMARY',
  nodeKindLabel: 'Summary task',
  position: 0,
  startDate: '2026-01-01T00:00:00Z',
  finishDate: '2026-03-01T00:00:00Z',
  durationMinutes: 4800,
  percentComplete: 50,
  progressLabel: '50%',
  readOnly: true,
  ariaRole: 'treeitem',
  ariaLevel: 1,
  ariaSetSize: 1,
  ariaPosInSet: 1,
  ariaReadOnly: true,
  revision: 0,
};

const LEAF_1: WbsTaskDto = {
  taskId: 2,
  parentTaskId: 1,
  wbsCode: '1.1',
  name: 'Spécification',
  nodeKind: 'LEAF',
  nodeKindLabel: 'Task',
  position: 0,
  startDate: '2026-01-01T00:00:00Z',
  finishDate: '2026-01-31T00:00:00Z',
  durationMinutes: 2400,
  percentComplete: 100,
  progressLabel: '100%',
  readOnly: false,
  ariaRole: 'treeitem',
  ariaLevel: 2,
  ariaSetSize: 2,
  ariaPosInSet: 1,
  ariaReadOnly: false,
  revision: 0,
};

const LEAF_2: WbsTaskDto = {
  taskId: 3,
  parentTaskId: 1,
  wbsCode: '1.2',
  name: 'Développement',
  nodeKind: 'LEAF',
  nodeKindLabel: 'Task',
  position: 1,
  startDate: '2026-02-01T00:00:00Z',
  finishDate: '2026-03-01T00:00:00Z',
  durationMinutes: 2400,
  percentComplete: 0,
  progressLabel: null,
  readOnly: false,
  ariaRole: 'treeitem',
  ariaLevel: 2,
  ariaSetSize: 2,
  ariaPosInSet: 2,
  ariaReadOnly: false,
  revision: 0,
};

const MILESTONE: WbsTaskDto = {
  taskId: 4,
  parentTaskId: 1,
  wbsCode: '1.3',
  name: 'Comité de lancement',
  nodeKind: 'MILESTONE',
  nodeKindLabel: 'Milestone',
  position: 2,
  startDate: '2026-01-20T00:00:00Z',
  finishDate: '2026-01-20T00:00:00Z',
  durationMinutes: 0,
  percentComplete: null,
  progressLabel: null,
  readOnly: false,
  ariaRole: 'treeitem',
  ariaLevel: 2,
  ariaSetSize: 3,
  ariaPosInSet: 3,
  ariaReadOnly: false,
  revision: 0,
};

async function fulfillJson(route: Route, status: number, json: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

async function stubTree(page: Page, nodes: WbsTaskDto[]): Promise<void> {
  await page.route(`${API_BASE}/tree`, route => fulfillJson(route, 200, { projectId: 3, ariaRole: 'tree', nodes }));
}

test.describe('WBS — arbre & numérotation (US22.4.1a)', () => {
  test('affiche le code WBS de chaque tâche et la hiérarchie via role=tree/treeitem', async ({ page }) => {
    await stubTree(page, [SUMMARY, LEAF_1, LEAF_2]);

    await page.goto(TENANT_PATH);

    const tree = page.getByRole('tree');
    await expect(tree).toBeVisible();

    const items = page.getByRole('treeitem');
    await expect(items).toHaveCount(3);

    await expect(page.getByRole('treeitem').filter({ hasText: 'Lot A' })).toContainText('1');
    await expect(page.getByRole('treeitem').filter({ hasText: 'Spécification' })).toContainText('1.1');
    await expect(page.getByRole('treeitem').filter({ hasText: 'Développement' })).toContainText('1.2');
  });

  test("affiche un message d'état vide quand le projet n'a aucune tâche WBS", async ({ page }) => {
    await stubTree(page, []);

    await page.goto(TENANT_PATH);

    await expect(page.getByText(/Aucune tâche pour l.instant/)).toBeVisible();
  });
});

test.describe('WBS — agrégation des tâches récapitulatives (US22.4.1c)', () => {
  test('une tâche récapitulative affiche ses champs agrégés en lecture seule, distincts visuellement', async ({
    page,
  }) => {
    await stubTree(page, [SUMMARY, LEAF_1, LEAF_2]);

    await page.goto(TENANT_PATH);

    const summaryRow = page.getByRole('treeitem').filter({ hasText: 'Lot A' });
    await expect(summaryRow).toContainText('Lecture seule');
    await expect(summaryRow).toContainText('50%');
    await expect(summaryRow).toHaveAttribute('aria-readonly', 'true');
    await expect(summaryRow).toHaveClass(/wbs-tree__item--summary/);
  });
});

test.describe('WBS — indent/outdent & réordonnancement (US22.4.1b)', () => {
  test('AC/A11y — Alt+Flèche droite au clavier déclenche un indent sur la tâche focalisée', async ({ page }) => {
    await stubTree(page, [SUMMARY, LEAF_1, LEAF_2]);
    let indentCalled = false;
    await page.route(`${API_BASE}/tasks/3/indent`, async route => {
      indentCalled = true;
      await fulfillJson(route, 200, { ...LEAF_2, ariaLevel: 3, wbsCode: '1.1.1', parentTaskId: 2 });
    });

    await page.goto(TENANT_PATH);

    const devRow = page.getByRole('treeitem').filter({ hasText: 'Développement' });
    await devRow.focus();
    await page.keyboard.press('Alt+ArrowRight');

    await expect.poll(() => indentCalled).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test("AC — le bouton visible « Monter » réordonne la tâche parmi ses frères (souris, sans glisser-déposer)", async ({
    page,
  }) => {
    await stubTree(page, [SUMMARY, LEAF_1, LEAF_2]);
    let moveBody: unknown;
    await page.route(`${API_BASE}/tasks/3/move`, async route => {
      moveBody = route.request().postDataJSON();
      await fulfillJson(route, 200, { ...LEAF_2, position: 0 });
    });

    await page.goto(TENANT_PATH);

    const devRow = page.getByRole('treeitem').filter({ hasText: 'Développement' });
    await devRow.getByRole('button', { name: 'Monter' }).click();

    await expect.poll(() => moveBody).toEqual({ position: 0 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('Security AC : un 403 (WbsEditPolicy fail-closed) affiche un message explicite sans modifier l\'arbre', async ({
    page,
  }) => {
    await stubTree(page, [SUMMARY, LEAF_1, LEAF_2]);
    await page.route(`${API_BASE}/tasks/3/indent`, route => route.fulfill({ status: 403 }));

    await page.goto(TENANT_PATH);

    const devRow = page.getByRole('treeitem').filter({ hasText: 'Développement' });
    await devRow.getByRole('button', { name: 'Abaisser (indent)' }).click();

    await expect(page.getByRole('alert')).toContainText(
      "Vous n'avez pas les droits pour modifier la structure de ce projet.",
    );
    // Rolled back — the tree is untouched, still 3 rows with the original WBS code.
    await expect(page.getByRole('treeitem')).toHaveCount(3);
    await expect(devRow).toContainText('1.2');
  });
});

test.describe('WBS — jalons & tâches périodiques (US22.4.6)', () => {
  test('AC1/A11y — un jalon (durée 0) affiche un losange distinct, sa classe CSS dédiée et un libellé texte, pas seulement une couleur/forme', async ({
    page,
  }) => {
    await stubTree(page, [SUMMARY, LEAF_1, MILESTONE]);

    await page.goto(TENANT_PATH);

    const milestoneRow = page.getByRole('treeitem').filter({ hasText: 'Comité de lancement' });
    await expect(milestoneRow).toHaveClass(/wbs-tree__item--milestone/);
    await expect(milestoneRow.locator('svg.node-kind-icon__glyph--milestone')).toBeVisible();
    await expect(milestoneRow).toContainText('Jalon');
    await expect(milestoneRow).toHaveAttribute('title', 'Milestone');
  });

  test('expose un lien vers le formulaire de création de série périodique', async ({ page }) => {
    await stubTree(page, [SUMMARY, LEAF_1, LEAF_2]);

    await page.goto(TENANT_PATH);

    await page.getByRole('link', { name: 'Créer une série de tâches périodiques' }).click();
    await expect(page).toHaveURL(/\/gantt\/tasks\/recurring$/);
  });
});
