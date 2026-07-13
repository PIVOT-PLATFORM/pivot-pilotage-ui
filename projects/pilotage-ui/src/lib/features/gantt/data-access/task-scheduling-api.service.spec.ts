import { provideHttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PILOTAGE_API_URL } from '../../../core/config/tokens';

const API_URL = 'http://test.local/api/pilotage';
import { TaskSchedulingApiService } from './task-scheduling-api.service';
import { TaskSchedulingApiError, TaskSchedulingProjectRef, TaskSchedulingResponse } from './task-scheduling.models';

const REF: TaskSchedulingProjectRef = { tenantId: 1, teamId: 2, projectId: 3 };
const BASE = `${API_URL}/tenants/1/teams/2/projects/3/gantt`;

const RESPONSE: TaskSchedulingResponse = {
  taskId: 100,
  schedulingMode: null,
  effectiveMode: 'AUTO',
  durationMinutes: 480,
  workMinutes: 480,
  startDate: '2026-01-05T09:00:00Z',
  finishDate: '2026-01-05T17:00:00Z',
  plannedManual: null,
  wouldBeAuto: null,
  deltaMinutes: 0,
  revision: 1,
};

describe('TaskSchedulingApiService', () => {
  let service: TaskSchedulingApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PILOTAGE_API_URL, useValue: API_URL }],
    });
    service = TestBed.inject(TaskSchedulingApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('setDuration', () => {
    it('PATCHes the duration endpoint with the requested minutes', () => {
      let result: TaskSchedulingResponse | undefined;
      service.setDuration(REF, 100, 480).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tasks/100/duration`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ durationMinutes: 480 });
      req.flush(RESPONSE);

      expect(result).toEqual(RESPONSE);
    });

    it('propagates a 422 INVALID_TASK_EFFORT error body', () => {
      let error: HttpErrorResponse | undefined;
      service.setDuration(REF, 100, -1).subscribe({ error: e => (error = e) });

      const body: TaskSchedulingApiError = { code: 'INVALID_TASK_EFFORT', message: 'duration_minutes must be >= 0' };
      httpMock.expectOne(`${BASE}/tasks/100/duration`).flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect((error?.error as TaskSchedulingApiError).code).toBe('INVALID_TASK_EFFORT');
    });

    it('propagates a bodyless 403 (fail-closed WbsEditPolicy)', () => {
      let error: HttpErrorResponse | undefined;
      service.setDuration(REF, 100, 480).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/duration`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 (project or task not visible)', () => {
      let error: HttpErrorResponse | undefined;
      service.setDuration(REF, 100, 480).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/duration`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('setEffort', () => {
    it('PATCHes the effort endpoint with the resource reference and units', () => {
      let result: TaskSchedulingResponse | undefined;
      service.setEffort(REF, 100, 'alice', 50).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tasks/100/effort`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ resourceRef: 'alice', unitsPercent: 50 });
      req.flush({ ...RESPONSE, workMinutes: 240 });

      expect(result?.workMinutes).toBe(240);
    });

    it('propagates a 422 INVALID_TASK_EFFORT error body (non-positive units)', () => {
      let error: HttpErrorResponse | undefined;
      service.setEffort(REF, 100, 'alice', 0).subscribe({ error: e => (error = e) });

      const body: TaskSchedulingApiError = { code: 'INVALID_TASK_EFFORT', message: 'units_percent must be > 0' };
      httpMock.expectOne(`${BASE}/tasks/100/effort`).flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect((error?.error as TaskSchedulingApiError).code).toBe('INVALID_TASK_EFFORT');
    });
  });

  describe('setSchedulingMode', () => {
    it('PATCHes the scheduling-mode endpoint with the requested mode', () => {
      let result: TaskSchedulingResponse | undefined;
      service.setSchedulingMode(REF, 100, 'MANUAL').subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tasks/100/scheduling-mode`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ schedulingMode: 'MANUAL' });
      req.flush({ ...RESPONSE, schedulingMode: 'MANUAL', effectiveMode: 'MANUAL', deltaMinutes: 120 });

      expect(result?.effectiveMode).toBe('MANUAL');
      expect(result?.deltaMinutes).toBe(120);
    });

    it('propagates a bodyless 403 (fail-closed WbsEditPolicy)', () => {
      let error: HttpErrorResponse | undefined;
      service.setSchedulingMode(REF, 100, 'AUTO').subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/scheduling-mode`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 (project or task not visible)', () => {
      let error: HttpErrorResponse | undefined;
      service.setSchedulingMode(REF, 100, 'AUTO').subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/scheduling-mode`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });
});
