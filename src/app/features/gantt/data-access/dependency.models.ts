/**
 * Domain models mirroring `pivot-pilotage-core`'s typed-dependency contract (US22.4.3 —
 * "Dépendances typées (FS/SS/FF/SF) + retard/avance"). Authoritative backend contract (endpoints,
 * DTOs, error codes):
 * `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/gantt-detaille/us-dependances-typees.md`,
 * backend PR `pivot-pilotage-core#47`.
 *
 * A dependency links two tasks of the same project's WBS (US22.4.1a/b/c — built out in parallel by
 * a different item on this same feature, `feat/us22-4-1abc-wbs-tree-ui`) with one of four typed
 * relations plus a signed lag/lead. This module owns none of the WBS tree itself — see
 * {@link TaskOption} and `DependencyApiService.listTasks`'s TSDoc for the minimal, read-only slice
 * of it this feature needs (populating the predecessor/successor pickers), never touching tree
 * editing (indent/outdent/reorder — out of scope here).
 */

/** The four typed dependency links — mirrors the backend's `DependencyLinkType` enum. */
export type DependencyLinkType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * A typed dependency — mirrors `DependencyResponse{dependencyId, predecessorTaskId,
 * successorTaskId, linkType, lagMinutes}`.
 */
export interface Dependency {
  readonly dependencyId: number;
  readonly predecessorTaskId: number;
  readonly successorTaskId: number;
  readonly linkType: DependencyLinkType;
  /**
   * Signed offset in **worked minutes** on the successor task's calendar (backend decision D7):
   * positive = lag (retard), negative = lead (avance). See `DependencyManagerComponent`'s TSDoc
   * for why this UI exposes minutes (the true API unit) alongside a computed days-equivalent
   * hint, rather than converting a user-entered day count into minutes.
   */
  readonly lagMinutes: number;
}

/**
 * Body of `POST .../gantt/dependencies` — mirrors `CreateDependencyRequest`. The backend defaults
 * an omitted `linkType`/`lagMinutes` to `FS`/`0`, but this UI's form always has a resolved type and
 * lag, so both are always sent explicitly.
 */
export interface CreateDependencyRequest {
  readonly predecessorTaskId: number;
  readonly successorTaskId: number;
  readonly linkType: DependencyLinkType;
  readonly lagMinutes: number;
}

/** Body of `PUT .../gantt/dependencies/{id}` — mirrors `UpdateDependencyRequest`. */
export interface UpdateDependencyRequest {
  readonly linkType: DependencyLinkType;
  readonly lagMinutes: number;
}

/**
 * Error body shape for the dependency endpoints — `{code, message}`, see `WbsExceptionHandler`.
 *
 * `INVALID_DEPENDENCY` — `422`, a self-dependency (a task linked to itself).
 * `DUPLICATE_DEPENDENCY` — `409`, the same `(predecessor, successor, linkType)` already exists.
 * `SCHEDULE_CYCLE` — `409`, the link would introduce a cycle in the temporal graph (atomic on the
 * backend — nothing is ever persisted when this fires).
 */
export interface DependencyApiError {
  readonly code: 'INVALID_DEPENDENCY' | 'DUPLICATE_DEPENDENCY' | 'SCHEDULE_CYCLE';
  readonly message: string;
}

/**
 * Minimal read-only projection of one `WbsTaskResponse` node (`GET .../gantt/tree`, US22.4.1a) —
 * only what the predecessor/successor pickers need (id, WBS code, name). Deliberately not the
 * full tree node shape (no `parentTaskId`/`ariaLevel`/etc.) — this feature never renders a tree,
 * it only needs a flat, labellable list of tasks to pick from.
 */
export interface TaskOption {
  readonly taskId: number;
  readonly wbsCode: string;
  readonly name: string;
}

/**
 * Identifies which project's Gantt view a request targets. `tenantId`/`teamId`/`projectId` travel
 * as **path segments** (never body/query/header) — same gap-era convention as `RoadmapProjectRef`
 * (see that type's TSDoc for why: `pivot-core-starter`'s `TenantContext` isn't published yet).
 * Deliberately a distinct type here (not imported from the roadmap feature) to keep this feature
 * additive/independent — mirrors `RoadmapShareApiService`'s own separation from `RoadmapApiService`.
 * Always resolved from the current route — never typed, stored or cached client-side.
 */
export interface DependencyProjectRef {
  readonly tenantId: number;
  readonly teamId: number;
  readonly projectId: number;
}
