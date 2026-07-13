import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PILOTAGE_API_URL } from '../../../core/config/tokens';
import {
  CreateRecurringTaskRequest,
  GanttProjectRef,
  MoveWbsTaskRequest,
  RecurringTaskResponse,
  WbsTaskResponse,
  WbsTreeResponse,
} from './wbs.models';

/**
 * HTTP client for the WBS contract (US22.4.1a/b/c, US22.4.6) exposed by `pivot-pilotage-core`'s
 * `WbsTaskController`. Authoritative contract: that controller's own JavaDoc plus the backlog
 * files under `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/gantt-detaille/`.
 *
 * `tenantId`/`teamId`/`projectId` travel as **path segments** (never body/query/header) — see
 * {@link GanttProjectRef}'s TSDoc. This service never invents or caches an id of its own: every
 * method takes a fully-resolved `GanttProjectRef` supplied by the caller.
 *
 * **No error handling here** — every method propagates the raw `HttpErrorResponse` to the caller
 * (bodyless 403/404, 409 `{code: 'WBS_HIERARCHY_CYCLE', message}` for a hierarchy cycle, 422
 * `{code: 'ILLEGAL_WBS_MOVE', message}` for an inapplicable indent/outdent) — same
 * "propagate, don't swallow" philosophy already established by `RoadmapApiService`.
 *
 * **Known platform gap** — every write endpoint (`indent`, `outdent`, `move`) currently 403s
 * unconditionally server-side: `WbsEditPolicy` is wired fail-closed (`DenyAllWbsEditPolicy`)
 * pending `pivot-core-starter`'s project/team membership resolution (same posture as
 * `RoadmapApiService`'s `DenyAllRoadmapEditPolicy`). This service and its caller
 * (`WbsTreeComponent`) are fully functional and tested against the *intended* contract; only the
 * backend's role gate itself is temporarily always-deny.
 */
@Injectable({ providedIn: 'root' })
export class WbsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PILOTAGE_API_URL);

  private baseUrl(ref: GanttProjectRef): string {
    return `${this.apiUrl}/tenants/${ref.tenantId}/teams/${ref.teamId}/projects/${ref.projectId}/gantt`;
  }

  /**
   * Reads a project's whole WBS as an ordered, pre-order tree. ARIA attributes and WBS codes are
   * fully server-derived — never recomputed here, see `WbsTaskResponse`'s TSDoc.
   *
   * @throws HttpErrorResponse 404 if the tenant/team/project triplet resolves to no visible project
   */
  tree(ref: GanttProjectRef): Observable<WbsTreeResponse> {
    return this.http.get<WbsTreeResponse>(`${this.baseUrl(ref)}/tree`);
  }

  /**
   * Indents a task: it becomes a sub-task of its preceding sibling; the whole project's WBS is
   * re-derived server-side (US22.4.1b) — the caller must re-fetch {@link tree} to observe every
   * impacted node, this call only returns the moved task itself.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (project or task not visible), 422 (`ILLEGAL_WBS_MOVE` — no preceding sibling to nest under)
   */
  indent(ref: GanttProjectRef, taskId: number): Observable<WbsTaskResponse> {
    return this.http.patch<WbsTaskResponse>(`${this.baseUrl(ref)}/tasks/${taskId}/indent`, null);
  }

  /**
   * Outdents a task: it rises one level, becoming a sibling of its former parent (US22.4.1b) —
   * same "re-fetch the whole tree to see every impacted node" caveat as {@link indent}.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (project or task not visible), 422 (`ILLEGAL_WBS_MOVE` — already at the WBS root)
   */
  outdent(ref: GanttProjectRef, taskId: number): Observable<WbsTaskResponse> {
    return this.http.patch<WbsTaskResponse>(`${this.baseUrl(ref)}/tasks/${taskId}/outdent`, null);
  }

  /**
   * Combined reparent/reorder (US22.4.1b). `WbsTreeComponent`'s move-up/move-down controls call
   * this with only {@link MoveWbsTaskRequest.position} set — an absent `parentTaskId` leaves the
   * current parent unchanged (see that type's TSDoc), reordering the task among its *current*
   * siblings only. Same "re-fetch the whole tree" caveat as {@link indent}/{@link outdent}.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (project, task, or a supplied parent not visible), 409 (`WBS_HIERARCHY_CYCLE` — the
   *         move would nest a task under its own descendant)
   */
  move(ref: GanttProjectRef, taskId: number, request: MoveWbsTaskRequest): Observable<WbsTaskResponse> {
    return this.http.patch<WbsTaskResponse>(`${this.baseUrl(ref)}/tasks/${taskId}/move`, request);
  }

  /**
   * Creates a recurring task series plus its generated occurrences in one call (US22.4.6) — see
   * `RecurringTaskFormComponent`'s TSDoc for the full behavioural contract (calendar snapping,
   * MANUAL pinning, MILESTONE-vs-LEAF occurrence classification).
   *
   * @throws HttpErrorResponse 400 (`firstOccurrenceDate` missing — bean validation), 422
   *         (`INVALID_RECURRENCE` — `frequency` missing, or `occurrenceCount` missing/`<= 0`/over
   *         the {@link MAX_RECURRING_OCCURRENCES} cap), 403 (unauthorized — fail-closed today, see
   *         class TSDoc), 404 (project not visible, or a supplied `parentTaskId` not found —
   *         non-disclosure, both bodyless)
   */
  createRecurringTask(ref: GanttProjectRef, request: CreateRecurringTaskRequest): Observable<RecurringTaskResponse> {
    return this.http.post<RecurringTaskResponse>(`${this.baseUrl(ref)}/tasks/recurring`, request);
  }
}
