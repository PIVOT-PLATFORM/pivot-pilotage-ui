import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PILOTAGE_API_URL } from '../../../core/config/tokens';
import {
  BaselineComparison,
  BaselineProjectRef,
  BaselineSummary,
  BaselineVariance,
  SetBaselineRequest,
} from './baseline.models';

/**
 * HTTP client for the baseline/écarts contract (US22.4.9) exposed by `pivot-pilotage-core`'s
 * `BaselineController`. Authoritative contract: that controller's own JavaDoc (`fr.pivot.pilotage
 * .baseline`, PR #63, squash `3098971`) — see `baseline.models.ts`'s class TSDoc for the "no name
 * field" Gate 1 note.
 *
 * `tenantId`/`teamId`/`projectId` travel as **path segments** (never body/query/header) — see
 * {@link BaselineProjectRef}'s TSDoc. This service never invents or caches an id of its own: every
 * method takes a fully-resolved `BaselineProjectRef` supplied by the caller.
 *
 * **No error handling here** — every method propagates the raw `HttpErrorResponse` to the caller
 * (bodyless 403/404, 422 `{code: 'INVALID_BASELINE_INDEX', message}`, 409
 * `{code: 'BASELINE_LIMIT_EXCEEDED', message}`) — same "propagate, don't swallow" philosophy
 * already established by `WbsApiService`/`DependencyApiService`/`TaskConstraintApiService`.
 *
 * **Reads are not gated (Security AC) — writes are.** `list`/`variance`/`compare` are reachable by
 * every role server-side (a read-only "contributeur planning" may consult écarts); only
 * `setBaseline`/`deleteBaseline` are behind `BaselineEditPolicy` (fail-closed today,
 * `DenyAllBaselineEditPolicy` — same platform gap as every other Gantt write in this repo, pending
 * `pivot-core-starter`'s PMO/chef-de-projet role resolution). This service and its caller
 * (`BaselinePanelComponent`) are fully functional and tested against the *intended* contract; only
 * the backend's role gate itself is temporarily always-deny.
 */
@Injectable({ providedIn: 'root' })
export class BaselineApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PILOTAGE_API_URL);

  private baseUrl(ref: BaselineProjectRef): string {
    return `${this.apiUrl}/tenants/${ref.tenantId}/teams/${ref.teamId}/projects/${ref.projectId}/baselines`;
  }

  /**
   * Lists a project's baselines, ordered by slot.
   *
   * @throws HttpErrorResponse 404 if the tenant/team/project triplet resolves to no visible project
   */
  list(ref: BaselineProjectRef): Observable<BaselineSummary[]> {
    return this.http.get<BaselineSummary[]>(this.baseUrl(ref));
  }

  /**
   * Poses (or, when the slot is already used, overwrites) a baseline. `baselineIndex: null` sends
   * an explicit-null body (the backend's `required = false` accepts either an absent or a
   * null-bearing body identically) so this call always sends a well-formed JSON object, never an
   * empty request body.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404 (project
   *         not visible), 422 (`INVALID_BASELINE_INDEX` — supplied index outside `0..10`), 409
   *         (`BASELINE_LIMIT_EXCEEDED` — index omitted and all 11 slots already used)
   */
  setBaseline(ref: BaselineProjectRef, request: SetBaselineRequest): Observable<BaselineSummary> {
    return this.http.post<BaselineSummary>(this.baseUrl(ref), request);
  }

  /**
   * Deletes a baseline.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404 (project
   *         or baseline not visible)
   */
  deleteBaseline(ref: BaselineProjectRef, baselineIndex: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl(ref)}/${baselineIndex}`);
  }

  /**
   * Reads a baseline's per-task écarts against the current temporal graph.
   *
   * @throws HttpErrorResponse 404 (project or baseline not visible)
   */
  variance(ref: BaselineProjectRef, baselineIndex: number): Observable<BaselineVariance> {
    return this.http.get<BaselineVariance>(`${this.baseUrl(ref)}/${baselineIndex}/variance`);
  }

  /**
   * Compares two baselines directly.
   *
   * @throws HttpErrorResponse 404 (project not visible, or either index not visible)
   */
  compare(ref: BaselineProjectRef, fromIndex: number, toIndex: number): Observable<BaselineComparison> {
    return this.http.get<BaselineComparison>(`${this.baseUrl(ref)}/${fromIndex}/compare/${toIndex}`);
  }
}
