import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TaskProgressProjectRef, TaskProgressResponse, UpdateTaskProgressRequest } from './task-progress.models';

/**
 * HTTP client for the progress-tracking contract (US22.4.8) exposed by `pivot-pilotage-core`'s
 * `WbsTaskController`. Authoritative contract:
 * `pivot-docs/docs/specs/EPIC-roadmap/us22-4-8-suivi-avancement.md` (backend PR
 * `pivot-pilotage-core#59`, commit `3098971`).
 *
 * `tenantId`/`teamId`/`projectId` travel as **path segments** (never body/query/header) — see
 * {@link TaskProgressProjectRef}'s TSDoc. This service never invents or caches an id of its own:
 * every method takes a fully-resolved `TaskProgressProjectRef` plus the target `taskId`.
 *
 * **No error handling here** — every method propagates the raw `HttpErrorResponse` to the caller
 * (bodyless 403/404, 422 `{code: 'INVALID_TASK_PROGRESS' | 'DERIVED_FIELD_NOT_EDITABLE', message}`)
 * — same "propagate, don't swallow" philosophy already established by `TaskConstraintApiService`/
 * `TaskSchedulingApiService`/`WbsApiService`.
 *
 * **No `get` — same platform read-gap as `TaskSchedulingApiService`.** Only `PATCH` exists
 * server-side for this US; see `task-progress.models.ts`'s class TSDoc and
 * `TaskProgressFormComponent`'s TSDoc for how the caller resolves the initial seed.
 *
 * **`set` is gated (Security AC).** `WbsEditPolicy` currently 403s unconditionally server-side
 * (`DenyAllWbsEditPolicy`) — same platform gap as every other Gantt write in this repo. This
 * service and its caller (`TaskProgressFormComponent`) are fully functional and tested against
 * the *intended* contract; only the backend's role gate itself is temporarily always-deny.
 */
@Injectable({ providedIn: 'root' })
export class TaskProgressApiService {
  private readonly http = inject(HttpClient);

  private baseUrl(ref: TaskProgressProjectRef): string {
    return `${environment.apiUrl}/tenants/${ref.tenantId}/teams/${ref.teamId}/projects/${ref.projectId}/gantt`;
  }

  /**
   * Records a task's percent complete (and, optionally, its physical percent, actual start/finish
   * and this entry's own status/freshness date) and re-derives the actual/remaining work of every
   * assignment on the task (MS-Project parity, `remaining = work − actual`).
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (project or task not visible, or cross-tenant — non-disclosure), 422
   *         (`INVALID_TASK_PROGRESS` — percent out of `[0, 100]` or `actualFinish` before
   *         `actualStart`; `DERIVED_FIELD_NOT_EDITABLE` — the task is a summary)
   */
  set(ref: TaskProgressProjectRef, taskId: number, request: UpdateTaskProgressRequest): Observable<TaskProgressResponse> {
    return this.http.patch<TaskProgressResponse>(`${this.baseUrl(ref)}/tasks/${taskId}/progress`, request);
  }
}
