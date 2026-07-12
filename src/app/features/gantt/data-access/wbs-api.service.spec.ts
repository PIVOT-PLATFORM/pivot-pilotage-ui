import { provideHttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { environment } from '../../../../environments/environment';
import { WbsApiService } from './wbs-api.service';
import {
  CreateRecurringTaskRequest,
  GanttProjectRef,
  RecurringTaskResponse,
  WbsApiError,
  WbsTaskResponse,
  WbsTreeResponse,
} from './wbs.models';

const REF: GanttProjectRef = { tenantId: 1, teamId: 2, projectId: 3 };
const BASE = `${environment.apiUrl}/tenants/1/teams/2/projects/3/gantt`;

const TASK_A: WbsTaskResponse = {
  taskId: 100,
  parentTaskId: null,
  wbsCode: '1',
  name: 'Lot A',
  nodeKind: 'SUMMARY',
  nodeKindLabel: 'Summary task',
  position: 0,
  startDate: '2026-01-01T00:00:00Z',
  finishDate: '2026-03-01T00:00:00Z',
  durationMinutes: 4800,
  percentComplete: 45,
  progressLabel: '45%',
  expectedPercentComplete: null,
  late: false,
  progressVarianceLabel: null,
  readOnly: true,
  ariaRole: 'treeitem',
  ariaLevel: 1,
  ariaSetSize: 1,
  ariaPosInSet: 1,
  ariaReadOnly: true,
  revision: 0,
};

const TREE: WbsTreeResponse = { projectId: 3, ariaRole: 'tree', nodes: [TASK_A] };

describe('WbsApiService', () => {
  let service: WbsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WbsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('tree', () => {
    it('GETs the ordered pre-order WBS tree for a project', () => {
      let result: WbsTreeResponse | undefined;
      service.tree(REF).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tree`);
      expect(req.request.method).toBe('GET');
      req.flush(TREE);

      expect(result).toEqual(TREE);
    });

    it('propagates 404 when the tenant/team/project triplet resolves to no visible project', () => {
      let error: HttpErrorResponse | undefined;
      service.tree(REF).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tree`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('indent', () => {
    it('PATCHes the indent endpoint with no body', () => {
      let result: WbsTaskResponse | undefined;
      service.indent(REF, 100).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tasks/100/indent`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toBeNull();
      req.flush(TASK_A);

      expect(result).toEqual(TASK_A);
    });

    it('propagates a 422 ILLEGAL_WBS_MOVE error body', () => {
      let error: HttpErrorResponse | undefined;
      service.indent(REF, 100).subscribe({ error: e => (error = e) });

      const body: WbsApiError = { code: 'ILLEGAL_WBS_MOVE', message: 'no preceding sibling' };
      httpMock
        .expectOne(`${BASE}/tasks/100/indent`)
        .flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect((error?.error as WbsApiError).code).toBe('ILLEGAL_WBS_MOVE');
    });

    it('propagates a bodyless 403 (fail-closed WbsEditPolicy)', () => {
      let error: HttpErrorResponse | undefined;
      service.indent(REF, 100).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/indent`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });
  });

  describe('outdent', () => {
    it('PATCHes the outdent endpoint with no body', () => {
      let result: WbsTaskResponse | undefined;
      service.outdent(REF, 100).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tasks/100/outdent`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toBeNull();
      req.flush(TASK_A);

      expect(result).toEqual(TASK_A);
    });

    it('propagates a 422 ILLEGAL_WBS_MOVE error body (already at WBS root)', () => {
      let error: HttpErrorResponse | undefined;
      service.outdent(REF, 100).subscribe({ error: e => (error = e) });

      const body: WbsApiError = { code: 'ILLEGAL_WBS_MOVE', message: 'already at the WBS root' };
      httpMock
        .expectOne(`${BASE}/tasks/100/outdent`)
        .flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
    });
  });

  describe('move', () => {
    it('PATCHes the move endpoint with only the requested fields', () => {
      let result: WbsTaskResponse | undefined;
      service.move(REF, 100, { position: 2 }).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tasks/100/move`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ position: 2 });
      req.flush(TASK_A);

      expect(result).toEqual(TASK_A);
    });

    it('propagates a 409 WBS_HIERARCHY_CYCLE error body', () => {
      let error: HttpErrorResponse | undefined;
      service.move(REF, 100, { parentTaskId: 999 }).subscribe({ error: e => (error = e) });

      const body: WbsApiError = { code: 'WBS_HIERARCHY_CYCLE', message: 'would create a cycle' };
      httpMock.expectOne(`${BASE}/tasks/100/move`).flush(body, { status: 409, statusText: 'Conflict' });

      expect(error?.status).toBe(409);
      expect((error?.error as WbsApiError).code).toBe('WBS_HIERARCHY_CYCLE');
    });

    it('propagates a bodyless 404 (task or supplied parent not visible)', () => {
      let error: HttpErrorResponse | undefined;
      service.move(REF, 100, { parentTaskId: 999 }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/100/move`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('createRecurringTask', () => {
    const REQUEST: CreateRecurringTaskRequest = {
      name: 'Comité hebdo',
      firstOccurrenceDate: '2026-08-01',
      frequency: 'WEEKLY',
      intervalCount: 1,
      occurrenceCount: 10,
    };

    const SERIES: WbsTaskResponse = { ...TASK_A, taskId: 501, wbsCode: '3', name: 'Comité hebdo', nodeKind: 'RECURRING', nodeKindLabel: 'Recurring task series', readOnly: false, ariaReadOnly: false };
    const OCCURRENCE: WbsTaskResponse = {
      ...TASK_A,
      taskId: 502,
      parentTaskId: 501,
      wbsCode: '3.1',
      name: 'Comité hebdo — occurrence 1/10',
      nodeKind: 'MILESTONE',
      nodeKindLabel: 'Milestone',
      readOnly: false,
      ariaReadOnly: false,
    };
    const RESPONSE: RecurringTaskResponse = {
      series: SERIES,
      recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=10;DTSTART=2026-08-01',
      occurrences: [OCCURRENCE],
    };

    it('POSTs the recurring-task endpoint with the request body and returns the series + occurrences', () => {
      let result: RecurringTaskResponse | undefined;
      service.createRecurringTask(REF, REQUEST).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tasks/recurring`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(REQUEST);
      req.flush(RESPONSE, { status: 201, statusText: 'Created' });

      expect(result).toEqual(RESPONSE);
    });

    it('propagates a 422 INVALID_RECURRENCE error body', () => {
      let error: HttpErrorResponse | undefined;
      service.createRecurringTask(REF, REQUEST).subscribe({ error: e => (error = e) });

      const body: WbsApiError = { code: 'INVALID_RECURRENCE', message: 'frequency is required' };
      httpMock
        .expectOne(`${BASE}/tasks/recurring`)
        .flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect((error?.error as WbsApiError).code).toBe('INVALID_RECURRENCE');
    });

    it('propagates a bodyless 403 (fail-closed WbsEditPolicy)', () => {
      let error: HttpErrorResponse | undefined;
      service.createRecurringTask(REF, REQUEST).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/recurring`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 (project, or a supplied parentTaskId, not visible)', () => {
      let error: HttpErrorResponse | undefined;
      service.createRecurringTask(REF, { ...REQUEST, parentTaskId: 999 }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tasks/recurring`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });
});
