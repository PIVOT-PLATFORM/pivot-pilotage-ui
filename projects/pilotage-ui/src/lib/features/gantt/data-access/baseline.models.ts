/**
 * Domain models mirroring `pivot-pilotage-core`'s baseline/écarts contract (US22.4.9 — "Baselines
 * multiples & analyse des écarts"). Authoritative backend contract:
 * `fr.pivot.pilotage.baseline.BaselineController`/`BaselineService` (`pivot-pilotage-core` PR #63,
 * squash commit `3098971`) — no frozen Gate 5 spec exists yet under
 * `pivot-docs/docs/specs/EPIC-roadmap/` at the time of writing (verified before starting this
 * feature); this file is the frontend's own record of the contract until one is generated.
 *
 * **Gate 1 (PO Agent) resolution — no "name" field.** The backlog/brief for this US describes
 * posing a baseline via "un bouton + nom optionnel". The frozen backend contract
 * (`SetBaselineRequest{baselineIndex}`, `BaselineResponse{id, baselineIndex, capturedAt,
 * taskCount}`, entity `Baseline` — no `name`/`label` column in `pilotage.baseline`, schema
 * `V1__schema_init.sql`) exposes **no free-text name**, only a numeric slot in `0..10` — explicitly
 * modelled after MS Project's `Baseline` / `Baseline 1`..`Baseline 10` (this US's own "Notes
 * d'implémentation"). Inventing a client-only name here would either (a) be silently discarded by
 * the backend (misleading — the UI would promise persistence that never happens), or (b) require
 * client-side storage of business data the backend cannot serve back to another user/session,
 * violating this repo's "no invented business data client-side" posture. This frontend therefore
 * reads "nom optionnel" as **the optional choice of slot** (`baselineIndex`): a caller may either
 * pick a specific `0..10` slot or leave it unset to auto-assign the lowest free one (the backend's
 * own optional-index semantics) — the MS Project-style numbered label (`BaselineSlotLabel`,
 * `baseline-panel.component.ts`) is the naming scheme actually available end-to-end. Documented
 * here, in the linked GitHub issue (#41) and in the PR description — never a silent unilateral
 * interpretation.
 *
 * **Variance/comparison labels are rendered verbatim, never through Transloco.** Every
 * `*VarianceLabel`/`*DeltaLabel` field below is a dynamic, backend-computed French sentence (e.g.
 * `"Début en retard de 3 j"`) — not a fixed enum key, so there is nothing to map to a translation
 * key (same "free-text backend sentence, rendered as-is" precedent as
 * `TaskConstraint.warnings[].detail` in `task-constraint.models.ts`). This is a deliberate,
 * documented scope decision (this API has no i18n negotiation today), distinct from
 * `WeatherIndicatorComponent`'s choice to *not* use the backend's fixed labels — that backend
 * exposes a small, static enum (`ProjectWeatherStatus`) that maps cleanly onto Transloco keys;
 * this one exposes open-ended computed sentences that do not.
 */

/** Lowest valid baseline slot (MS Project's plain "Baseline") — mirrors `BaselineService.MIN_INDEX`. */
export const MIN_BASELINE_INDEX = 0;

/** Highest valid baseline slot (MS Project's "Baseline 10") — mirrors `BaselineService.MAX_INDEX`. */
export const MAX_BASELINE_INDEX = 10;

/** Total number of baseline slots (0..10 inclusive) — mirrors the US's "jusqu'à 11 baselines". */
export const MAX_BASELINE_COUNT = MAX_BASELINE_INDEX - MIN_BASELINE_INDEX + 1;

/**
 * Effective temporal precision (altitude) of a task at baseline-capture or current time — mirrors
 * the backend's `TemporalPrecision` enum (`fr.pivot.pilotage.schedule`, EN22.1a frozen contract).
 * Never computed client-side, only ever read from a response.
 */
export type TemporalPrecision = 'SEMESTER' | 'QUARTER' | 'MONTH' | 'WEEK' | 'DAY';

/**
 * A posed baseline — mirrors `BaselineResponse{id, baselineIndex, capturedAt, taskCount}`.
 * Returned by both `GET .../baselines` (list) and `POST .../baselines` (pose/overwrite).
 */
export interface BaselineSummary {
  readonly id: number;
  /** The slot this baseline occupies (`0..10`) — see this file's class TSDoc "no name field" note. */
  readonly baselineIndex: number;
  /** ISO instant — when this baseline was captured. */
  readonly capturedAt: string;
  /** Number of tasks frozen into this baseline's snapshots. */
  readonly taskCount: number;
}

/**
 * Body of `POST .../baselines` — mirrors `SetBaselineRequest{baselineIndex}`. An explicit
 * `baselineIndex` already in use is *overwritten* server-side ("écraser", Security AC); `null`
 * (sent explicitly, never omitted — `required = false` on the backend accepts either) auto-assigns
 * the lowest free slot, refused with `409 BASELINE_LIMIT_EXCEEDED` once all 11 are used (Error AC).
 */
export interface SetBaselineRequest {
  readonly baselineIndex: number | null;
}

/**
 * One task's frozen baseline values against its *current* values on the live temporal graph —
 * mirrors `TaskVarianceResponse`, field for field. Every `*VarianceLabel` is a French,
 * colour-independent sentence already rendered server-side (A11y AC — see class TSDoc "rendered
 * verbatim" note); a `null` numeric variance means one side is itself absent ("non comparable"),
 * never guessed.
 */
export interface TaskVariance {
  readonly taskId: number;
  readonly taskName: string | null;
  readonly baselineStart: string | null;
  readonly currentStart: string | null;
  readonly startVarianceMinutes: number | null;
  readonly startVarianceLabel: string;
  readonly baselineFinish: string | null;
  readonly currentFinish: string | null;
  readonly finishVarianceMinutes: number | null;
  readonly finishVarianceLabel: string;
  readonly baselineDurationMinutes: number | null;
  readonly currentDurationMinutes: number | null;
  readonly durationVarianceMinutes: number | null;
  readonly durationVariancePercent: number | null;
  readonly durationVarianceLabel: string;
  readonly baselineWorkMinutes: number | null;
  readonly currentWorkMinutes: number | null;
  readonly workVarianceMinutes: number | null;
  readonly workVariancePercent: number | null;
  readonly workVarianceLabel: string;
  readonly baselineCostAmount: number | null;
  readonly currentCostAmount: number | null;
  readonly costVarianceAmount: number | null;
  readonly costVariancePercent: number | null;
  readonly costVarianceLabel: string;
  readonly baselineTemporalPrecision: TemporalPrecision | null;
  readonly currentTemporalPrecision: TemporalPrecision | null;
  /** Whether the altitude changed since capture — when `true`, date/duration variances above should be read with that context (fuzzy vs precise). */
  readonly temporalPrecisionChanged: boolean;
}

/**
 * Response of `GET .../baselines/{baselineIndex}/variance` — mirrors `BaselineVarianceResponse`.
 */
export interface BaselineVariance {
  readonly baselineIndex: number;
  readonly baselineCapturedAt: string;
  readonly tasks: readonly TaskVariance[];
}

/**
 * One task's frozen values in the `from` baseline against the same task's frozen values in the
 * `to` baseline (no "current" value involved) — mirrors `BaselineComparisonRowResponse`. A task
 * present in only one of the two baselines carries `null` on the absent side, with every delta
 * itself `null`.
 */
export interface BaselineComparisonRow {
  readonly taskId: number;
  readonly taskName: string | null;
  readonly fromStart: string | null;
  readonly toStart: string | null;
  readonly startDeltaMinutes: number | null;
  readonly startDeltaLabel: string;
  readonly fromFinish: string | null;
  readonly toFinish: string | null;
  readonly finishDeltaMinutes: number | null;
  readonly finishDeltaLabel: string;
  readonly fromDurationMinutes: number | null;
  readonly toDurationMinutes: number | null;
  readonly durationDeltaMinutes: number | null;
  readonly durationDeltaPercent: number | null;
  readonly durationDeltaLabel: string;
  readonly fromWorkMinutes: number | null;
  readonly toWorkMinutes: number | null;
  readonly workDeltaMinutes: number | null;
  readonly workDeltaPercent: number | null;
  readonly workDeltaLabel: string;
  readonly fromCostAmount: number | null;
  readonly toCostAmount: number | null;
  readonly costDeltaAmount: number | null;
  readonly costDeltaPercent: number | null;
  readonly costDeltaLabel: string;
}

/**
 * Response of `GET .../baselines/{fromIndex}/compare/{toIndex}` — mirrors
 * `BaselineComparisonResponse`.
 */
export interface BaselineComparison {
  readonly fromIndex: number;
  readonly fromCapturedAt: string;
  readonly toIndex: number;
  readonly toCapturedAt: string;
  readonly tasks: readonly BaselineComparisonRow[];
}

/**
 * Error body shape for the baseline write/validation endpoints — `{code, message}`, see
 * `BaselineExceptionHandler`/`BaselineApiError`.
 *
 * `INVALID_BASELINE_INDEX` — `422`, a supplied `baselineIndex` outside `0..10`.
 * `BASELINE_LIMIT_EXCEEDED` — `409`, the index was omitted (auto-assign) and all 11 slots are used
 * (Error AC — "invite à écraser ou supprimer une baseline existante").
 */
export interface BaselineApiError {
  readonly code: 'INVALID_BASELINE_INDEX' | 'BASELINE_LIMIT_EXCEEDED';
  readonly message: string;
}

/**
 * Identifies which project's baselines a request targets. `tenantId`/`teamId`/`projectId` travel
 * as **path segments** (never body/query/header) — same gap-era shape as `GanttProjectRef`/
 * `DependencyProjectRef`/`TaskConstraintProjectRef` (`pivot-core-starter`'s `TenantContext` isn't
 * consumable yet, `TODO-SETUP.md` §5). Deliberately a distinct type here (not imported from a
 * sibling feature) to keep this feature additive/independent — same separation already established
 * across every other Gantt data-access module in this repo. Always resolved from the current route
 * — never typed, stored or cached client-side.
 */
export interface BaselineProjectRef {
  readonly tenantId: number;
  readonly teamId: number;
  readonly projectId: number;
}
