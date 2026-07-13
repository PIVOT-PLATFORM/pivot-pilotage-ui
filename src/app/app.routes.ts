import { Routes } from '@angular/router';
import { PILOTAGE_ROUTES } from '../../projects/pilotage-ui/src/public-api';

/**
 * Routes du dev harness standalone de pivot-pilotage-ui.
 *
 * Depuis EN18 (extraction en librairie), toutes les vraies routes métier (roadmap, Gantt
 * détaillé, calendriers, partage public) vivent dans le projet librairie `pilotage-ui`
 * (`projects/pilotage-ui/src/lib/pilotage.routes.ts`, source unique de vérité) et sont importées
 * ici via `PILOTAGE_ROUTES` — exactement comme le harness de `pivot-collaboratif-ui` importe
 * `whiteboardRoutes` depuis son propre projet librairie (EN17.9). Le vrai shell (`pivot-ui`)
 * consommera le paquet publié `@pivot-platform/pilotage-ui` à la place.
 *
 * `''` reste le squelette placeholder bootstrap-only (voir CLAUDE.md) : sert uniquement à valider
 * que le workspace build/boot en CI (lint, tests, build, E2E, Lighthouse) SANS dépendance
 * backend — voir TODO-SETUP.md §4. Ne pas la faire dépendre d'un appel HTTP réel. Elle n'est PAS
 * dans la librairie (ce n'est pas une feature métier) : le shell a sa propre route d'accueil.
 *
 * Les segments d'URL `tenants/:tenantId/teams/:teamId/projects/:projectId/...` des routes de la
 * librairie sont conservés tels quels : une fois ce module réellement lazy-loadé dans le shell,
 * c'est le routing du shell (qui résout déjà le tenant/team courant) qui fournira ces segments.
 * `PILOTAGE_ROUTES` est étalé au niveau racine (et non monté sous un préfixe) pour préserver
 * exactement les URLs actuelles du harness.
 *
 * EN18.2 — `moduleGuard('pilotage')` (`./core/modules/module.guard.ts`) reste volontairement
 * non câblé ici (squelette standalone sans route `/home` de repli) ; il sera appliqué par le
 * shell pivot-ui lors de l'intégration réelle.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  ...PILOTAGE_ROUTES,
];
