import { Routes } from '@angular/router';

/**
 * Feature routes of the `@pivot-platform/pilotage-ui` module (roadmap / Gantt détaillé /
 * calendriers). Mounted by the consuming shell (`pivot-ui`) under a guarded path — the shell
 * supplies the `tenants/:tenantId/teams/:teamId/projects/:projectId` URL segments (it already
 * resolves the current tenant/team), so this repo never types, stores or manages those ids
 * itself (règle absolue tenantId/userId).
 *
 * The tenant/team/project path segments below are kept EXACTLY as exposed by
 * `pivot-pilotage-core`'s controllers (`RoadmapController`, `WbsTaskController`,
 * `CalendarController`). Only the standalone dev harness's `''` bootstrap placeholder route stays
 * in the harness `app.routes.ts`; every business feature route lives here as the single source of
 * truth (EN18 lib-extraction, mirroring `COLLABORATIF_ROUTES`).
 *
 * `roadmap-shares/:token` is a **public, guardless** roadmap feature route (US22.3.5): a share
 * link must be openable by a recipient without a PIVOT account or session — the shell mounts it
 * at top level rather than under the module-guarded tenant path.
 */
export const PILOTAGE_ROUTES: Routes = [
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
  {
    path: 'tenants/:tenantId/teams/:teamId/calendars',
    loadComponent: () =>
      import('./features/calendar/calendar-manager/calendar-manager.component').then((m) => m.CalendarManagerComponent),
  },
  {
    path: 'tenants/:tenantId/teams/:teamId/projects/:projectId/tasks/:taskId/effective-calendar',
    loadComponent: () =>
      import('./features/calendar/effective-calendar-view/effective-calendar-view.component').then(
        (m) => m.EffectiveCalendarViewComponent,
      ),
  },
  {
    // Vue Gantt visuelle (timeline 2 volets) — vue par défaut du Gantt détaillé.
    path: 'tenants/:tenantId/teams/:teamId/projects/:projectId/gantt',
    loadComponent: () => import('./features/gantt/gantt-chart/gantt-chart.component').then((m) => m.GanttChartComponent),
  },
  {
    // Éditeur d'arborescence WBS (indent/outdent/réordo) — outil d'édition structurelle.
    path: 'tenants/:tenantId/teams/:teamId/projects/:projectId/gantt/tree',
    loadComponent: () => import('./features/gantt/wbs-tree/wbs-tree.component').then((m) => m.WbsTreeComponent),
  },
  {
    path: 'tenants/:tenantId/teams/:teamId/projects/:projectId/gantt/tasks/:taskId/scheduling',
    loadComponent: () =>
      import('./features/gantt/task-scheduling/task-scheduling.component').then((m) => m.TaskSchedulingComponent),
  },
  {
    path: 'tenants/:tenantId/teams/:teamId/projects/:projectId/gantt/tasks/:taskId/constraint',
    loadComponent: () =>
      import('./features/gantt/task-constraint/task-constraint.component').then((m) => m.TaskConstraintComponent),
  },
  {
    path: 'tenants/:tenantId/teams/:teamId/projects/:projectId/gantt/tasks/recurring',
    loadComponent: () =>
      import('./features/gantt/recurring-task-form/recurring-task-form.component').then(
        (m) => m.RecurringTaskFormComponent,
      ),
  },
  {
    path: 'tenants/:tenantId/teams/:teamId/projects/:projectId/gantt/baselines',
    loadComponent: () =>
      import('./features/gantt/baseline-panel/baseline-panel.component').then((m) => m.BaselinePanelComponent),
  },
  {
    path: 'tenants/:tenantId/teams/:teamId/projects/:projectId/gantt/tasks/:taskId/progress',
    loadComponent: () =>
      import('./features/gantt/task-progress-form/task-progress-form.component').then(
        (m) => m.TaskProgressFormComponent,
      ),
  },
];
