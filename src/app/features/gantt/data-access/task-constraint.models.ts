/**
 * Domain models mirroring `pivot-pilotage-core`'s constraint/deadline contract (US22.4.4 —
 * "Contraintes de date & échéances"). Authoritative backend contract:
 * `fr.pivot.pilotage.gantt.TaskConstraintService`/`TaskConstraintResponse`/`WbsTaskController`
 * (`pivot-pilotage-core` PR #54, commit `4748198`) plus the frozen Gate 5 spec
 * `pivot-docs/docs/specs/EPIC-roadmap/us22-4-4-contraintes-echeances.md`.
 *
 * **No read gap here (unlike US22.4.2/task-scheduling).** `GET .../gantt/tasks/{taskId}/constraint`
 * already returns the full current state (`constraintType` defaults to `ASAP` with no date/deadline
 * when no row was ever persisted) plus the engine's live warnings for the task — this feature never
 * needs to fall back on `GET .../gantt/tree` for context the way `TaskSchedulingComponent` does.
 *
 * **Read is not gated, write is (Security AC).** The `GET` is deliberately reachable by every role —
 * see `TaskConstraintApiService.get`'s TSDoc — so a conflict an editor raises stays visible read-only
 * to a viewer without a fresh write. Only `PUT` is behind `WbsEditPolicy` (fail-closed today,
 * `DenyAllWbsEditPolicy` — same platform gap as every other Gantt write in this repo).
 */

/**
 * A task's scheduling constraint type — mirrors the backend's `ConstraintType` enum (EN22.1a,
 * frozen contract §a). `ASAP`/`ALAP` never carry a date; every other type requires one
 * (`constraintDate` — Error AC).
 */
export type ConstraintType = 'ASAP' | 'ALAP' | 'MSO' | 'MFO' | 'SNET' | 'SNLT' | 'FNET' | 'FNLT';

/**
 * The constraint types that never carry a date — mirrors the service-layer rule enforced by
 * `TaskConstraintService.upsert` (a date supplied for one of these is silently cleared server-side,
 * never rejected). Exported so the component and its tests share one definition of "dateless".
 */
export const DATELESS_CONSTRAINT_TYPES: ReadonlySet<ConstraintType> = new Set(['ASAP', 'ALAP']);

/**
 * The full ordered list of constraint types this form offers — mirrors `ConstraintType`'s
 * declaration order in the backend enum (ASAP/ALAP first, matching the referential MS Project
 * carries).
 */
export const CONSTRAINT_TYPES: readonly ConstraintType[] = ['ASAP', 'ALAP', 'MSO', 'MFO', 'SNET', 'SNLT', 'FNET', 'FNLT'];

/**
 * An engine-emitted warning kind — mirrors `SchedulingWarning.WarningType` (EN22.1b).
 * `CONSTRAINT_CONFLICT` and `DEADLINE_MISSED` are the two this US's ACs name explicitly;
 * `NEGATIVE_FLOAT`/`REJECTED` are rendered identically (same icon+text treatment) even though this
 * US does not dedicate an AC to either (US22.4.7 owns float exposure; `REJECTED` is a defensive
 * catch-all the engine can emit for any task).
 */
export type ConstraintWarningType = 'CONSTRAINT_CONFLICT' | 'DEADLINE_MISSED' | 'NEGATIVE_FLOAT' | 'REJECTED';

/**
 * A single engine-emitted conflict/alert on the task's constraint or deadline — mirrors
 * `ConstraintWarningResponse{type, detail}`. `type` is the stable machine-readable discriminator
 * this UI maps to an icon + translated label; `detail` is the backend's human-readable sentence,
 * rendered alongside it (A11y AC — never colour alone).
 */
export interface ConstraintWarning {
  readonly type: ConstraintWarningType;
  readonly detail: string;
}

/**
 * A task's current constraint/deadline plus the engine's live warnings about it — mirrors
 * `TaskConstraintResponse`. Returned by both `GET` (read-only preview) and `PUT` (post-persistence,
 * fresh recompute) — same shape either way, see class TSDoc.
 */
export interface TaskConstraint {
  readonly taskId: number;
  /** `ASAP` when no `task_constraint` row was ever persisted (backend default, not an error state). */
  readonly constraintType: ConstraintType;
  /** ISO instant, or `null` for `ASAP`/`ALAP` or when unset. */
  readonly constraintDate: string | null;
  /** ISO instant, or `null` when no deadline is set — independent of {@link constraintType}. */
  readonly deadline: string | null;
  /** Possibly empty, never absent. */
  readonly warnings: readonly ConstraintWarning[];
}

/**
 * Body of `PUT .../gantt/tasks/{taskId}/constraint` — mirrors `UpsertTaskConstraintRequest`.
 * `constraintDate`/`deadline` are always sent explicitly (`null` to clear), never omitted — this
 * form always has a fully resolved value for both by the time it submits (see
 * `TaskConstraintComponent.submit`).
 */
export interface UpsertTaskConstraintRequest {
  readonly constraintType: ConstraintType;
  readonly constraintDate: string | null;
  readonly deadline: string | null;
}

/**
 * Error body shape for `PUT .../gantt/tasks/{taskId}/constraint` — `{code, message}`, see
 * `WbsExceptionHandler`. `INVALID_TASK_CONSTRAINT` (422) is the only code this endpoint's body can
 * carry (a date-bearing type submitted without `constraintDate` — Error AC); this frontend
 * pre-validates that same rule client-side (see `TaskConstraintComponent.submit`), so this mapping
 * stays a tested fallback for a race, never the only path covered.
 */
export interface TaskConstraintApiError {
  readonly code: 'INVALID_TASK_CONSTRAINT';
  readonly message: string;
}

/**
 * Identifies which project's Gantt view a request targets. `tenantId`/`teamId`/`projectId` travel as
 * **path segments** (never body/query/header) — same gap-era shape as `GanttProjectRef`/
 * `DependencyProjectRef`/`TaskSchedulingProjectRef`. Deliberately a distinct type here (not imported
 * from a sibling feature) to keep this feature additive/independent — same separation already
 * established between those. Always resolved from the current route — never typed, stored or cached
 * client-side.
 */
export interface TaskConstraintProjectRef {
  readonly tenantId: number;
  readonly teamId: number;
  readonly projectId: number;
}
