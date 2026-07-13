import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PILOTAGE_API_URL } from '../../../core/config/tokens';
import {
  AddExceptionRequest,
  CalendarExceptionResponse,
  CalendarResponse,
  CalendarTaskRef,
  CalendarTeamRef,
  CreateCalendarRequest,
  EffectiveCalendarResponse,
  UpdateCalendarRequest,
} from './calendar.models';

/**
 * HTTP client for the working-time calendar contract (US22.4.5) exposed by
 * `pivot-pilotage-core`'s `CalendarController`. Authoritative contract:
 * `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/gantt-detaille/us-calendriers-ouvres.md`
 * (backend PR `pivot-pilotage-core#45`).
 *
 * **Known platform gap.** Every write here (create/update/delete a calendar, add/remove an
 * exception) 403s unconditionally server-side today — `DenyAllCalendarEditPolicy`, fail-closed
 * pending `pivot-core-starter`'s project-membership/roles (this repo's CLAUDE.md §gap). Read
 * endpoints (list/read a calendar, list exceptions, resolve the effective calendar) are never
 * gated — same split already established by `RoadmapApiService`. This service does **not** hide
 * any write behind a client-side permission check (no role claims are available client-side yet)
 * — same documented posture as `RoadmapSharePanelComponent`: the backend 403 is the actual
 * enforcement point, this service only propagates it.
 *
 * `tenantId`/`teamId`/`projectId`/`taskId` travel as **path segments** (never body/query/header),
 * per {@link CalendarTeamRef}/{@link CalendarTaskRef}'s TSDoc.
 *
 * **No error handling here** — every method propagates the raw `HttpErrorResponse` to the caller,
 * same "propagate, don't swallow" philosophy as `RoadmapApiService`/`RoadmapShareApiService`.
 */
@Injectable({ providedIn: 'root' })
export class CalendarApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PILOTAGE_API_URL);

  private teamBaseUrl(ref: CalendarTeamRef): string {
    return `${this.apiUrl}/tenants/${ref.tenantId}/teams/${ref.teamId}`;
  }

  private calendarUrl(ref: CalendarTeamRef, calendarId: number): string {
    return `${this.teamBaseUrl(ref)}/calendars/${calendarId}`;
  }

  /**
   * Lists the tenant/team's calendars.
   *
   * @throws HttpErrorResponse 403 (unauthorized — see class TSDoc gap, though reads are not
   *         gated), 404 (unknown tenant/team)
   */
  listCalendars(ref: CalendarTeamRef): Observable<CalendarResponse[]> {
    return this.http.get<CalendarResponse[]>(`${this.teamBaseUrl(ref)}/calendars`);
  }

  /**
   * Creates a calendar.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404 (a
   *         supplied `projectId` is not visible), 422 (`INVALID_CALENDAR_EXCEPTION` — invalid
   *         working days/ranges)
   */
  createCalendar(ref: CalendarTeamRef, request: CreateCalendarRequest): Observable<CalendarResponse> {
    return this.http.post<CalendarResponse>(`${this.teamBaseUrl(ref)}/calendars`, request);
  }

  /**
   * Updates a calendar's name, working days and ranges.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404 (not
   *         visible), 422 (`INVALID_CALENDAR_EXCEPTION` — invalid working days/ranges)
   */
  updateCalendar(ref: CalendarTeamRef, calendarId: number, request: UpdateCalendarRequest): Observable<CalendarResponse> {
    return this.http.put<CalendarResponse>(this.calendarUrl(ref, calendarId), request);
  }

  /**
   * Deletes a calendar (its exceptions cascade server-side).
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404 (not
   *         visible)
   */
  deleteCalendar(ref: CalendarTeamRef, calendarId: number): Observable<void> {
    return this.http.delete<void>(this.calendarUrl(ref, calendarId));
  }

  /**
   * Lists a calendar's exceptions, ordered by date.
   *
   * @throws HttpErrorResponse 404 (calendar not visible)
   */
  listExceptions(ref: CalendarTeamRef, calendarId: number): Observable<CalendarExceptionResponse[]> {
    return this.http.get<CalendarExceptionResponse[]>(`${this.calendarUrl(ref, calendarId)}/exceptions`);
  }

  /**
   * Adds a derogatory interval to a calendar (expanded server-side into one exception per day).
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (calendar not visible), 422 (`INVALID_CALENDAR_EXCEPTION` — end before start, Error
   *         AC, or invalid ranges)
   */
  addException(ref: CalendarTeamRef, calendarId: number, request: AddExceptionRequest): Observable<CalendarExceptionResponse[]> {
    return this.http.post<CalendarExceptionResponse[]>(`${this.calendarUrl(ref, calendarId)}/exceptions`, request);
  }

  /**
   * Removes a single exception day from a calendar.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404 (not
   *         visible)
   */
  removeException(ref: CalendarTeamRef, calendarId: number, exceptionId: number): Observable<void> {
    return this.http.delete<void>(`${this.calendarUrl(ref, calendarId)}/exceptions/${exceptionId}`);
  }

  /**
   * Resolves the calendar that effectively governs a task's (optionally a resource's) working
   * time, applying the resource &gt; task &gt; project priority (AC3, decision D7). A read — never
   * gated by the write policy.
   *
   * @param resourceRef the resource whose calendar may prime, or omitted for the task/project
   *        resolution only
   * @throws HttpErrorResponse 404 (project/task not visible, or no calendar resolves)
   */
  effectiveCalendar(ref: CalendarTaskRef, resourceRef?: string): Observable<EffectiveCalendarResponse> {
    const base = `${this.teamBaseUrl(ref)}/projects/${ref.projectId}/tasks/${ref.taskId}/effective-calendar`;
    const url = resourceRef ? `${base}?resourceRef=${encodeURIComponent(resourceRef)}` : base;
    return this.http.get<EffectiveCalendarResponse>(url);
  }
}
