import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CreateShareLinkRequest, CreateShareLinkResponse, ShareLinkResponse } from './roadmap-share.models';
import { RoadmapProjectRef } from './roadmap.models';

/**
 * HTTP client for the **authenticated** roadmap share-link management contract (US22.3.5) exposed
 * by `pivot-pilotage-core`'s `RoadmapShareController`. Authoritative contract:
 * `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/roadmap-rapide/us-partage-export-roadmap.md`
 * (backend PR `pivot-pilotage-core#36`).
 *
 * Deliberately a **separate service** from `RoadmapApiService` (not a set of extra methods on
 * it) — this keeps the two US's changes additive and independent on shared files, and mirrors the
 * backend's own separate `RoadmapShareController`. Every method here is gated server-side by
 * `RoadmapEditPolicy` — same "who can edit this roadmap" population, and the same known platform
 * gap (`DenyAllRoadmapEditPolicy`, fail-closed) documented on `RoadmapApiService`.
 *
 * `tenantId`/`teamId`/`projectId` travel as **path segments** (never body/query/header), exactly
 * like `RoadmapApiService` — see {@link RoadmapProjectRef}'s TSDoc.
 *
 * **No error handling here** — every method propagates the raw `HttpErrorResponse` to the caller,
 * same "propagate, don't swallow" philosophy as `RoadmapApiService`.
 */
@Injectable({ providedIn: 'root' })
export class RoadmapShareApiService {
  private readonly http = inject(HttpClient);

  private baseUrl(ref: RoadmapProjectRef): string {
    return `${environment.apiUrl}/tenants/${ref.tenantId}/teams/${ref.teamId}/projects/${ref.projectId}/roadmap/share-links`;
  }

  /**
   * Creates a share link. The response's `token` is the **only** time the raw token is ever
   * exposed — see {@link CreateShareLinkResponse}'s TSDoc.
   *
   * @throws HttpErrorResponse 400 (`SHARE_LINK_EXPIRY_INVALID` — `expiresAt` not strictly in the
   *         future), 403 (unauthorized — fail-closed today, see class TSDoc), 404 (project not
   *         visible)
   */
  createShareLink(ref: RoadmapProjectRef, request: CreateShareLinkRequest): Observable<CreateShareLinkResponse> {
    return this.http.post<CreateShareLinkResponse>(this.baseUrl(ref), request);
  }

  /**
   * Lists a project's share links, most recent first. Never includes the token or its hash — see
   * {@link ShareLinkResponse}'s TSDoc.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   */
  listShareLinks(ref: RoadmapProjectRef): Observable<ShareLinkResponse[]> {
    return this.http.get<ShareLinkResponse[]>(this.baseUrl(ref));
  }

  /**
   * Revokes a share link — **idempotent**: revoking an already-revoked/expired link is a silent
   * `204` success, never an error (see backend contract).
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404 (link
   *         not found on this project)
   */
  revokeShareLink(ref: RoadmapProjectRef, shareLinkId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl(ref)}/${shareLinkId}`);
  }
}
