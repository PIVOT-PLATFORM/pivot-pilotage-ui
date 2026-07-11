/**
 * Domain models mirroring `pivot-pilotage-core`'s roadmap-rapide contract (US22.3.1 — "Créer une
 * roadmap rapide"). Authoritative backend contract (endpoints, DTOs, error codes):
 * `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/roadmap-rapide/us-creer-roadmap-rapide.md`.
 *
 * A "lane" is a flat, horizontal grouping (theme / team / objective — free-form label, no fixed
 * taxonomy) on a project's roadmap-rapide view. An "initiative" is **not** a separate entity —
 * it is a macro view of an existing `pilotage.task` (leaf, `shared_in_roadmap = true`), exposed
 * here only with the subset of fields relevant to this altitude (approximate period, never
 * precise Gantt dates). No separate "initiative" table exists server-side, and none is modelled
 * here either — see the backlog file's "Notes d'implémentation".
 */

/** Effective temporal precision (altitude) of an initiative — mirrors the backend's `TemporalPrecision` enum (EN22.1a). */
export type TemporalPrecision = 'SEMESTER' | 'QUARTER' | 'MONTH' | 'WEEK' | 'DAY';

/** A lane — mirrors `LaneResponse{id, name, position}`. */
export interface Lane {
  readonly id: number;
  readonly name: string;
  readonly position: number;
}

/** An initiative posed on a lane — mirrors `InitiativeResponse`. */
export interface Initiative {
  readonly id: number;
  readonly laneId: number;
  readonly name: string;
  /** ISO `yyyy-MM-dd`, or `null` when not yet placed on the timeline. */
  readonly fuzzyPeriodStart: string | null;
  /** ISO `yyyy-MM-dd`, or `null` when not yet placed on the timeline. */
  readonly fuzzyPeriodEnd: string | null;
  readonly temporalPrecision: TemporalPrecision;
  /** Monotonic revision counter (optimistic co-editing lock) — not enforced client-side yet. */
  readonly revision: number;
}

/** Body of `POST .../roadmap/lanes` — mirrors `CreateLaneRequest`. */
export interface CreateLaneRequest {
  readonly name: string;
}

/**
 * Body of `POST .../roadmap/initiatives` — mirrors `CreateInitiativeRequest`. `laneId` is
 * mandatory (AC "Error: given an initiative without a target lane... rejected... a lane is
 * required" — enforced client-side by the create form, and server-side regardless, see
 * `LaneNotFoundException`). `fuzzyPeriodStart`/`fuzzyPeriodEnd` are both optional — AC1 allows
 * posing a bar "without requiring tasks or precise dates".
 */
export interface CreateInitiativeRequest {
  readonly name: string;
  readonly laneId: number;
  readonly fuzzyPeriodStart?: string;
  readonly fuzzyPeriodEnd?: string;
  readonly temporalPrecision?: TemporalPrecision;
}

/**
 * Body of `PATCH .../roadmap/initiatives/{id}` — mirrors `UpdateInitiativePlacementRequest`.
 * Every field optional; an absent field means "leave unchanged" (never clears a value back to
 * `null` — out of scope for this US, see backend JavaDoc).
 */
export interface UpdateInitiativePlacementRequest {
  readonly laneId?: number;
  readonly fuzzyPeriodStart?: string;
  readonly fuzzyPeriodEnd?: string;
}

/** Error body shape for 400/409 responses — `{code, message}`, see `RoadmapExceptionHandler`. */
export interface RoadmapApiError {
  readonly code: string;
  readonly message: string;
}

/** Machine-readable error codes the backend may return on 400/409 — see `RoadmapExceptionHandler`. */
export type RoadmapErrorCode = 'LANE_REQUIRED' | 'LANE_NOT_FOUND' | 'INVALID_PERIOD' | 'LANE_DUPLICATE';

/**
 * A fully-resolved new placement for an initiative, emitted by `InitiativeBarComponent` once a
 * mouse drag/resize is dropped or a keyboard nudge is applied (AC2 + A11y AC). Always absolute
 * values (never a delta) — the bar component owns the quarter-axis/lane-index math, the parent
 * (`RoadmapBoardComponent`) only has to spread this into an `UpdateInitiativePlacementRequest`.
 */
export interface InitiativePlacementChange {
  readonly laneId: number;
  readonly fuzzyPeriodStart: string;
  readonly fuzzyPeriodEnd: string;
}

/**
 * Identifies which project's roadmap-rapide view a request targets. `tenantId`/`teamId` travel
 * as **path segments** on every `RoadmapApiService` call (never body/query/header) — mirroring
 * the backend's own gap-era URL shape (`pivot-core-starter`'s `TenantContext` not yet published,
 * see this repo's CLAUDE.md §Isolation tenant and `pivot-pilotage-core/TODO-SETUP.md` §5).
 * Always resolved from the current route (see `RoadmapBoardComponent`) — never typed, stored or
 * cached client-side.
 */
export interface RoadmapProjectRef {
  readonly tenantId: number;
  readonly teamId: number;
  readonly projectId: number;
}
