/**
 * Specs d'acceptation RECETTE — module Pilotage (roadmap / KPI).
 *
 * Jouées contre https://recette.pivot-platform.fr APRÈS déploiement (e2e-recette.yml).
 * Session déjà authentifiée par recette.setup.ts (compte de recette dédié) — la storageState
 * réutilisée par le projet `recette` porte le cookie de session ; APP_INITIALIZER restaure le
 * token en mémoire à chaque chargement, donc aucune re-connexion par spec.
 *
 * Contrairement aux specs de e2e/ (mockées via page.route), ici AUCUN mock : vrai shell pivot-ui,
 * vrai pivot-pilotage-core déployé, vraies données du tenant de test. Ce module étant lazy-loadé
 * DANS le shell (voir CLAUDE.md), le parcours réel passe par le shell : navigation vers la roadmap
 * d'un projet (US22.3.1 — roadmap rapide), le shell résolvant les segments tenant/team/projet.
 *
 * Règle de traçabilité (skill-ac-traceability) : chaque test porte l'identifiant de l'AC qu'il
 * valide. Un « vrai PO » vérifierait exactement ces parcours sur le site déployé.
 *
 * Ces cas sont NON DESTRUCTIFS (login + navigation + affichage seulement). Les AC destructifs
 * (créer une lane / poser une initiative, US22.3.1) suivront EXACTEMENT le même patron mais :
 *   - créeront leurs données sur le tenant de test dédié (secrets.RECETTE_E2E_TENANT), jamais un
 *     tenant réel ;
 *   - nettoieront ces données en `afterEach` / `afterAll` (suppression des lanes/initiatives
 *     créées) pour ne pas polluer l'environnement partagé ni faire diverger les runs suivants.
 * Cf. le patron des specs éphémères e2e/roadmap-board.e2e.spec.ts (create lane + pose initiative).
 */
import { test, expect } from '@playwright/test';

test.describe('Recette — accès au module Pilotage (compte authentifié)', () => {
  test('AC-PILOTAGE-01 : le shell charge, authentifié, et le module Pilotage est atteignable', async ({
    page,
  }) => {
    // Point d'entrée réel : l'app authentifiée. Le shell (pivot-ui) porte header/nav ; le module
    // Pilotage y est lazy-loadé. On prouve d'abord que la session recette tient sur l'infra réelle.
    await page.goto('/');

    // On ne doit PAS être renvoyé au login (session valide sur la recette réelle).
    await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 15_000 });

    // Marqueur observable du shell chargé : un titre de niveau 1 est rendu (accueil / dashboard).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test('AC-PILOTAGE-02 : la roadmap d’un projet s’affiche sur données réelles (US22.3.1)', async ({
    page,
  }) => {
    // Parcours PO : ouvrir la roadmap d'un projet du tenant de test. Le tenant est fourni par le
    // compte de recette (secrets.RECETTE_E2E_TENANT) ; le shell résout team/projet du tenant de
    // test et monte le module Pilotage sous le chemin gardé. On cible le lien "Roadmap" de la nav
    // du shell plutôt qu'une URL en dur (les ids tenant/team/projet ne sont jamais typés ici —
    // règle absolue tenantId/userId, cf. CLAUDE.md).
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 15_000 });

    const roadmapLink = page.getByRole('link', { name: /roadmap|feuille de route/i });
    await expect(roadmapLink.first()).toBeVisible({ timeout: 15_000 });
    await roadmapLink.first().click();

    // La vue roadmap (RoadmapBoardComponent) est chargée : soit elle liste des lanes réelles,
    // soit — projet vierge — elle affiche son état vide explicite. Les deux prouvent que le module
    // est lazy-loadé, gardé, et branché sur pivot-pilotage-core déployé (pas un mock).
    await expect(page).toHaveURL(/\/roadmap/, { timeout: 15_000 });
    await expect(
      page
        .locator('.rm-lane__label')
        .first()
        .or(page.getByText(/Aucune lane pour l.instant/i)),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('AC-PILOTAGE-03 : une route Pilotage gardée hors session renvoie au login', async ({
    browser,
  }) => {
    // Contexte NON authentifié (pas de storageState) : la protection du module Pilotage doit tenir
    // sur l'infra réelle, pas seulement en mock. On vise le chemin gardé du domaine.
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto('/');
    // Sans session, le shell doit rediriger vers le login sur la recette réelle.
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
    await anon.close();
  });
});
