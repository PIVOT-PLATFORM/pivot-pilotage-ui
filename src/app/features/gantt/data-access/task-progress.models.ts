/**
 * Domain models mirroring `pivot-pilotage-core`'s progress-tracking contract (US22.4.8 — "Suivi
 * d'avancement (% réalisé, réel/restant)"). Authoritative backend contract:
 * `fr.pivot.pilotage.gantt.TaskProgressService`/`TaskProgressResponse`/`UpdateTaskProgressRequest`/
 * `WbsTaskController` (`pivot-pilotage-core` PR #59, commit `3098971`) plus the frozen Gate 5 spec
 * `pivot-docs/docs/specs/EPIC-roadmap/us22-4-8-suivi-avancement.md`.
 *
 * **No GET here — same platform read-gap as US22.4.2 (`task-scheduling.models.ts`).** The only
 * endpoint this US adds is `PATCH .../gantt/tasks/{taskId}/progress`; there is no dedicated read
 * for a task's physical percent/actual dates/status date/actual-remaining-total work. This
 * frontend resolves it the same way `TaskSchedulingComponent` resolves its own read gap: seed the
 * task's context (name, WBS code, node kind, `readOnly`, and the already-tracked
 * `percentComplete`/`progressLabel`) from the already-existing, already-tested
 * `GET .../gantt/tree` (`WbsApiService.tree`), and treat every other progress field (physical
 * percent, actual work/remaining/total, actual start/finish, status date, revision) as **unknown
 * until the first successful write** — never guessed or defaulted client-side. See
 * `TaskProgressFormComponent`'s TSDoc.
 *
 * **The progress *line* (`expectedPercentComplete`/`late`/`progressVarianceLabel`) is not part of
 * this contract.** Those three fields are exposed per node by `GET .../gantt/tree` itself
 * (`WbsTaskResponse`, see `wbs.models.ts`) and rendered by `WbsTreeComponent` — this form only
 * ever *writes* a task's own progress, it never reads or displays the line.
 */

/**
 * Body of `PATCH .../gantt/tasks/{taskId}/progress` — mirrors `UpdateTaskProgressRequest`.
 * `percentComplete` is the only required field; every other field is `null` when the caller does
 * not intend to set/clear it in this entry (the backend always **replaces** the current row's
 * values with exactly what this body carries — there is no partial-patch merge semantics here,
 * same "the form always has a fully resolved value" posture as `UpsertTaskConstraintRequest`, see
 * `TaskConstraintComponent.submit`'s TSDoc). `actorRef` is a free-form logical reference to the
 * caller entering the value (gap-era, ADR-006 — same "no cross-module FK, no real authenticated
 * identity yet" posture already established by `UpdateTaskEffortRequest.resourceRef"; never a real
 * `userId`, and never used for authorization — only stamps the audit trail's "auteur" column,
 * server-side).
 */
export interface UpdateTaskProgressRequest {
  /** Temporal percent complete; required, must lie within `[0, 100]` (Error AC). */
  readonly percentComplete: number;
  /** Distinct physical percent complete within `[0, 100]`, or `null` to leave/clear it unset. */
  readonly physicalPercentComplete: number | null;
  /** ISO instant, or `null`. Must not be after {@link actualFinish} when both are supplied (Error AC). */
  readonly actualStart: string | null;
  /** ISO instant, or `null`. Must not precede {@link actualStart} when both are supplied (Error AC). */
  readonly actualFinish: string | null;
  /** ISO `yyyy-MM-dd` freshness date of this entry, or `null` — distinct from the project's own status date (used for the progress line). */
  readonly statusDate: string | null;
  /** Free-form logical reference to the caller entering the value (gap-era, ADR-006) — required, non-blank; stamps the audit trail's "auteur" column, never used for authorization. */
  readonly actorRef: string;
}

/**
 * Response body of `PATCH .../gantt/tasks/{taskId}/progress` — mirrors `TaskProgressResponse`.
 * Reflects the task's post-save progress state so this form can refresh the bar and the
 * actual/remaining work without a second round trip (AC "la barre d'avancement et le travail
 * restant se mettent à jour").
 */
export interface TaskProgressResponse {
  readonly taskId: number;
  /** The saved temporal percent complete. */
  readonly percentComplete: number;
  /** Textual progress rendering (e.g. `"45%"`), never colour-only (A11y). */
  readonly progressLabel: string;
  /** The saved physical percent complete, or `null`. */
  readonly physicalPercentComplete: number | null;
  /** Total actual work across the task's assignments (Σ), or `null` when the task carries no assignment. */
  readonly actualWorkMinutes: number | null;
  /** Total remaining work (Σ `work − actual`, floored at `0`), or `null` when the task carries no assignment. */
  readonly remainingWorkMinutes: number | null;
  /** Total planned work (Σ), or `null` when the task carries no assignment. */
  readonly totalWorkMinutes: number | null;
  /** The saved actual start (ISO instant), or `null`. */
  readonly actualStart: string | null;
  /** The saved actual finish (ISO instant), or `null`. */
  readonly actualFinish: string | null;
  /** The saved status (freshness) date of this entry (ISO `yyyy-MM-dd`), or `null`. */
  readonly statusDate: string | null;
  /** Monotonic task revision — optimistic co-editing lock and event ordering, not enforced client-side yet (same posture as the WBS tree's `revision`). */
  readonly revision: number;
}

/**
 * Error body shape for `PATCH .../gantt/tasks/{taskId}/progress` — `{code, message}`, see
 * `WbsExceptionHandler`. `INVALID_TASK_PROGRESS` covers an out-of-range percent or an actual
 * finish preceding the actual start (both pre-validated client-side, see
 * `TaskProgressFormComponent.submit` — this mapping stays a tested defensive fallback for a
 * race, never the only path covered, same posture as `TaskConstraintComponent`).
 * `DERIVED_FIELD_NOT_EDITABLE` covers a summary task (aggregated, read-only) — also pre-checked
 * client-side via {@link WbsTaskResponse.readOnly}, same "summary never gets an editable form"
 * rule as `TaskSchedulingComponent`.
 */
export interface TaskProgressApiError {
  readonly code: 'INVALID_TASK_PROGRESS' | 'DERIVED_FIELD_NOT_EDITABLE';
  readonly message: string;
}

/**
 * Identifies which project's Gantt view a request targets. `tenantId`/`teamId`/`projectId` travel
 * as **path segments** (never body/query/header) — same gap-era shape as `GanttProjectRef`/
 * `TaskConstraintProjectRef`/`TaskSchedulingProjectRef`. Deliberately a distinct type here (not
 * imported from a sibling feature) to keep this feature additive/independent — same separation
 * already established between those. Always resolved from the current route — never typed, stored
 * or cached client-side.
 */
export interface TaskProgressProjectRef {
  readonly tenantId: number;
  readonly teamId: number;
  readonly projectId: number;
}
