import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TaskConstraint, TaskConstraintProjectRef, UpsertTaskConstraintRequest } from './task-constraint.models';

/**
 * HTTP client for the constraint/deadline contract (US22.4.4) exposed by `pivot-pilotage-core`'s
 * `WbsTaskController`. Authoritative contract:
 * `pivot-docs/docs/specs/EPIC-roadmap/us22-4-4-contraintes-echeances.md` (backend PR
 * `pivot-pilotage-core#54`, commit `4748198`).
 *
 * `tenantId`/`teamId`/`projectId` travel as **path segments** (never body/query/header) — see
 * {@link TaskConstraintProjectRef}'s TSDoc. This service never invents or caches an id of its own:
 * every method takes a fully-resolved `TaskConstraintProjectRef` plus the target `taskId`.
 *
 * **No error handling here** — every method propagates the raw `HttpErrorResponse` to the caller
 * (bodyless 403/404, 422 `{code: 'INVALID_TASK_CONSTRAINT', message}` for a rejected constraint) —
 * same "propagate, don't swallow" philosophy already established by `WbsApiService`/
 * `DependencyApiService`/`TaskSchedulingApiService`.
 *
 * **`get` is not gated (Security AC) — `set` is.** `getConstraint` is reachable by every role
 * server-side (not behind `WbsEditPolicy`); only `setConstraint` currently 403s unconditionally
 * server-side (`WbsEditPolicy` wired fail-closed, `DenyAllWbsEditPolicy` — same platform gap as every
 * other Gantt write in this repo). This service and its caller (`TaskConstraintComponent`) are fully
 * functional and tested against the *intended* contract; only the backend's role gate itself is
 * temporarily always-deny.
 */
@Injectable({ providedIn: 'root' })
export class TaskConstraintApiService {
  private readonly http = inject(HttpClient);

  private baseUrl(ref: TaskConstraintProjectRef): string {
    return `${environment.apiUrl}/tenants/${ref.tenantId}/teams/${ref.teamId}/projects/${ref.projectId}/gantt`;
  }

  /**
   * Reads a task's current constraint/deadline and the engine's current warnings about it. A
   * live-recomputed preview (no persistence) — never fails because "no constraint was ever set":
   * that state comes back as `200 OK` with `constraintType: 'ASAP'`, no date, no deadline.
   *
   * @throws HttpErrorResponse 404 (project or task not visible, or cross-tenant — non-disclosure)
   */
  get(ref: TaskConstraintProjectRef, taskId: number): Observable<TaskConstraint> {
    return this.http.get<TaskConstraint>(`${this.baseUrl(ref)}/tasks/${taskId}/constraint`);
  }

  /**
   * Creates or replaces a task's constraint/deadline and re-runs the CPM, returning the fresh state
   * and its warnings.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404 (project
   *         or task not visible, or cross-tenant — non-disclosure), 422
   *         (`INVALID_TASK_CONSTRAINT` — a date-bearing type submitted without `constraintDate`)
   */
  set(ref: TaskConstraintProjectRef, taskId: number, request: UpsertTaskConstraintRequest): Observable<TaskConstraint> {
    return this.http.put<TaskConstraint>(`${this.baseUrl(ref)}/tasks/${taskId}/constraint`, request);
  }
}
