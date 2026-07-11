import { test, expect, Route } from '@playwright/test';

// US22.4.5 — calendriers ouvrés & exceptions. Same approach as `gantt-dependencies.e2e.spec.ts`:
// no live `pivot-pilotage-core` backend, every HTTP call stubbed at the network level via
// `page.route`. The app runs with its real Transloco catalogue here — assertions check the
// actual rendered French copy from `public/assets/i18n/fr.json`.

const TENANT_PATH = '/tenants/1/teams/2/calendars';
const TEAM_BASE = '**/api/pilotage/tenants/1/teams/2';

async function fulfillJson(route: Route, status: number, json: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

const CALENDAR = {
  calendarId: 100,
  projectId: 3,
  scope: 'PROJECT',
  name: 'Calendrier standard',
  workingDays: [1, 2, 3, 4, 5],
  ranges: [{ startHour: 9, endHour: 17 }],
};

test.describe('Calendriers ouvrés — happy path (US22.4.5)', () => {
  test('creates a calendar, then adds an exception on it', async ({ page }) => {
    let calendars: unknown[] = [];
    await page.route(`${TEAM_BASE}/calendars`, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, calendars);
        return;
      }
      calendars = [CALENDAR];
      await fulfillJson(route, 201, CALENDAR);
    });

    let exceptions: unknown[] = [];
    await page.route(`${TEAM_BASE}/calendars/100/exceptions`, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, exceptions);
        return;
      }
      const created = [{ exceptionId: 1, calendarId: 100, exceptionDate: '2026-05-01', working: false, ranges: [] }];
      exceptions = created;
      await fulfillJson(route, 201, created);
    });

    await page.goto(TENANT_PATH);

    await expect(page.getByRole('heading', { name: 'Calendriers de temps ouvré' })).toBeVisible();
    await expect(page.getByText('Aucun calendrier pour l\'instant')).toBeVisible();

    // AC1 — creates a project calendar with the default Mon..Fri / 09:00-17:00 selection.
    await page.locator('#cal-create-name').fill('Calendrier standard');
    await page.locator('#cal-create-project-id').fill('3');
    await page.getByRole('button', { name: 'Créer le calendrier' }).click();

    const row = page.locator('tbody tr').first();
    await expect(row).toContainText('Calendrier standard');
    await expect(row).toContainText('Projet');

    // AC2 — opens the exceptions panel and adds a public-holiday day off.
    await page.getByRole('button', { name: 'Exceptions' }).click();
    await page.locator('#cal-exc-start').fill('2026-05-01');
    await page.locator('#cal-exc-end').fill('2026-05-01');
    await page.getByRole('button', { name: 'Ajouter l\'exception' }).click();

    await expect(page.getByText('Jour non travaillé').first()).toBeVisible();
  });
});

test.describe('Calendriers ouvrés — error case (US22.4.5)', () => {
  test('Error AC: an exception end date before its start date shows an explicit message and creates nothing', async ({
    page,
  }) => {
    await page.route(`${TEAM_BASE}/calendars`, route => fulfillJson(route, 200, [CALENDAR]));
    let addExceptionCalled = false;
    await page.route(`${TEAM_BASE}/calendars/100/exceptions`, async route => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, 200, []);
        return;
      }
      addExceptionCalled = true;
      await route.continue();
    });

    await page.goto(TENANT_PATH);

    await page.getByRole('button', { name: 'Exceptions' }).click();
    await page.locator('#cal-exc-start').fill('2026-05-05');
    await page.locator('#cal-exc-end').fill('2026-05-01');
    await page.getByRole('button', { name: 'Ajouter l\'exception' }).click();

    await expect(page.getByRole('alert')).toContainText('La date de fin ne peut pas être antérieure à la date de début.');
    expect(addExceptionCalled).toBe(false);
  });
});
