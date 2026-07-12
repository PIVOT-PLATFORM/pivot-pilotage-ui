import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PILOTAGE_API_URL } from '../../../core/config/tokens';
import {
  SchedulingMode,
  TaskSchedulingProjectRef,
  TaskSchedulingResponse,
  UpdateSchedulingModeRequest,
  UpdateTaskDurationRequest,
  UpdateTaskEffortRequest,
} from './task-scheduling.models';

/**
 * HTTP client for the duration/effort/scheduling-mode contract (US22.4.2) exposed by
 * `pivot-pilotage-core`'s `WbsTaskController`. Authoritative contract: that controller's own
 * JavaDoc (`TaskEffortService`/`TaskSchedulingResponse`, PR #49) plus
 * `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/gantt-detaille/us-duree-effort-planif-auto-manuelle.md`.
 *
 * `tenantId`/`teamId`/`projectId` travel as **path segments** (never body/query/header) — see
 * {@link TaskSchedulingProjectRef}'s TSDoc. This service never invents or caches an id of its own:
 * every method takes a fully-resolved `TaskSchedulingProjectRef` plus the target `taskId`.
 *
 * **No error handling here** — every method propagates the raw `HttpErrorResponse` to the caller
 * (bodyless 403/404, 422 `{code: 'INVALID_TASK_EFFORT', message}` for a rejected duration/units
 * value) — same "propagate, don't swallow" philosophy already established by `WbsApiService`/
 * `DependencyApiService`.
 *
 * **Known platform gap** — every endpoint here currently 403s unconditionally server-side:
 * `WbsEditPolicy` is wired fail-closed (`DenyAllWbsEditPolicy`) pending `pivot-core-starter`'s
 * project/team membership resolution — identical posture to every other Gantt write in this repo.
 * This service and its caller (`TaskSchedulingComponent`) are fully functional and tested against
 * the *intended* contract; only the backend's role gate itself is temporarily always-deny.
 *
 * **No GET here** — see `task-scheduling.models.ts`'s class TSDoc for the platform read-gap and
 * how `TaskSchedulingComponent` resolves it (reusing `WbsApiService.tree` for its initial seed).
 */
@Injectable({ providedIn: 'root' })
export class TaskSchedulingApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PILOTAGE_API_URL);

  private baseUrl(ref: TaskSchedulingProjectRef): string {
    return `${this.apiUrl}/tenants/${ref.tenantId}/teams/${ref.teamId}/projects/${ref.projectId}/gantt`;
  }

  /**
   * Sets a task's duration in worked minutes and re-runs the CPM.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (project or task not visible), 422 (`INVALID_TASK_EFFORT` — negative, or zero on a
   *         non-milestone)
   */
  setDuration(ref: TaskSchedulingProjectRef, taskId: number, durationMinutes: number): Observable<TaskSchedulingResponse> {
    const request: UpdateTaskDurationRequest = { durationMinutes };
    return this.http.patch<TaskSchedulingResponse>(`${this.baseUrl(ref)}/tasks/${taskId}/duration`, request);
  }

  /**
   * Sets a task assignment's resource units (creating the assignment if absent), re-deriving
   * work = duration × units, and re-runs the CPM.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (project or task not visible), 422 (`INVALID_TASK_EFFORT` — non-positive units)
   */
  setEffort(
    ref: TaskSchedulingProjectRef,
    taskId: number,
    resourceRef: string,
    unitsPercent: number,
  ): Observable<TaskSchedulingResponse> {
    const request: UpdateTaskEffortRequest = { resourceRef, unitsPercent };
    return this.http.patch<TaskSchedulingResponse>(`${this.baseUrl(ref)}/tasks/${taskId}/effort`, request);
  }

  /**
   * Switches a task between AUTO and MANUAL scheduling and re-runs the CPM. The response exposes
   * the manual variance (`plannedManual`/`wouldBeAuto`/`deltaMinutes`) when the task ends up MANUAL.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (project or task not visible)
   */
  setSchedulingMode(ref: TaskSchedulingProjectRef, taskId: number, schedulingMode: SchedulingMode): Observable<TaskSchedulingResponse> {
    const request: UpdateSchedulingModeRequest = { schedulingMode };
    return this.http.patch<TaskSchedulingResponse>(`${this.baseUrl(ref)}/tasks/${taskId}/scheduling-mode`, request);
  }
}
