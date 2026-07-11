import { test, expect, Route } from '@playwright/test';

// US22.3.5 — partage & export de la roadmap. Same approach as `roadmap-board.e2e.spec.ts`: no
// live `pivot-pilotage-core` backend, every HTTP call stubbed at the network level via
// `page.route`. The app runs with its real Transloco catalogue here — assertions check the
// actual rendered French copy from `public/assets/i18n/fr.json`.

const TENANT_PATH = '/tenants/1/teams/2/projects/3/roadmap';
const API_BASE = '**/api/pilotage/tenants/1/teams/2/projects/3/roadmap';
const SHARE_TOKEN = 'e'.repeat(64);

async function fulfillJson(route: Route, status: number, json: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

test.describe('Partage & export — happy path (US22.3.5)', () => {
  test('creates a share link, reveals its token once, and the public link renders the roadmap read-only', async ({
    page,
  }) => {
    await page.route(`${API_BASE}/lanes`, route => fulfillJson(route, 200, [{ id: 10, name: 'Thème A', position: 0 }]));
    await page.route(`${API_BASE}/initiatives`, route =>
      fulfillJson(route, 200, [
        {
          id: 100,
          laneId: 10,
          name: 'Initiative A',
          fuzzyPeriodStart: '2026-04-01',
          fuzzyPeriodEnd: '2026-06-30',
          temporalPrecision: 'QUARTER',
          revision: 0,
        },
      ]),
    );

    let shareLinks: unknown[] = [];
    await page.route(`${API_BASE}/share-links`, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, shareLinks);
        return;
      }
      const created = { id: 1, token: SHARE_TOKEN, createdAt: '2026-07-11T10:00:00Z', expiresAt: null };
      shareLinks = [{ id: 1, createdAt: created.createdAt, expiresAt: null, revokedAt: null, active: true }];
      await fulfillJson(route, 201, created);
    });

    await page.goto(TENANT_PATH);

    // AC — open the share panel and create a link (no expiry).
    await page.getByRole('button', { name: 'Liens de partage' }).click();
    await page.getByRole('button', { name: 'Créer un lien' }).click();

    // AC — the raw token is revealed exactly once, in the constructed shareable URL.
    await expect(page.getByText('Lien créé — copiez-le maintenant')).toBeVisible();
    const revealedUrl = page.locator('.rm-share__reveal-url');
    await expect(revealedUrl).toContainText(`/roadmap-shares/${SHARE_TOKEN}`);

    // Now open that public link in a fresh context — stub the public, unauthenticated endpoint.
    await page.route(`**/api/pilotage/public/roadmap-shares/${SHARE_TOKEN}`, route =>
      fulfillJson(route, 200, {
        projectName: 'Projet Alpha',
        lanes: [{ id: 10, name: 'Thème A', position: 0 }],
        initiatives: [
          {
            id: 100,
            laneId: 10,
            name: 'Initiative A',
            fuzzyPeriodStart: '2026-04-01',
            fuzzyPeriodEnd: '2026-06-30',
            temporalPrecision: 'QUARTER',
            revision: 0,
          },
        ],
      }),
    );

    await page.goto(`/roadmap-shares/${SHARE_TOKEN}`);

    // AC — the recipient sees the roadmap, read-only, without needing an account/session.
    await expect(page.getByRole('heading', { name: 'Projet Alpha' })).toBeVisible();
    await expect(page.getByText('Vue en lecture seule — vous ne pouvez pas modifier cette roadmap.')).toBeVisible();
    await expect(page.locator('.rm-lane__label', { hasText: 'Thème A' })).toBeVisible();
    await expect(page.getByText('Initiative A')).toBeVisible();

    // Security AC — no edit affordance is even present: no form, no [role="button"] bar, no
    // create-lane/create-initiative inputs anywhere on this page.
    await expect(page.locator('form')).toHaveCount(0);
    await expect(page.locator('input, select')).toHaveCount(0);
    await expect(page.locator('[role="button"]')).toHaveCount(0);

    // AC1 — export controls are available on the read-only view too.
    await expect(page.getByRole('button', { name: 'Exporter en PNG' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Exporter en PDF' })).toBeEnabled();
  });
});

test.describe('Partage & export — error case (US22.3.5)', () => {
  test('Error AC: an invalid/revoked/expired share token shows one explicit, generic message — never a partial roadmap', async ({
    page,
  }) => {
    await page.route('**/api/pilotage/public/roadmap-shares/**', route =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'SHARE_LINK_INVALID', message: 'Ce lien de partage est invalide, expiré ou a été révoqué.' }),
      }),
    );

    await page.goto(`/roadmap-shares/${'0'.repeat(64)}`);

    await expect(page.getByRole('alert')).toContainText(
      'Ce lien de partage est invalide, expiré ou a été révoqué.',
    );
    // No partial roadmap — none of the read-only board's structural classes are present.
    await expect(page.locator('.rm-lane__label')).toHaveCount(0);
    await expect(page.locator('.rm-bar--readonly')).toHaveCount(0);
  });
});
