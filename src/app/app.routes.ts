import { Routes } from '@angular/router';

/**
 * Routes du squelette bootstrap-only.
 *
 * Une seule route placeholder aujourd'hui. Dans l'intégration finale (feature
 * module lazy-loadé depuis pivot-ui), ces routes seront exposées via
 * `loadChildren`/`loadComponent` pour les features réelles du domaine
 * Pilotage (roadmap, Gantt, portefeuille de projets) — voir CLAUDE.md.
 *
 * EN18.2 — `moduleGuard('pilotage')` (`./core/modules/module.guard.ts`) existe, est
 * pleinement implémenté (appel HTTP réel `GET /modules/pilotage/status`, fail-closed,
 * toast, `no-store`) et entièrement testé (`module.guard.spec.ts`, y compris un test de
 * câblage routing prouvant l'héritage via `canActivateChild` et le non-téléchargement du
 * bundle lazy quand le module est désactivé — AC1/AC3/AC4 d'EN18.2).
 *
 * Il n'est volontairement **pas** câblé sur la route placeholder ci-dessous : cette route
 * n'a aucun rapport avec le vrai périmètre fonctionnel Pilotage qu'EN18.2 protège (E22
 * Roadmap/E23 Portefeuille/E24 ADR projet/E25 Commande publique/E26 Budget/E27 OKR/E13
 * Cahiers de tests — aucune de ces routes n'existe encore). Elle sert uniquement à valider
 * que le workspace build/boot en CI (lint, tests, build, E2E, Lighthouse) — voir CLAUDE.md et
 * TODO-SETUP.md §4, qui documentent explicitement que la passe Lighthouse publique tourne
 * contre cette route SANS dépendance backend. La câbler derrière un guard qui fait un appel
 * HTTP réel casserait cette garantie (redirection vers `/home`, route qui n'existe pas non
 * plus dans ce squelette standalone — voir TSDoc de `moduleGuard`) pour aucun bénéfice
 * fonctionnel réel aujourd'hui.
 *
 * `moduleGuard('pilotage')` sera appliqué ici (via `canActivateChild` sur une route racine
 * enveloppant les futures routes E22-E27/E13, remplaçant cette route placeholder) dès la
 * première vraie US du domaine Pilotage. Mirroring du même choix déjà fait dans
 * `pivot-agilite-ui/src/app/app.routes.ts` (commentaire US20.1.1 : guard non câblé tant
 * qu'il n'y a rien de réel à protéger).
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },
];
