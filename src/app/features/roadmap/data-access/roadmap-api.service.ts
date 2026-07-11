import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CreateInitiativeRequest,
  CreateLaneRequest,
  Initiative,
  Lane,
  RoadmapProjectRef,
  UpdateInitiativePlacementRequest,
} from './roadmap.models';

/**
 * HTTP client for the roadmap-rapide contract (US22.3.1) exposed by `pivot-pilotage-core`'s
 * `RoadmapController`. Authoritative contract:
 * `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/roadmap-rapide/us-creer-roadmap-rapide.md`.
 *
 * `tenantId`/`teamId`/`projectId` travel as **path segments** (never body/query/header) — see
 * {@link RoadmapProjectRef}'s TSDoc for why. This service never invents or caches an id of its
 * own: every method takes a fully-resolved `RoadmapProjectRef` supplied by the caller.
 *
 * **No error handling here** — every method propagates the raw `HttpErrorResponse` to the
 * caller (400 `{code, message}` for `LANE_REQUIRED`/`LANE_NOT_FOUND`/`INVALID_PERIOD`, 409
 * `{code, message}` for `LANE_DUPLICATE`, bodyless 403/404) — same "propagate, don't swallow"
 * philosophy already established by `RetroApiService`/`WheelApiService` (`pivot-agilite-ui`) and
 * `BoardService` (`pivot-collaboratif-ui`).
 *
 * **Known platform gap** — every write endpoint (`createLane`, `createInitiative`,
 * `updatePlacement`) currently 403s unconditionally server-side: `RoadmapEditPolicy` is wired
 * fail-closed (`DenyAllRoadmapEditPolicy`) pending `pivot-core-starter`'s project/team
 * membership resolution (same posture as EN18.10's `OrganizationProfileOverridePolicy`). This
 * service and its callers are fully functional and tested against the *intended* contract; only
 * the backend's role gate itself is temporarily always-deny.
 */
@Injectable({ providedIn: 'root' })
export class RoadmapApiService {
  private readonly http = inject(HttpClient);

  private baseUrl(ref: RoadmapProjectRef): string {
    return `${environment.apiUrl}/tenants/${ref.tenantId}/teams/${ref.teamId}/projects/${ref.projectId}/roadmap`;
  }

  /**
   * Lists a project's lanes, ordered by position.
   *
   * @throws HttpErrorResponse 404 if the tenant/team/project triplet resolves to no visible project
   */
  listLanes(ref: RoadmapProjectRef): Observable<Lane[]> {
    return this.http.get<Lane[]>(`${this.baseUrl(ref)}/lanes`);
  }

  /**
   * Creates a new lane on the project's roadmap-rapide view.
   *
   * @throws HttpErrorResponse 400 (empty/too-long name), 403 (unauthorized — fail-closed today,
   *         see class TSDoc), 404, 409 (`LANE_DUPLICATE` — label already used on this project)
   */
  createLane(ref: RoadmapProjectRef, request: CreateLaneRequest): Observable<Lane> {
    return this.http.post<Lane>(`${this.baseUrl(ref)}/lanes`, request);
  }

  /**
   * Lists a project's initiatives, ordered by lane then position.
   *
   * @throws HttpErrorResponse 404
   */
  listInitiatives(ref: RoadmapProjectRef): Observable<Initiative[]> {
    return this.http.get<Initiative[]>(`${this.baseUrl(ref)}/initiatives`);
  }

  /**
   * Creates a new initiative posed on a lane — no dates or child tasks required (AC1).
   *
   * @throws HttpErrorResponse 400 (`LANE_REQUIRED` — no `laneId` supplied; `LANE_NOT_FOUND` —
   *         unknown/foreign lane; `INVALID_PERIOD` — one bound only, or end before start),
   *         403 (unauthorized — fail-closed today, see class TSDoc), 404
   */
  createInitiative(ref: RoadmapProjectRef, request: CreateInitiativeRequest): Observable<Initiative> {
    return this.http.post<Initiative>(`${this.baseUrl(ref)}/initiatives`, request);
  }

  /**
   * Moves, resizes and/or re-lanes an initiative (AC2) — every field optional, `undefined` means
   * "leave unchanged".
   *
   * @throws HttpErrorResponse 400 (`LANE_NOT_FOUND`, `INVALID_PERIOD`), 403 (unauthorized —
   *         fail-closed today, see class TSDoc), 404 (project or initiative not visible)
   */
  updatePlacement(
    ref: RoadmapProjectRef,
    initiativeId: number,
    request: UpdateInitiativePlacementRequest,
  ): Observable<Initiative> {
    return this.http.patch<Initiative>(`${this.baseUrl(ref)}/initiatives/${initiativeId}`, request);
  }
}
