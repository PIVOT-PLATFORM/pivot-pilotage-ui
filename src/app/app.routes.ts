import { Routes } from '@angular/router';

/**
 * Routes de pivot-pilotage-ui.
 *
 * `''` reste le squelette placeholder bootstrap-only (voir CLAUDE.md) : sert uniquement à
 * valider que le workspace build/boot en CI (lint, tests, build, E2E, Lighthouse) — voir
 * TODO-SETUP.md §4, qui documente que la passe Lighthouse publique tourne contre cette route
 * SANS dépendance backend. Ne pas la faire dépendre d'un appel HTTP réel.
 *
 * `tenants/:tenantId/teams/:teamId/projects/:projectId/roadmap` — US22.3.1 (roadmap rapide),
 * première feature métier réelle de ce repo. Chemin volontairement identique aux segments
 * d'URL exposés par `pivot-pilotage-core`'s `RoadmapController` (même gap-era `tenantId`/
 * `teamId`/`projectId` en path, jamais en query/header — voir `RoadmapProjectRef` TSDoc) :
 * une fois ce module réellement lazy-loadé dans le shell `pivot-ui`, c'est le routing du shell
 * (qui résout déjà le tenant/team courant) qui fournira ces segments — ce repo ne les type, ne
 * les stocke et ne les gère jamais lui-même (règle absolue tenantId/userId, CLAUDE.md).
 *
 * EN18.2 — `moduleGuard('pilotage')` (`./core/modules/module.guard.ts`) existe, est pleinement
 * implémenté et testé, mais reste volontairement **non câblé** ici : ce squelette standalone
 * n'a pas de route `/home` de repli (voir TSDoc de `moduleGuard`) et US22.3.1 ne dépend pas de
 * l'activation de module pour être testable en isolation. Il sera appliqué via
 * `canActivateChild` sur une route racine enveloppant E22-E27/E13 dès l'intégration réelle dans
 * le shell pivot-ui (mirroring `pivot-agilite-ui/src/app/app.routes.ts`, commentaire US20.1.1).
 *
 * `roadmap-shares/:token` — US22.3.5 (partage & export), **route publique, aucun guard**. Ce
 * n'est pas un oubli : un lien de partage doit être ouvrable par un destinataire sans compte
 * PIVOT ni session — voir `RoadmapPublicShareApiService`/`RoadmapPublicShareViewComponent` TSDoc.
 * Ne jamais lui adjoindre `moduleGuard`/`AuthGuard` un jour sans revalider ce choix.
 *
 * `tenants/:tenantId/teams/:teamId/projects/:projectId/gantt/dependencies` — US22.4.3
 * (dépendances typées FS/SS/FF/SF + retard/avance), première route du Gantt détaillé (F22.4) dans
 * ce repo. Chemin identique au segment exposé par `pivot-pilotage-core`'s `WbsTaskController`
 * (`.../gantt/dependencies`, même gap-era `tenantId`/`teamId`/`projectId` en path — voir
 * `DependencyProjectRef` TSDoc). L'arbre WBS (US22.4.1a/b/c, `.../gantt/tree`) est un item
 * parallèle séparément suivi (`feat/us22-4-1abc-wbs-tree-ui`) — cette route ne dépend pas de sa
 * propre route à terme, les deux convergeront probablement sous un même parent `.../gantt` une
 * fois les deux livrées.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'tenants/:tenantId/teams/:teamId/projects/:projectId/roadmap',
    loadComponent: () =>
      import('./features/roadmap/roadmap-board/roadmap-board.component').then((m) => m.RoadmapBoardComponent),
  },
  {
    path: 'roadmap-shares/:token',
    loadComponent: () =>
      import('./features/roadmap/roadmap-public-share/roadmap-public-share-view.component').then(
        (m) => m.RoadmapPublicShareViewComponent,
      ),
  },
  {
    path: 'tenants/:tenantId/teams/:teamId/projects/:projectId/gantt/dependencies',
    loadComponent: () =>
      import('./features/gantt/dependency-manager/dependency-manager.component').then(
        (m) => m.DependencyManagerComponent,
      ),
  },
];
