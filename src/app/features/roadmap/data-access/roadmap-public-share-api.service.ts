import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RoadmapShareViewResponse } from './roadmap-share.models';

/**
 * HTTP client for the **public, unauthenticated** roadmap share-link view contract (US22.3.5)
 * exposed by `pivot-pilotage-core`'s `RoadmapShareController` at `GET
 * /public/roadmap-shares/{token}`. Authoritative contract:
 * `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/roadmap-rapide/us-partage-export-roadmap.md`
 * (backend PR `pivot-pilotage-core#36`).
 *
 * **No `tenantId`/`teamId`/`projectId`** — unlike every other roadmap endpoint in this codebase,
 * this one deliberately carries none of them: the recipient of a share link knows only the
 * opaque `token`, never any internal identifier. The backend resolves tenant/team/project
 * entirely from the token's hash server-side.
 *
 * **No auth of any kind** — consumed by `RoadmapPublicShareViewComponent`, which this repo routes
 * (`app.routes.ts`) **without any guard** (`moduleGuard`, `AuthGuard`, or otherwise): this is an
 * intentional public, unauthenticated access path, not an oversight. Never gate this route or
 * this service behind auth — that would break the whole point of a share link (a recipient with
 * no PIVOT account/session must still be able to open it).
 *
 * **No error handling here** — every call propagates the raw `HttpErrorResponse` to the caller.
 * Per the backend contract, this endpoint has exactly two outcomes: `200` with the full view, or
 * `404 SHARE_LINK_INVALID` — the three underlying causes (unknown/revoked/expired token) are
 * deliberately never distinguished, by design (non-disclosure) — see
 * `RoadmapShareViewResponse`/`ShareLinkApiError`'s TSDoc in `roadmap-share.models.ts`. This
 * service does not — and must never — attempt to re-derive which cause applies from the error
 * response; that responsibility (rendering one single generic message for every failure on this
 * endpoint) belongs to `RoadmapPublicShareViewComponent`.
 */
@Injectable({ providedIn: 'root' })
export class RoadmapPublicShareApiService {
  private readonly http = inject(HttpClient);

  /**
   * Fetches the complete, read-only roadmap view for a share token.
   *
   * @throws HttpErrorResponse 404 (`SHARE_LINK_INVALID`) if the token is unknown, revoked, or
   *         expired — see class TSDoc for why these are never distinguished
   */
  getSharedRoadmap(token: string): Observable<RoadmapShareViewResponse> {
    return this.http.get<RoadmapShareViewResponse>(
      `${environment.apiUrl}/public/roadmap-shares/${encodeURIComponent(token)}`,
    );
  }
}
