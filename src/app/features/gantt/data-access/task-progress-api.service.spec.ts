import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { TaskProgressApiService } from './task-progress-api.service';
import { TaskProgressApiError, TaskProgressProjectRef, TaskProgressResponse, UpdateTaskProgressRequest } from './task-progress.models';

const REF: TaskProgressProjectRef = { tenantId: 1, teamId: 2, projectId: 3 };
const BASE = `${environment.apiUrl}/tenants/1/teams/2/projects/3/gantt`;

const REQUEST: UpdateTaskProgressRequest = {
  percentComplete: 45,
  physicalPercentComplete: null,
  actualStart: null,
  actualFinish: null,
  statusDate: null,
  actorRef: 'jdupont',
};

const RESPONSE: TaskProgressResponse = {
  taskId: 100,
  percentComplete: 45,
  progressLabel: '45%',
  physicalPercentComplete: null,
  actualWorkMinutes: 1080,
  remainingWorkMinutes: 1320,
  totalWorkMinutes: 2400,
  actualStart: null,
  actualFinish: null,
  statusDate: null,
  revision: 3,
};

describe('TaskProgressApiService', () => {
  let service: TaskProgressApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TaskProgressApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('set', () => {
    it('PATCHes the progress endpoint with the full request body', () => {
      let result: TaskProgressResponse | undefined;
      service.set(REF, 100, REQUEST).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tasks/100/progress`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(REQUEST);
      req.flush(RESPONSE);

      expect(result).toEqual(RESPONSE);
    });

    it('propagates a 422 INVALID_TASK_PROGRESS error body', () => {
      let error: HttpErrorResponse | undefined;
      service.set(REF, 100, { ...REQUEST, percentComplete: 150 }).subscribe({ error: e => (error = e) });

      const body: TaskProgressApiError = { code: 'INVALID_TASK_PROGRESS', message: 'percentComplete must be within [0, 100]' };
      httpMock.expectOne(`${BASE}/tasks/100/progress`).flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect((error?.error as TaskProgressApiError).code).toBe('INVALID_TASK_PROGRESS');
    });

    it('propagates a 422 DERIVED_FIELD_NOT_EDITABLE error body (summary task)', () => {
      let error: HttpErrorResponse | undefined;
      service.set(REF, 100, REQUEST).subscribe({ error: e => (error = e) });

      const body: TaskProgressApiError = { code: 'DERIVED_FIELD_NOT_EDITABLE', message: 'task is a summary' };
      httpMock.expectOne(`${BASE}/tasks/100/progress`).flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect((error?.error as TaskProgressApiError).code).toBe('DERIVED_FIELD_NOT_EDITABLE');
    });

    it('propagates a bodyless 403 (fail-closed WbsEditPolicy)', () => {
      let error: HttpErrorResponse | undefined;
      service.set(REF, 100, REQUEST).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/progress`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 (project/task not visible, or cross-tenant — non-disclosure)', () => {
      let error: HttpErrorResponse | undefined;
      service.set(REF, 100, REQUEST).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/progress`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });
});
