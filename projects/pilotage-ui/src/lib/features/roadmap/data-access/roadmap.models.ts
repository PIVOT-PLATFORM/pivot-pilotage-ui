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

/**
 * Now/Next/Later bucket (US22.3.3 — "Vue Now/Next/Later") — mirrors the backend's `Horizon` enum
 * (`pivot-pilotage-core#39`). An attribute of an `Initiative`, never a separate structure — same
 * "modèle temporel unique" (EN22.1) principle already established for `fuzzyPeriodStart`/`End`
 * (US22.3.1) and `Milestone.date` (US22.3.4): the Now/Next/Later board is a pure alternative
 * *rendering* of the same initiatives, not a second dataset to keep in sync.
 */
export type Horizon = 'NOW' | 'NEXT' | 'LATER';

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
  /**
   * Now/Next/Later bucket (US22.3.3) — `null` for an initiative never explicitly triaged (see
   * `HorizonViewResponse.unbucketed`'s TSDoc for why this is never silently dropped). The backend
   * defaults new initiatives to `NOW` when `horizon` is omitted on create, so `null` should only
   * ever be observed on initiatives created before this US shipped.
   */
  readonly horizon: Horizon | null;
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
  /** US22.3.3 — omitted means "let the server default to `NOW`" (see `Initiative.horizon`'s TSDoc); this form never sends an explicit value, the create form has no horizon picker (out of scope, see that US's backlog file "Hors périmètre"). */
  readonly horizon?: Horizon;
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
export type RoadmapErrorCode =
  | 'LANE_REQUIRED'
  | 'LANE_NOT_FOUND'
  | 'INVALID_PERIOD'
  | 'LANE_DUPLICATE'
  | 'MILESTONE_DATE_REQUIRED'
  | 'MILESTONE_DATE_OUT_OF_BOUNDS';

/**
 * A strategic milestone (US22.3.4 — "Jalons stratégiques") — mirrors `MilestoneResponse`. **Not**
 * a separate entity: same underlying `pilotage.task` row as an `Initiative` (`node_kind =
 * MILESTONE`, `duration_minutes = 0`), exposed under its own `/milestones` endpoint so this
 * frontend gets a structural (non-color) signal to identify it — see A11y AC and
 * `MilestoneMarkerComponent`. Written once via `date` and read back identically by this view and
 * any future Gantt consumer (EN22.1 "modèle temporel unique") — no transformation, no
 * duplication, see the backlog file's "Notes d'implémentation".
 */
export interface Milestone {
  readonly id: number;
  /**
   * `null` when the milestone is a cross-project marker with no natural lane (e.g. "go/no-go",
   * steering committee review) — unlike {@link Initiative}, a lane is optional here.
   */
  readonly laneId: number | null;
  readonly name: string;
  /**
   * ISO `yyyy-MM-dd`. `POST` always requires a date (Error AC — `MILESTONE_DATE_REQUIRED`), but
   * the list endpoint documents undated milestones sorting last — modelled as nullable defensively
   * so a future/legacy undated record is never silently mis-rendered as "today".
   */
  readonly date: string | null;
  readonly temporalPrecision: TemporalPrecision;
  /** Monotonic revision counter (optimistic co-editing lock) — not enforced client-side yet. */
  readonly revision: number;
}

/** Body of `POST .../roadmap/milestones` — mirrors `CreateMilestoneRequest`. `date` is mandatory (Error AC). `laneId` is optional — see {@link Milestone}'s TSDoc. */
export interface CreateMilestoneRequest {
  readonly name: string;
  readonly date: string;
  readonly laneId?: number;
}

/**
 * Body of `PATCH .../roadmap/milestones/{id}` — mirrors `UpdateMilestoneRequest`. Every field
 * optional; an absent field means "leave unchanged" (same convention as
 * {@link UpdateInitiativePlacementRequest} — this service never sends an explicit `null`).
 */
export interface UpdateMilestoneRequest {
  readonly date?: string;
  readonly laneId?: number;
}

/**
 * A fully-resolved new date for a milestone, emitted by `MilestoneMarkerComponent` once a
 * mouse drag/drop or a keyboard nudge is committed (AC "date change" + A11y AC). Always the
 * absolute new date (never a delta) — mirrors {@link InitiativePlacementChange}'s own contract,
 * snapped to the currently selected axis grain's period boundary, same as an initiative's own
 * placement (see that component's TSDoc on why this view's "approximate" editing never operates
 * at finer-than-period granularity, regardless of the object's own `temporalPrecision`).
 */
export interface MilestoneDateChange {
  readonly date: string;
}

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
 * One Now/Next/Later column's initiatives — mirrors `HorizonBucketResponse` (US22.3.3,
 * `pivot-pilotage-core#39`).
 */
export interface HorizonBucketResponse {
  readonly horizon: Horizon;
  readonly initiatives: Initiative[];
}

/**
 * Body of `GET .../roadmap/horizon-view` — mirrors `HorizonViewResponse`. `unbucketed` holds every
 * initiative with `horizon: null` (see `Initiative.horizon`'s TSDoc) — **never dropped**: AC1
 * requires the Now/Next/Later board to show "le même jeu d'initiatives que la vue temporelle",
 * so an initiative that hasn't been triaged yet must still be visible somewhere on this board,
 * just not inside a `NOW`/`NEXT`/`LATER` column (see `NowNextLaterBoardComponent`'s TSDoc for how
 * it's rendered, and why it can only ever be a drag/keyboard-move *source*, never a drop target —
 * `UpdateInitiativeHorizonRequest.horizon` is mandatory, there is no supported way to clear it
 * back to `null` from this UI).
 */
export interface HorizonViewResponse {
  readonly buckets: HorizonBucketResponse[];
  readonly unbucketed: Initiative[];
}

/**
 * Body of `PATCH .../roadmap/initiatives/{id}/horizon` — mirrors `UpdateInitiativeHorizonRequest`.
 * Unlike {@link UpdateInitiativePlacementRequest}/{@link UpdateMilestoneRequest}, `horizon` is
 * **mandatory** here (backend returns 400 if null/absent) — this single-field endpoint has no
 * "leave unchanged" case to support.
 */
export interface UpdateInitiativeHorizonRequest {
  readonly horizon: Horizon;
}

/**
 * A fully-resolved new horizon for an initiative, emitted by `NowNextLaterBoardComponent` once a
 * mouse drag/drop between columns is dropped or a keyboard move is applied (AC2 + A11y AC).
 * Carries the full {@link Initiative} (not just its id) because — unlike
 * `InitiativeBarComponent`/`MilestoneMarkerComponent`, which are rendered from a `RoadmapBoardComponent`-owned `@for` that already has the initiative in scope — the board here has no
 * per-card loop variable of its own to bind against; `NowNextLaterBoardComponent` owns that
 * iteration internally (one column per horizon, see its TSDoc).
 */
export interface InitiativeHorizonChange {
  readonly initiative: Initiative;
  readonly horizon: Horizon;
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
