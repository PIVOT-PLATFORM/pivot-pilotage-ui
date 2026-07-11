import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CreateInitiativeRequest,
  CreateLaneRequest,
  CreateMilestoneRequest,
  Initiative,
  Lane,
  Milestone,
  RoadmapProjectRef,
  UpdateInitiativePlacementRequest,
  UpdateMilestoneRequest,
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
 * `updatePlacement`, and the two milestone writes below) currently 403s unconditionally
 * server-side: `RoadmapEditPolicy` is wired fail-closed (`DenyAllRoadmapEditPolicy`) pending
 * `pivot-core-starter`'s project/team membership resolution (same posture as EN18.10's
 * `OrganizationProfileOverridePolicy`). This service and its callers are fully functional and
 * tested against the *intended* contract; only the backend's role gate itself is temporarily
 * always-deny.
 *
 * **Milestones (US22.3.4 — "Jalons stratégiques").** `listMilestones`/`createMilestone`/
 * `updateMilestone` extend this same contract (`pivot-pilotage-core#37`) with the exact same
 * conventions (controller/service/DTO/error shape) — a milestone is **not** a separate entity
 * either, see `Milestone`'s TSDoc. `RoadmapEditPolicy` (the same fail-closed policy as above,
 * "Réutilise `RoadmapEditPolicy`" per the backlog file) is the sole security gate — this is the
 * Security AC's enforcement point: an unauthorized user's create/date-change attempt 403s here,
 * which the caller (`RoadmapBoardComponent`) turns into a rollback + explicit error, effectively
 * leaving that user in a read-only view without this service or any component needing to know
 * the user's role itself (no client-side role gating — see that component's TSDoc).
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

  /**
   * Lists a project's strategic milestones (US22.3.4), sorted by date (undated ones last per the
   * backend contract — see `Milestone`'s TSDoc).
   *
   * @throws HttpErrorResponse 404 if the tenant/team/project triplet resolves to no visible project
   */
  listMilestones(ref: RoadmapProjectRef): Observable<Milestone[]> {
    return this.http.get<Milestone[]>(`${this.baseUrl(ref)}/milestones`);
  }

  /**
   * Creates a strategic milestone. `laneId` is optional — a milestone without one is a
   * cross-project marker (see `Milestone`'s TSDoc).
   *
   * @throws HttpErrorResponse 400 (`MILESTONE_DATE_REQUIRED` — no `date` supplied;
   *         `MILESTONE_DATE_OUT_OF_BOUNDS` — outside the project's derived bounds; `LANE_NOT_FOUND`
   *         — `laneId` supplied but unknown/foreign), 403 (unauthorized — fail-closed today, see
   *         class TSDoc), 404
   */
  createMilestone(ref: RoadmapProjectRef, request: CreateMilestoneRequest): Observable<Milestone> {
    return this.http.post<Milestone>(`${this.baseUrl(ref)}/milestones`, request);
  }

  /**
   * Moves and/or re-lanes a milestone — every field optional, `undefined` means "leave unchanged"
   * (this service never sends an explicit `null`, see `UpdateMilestoneRequest`'s TSDoc). This is
   * the sole write path for a milestone's date — roadmap and any future Gantt view read the same
   * row, so no separate propagation step is needed for the "date change reflected everywhere" AC.
   *
   * @throws HttpErrorResponse 400 (`MILESTONE_DATE_OUT_OF_BOUNDS`, `LANE_NOT_FOUND`), 403
   *         (unauthorized — fail-closed today, see class TSDoc), 404 (project or milestone not visible)
   */
  updateMilestone(
    ref: RoadmapProjectRef,
    milestoneId: number,
    request: UpdateMilestoneRequest,
  ): Observable<Milestone> {
    return this.http.patch<Milestone>(`${this.baseUrl(ref)}/milestones/${milestoneId}`, request);
  }
}
