/**
 * Domain models mirroring `pivot-pilotage-core`'s duration/effort/scheduling-mode contract
 * (US22.4.2 — "Durées, effort, planification auto vs manuelle"). Authoritative backend contract:
 * `fr.pivot.pilotage.gantt.TaskEffortService`/`TaskSchedulingResponse`/`WbsTaskController`
 * (`pivot-pilotage-core` PR #49) and
 * `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/gantt-detaille/us-duree-effort-planif-auto-manuelle.md`.
 *
 * **Known platform gap — no GET for this state (PO Agent Gate 1 resolution).** PR #49 only adds
 * three `PATCH` endpoints (`duration`, `effort`, `scheduling-mode`), each returning a fresh
 * {@link TaskSchedulingResponse}; there is no `GET` anywhere that returns a task's current
 * `schedulingMode`/`workMinutes`/manual-variance (confirmed against the controller source — the
 * only read is `GET .../gantt/tree`, whose `WbsTaskResponse` carries `durationMinutes`/`nodeKind`/
 * `readOnly` but none of the scheduling-specific fields). `TaskSchedulingComponent` resolves this
 * the same way `DependencyManagerComponent` resolved its own read gap (reusing `GET .../gantt/tree`
 * for its task pickers, see that component's TSDoc): it seeds its initial duration/node-kind
 * display from that same already-existing, already-tested read, and treats
 * `workMinutes`/`effectiveMode`/the manual variance as **unknown until the first successful write**
 * — never guessed or defaulted client-side. See `TaskSchedulingComponent`'s TSDoc for the full
 * rationale and its read-only-vs-editable rendering rules.
 */

/** A task's scheduling regime — mirrors the backend's `SchedulingMode` enum (EN22.1, frozen contract). */
export type SchedulingMode = 'AUTO' | 'MANUAL';

/**
 * Response body shared by all three US22.4.2 endpoints — mirrors `TaskSchedulingResponse`.
 * Returned after the service persists the write and re-runs the whole-project CPM, so every field
 * here reflects the *post-recompute* state (AUTO tasks may have just slipped, MANUAL tasks keep
 * their pinned dates and get a fresh variance).
 */
export interface TaskSchedulingResponse {
  readonly taskId: number;
  /** The task's own mode, or `null` when it inherits the project's (see {@link effectiveMode}). */
  readonly schedulingMode: SchedulingMode | null;
  /** The mode actually applied — task's own mode, else the project's. Always resolved, never `null`. */
  readonly effectiveMode: SchedulingMode;
  readonly durationMinutes: number | null;
  /** Total planned work across the task's assignments (Σ of work = duration × units), or `null` when no resource is assigned. */
  readonly workMinutes: number | null;
  /** ISO instant — pinned for MANUAL, engine-computed for AUTO — or `null`. */
  readonly startDate: string | null;
  readonly finishDate: string | null;
  /** MANUAL only: the pinned start (ISO instant); `null` for AUTO. */
  readonly plannedManual: string | null;
  /** MANUAL only: the start the engine would have computed in AUTO (ISO instant); `null` for AUTO. */
  readonly wouldBeAuto: string | null;
  /** MANUAL only: the signed worked-minute drift (`plannedManual - wouldBeAuto`); `0` for AUTO. */
  readonly deltaMinutes: number;
  /** Monotonic revision — optimistic co-editing lock, not enforced client-side yet (same posture as the WBS tree's `revision`). */
  readonly revision: number;
}

/** Body of `PATCH .../gantt/tasks/{taskId}/duration` — mirrors `UpdateTaskDurationRequest`. */
export interface UpdateTaskDurationRequest {
  readonly durationMinutes: number;
}

/**
 * Body of `PATCH .../gantt/tasks/{taskId}/effort` — mirrors `UpdateTaskEffortRequest`. The
 * assignment is identified by `resourceRef` (a free-form logical resource reference, no
 * cross-module FK — ADR-006); resource selection/assignment management itself is F22.5, out of
 * scope here — this form only ever writes the units on a resource reference the user types.
 */
export interface UpdateTaskEffortRequest {
  readonly resourceRef: string;
  readonly unitsPercent: number;
}

/** Body of `PATCH .../gantt/tasks/{taskId}/scheduling-mode` — mirrors `UpdateSchedulingModeRequest`. */
export interface UpdateSchedulingModeRequest {
  readonly schedulingMode: SchedulingMode;
}

/**
 * Error body shape for the US22.4.2 endpoints — `{code, message}`, see `WbsExceptionHandler`.
 *
 * `INVALID_TASK_EFFORT` — `422`, shared by three distinct server-side guards (negative duration,
 * zero duration on a non-milestone, non-positive units); each of this frontend's three PATCH call
 * sites only ever triggers its own subset (the duration endpoint never rejects for a units reason
 * and vice versa), so each form maps this single code to its own precise, statically-translated
 * message — see `TaskSchedulingComponent`'s TSDoc.
 */
export interface TaskSchedulingApiError {
  readonly code: 'INVALID_TASK_EFFORT' | 'DERIVED_FIELD_NOT_EDITABLE' | 'MALFORMED_BODY';
  readonly message: string;
}

/**
 * Identifies which project a US22.4.2 request targets. `tenantId`/`teamId`/`projectId` travel as
 * **path segments** (never body/query/header) — same gap-era shape as `GanttProjectRef`/
 * `DependencyProjectRef`. Deliberately a distinct type here (not imported from the WBS/dependency
 * features) to keep this feature additive/independent — same separation those two already
 * established between each other. Always resolved from the current route — never typed, stored or
 * cached client-side.
 */
export interface TaskSchedulingProjectRef {
  readonly tenantId: number;
  readonly teamId: number;
  readonly projectId: number;
}
