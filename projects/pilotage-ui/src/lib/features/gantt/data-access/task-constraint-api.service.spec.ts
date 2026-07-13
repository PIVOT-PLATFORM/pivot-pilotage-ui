import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PILOTAGE_API_URL } from '../../../core/config/tokens';

const API_URL = 'http://test.local/api/pilotage';
import { TaskConstraintApiService } from './task-constraint-api.service';
import { TaskConstraint, TaskConstraintApiError, TaskConstraintProjectRef } from './task-constraint.models';

const REF: TaskConstraintProjectRef = { tenantId: 1, teamId: 2, projectId: 3 };
const BASE = `${API_URL}/tenants/1/teams/2/projects/3/gantt`;

const RESPONSE: TaskConstraint = {
  taskId: 100,
  constraintType: 'MFO',
  constraintDate: '2026-08-14T17:00:00Z',
  deadline: null,
  warnings: [],
};

describe('TaskConstraintApiService', () => {
  let service: TaskConstraintApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PILOTAGE_API_URL, useValue: API_URL }],
    });
    service = TestBed.inject(TaskConstraintApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('get', () => {
    it('GETs the constraint endpoint', () => {
      let result: TaskConstraint | undefined;
      service.get(REF, 100).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tasks/100/constraint`);
      expect(req.request.method).toBe('GET');
      req.flush(RESPONSE);

      expect(result).toEqual(RESPONSE);
    });

    it('propagates a bodyless 404 (project/task not visible, or cross-tenant — non-disclosure)', () => {
      let error: HttpErrorResponse | undefined;
      service.get(REF, 100).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/constraint`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('set', () => {
    it('PUTs the constraint endpoint with the full request body', () => {
      let result: TaskConstraint | undefined;
      service
        .set(REF, 100, { constraintType: 'MFO', constraintDate: '2026-08-14T17:00:00Z', deadline: null })
        .subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tasks/100/constraint`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ constraintType: 'MFO', constraintDate: '2026-08-14T17:00:00Z', deadline: null });
      req.flush(RESPONSE);

      expect(result).toEqual(RESPONSE);
    });

    it('propagates a 422 INVALID_TASK_CONSTRAINT error body', () => {
      let error: HttpErrorResponse | undefined;
      service.set(REF, 100, { constraintType: 'MSO', constraintDate: null, deadline: null }).subscribe({ error: e => (error = e) });

      const body: TaskConstraintApiError = {
        code: 'INVALID_TASK_CONSTRAINT',
        message: 'constraint_date is required for constraint type MSO',
      };
      httpMock.expectOne(`${BASE}/tasks/100/constraint`).flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect((error?.error as TaskConstraintApiError).code).toBe('INVALID_TASK_CONSTRAINT');
    });

    it('propagates a bodyless 403 (fail-closed WbsEditPolicy)', () => {
      let error: HttpErrorResponse | undefined;
      service
        .set(REF, 100, { constraintType: 'ASAP', constraintDate: null, deadline: null })
        .subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/constraint`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 (project/task not visible, or cross-tenant — non-disclosure)', () => {
      let error: HttpErrorResponse | undefined;
      service
        .set(REF, 100, { constraintType: 'ASAP', constraintDate: null, deadline: null })
        .subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/constraint`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });
});
