import { test, expect } from '@playwright/test';

// Squelette bootstrap-only : aucune feature réelle à tester encore (voir CLAUDE.md).
// Spec volontairement minimale — valide juste que le shell build/boot correctement.
test('le shell charge la route placeholder', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Pivot Pilotage');
  await expect(page.getByText('Module en construction.')).toBeVisible();
});
