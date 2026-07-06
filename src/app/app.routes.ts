import { Routes } from '@angular/router';

/**
 * Routes du squelette bootstrap-only.
 *
 * Une seule route placeholder aujourd'hui. Dans l'intégration finale (feature
 * module lazy-loadé depuis pivot-ui), ces routes seront exposées via
 * `loadChildren`/`loadComponent` pour les features réelles du domaine
 * Pilotage (roadmap, Gantt, portefeuille de projets) — voir CLAUDE.md.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },
];
