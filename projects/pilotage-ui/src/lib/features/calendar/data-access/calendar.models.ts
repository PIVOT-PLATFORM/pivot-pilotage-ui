/**
 * Domain models mirroring `pivot-pilotage-core`'s working-time calendar contract (US22.4.5 —
 * "Calendriers ouvrés & exceptions"). Authoritative backend contract (endpoints, DTOs, error
 * codes): `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/gantt-detaille/us-calendriers-ouvres.md`,
 * backend PR `pivot-pilotage-core#45` (`fr.pivot.pilotage.calendar` package).
 *
 * A calendar defines the working days (ISO week, 1=Mon..7=Sun) and intra-day whole-hour working
 * ranges for one of three scopes — see {@link CalendarScope}. An **exception** is a derogatory
 * day attached to a calendar (public holiday / closure, or an exceptionally-worked day),
 * reusable across every task/resource the calendar governs — never duplicated per task (see
 * backlog file's "Notes d'implémentation").
 *
 * **Resolution priority (EN22.1, decision D7).** For a given task (optionally a specific
 * resource), the *effective* calendar is resolved as **resource &gt; task &gt; project** — see
 * {@link EffectiveCalendarResponse}. This resolution itself, and the actual scheduling effect of
 * an exception (extending/shrinking a task's occupied span), are backend responsibilities already
 * covered by `CalendarServiceIT` — this frontend only manages/displays the calendars and
 * exceptions, and displays the already-resolved effective calendar (out of scope: US22.4.2's
 * recalculation, see backlog file's "Hors périmètre").
 */

/** The level a calendar applies to. Mirrors the backend's `fr.pivot.pilotage.schedule.CalendarScope` enum. */
export type CalendarScope = 'PROJECT' | 'TASK' | 'RESOURCE';

/**
 * One intra-day working-time range, expressed as whole hours `[startHour, endHour)` on a 24-hour
 * clock — mirrors `WorkingTimeRange`. `startHour` 0..23, `endHour` 1..24, strictly greater than
 * `startHour` (enforced client-side before submit, and server-side regardless, 422 otherwise).
 */
export interface WorkingTimeRange {
  readonly startHour: number;
  readonly endHour: number;
}

/** A working-time calendar — mirrors `CalendarResponse`. */
export interface CalendarResponse {
  readonly calendarId: number;
  /** Owning project id, or `null` for a reusable calendar (typically a `RESOURCE` calendar). */
  readonly projectId: number | null;
  readonly scope: CalendarScope;
  readonly name: string;
  /** ISO week days worked (1=Mon..7=Sun), at least one. */
  readonly workingDays: number[];
  /** Intra-day whole-hour working ranges, at least one. */
  readonly ranges: WorkingTimeRange[];
}

/**
 * Body of `POST .../calendars` — mirrors `CreateCalendarRequest`. `scope` and `projectId` are the
 * calendar's immutable identity/placement — never sent again on an update (see
 * {@link UpdateCalendarRequest}'s TSDoc).
 */
export interface CreateCalendarRequest {
  readonly scope: CalendarScope;
  readonly projectId?: number | null;
  readonly name: string;
  readonly workingDays: number[];
  readonly ranges: WorkingTimeRange[];
}

/**
 * Body of `PUT .../calendars/{calendarId}` — mirrors `UpdateCalendarRequest`. Only the mutable
 * attributes (name, working days, ranges); `scope`/`projectId` of an existing calendar are never
 * updated (a scope change would be a different calendar, per the backend JavaDoc).
 */
export interface UpdateCalendarRequest {
  readonly name: string;
  readonly workingDays: number[];
  readonly ranges: WorkingTimeRange[];
}

/**
 * One derogatory day attached to a calendar — mirrors `CalendarExceptionResponse`. `working:
 * false` is a day off (public holiday, closure); `working: true` is an exceptionally-worked day,
 * whose `ranges` are its specific hours (empty ⇒ the calendar's own default ranges apply).
 */
export interface CalendarExceptionResponse {
  readonly exceptionId: number;
  readonly calendarId: number;
  /** ISO `yyyy-MM-dd`. */
  readonly exceptionDate: string;
  readonly working: boolean;
  readonly ranges: WorkingTimeRange[];
}

/**
 * Body of `POST .../calendars/{calendarId}/exceptions` — mirrors `AddExceptionRequest`. Modelled
 * as a **dated interval** (`startDate`..`endDate`, both inclusive) — the backend expands it into
 * one {@link CalendarExceptionResponse} per day. `endDate` strictly before `startDate` is rejected
 * `422 INVALID_CALENDAR_EXCEPTION` (Error AC) — checked client-side first for immediate feedback
 * (see `CalendarExceptionsPanelComponent`), the identical server error is still handled the same
 * way if it ever occurs regardless (defense in depth, same posture as
 * `RoadmapSharePanelComponent`'s `EXPIRY_INVALID` client+server double-check).
 */
export interface AddExceptionRequest {
  readonly startDate: string;
  readonly endDate: string;
  readonly working: boolean;
  readonly ranges?: WorkingTimeRange[];
}

/**
 * Error body for every calendar/exception write — `{code, message}`, mirrors `CalendarApiError`.
 * `INVALID_CALENDAR_EXCEPTION` is the **only** code the backend emits today (422) — covers both an
 * invalid working-time range and an exception interval whose end precedes its start. `message` is
 * always an explicit, human-readable reason (never surfaced raw to end users here — mapped to a
 * translated key, but logged/available for support).
 */
export interface CalendarApiError {
  readonly code: 'INVALID_CALENDAR_EXCEPTION';
  readonly message: string;
}

/**
 * Body of `GET .../projects/{projectId}/tasks/{taskId}/effective-calendar` — mirrors
 * `EffectiveCalendarResponse`. `resolvedFrom` names the level that actually governs the task's
 * (or task/resource pair's) working time after applying the resource &gt; task &gt; project
 * priority (AC3) — always surfaced explicitly in the UI (not just implied), so a chef de projet
 * can see *why* a given calendar applies.
 */
export interface EffectiveCalendarResponse {
  readonly calendarId: number;
  readonly resolvedFrom: CalendarScope;
  readonly calendar: CalendarResponse;
}

/**
 * Identifies which tenant/team's calendars a request targets — mirrors `RoadmapProjectRef`'s own
 * gap-era convention. `tenantId`/`teamId` travel as **path segments** on every
 * `CalendarApiService` call (never body/query/header) — `pivot-core-starter`'s `TenantContext` is
 * not yet published (this repo's CLAUDE.md §Isolation tenant), so this repo never types, stores
 * or transmits a tenant/team id any other way. Always resolved from the current route, never
 * cached client-side.
 */
export interface CalendarTeamRef {
  readonly tenantId: number;
  readonly teamId: number;
}

/**
 * Identifies which task's effective calendar a request targets — extends {@link CalendarTeamRef}
 * with the project/task the resolution is scoped to. Same gap-era path-segment convention.
 */
export interface CalendarTaskRef extends CalendarTeamRef {
  readonly projectId: number;
  readonly taskId: number;
}

/** ISO week day (1=Mon..7=Sun), ascending — the canonical order every day-picker/list renders in. */
export const ISO_WEEK_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Maps an ISO week day (1=Mon..7=Sun) to its `calendar.days.{key}` i18n key suffix — every
 * component rendering a working day (day picker, calendar list, effective-calendar view) uses
 * this so a day is always announced by its translated name (A11y AC — "pas seulement une
 * couleur"), never a bare number.
 */
export function isoDayI18nKey(day: number): string {
  const keys = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  return keys[day - 1] ?? String(day);
}

/**
 * Formats a whole hour (0..24) as a zero-padded `HH:00` label — the same whole-hour convention the
 * backend serialises into `working_time` JSONB (`WorkingTimeRange`'s TSDoc). Display-only; never
 * used to build a request payload (those carry the raw numeric hours).
 */
export function formatHour(hour: number): string {
  return `${hour < 10 ? '0' : ''}${hour}:00`;
}
