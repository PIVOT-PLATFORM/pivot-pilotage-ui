import type { Initiative, Lane } from './roadmap.models';

/**
 * Domain models mirroring `pivot-pilotage-core`'s roadmap share-link contract (US22.3.5 —
 * "Partage & export de la roadmap"). Authoritative backend contract (endpoints, DTOs, error
 * codes): `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/roadmap-rapide/us-partage-export-roadmap.md`,
 * backend PR `pivot-pilotage-core#36`.
 *
 * A share link grants **read-only, unauthenticated** access to one project's roadmap (lanes +
 * initiatives) via an opaque token — see `RoadmapPublicShareApiService`. Management (create,
 * list, revoke) is authenticated and gated by `RoadmapEditPolicy` server-side (same population as
 * "who can edit this roadmap", currently fail-closed — same known platform gap already documented
 * on `RoadmapApiService`).
 */

/**
 * Body of `POST .../roadmap/share-links` — mirrors `CreateShareLinkRequest`. `expiresAt`, when
 * supplied, must be a strictly-future ISO instant (`400 SHARE_LINK_EXPIRY_INVALID` otherwise) —
 * enforced server-side; absent means the link never expires on its own (still revocable anytime).
 */
export interface CreateShareLinkRequest {
  readonly expiresAt?: string;
}

/**
 * Response of `POST .../roadmap/share-links` — mirrors `CreateShareLinkResponse`. `token` is the
 * **raw, opaque, 64-hex-char secret** — this is the **only** response that ever carries it (never
 * persisted server-side, only its SHA-256 hash is). Once this response is consumed, the token
 * cannot be retrieved again by any means (not even by the creator) — see
 * `RoadmapSharePanelComponent`'s TSDoc for how the UI surfaces this one-time reveal.
 */
export interface CreateShareLinkResponse {
  readonly id: number;
  readonly token: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
}

/**
 * One row of `GET .../roadmap/share-links` — mirrors `ShareLinkResponse`. Deliberately **never**
 * carries the token or its hash — only `CreateShareLinkResponse` (the create response) does.
 * `active` is a server-computed pure function of `revokedAt`/`expiresAt` (no separate `status`
 * enum to fall out of sync) — trusted as-is for whether the link currently works; `revokedAt`/
 * `expiresAt` are exposed alongside it purely so the *authenticated* management UI can show
 * distinct "revoked" vs. "expired" statuses to the editor managing their own links (the
 * non-disclosure requirement — never distinguishing these — applies only to the **public**,
 * unauthenticated endpoint, see `RoadmapShareViewResponse`'s TSDoc and the backend contract's
 * "Security" note).
 */
export interface ShareLinkResponse {
  readonly id: number;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly active: boolean;
}

/**
 * Body of `GET /public/roadmap-shares/{token}` — mirrors `RoadmapShareViewResponse`. Always the
 * **complete** read-only view (never a partial/truncated subset) — the public controller has no
 * mutation method and returns either this in full, or a `404 SHARE_LINK_INVALID` (see
 * {@link ShareLinkApiError}), never anything in between (Error AC — "pas d'affichage partiel").
 */
export interface RoadmapShareViewResponse {
  readonly projectName: string;
  readonly lanes: Lane[];
  readonly initiatives: Initiative[];
}

/**
 * Error body for the share-link endpoints — `{code, message}`.
 *
 * `SHARE_LINK_EXPIRY_INVALID` — `400` from the authenticated create endpoint, `expiresAt` was not
 * strictly in the future.
 *
 * `SHARE_LINK_INVALID` — `404` from the **public** endpoint only. Deliberately covers three
 * distinct server-side situations (unknown token, revoked link, expired link) **without
 * distinguishing them** — a destinguishing response would let someone probing tokens learn
 * whether a given token ever existed, which the backend's non-disclosure design explicitly
 * prevents (see backend contract's "Security" note). `RoadmapPublicShareViewComponent` never
 * attempts to re-derive which of the three occurred — it renders the exact same generic message
 * for all of them, and for any other unexpected error on this endpoint too (see that component's
 * TSDoc).
 */
export interface ShareLinkApiError {
  readonly code: 'SHARE_LINK_EXPIRY_INVALID' | 'SHARE_LINK_INVALID';
  readonly message: string;
}
