import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PILOTAGE_API_URL } from '../../../core/config/tokens';

const API_URL = 'http://test.local/api/pilotage';
import { CalendarApiService } from './calendar-api.service';
import { CalendarApiError, CalendarResponse, CalendarTaskRef, CalendarTeamRef, EffectiveCalendarResponse } from './calendar.models';

const TEAM_REF: CalendarTeamRef = { tenantId: 1, teamId: 2 };
const TASK_REF: CalendarTaskRef = { tenantId: 1, teamId: 2, projectId: 3, taskId: 9 };
const BASE = `${API_URL}/tenants/1/teams/2`;

const CALENDAR: CalendarResponse = {
  calendarId: 100,
  projectId: 3,
  scope: 'PROJECT',
  name: 'Standard',
  workingDays: [1, 2, 3, 4, 5],
  ranges: [{ startHour: 9, endHour: 17 }],
};

describe('CalendarApiService', () => {
  let service: CalendarApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PILOTAGE_API_URL, useValue: API_URL }],
    });
    service = TestBed.inject(CalendarApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('listCalendars', () => {
    it('GETs the tenant/team calendars', () => {
      let result: CalendarResponse[] | undefined;
      service.listCalendars(TEAM_REF).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/calendars`);
      expect(req.request.method).toBe('GET');
      req.flush([CALENDAR]);

      expect(result).toEqual([CALENDAR]);
    });
  });

  describe('createCalendar', () => {
    it('POSTs the creation payload and returns the created calendar', () => {
      let result: CalendarResponse | undefined;
      service
        .createCalendar(TEAM_REF, {
          scope: 'PROJECT',
          projectId: 3,
          name: 'Standard',
          workingDays: [1, 2, 3, 4, 5],
          ranges: [{ startHour: 9, endHour: 17 }],
        })
        .subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/calendars`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        scope: 'PROJECT',
        projectId: 3,
        name: 'Standard',
        workingDays: [1, 2, 3, 4, 5],
        ranges: [{ startHour: 9, endHour: 17 }],
      });
      req.flush(CALENDAR, { status: 201, statusText: 'Created' });

      expect(result).toEqual(CALENDAR);
    });

    it('propagates a 403 when the write is unauthorized (fail-closed platform gap)', () => {
      let error: HttpErrorResponse | undefined;
      service
        .createCalendar(TEAM_REF, { scope: 'RESOURCE', name: 'Alice', workingDays: [1], ranges: [{ startHour: 9, endHour: 17 }] })
        .subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/calendars`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a 422 INVALID_CALENDAR_EXCEPTION body when working days/ranges are invalid', () => {
      let error: HttpErrorResponse | undefined;
      service
        .createCalendar(TEAM_REF, { scope: 'PROJECT', projectId: 3, name: 'Bad', workingDays: [1], ranges: [{ startHour: 17, endHour: 9 }] })
        .subscribe({ error: e => (error = e) });

      const apiError: CalendarApiError = { code: 'INVALID_CALENDAR_EXCEPTION', message: 'invalid range' };
      httpMock.expectOne(`${BASE}/calendars`).flush(apiError, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect((error?.error as CalendarApiError).code).toBe('INVALID_CALENDAR_EXCEPTION');
    });
  });

  describe('updateCalendar', () => {
    it('PUTs the update payload to the calendar URL', () => {
      let result: CalendarResponse | undefined;
      service.updateCalendar(TEAM_REF, 100, { name: 'Std-2', workingDays: [1, 2, 3], ranges: [{ startHour: 8, endHour: 12 }] }).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/calendars/100`);
      expect(req.request.method).toBe('PUT');
      req.flush({ ...CALENDAR, name: 'Std-2' });

      expect(result?.name).toBe('Std-2');
    });
  });

  describe('deleteCalendar', () => {
    it('DELETEs the calendar', () => {
      let completed = false;
      service.deleteCalendar(TEAM_REF, 100).subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${BASE}/calendars/100`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(completed).toBe(true);
    });
  });

  describe('listExceptions', () => {
    it('GETs the calendar exceptions', () => {
      let result: unknown;
      service.listExceptions(TEAM_REF, 100).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/calendars/100/exceptions`);
      expect(req.request.method).toBe('GET');
      req.flush([]);

      expect(result).toEqual([]);
    });
  });

  describe('addException', () => {
    it('POSTs the interval and returns the expanded per-day exceptions', () => {
      let result: unknown;
      service.addException(TEAM_REF, 100, { startDate: '2026-05-01', endDate: '2026-05-01', working: false }).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/calendars/100/exceptions`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ startDate: '2026-05-01', endDate: '2026-05-01', working: false });
      req.flush([{ exceptionId: 1, calendarId: 100, exceptionDate: '2026-05-01', working: false, ranges: [] }], { status: 201, statusText: 'Created' });

      expect(result).toHaveLength(1);
    });

    it('propagates a 422 INVALID_CALENDAR_EXCEPTION for an end date before the start date (Error AC)', () => {
      let error: HttpErrorResponse | undefined;
      service.addException(TEAM_REF, 100, { startDate: '2026-05-05', endDate: '2026-05-01', working: false }).subscribe({ error: e => (error = e) });

      const apiError: CalendarApiError = { code: 'INVALID_CALENDAR_EXCEPTION', message: 'end before start' };
      httpMock.expectOne(`${BASE}/calendars/100/exceptions`).flush(apiError, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
    });
  });

  describe('removeException', () => {
    it('DELETEs a single exception', () => {
      let completed = false;
      service.removeException(TEAM_REF, 100, 5).subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${BASE}/calendars/100/exceptions/5`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(completed).toBe(true);
    });
  });

  describe('effectiveCalendar', () => {
    it('GETs the effective calendar without a resourceRef', () => {
      let result: EffectiveCalendarResponse | undefined;
      service.effectiveCalendar(TASK_REF).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/projects/3/tasks/9/effective-calendar`);
      expect(req.request.method).toBe('GET');
      const response: EffectiveCalendarResponse = { calendarId: 100, resolvedFrom: 'PROJECT', calendar: CALENDAR };
      req.flush(response);

      expect(result?.resolvedFrom).toBe('PROJECT');
    });

    it('appends the resourceRef query param when supplied (AC3 — resource priority)', () => {
      let result: EffectiveCalendarResponse | undefined;
      service.effectiveCalendar(TASK_REF, 'alice').subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/projects/3/tasks/9/effective-calendar?resourceRef=alice`);
      expect(req.request.method).toBe('GET');
      const response: EffectiveCalendarResponse = { calendarId: 101, resolvedFrom: 'RESOURCE', calendar: { ...CALENDAR, calendarId: 101, scope: 'RESOURCE', projectId: null, name: 'alice' } };
      req.flush(response);

      expect(result?.resolvedFrom).toBe('RESOURCE');
    });

    it('propagates 404 when no calendar resolves for the task', () => {
      let error: HttpErrorResponse | undefined;
      service.effectiveCalendar(TASK_REF).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/projects/3/tasks/9/effective-calendar`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });
});
