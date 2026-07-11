/**
 * Domain models mirroring `pivot-pilotage-core`'s WBS (Work Breakdown Structure) contract —
 * US22.4.1a ("modèle arborescent & numérotation"), US22.4.1b ("indent/outdent &
 * réordonnancement") and US22.4.1c ("agrégation des tâches récapitulatives"). Authoritative
 * backend contract: `fr.pivot.pilotage.gantt` package (`WbsTaskController`/`WbsTaskResponse`/
 * `WbsTreeResponse`, `pivot-pilotage-core` PR #43) and the backlog files under
 * `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/gantt-detaille/`.
 *
 * A WBS node is **not** a separate entity — it is the same shared temporal graph node
 * (`pilotage.task`) already used by the roadmap-rapide/Now-Next-Later views (EN22.1 "modèle
 * temporel unique"), exposed here with its hierarchy (`parentTaskId`), server-derived WBS code
 * and ARIA attributes. Nothing here is stored or recomputed client-side — every hierarchy/
 * numbering property is read verbatim from the backend and re-fetched (never client-derived)
 * after a structural write, see `WbsTreeComponent`'s TSDoc.
 */

/** Kind of WBS node — mirrors the backend's `NodeKind` enum (EN22.1a, frozen contract). */
export type WbsNodeKind = 'SUMMARY' | 'LEAF' | 'MILESTONE' | 'RECURRING';

/**
 * One node of a project's WBS tree — mirrors `WbsTaskResponse`. Returned flattened in pre-order
 * (depth-first, siblings by position) by `GET .../gantt/tree`; {@link ariaLevel}/
 * {@link ariaSetSize}/{@link ariaPosInSet} are the **sole** source of hierarchy depth/rank for
 * this frontend — never recomputed from {@link parentTaskId}/{@link position} client-side
 * (US22.4.1a: "propriété dérivée... jamais dérivée uniquement côté client").
 */
export interface WbsTaskResponse {
  readonly taskId: number;
  /** WBS parent task id, or `null` at the root. */
  readonly parentTaskId: number | null;
  /** Server-derived WBS code (e.g. `"1.2.3"`) — never client-computed. */
  readonly wbsCode: string;
  readonly name: string;
  readonly nodeKind: WbsNodeKind;
  /** Display order among its siblings (0-based). */
  readonly position: number;
  /** ISO instant — own value for a leaf, aggregated min (US22.4.1c) for a summary — or `null`. */
  readonly startDate: string | null;
  /** ISO instant — own value for a leaf, aggregated max (US22.4.1c) for a summary — or `null`. */
  readonly finishDate: string | null;
  /** Own value for a leaf, aggregated sum (US22.4.1c) for a summary, or `null`. */
  readonly durationMinutes: number | null;
  /** Percent complete in `[0, 100]` — own value for a leaf, charge-weighted mean (US22.4.1c) for a summary — or `null` when untracked. */
  readonly percentComplete: number | null;
  /**
   * Textual progress rendering (e.g. `"45%"`), or `null` when untracked — never colour-only
   * (A11y AC, US22.4.1c). Always render this label alongside any visual progress indicator, never
   * a colour bar alone.
   */
  readonly progressLabel: string | null;
  /** Whether the temporal fields are derived/read-only (always `true` for a `SUMMARY` node — US22.4.1c). */
  readonly readOnly: boolean;
  /** ARIA role for this node (`"treeitem"`). */
  readonly ariaRole: string;
  /** 1-based depth in the tree — `aria-level`. */
  readonly ariaLevel: number;
  /** Number of siblings sharing this node's parent — `aria-setsize`. */
  readonly ariaSetSize: number;
  /** 1-based rank among those siblings — `aria-posinset`. */
  readonly ariaPosInSet: number;
  /** Mirrors {@link readOnly} for screen-reader exposure — `aria-readonly`. */
  readonly ariaReadOnly: boolean;
  /** Monotonic revision — optimistic co-editing lock, not enforced client-side yet (same posture as roadmap's `Initiative.revision`). */
  readonly revision: number;
}

/** Body of `GET .../gantt/tree` — mirrors `WbsTreeResponse`. */
export interface WbsTreeResponse {
  readonly projectId: number;
  /** ARIA role for the tree container (`"tree"`). */
  readonly ariaRole: string;
  /** WBS nodes in pre-order — never reordered/recomputed client-side. */
  readonly nodes: WbsTaskResponse[];
}

/**
 * Body of `PATCH .../gantt/tasks/{taskId}/move` — mirrors `MoveWbsTaskRequest`. Every field is
 * optional: an absent {@link parentTaskId} leaves the parent unchanged (used by
 * `WbsTreeComponent`'s move-up/move-down controls to reorder among the *current* siblings only);
 * an absent {@link position} leaves the position unchanged. `wbsCode` is deliberately absent from
 * this contract — always derived server-side, never client-supplied.
 */
export interface MoveWbsTaskRequest {
  /** New WBS parent task id, `undefined` to leave unchanged, or {@link WBS_ROOT} to move to the WBS root. */
  readonly parentTaskId?: number;
  /** New display order among the (new) siblings, `undefined` to leave unchanged. */
  readonly position?: number;
}

/**
 * Sentinel value for {@link MoveWbsTaskRequest.parentTaskId} requesting a move to the WBS root —
 * mirrors `MoveWbsTaskRequest.ROOT` server-side. Unused by this US's UI (no root-move control in
 * this first tree widget), kept here for contract completeness/documentation.
 */
export const WBS_ROOT = -1;

/** Error body shape for message-carrying WBS errors (409/422) — mirrors `WbsApiError`. */
export interface WbsApiError {
  readonly code: string;
  readonly message: string;
}

/** Machine-readable error codes the backend may return on 409/422 — see `WbsExceptionHandler`. */
export type WbsErrorCode =
  | 'WBS_HIERARCHY_CYCLE'
  | 'ILLEGAL_WBS_MOVE'
  | 'DERIVED_FIELD_NOT_EDITABLE'
  | 'MALFORMED_BODY';

/**
 * Identifies which project's WBS a request targets. `tenantId`/`teamId`/`projectId` travel as
 * **path segments** on every `WbsApiService` call (never body/query/header) — same gap-era shape
 * as `RoadmapProjectRef` (`pivot-core-starter`'s `TenantContext` not yet published, see this
 * repo's CLAUDE.md §Isolation tenant). Always resolved from the current route (see
 * `WbsTreeComponent`) — never typed, stored or cached client-side.
 */
export interface GanttProjectRef {
  readonly tenantId: number;
  readonly teamId: number;
  readonly projectId: number;
}
