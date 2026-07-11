import { test, expect, Page, Route } from '@playwright/test';

// US22.3.1 — roadmap rapide. Mirrors `pivot-agilite-ui`'s E2E approach (`retro-*.e2e.spec.ts`):
// no live `pivot-pilotage-core` backend is started here (this bootstrap doesn't publish a GHCR
// image yet, see TODO-SETUP.md) — every HTTP call is stubbed at the network level via
// `page.route`, so these specs only need the static Angular production build already served by
// this workflow. Locators are role/label-based throughout — no `data-testid` anywhere in this
// codebase family.
//
// The app runs with its real Transloco catalogue here (unlike the Vitest specs, which use
// `TranslocoTestingModule`'s raw-key stub) — assertions below check the actual rendered French
// copy from `public/assets/i18n/fr.json`.

const TENANT_PATH = '/tenants/1/teams/2/projects/3/roadmap';
const API_BASE = '**/api/pilotage/tenants/1/teams/2/projects/3/roadmap';

interface LaneDto {
  id: number;
  name: string;
  position: number;
}

async function fulfillJson(route: Route, status: number, json: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

/** Stubs the `/milestones` GET (empty by default) — every spec below needs this route to exist so `RoadmapBoardComponent`'s `forkJoin` (US22.3.4) completes, even when a spec has nothing to say about milestones. */
async function stubEmptyMilestones(page: Page): Promise<void> {
  await page.route(`${API_BASE}/milestones`, route => fulfillJson(route, 200, []));
}

test.describe('Roadmap rapide — happy path (US22.3.1)', () => {
  test('creates a lane, poses an initiative on it without dates, and moves it with the keyboard', async ({
    page,
  }) => {
    let lanes: LaneDto[] = [];

    await page.route(`${API_BASE}/lanes`, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, lanes);
        return;
      }
      const body = route.request().postDataJSON() as { name: string };
      const created: LaneDto = { id: 10, name: body.name, position: lanes.length };
      lanes = [...lanes, created];
      await fulfillJson(route, 201, created);
    });

    await page.route(`${API_BASE}/initiatives`, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, []);
        return;
      }
      const body = route.request().postDataJSON() as { name: string; laneId: number };
      await fulfillJson(route, 201, {
        id: 100,
        laneId: body.laneId,
        name: body.name,
        fuzzyPeriodStart: null,
        fuzzyPeriodEnd: null,
        temporalPrecision: 'QUARTER',
        revision: 0,
      });
    });

    await page.route(`${API_BASE}/initiatives/100`, async route => {
      await fulfillJson(route, 200, {
        id: 100,
        laneId: 10,
        name: 'Initiative A',
        fuzzyPeriodStart: '2026-04-01',
        fuzzyPeriodEnd: '2026-06-30',
        temporalPrecision: 'QUARTER',
        revision: 1,
      });
    });

    await stubEmptyMilestones(page);

    await page.goto(TENANT_PATH);

    await expect(page.getByText(/Aucune lane pour l.instant/)).toBeVisible();

    // AC "create a lane".
    await page.getByLabel(/Nom de la lane/).fill('Thème A');
    await page.getByRole('button', { name: 'Créer la lane' }).click();
    // `.rm-lane__label` (not a plain getByText) — the same lane name is also rendered as an
    // `<option>` inside the create-initiative `<select>` below, which would make a bare text
    // query ambiguous (strict-mode violation).
    await expect(page.locator('.rm-lane__label', { hasText: 'Thème A' })).toBeVisible();

    // AC1 — pose an initiative on that lane without requiring tasks or precise dates.
    await page.getByLabel("Nom de l'initiative").fill('Initiative A');
    // `exact: true` avoids matching the "Nom de la lane…" text input, whose label also
    // contains the substring "lane" (Playwright's default getByLabel match is substring-based).
    await page.getByLabel('Lane', { exact: true }).selectOption({ label: 'Thème A' });
    await page.getByRole('button', { name: "Créer l'initiative" }).click();

    const bar = page.getByRole('button', { name: /Initiative A/ });
    await expect(bar).toBeVisible();

    // AC2 + A11y AC — move it with the keyboard, no mouse involved.
    await bar.focus();
    await page.keyboard.press('ArrowRight');

    // The move succeeded — no error surfaced.
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('Roadmap rapide — error cases (US22.3.1)', () => {
  test('Error AC: rejects creating an initiative with no lane selected, with an explicit message', async ({
    page,
  }) => {
    await stubRoadmap(page, { lanes: [{ id: 10, name: 'Thème A', position: 0 }], initiatives: [] });

    await page.goto(TENANT_PATH);

    await page.getByLabel("Nom de l'initiative").fill('Initiative sans lane');
    await page.getByRole('button', { name: "Créer l'initiative" }).click();

    await expect(page.getByRole('alert')).toContainText('Une lane est requise pour créer une initiative.');
  });

  test('Security AC: surfaces a permission error when the backend denies the write (403)', async ({ page }) => {
    await stubRoadmap(page, { lanes: [], initiatives: [] });
    await page.route(`${API_BASE}/lanes`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 403 });
      } else {
        await fulfillJson(route, 200, []);
      }
    });

    await page.goto(TENANT_PATH);

    await page.getByLabel(/Nom de la lane/).fill('Thème B');
    await page.getByRole('button', { name: 'Créer la lane' }).click();

    await expect(page.getByRole('alert')).toContainText(
      "Vous n'avez pas les droits pour créer une lane sur ce projet.",
    );
  });
});

async function stubRoadmap(
  page: Page,
  data: { lanes: LaneDto[]; initiatives: unknown[]; milestones?: unknown[] },
): Promise<void> {
  await page.route(`${API_BASE}/lanes`, route => fulfillJson(route, 200, data.lanes));
  await page.route(`${API_BASE}/initiatives`, route => fulfillJson(route, 200, data.initiatives));
  await page.route(`${API_BASE}/milestones`, route => fulfillJson(route, 200, data.milestones ?? []));
}

test.describe('Échelle de temps floue (US22.3.2)', () => {
  test('switches the axis grain (mois/trimestre/semestre) with the keyboard, without touching the stored period', async ({
    page,
  }) => {
    let updatePlacementCalls = 0;

    await stubRoadmap(page, {
      lanes: [{ id: 10, name: 'Thème A', position: 0 }],
      initiatives: [
        {
          id: 100,
          laneId: 10,
          name: 'Initiative A',
          fuzzyPeriodStart: '2026-02-10',
          fuzzyPeriodEnd: '2026-02-20',
          temporalPrecision: 'QUARTER',
          revision: 0,
        },
      ],
    });
    await page.route(`${API_BASE}/initiatives/100`, async route => {
      updatePlacementCalls++;
      await fulfillJson(route, 200, {});
    });

    await page.goto(TENANT_PATH);

    const scaleSelect = page.getByLabel('Échelle de temps');
    await expect(scaleSelect).toBeVisible();
    // AC — default grain is Trimestre (QUARTER), matching US22.3.1's fixed axis.
    await expect(scaleSelect).toHaveValue('QUARTER');

    // A11y AC — keyboard-operable: focus the selector directly (two other forms precede it in
    // tab order, so a single blind `Tab` from page load isn't a reliable way to reach it — see
    // `RoadmapBoardComponent`'s template), then drive it with real keyboard input. A native
    // `<select>` moves to the adjacent option on ArrowUp/ArrowDown without opening a popup —
    // `MONTH` is the option just before the default `QUARTER`.
    await scaleSelect.focus();
    await expect(scaleSelect).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(scaleSelect).toHaveValue('MONTH');

    // AC — bars re-align on the new grain's period boundaries; the initiative's own stored
    // period is never touched by a scale switch (no PATCH fired).
    const bar = page.getByRole('button', { name: /Initiative A/ });
    await expect(bar).toBeVisible();
    expect(updatePlacementCalls).toBe(0);

    // ArrowDown twice: MONTH -> QUARTER -> SEMESTER.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(scaleSelect).toHaveValue('SEMESTER');
    await expect(bar).toBeVisible();
    expect(updatePlacementCalls).toBe(0);

    // Error AC — switching back to the original grain never lost/truncated the stored period:
    // no error surfaced, initiative still rendered.
    await page.keyboard.press('ArrowUp');
    await expect(scaleSelect).toHaveValue('QUARTER');
    await expect(bar).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(updatePlacementCalls).toBe(0);
  });
});

test.describe('Jalons stratégiques (US22.3.4)', () => {
  test('creates a cross-project milestone (no lane) and moves it with the keyboard', async ({ page }) => {
    let milestones: unknown[] = [];

    await stubRoadmap(page, { lanes: [{ id: 10, name: 'Thème A', position: 0 }], initiatives: [] });
    await page.route(`${API_BASE}/milestones`, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, milestones);
        return;
      }
      const body = route.request().postDataJSON() as { name: string; date: string; laneId?: number };
      const created = {
        id: 200,
        laneId: body.laneId ?? null,
        name: body.name,
        date: body.date,
        temporalPrecision: 'DAY',
        revision: 0,
      };
      milestones = [...milestones, created];
      await fulfillJson(route, 201, created);
    });
    await page.route(`${API_BASE}/milestones/200`, async route => {
      await fulfillJson(route, 200, {
        id: 200,
        laneId: null,
        name: 'Go/No-Go',
        date: '2026-04-01',
        temporalPrecision: 'DAY',
        revision: 1,
      });
    });

    await page.goto(TENANT_PATH);

    // AC1 — create a strategic milestone, visible on the roadmap without needing a lane.
    await page.getByLabel('Nom du jalon').fill('Go/No-Go');
    await page.getByLabel('Date', { exact: true }).fill('2026-06-01');
    await page.getByRole('button', { name: 'Créer le jalon' }).click();

    const marker = page.getByRole('button', { name: /Jalon Go\/No-Go/ });
    await expect(marker).toBeVisible();

    // AC2 + A11y AC — move it with the keyboard, no mouse involved; the date change is written
    // through the same PATCH a future Gantt view would use (single source of truth, EN22.1).
    await marker.focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('Error AC: rejects creating a milestone with no date, with an explicit message (MILESTONE_DATE_REQUIRED)', async ({
    page,
  }) => {
    await stubRoadmap(page, { lanes: [{ id: 10, name: 'Thème A', position: 0 }], initiatives: [] });

    await page.goto(TENANT_PATH);

    await page.getByLabel('Nom du jalon').fill('Jalon sans date');
    await page.getByRole('button', { name: 'Créer le jalon' }).click();

    await expect(page.getByRole('alert')).toContainText('Une date est requise pour créer un jalon.');
  });

  test('Error AC: surfaces MILESTONE_DATE_OUT_OF_BOUNDS when the backend rejects the date', async ({ page }) => {
    await stubRoadmap(page, { lanes: [], initiatives: [] });
    await page.route(`${API_BASE}/milestones`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'MILESTONE_DATE_OUT_OF_BOUNDS', message: 'out of bounds' }),
        });
        return;
      }
      await fulfillJson(route, 200, []);
    });

    await page.goto(TENANT_PATH);

    await page.getByLabel('Nom du jalon').fill('Jalon hors bornes');
    await page.getByLabel('Date', { exact: true }).fill('1999-01-01');
    await page.getByRole('button', { name: 'Créer le jalon' }).click();

    await expect(page.getByRole('alert')).toContainText("Cette date est en dehors des bornes planifiées du projet.");
  });

  test('Security AC: surfaces a permission error when the backend denies the milestone write (403)', async ({
    page,
  }) => {
    await stubRoadmap(page, { lanes: [], initiatives: [] });
    await page.route(`${API_BASE}/milestones`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 403 });
      } else {
        await fulfillJson(route, 200, []);
      }
    });

    await page.goto(TENANT_PATH);

    await page.getByLabel('Nom du jalon').fill('Go/No-Go');
    await page.getByLabel('Date', { exact: true }).fill('2026-06-01');
    await page.getByRole('button', { name: 'Créer le jalon' }).click();

    await expect(page.getByRole('alert')).toContainText(
      "Vous n'avez pas les droits pour créer un jalon sur ce projet.",
    );
  });
});

test.describe('Vue Now/Next/Later (US22.3.3)', () => {
  test('bascule vers la vue en 3 colonnes et déplace une initiative au clavier', async ({ page }) => {
    await stubRoadmap(page, {
      lanes: [{ id: 10, name: 'Thème A', position: 0 }],
      initiatives: [
        {
          id: 100,
          laneId: 10,
          name: 'Initiative A',
          fuzzyPeriodStart: null,
          fuzzyPeriodEnd: null,
          temporalPrecision: 'QUARTER',
          revision: 0,
          horizon: 'NOW',
        },
      ],
    });
    await page.route(`${API_BASE}/horizon-view`, route =>
      fulfillJson(route, 200, {
        buckets: [
          {
            horizon: 'NOW',
            initiatives: [
              {
                id: 100,
                laneId: 10,
                name: 'Initiative A',
                fuzzyPeriodStart: null,
                fuzzyPeriodEnd: null,
                temporalPrecision: 'QUARTER',
                revision: 0,
                horizon: 'NOW',
              },
            ],
          },
          { horizon: 'NEXT', initiatives: [] },
          { horizon: 'LATER', initiatives: [] },
        ],
        unbucketed: [],
      }),
    );
    await page.route(`${API_BASE}/initiatives/100/horizon`, async route => {
      const body = route.request().postDataJSON() as { horizon: string };
      await fulfillJson(route, 200, {
        id: 100,
        laneId: 10,
        name: 'Initiative A',
        fuzzyPeriodStart: null,
        fuzzyPeriodEnd: null,
        temporalPrecision: 'QUARTER',
        revision: 1,
        horizon: body.horizon,
      });
    });

    await page.goto(TENANT_PATH);

    // AC1 — bascule vers la vue Now/Next/Later : même jeu d'initiatives, changement de rendu.
    await page.getByRole('button', { name: 'Now / Next / Later' }).click();

    const card = page.getByRole('button', { name: /Initiative A/ });
    await expect(card).toBeVisible();

    // AC2 + A11y AC — déplacement au clavier, pas uniquement au glisser-déposer souris.
    await card.focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test("Security AC: surfaces a permission error when the backend denies the horizon write (403)", async ({
    page,
  }) => {
    await stubRoadmap(page, {
      lanes: [{ id: 10, name: 'Thème A', position: 0 }],
      initiatives: [],
    });
    const initiative = {
      id: 100,
      laneId: 10,
      name: 'Initiative A',
      fuzzyPeriodStart: null,
      fuzzyPeriodEnd: null,
      temporalPrecision: 'QUARTER',
      revision: 0,
      horizon: 'NOW',
    };
    await page.route(`${API_BASE}/horizon-view`, route =>
      fulfillJson(route, 200, {
        buckets: [
          { horizon: 'NOW', initiatives: [initiative] },
          { horizon: 'NEXT', initiatives: [] },
          { horizon: 'LATER', initiatives: [] },
        ],
        unbucketed: [],
      }),
    );
    await page.route(`${API_BASE}/initiatives/100/horizon`, route => route.fulfill({ status: 403 }));

    await page.goto(TENANT_PATH);

    await page.getByRole('button', { name: 'Now / Next / Later' }).click();
    const card = page.getByRole('button', { name: /Initiative A/ });
    await card.focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.getByRole('alert')).toContainText(
      "Vous n'avez pas les droits pour changer l'horizon de cette initiative.",
    );
    // Rolled back — the initiative is still visible.
    await expect(card).toBeVisible();
  });
});
