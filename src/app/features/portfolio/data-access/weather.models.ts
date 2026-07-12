/**
 * Domain models mirroring `pivot-pilotage-core`'s weather contract (US23.2.4 — "Météo et
 * indicateurs normalisés"). Authoritative backend contract (service signatures, DTOs, thresholds,
 * error semantics): `pivot-docs/docs/specs/EPIC-portefeuille/us23-2-4-meteo-indicateurs-normalises.md`
 * (Gate 5, frozen from `pivot-pilotage-core` PR #57, package `fr.pivot.pilotage.weather`).
 *
 * **Known platform gap — no REST controller exists yet, unlike every other feature already
 * shipped in this repo.** `RoadmapController`/`WbsTaskController`/`CalendarController` all exist
 * server-side (some of their *write* endpoints are fail-closed pending `pivot-core-starter`, see
 * `RoadmapApiService`'s TSDoc, but their read endpoints are real and callable today).
 * `fr.pivot.pilotage.weather` has **no `@RestController` at all** — not even a fail-closed one.
 * This was a deliberate scope decision on the backend PR (its Gate 5 spec, "Écarts vs AC
 * initiaux"): `tenantId` still isn't extractable from a `TenantContext` (`pivot-core-starter` not
 * consumable, `TODO-SETUP.md` §5), and there is no HTTP mapping yet for
 * `ProjectNotFoundException` / `ApplicationNotFoundException` / `UnauthorizedWeatherRuleChangeException`
 * to build a client against. On top of that, neither consuming view this US is meant to feed
 * (US23.2.1 "vue portefeuille consolidée", US23.2.2 "dashboards personnalisables") has shipped in
 * this repo yet — there is nowhere to wire a live HTTP call into today.
 *
 * Given both gaps, this file intentionally mirrors only the **data shape** the backend's
 * `ProjectWeather` record already guarantees (frozen, tested, 100% line coverage server-side) —
 * enough for `WeatherIndicatorComponent` to be built, reviewed and unit-tested now against the
 * *real* contract. No `WeatherApiService` / `HttpClient` call is introduced here: that lands
 * together with the REST controller (a future Enabler), without needing to change this shape —
 * same "shape now, wiring later" precedent as `RoadmapProjectRef`'s own TSDoc.
 */

/**
 * Normalized weather status — mirrors `ProjectWeatherStatus` (`SUNNY | CLOUDY | STORMY |
 * INDETERMINATE`). Server-side classification thresholds (fixed, homogeneous, not
 * tenant-customizable for this US): variance ≥ -5 → `SUNNY`, [-15, -5[ → `CLOUDY`, < -15 →
 * `STORMY`. Never computed client-side — this type only names the four possible values the
 * backend can return.
 */
export type ProjectWeatherStatus = 'SUNNY' | 'CLOUDY' | 'STORMY' | 'INDETERMINATE';

/**
 * Reason a project's weather is `INDETERMINATE` — mirrors `ProjectWeatherIndeterminateReason`.
 * Surfaced explicitly (US23.2.4 error AC — "un état indéterminé explicite plutôt qu'une météo par
 * défaut trompeuse") rather than only exposing the `INDETERMINATE` status on its own.
 */
export type ProjectWeatherIndeterminateReason = 'MISSING_STATUS_DATE' | 'MISSING_WINDOW' | 'MISSING_PROGRESS';

/**
 * Immutable, normalized weather indicator of a single project — mirrors `ProjectWeather`
 * (`fr.pivot.pilotage.weather`), field for field. Every field carries the exact same nullability
 * contract as the backend record: `actualProgressPercent`, `expectedProgressPercent`,
 * `varianceInPoints` and `indeterminateReason` are `null` together exactly when `status` is not /
 * is `INDETERMINATE` respectively; `asOfDate` is `null` whenever the project has no `statusDate`
 * (always the case when `indeterminateReason` is `MISSING_STATUS_DATE`). Backend `WeatherDtoTest`
 * enforces this server-side; `WeatherIndicatorComponent`'s own spec re-asserts it client-side —
 * this interface itself cannot express the correlation in TypeScript's structural type system
 * without a discriminated union, deliberately not introduced here to stay a direct 1:1 mirror of
 * the wire shape (a discriminated union would require a client-side mapping step that doesn't
 * exist, since there is no `WeatherApiService` yet — see this file's class-level TSDoc).
 */
export interface ProjectWeather {
  readonly projectId: number;
  readonly tenantId: number;
  readonly status: ProjectWeatherStatus;
  /** Average temporal completion across the project's leaf tasks with a progress record (0–100), or `null` when `status` is `INDETERMINATE`. */
  readonly actualProgressPercent: number | null;
  /** Progress expected at `asOfDate` given the project's temporal window (0–100), or `null` when `status` is `INDETERMINATE`. */
  readonly expectedProgressPercent: number | null;
  /** `actualProgressPercent - expectedProgressPercent`, in percentage points (negative = behind schedule), or `null` when `status` is `INDETERMINATE`. */
  readonly varianceInPoints: number | null;
  /** ISO `yyyy-MM-dd` — the project's `statusDate` (EN22.1a) used as the evaluation reference, or `null` when missing. */
  readonly asOfDate: string | null;
  /** Why `status` is `INDETERMINATE`, or `null` for any other status. */
  readonly indeterminateReason: ProjectWeatherIndeterminateReason | null;
}
