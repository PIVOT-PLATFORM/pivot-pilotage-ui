import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PILOTAGE_API_URL } from '../../../core/config/tokens';

const API_URL = 'http://test.local/api/pilotage';
import { DependencyApiService } from './dependency-api.service';
import { Dependency, DependencyApiError, DependencyProjectRef, TaskOption } from './dependency.models';

const REF: DependencyProjectRef = { tenantId: 1, teamId: 2, projectId: 3 };
const BASE = `${API_URL}/tenants/1/teams/2/projects/3/gantt`;

const DEPENDENCY: Dependency = {
  dependencyId: 100,
  predecessorTaskId: 10,
  successorTaskId: 20,
  linkType: 'FS',
  lagMinutes: 0,
};

describe('DependencyApiService', () => {
  let service: DependencyApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PILOTAGE_API_URL, useValue: API_URL }],
    });
    service = TestBed.inject(DependencyApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('listTasks', () => {
    it('GETs the WBS tree and projects it to a flat, labellable task list', () => {
      let result: TaskOption[] | undefined;
      service.listTasks(REF).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/tree`);
      expect(req.request.method).toBe('GET');
      req.flush({
        projectId: 3,
        ariaRole: 'tree',
        nodes: [
          { taskId: 10, wbsCode: '1', name: 'Analyse', parentTaskId: null, extraField: 'ignored' },
          { taskId: 20, wbsCode: '2', name: 'Conception', parentTaskId: null },
        ],
      });

      expect(result).toEqual([
        { taskId: 10, wbsCode: '1', name: 'Analyse' },
        { taskId: 20, wbsCode: '2', name: 'Conception' },
      ]);
    });

    it('propagates 404 when the tenant/team/project triplet resolves to no visible project', () => {
      let error: HttpErrorResponse | undefined;
      service.listTasks(REF).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/tree`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('list', () => {
    it('GETs the project dependencies', () => {
      let result: Dependency[] | undefined;
      service.list(REF).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/dependencies`);
      expect(req.request.method).toBe('GET');
      req.flush([DEPENDENCY]);

      expect(result).toEqual([DEPENDENCY]);
    });

    it('propagates 404', () => {
      let error: HttpErrorResponse | undefined;
      service.list(REF).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/dependencies`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('create', () => {
    it('POSTs the typed dependency payload and returns the created dependency', () => {
      let result: Dependency | undefined;
      service
        .create(REF, { predecessorTaskId: 10, successorTaskId: 20, linkType: 'FS', lagMinutes: 0 })
        .subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/dependencies`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ predecessorTaskId: 10, successorTaskId: 20, linkType: 'FS', lagMinutes: 0 });
      req.flush(DEPENDENCY, { status: 201, statusText: 'Created' });

      expect(result).toEqual(DEPENDENCY);
    });

    it('propagates 422 (INVALID_DEPENDENCY) on a self-link', () => {
      let error: HttpErrorResponse | undefined;
      service
        .create(REF, { predecessorTaskId: 10, successorTaskId: 10, linkType: 'FS', lagMinutes: 0 })
        .subscribe({ error: e => (error = e) });

      const body: DependencyApiError = { code: 'INVALID_DEPENDENCY', message: 'A task cannot depend on itself' };
      httpMock.expectOne(`${BASE}/dependencies`).flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect((error?.error as DependencyApiError).code).toBe('INVALID_DEPENDENCY');
    });

    it('propagates 409 (DUPLICATE_DEPENDENCY) on an already-existing link', () => {
      let error: HttpErrorResponse | undefined;
      service
        .create(REF, { predecessorTaskId: 10, successorTaskId: 20, linkType: 'FS', lagMinutes: 0 })
        .subscribe({ error: e => (error = e) });

      const body: DependencyApiError = { code: 'DUPLICATE_DEPENDENCY', message: 'Already exists' };
      httpMock.expectOne(`${BASE}/dependencies`).flush(body, { status: 409, statusText: 'Conflict' });

      expect(error?.status).toBe(409);
      expect((error?.error as DependencyApiError).code).toBe('DUPLICATE_DEPENDENCY');
    });

    it('propagates 409 (SCHEDULE_CYCLE) when the link would introduce a cycle', () => {
      let error: HttpErrorResponse | undefined;
      service
        .create(REF, { predecessorTaskId: 20, successorTaskId: 10, linkType: 'FS', lagMinutes: 0 })
        .subscribe({ error: e => (error = e) });

      const body: DependencyApiError = { code: 'SCHEDULE_CYCLE', message: 'Cycle detected' };
      httpMock.expectOne(`${BASE}/dependencies`).flush(body, { status: 409, statusText: 'Conflict' });

      expect(error?.status).toBe(409);
      expect((error?.error as DependencyApiError).code).toBe('SCHEDULE_CYCLE');
    });

    it('propagates a bodyless 403 when the write is unauthorized (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service
        .create(REF, { predecessorTaskId: 10, successorTaskId: 20, linkType: 'FS', lagMinutes: 0 })
        .subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/dependencies`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 when the project or an endpoint task is not visible', () => {
      let error: HttpErrorResponse | undefined;
      service
        .create(REF, { predecessorTaskId: 10, successorTaskId: 999, linkType: 'FS', lagMinutes: 0 })
        .subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/dependencies`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('update', () => {
    it('PUTs the retype/relag payload and returns the updated dependency', () => {
      let result: Dependency | undefined;
      service.update(REF, 100, { linkType: 'SS', lagMinutes: 480 }).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/dependencies/100`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ linkType: 'SS', lagMinutes: 480 });
      req.flush({ ...DEPENDENCY, linkType: 'SS', lagMinutes: 480 });

      expect(result?.linkType).toBe('SS');
      expect(result?.lagMinutes).toBe(480);
    });

    it('propagates 409 (DUPLICATE_DEPENDENCY) when the retype collides with an existing link', () => {
      let error: HttpErrorResponse | undefined;
      service.update(REF, 100, { linkType: 'SS', lagMinutes: 0 }).subscribe({ error: e => (error = e) });

      const body: DependencyApiError = { code: 'DUPLICATE_DEPENDENCY', message: 'Already exists' };
      httpMock.expectOne(`${BASE}/dependencies/100`).flush(body, { status: 409, statusText: 'Conflict' });

      expect(error?.status).toBe(409);
      expect((error?.error as DependencyApiError).code).toBe('DUPLICATE_DEPENDENCY');
    });

    it('propagates 409 (SCHEDULE_CYCLE) when the change would introduce a cycle', () => {
      let error: HttpErrorResponse | undefined;
      service.update(REF, 100, { linkType: 'SF', lagMinutes: 0 }).subscribe({ error: e => (error = e) });

      const body: DependencyApiError = { code: 'SCHEDULE_CYCLE', message: 'Cycle detected' };
      httpMock.expectOne(`${BASE}/dependencies/100`).flush(body, { status: 409, statusText: 'Conflict' });

      expect(error?.status).toBe(409);
      expect((error?.error as DependencyApiError).code).toBe('SCHEDULE_CYCLE');
    });

    it('propagates a bodyless 403 when the write is unauthorized (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service.update(REF, 100, { linkType: 'SS', lagMinutes: 0 }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/dependencies/100`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 when the dependency is not visible', () => {
      let error: HttpErrorResponse | undefined;
      service.update(REF, 100, { linkType: 'SS', lagMinutes: 0 }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/dependencies/100`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('delete', () => {
    it('DELETEs the dependency', () => {
      let completed = false;
      service.delete(REF, 100).subscribe({ complete: () => (completed = true) });

      const req = httpMock.expectOne(`${BASE}/dependencies/100`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(completed).toBe(true);
    });

    it('propagates a bodyless 403 when the write is unauthorized (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service.delete(REF, 100).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/dependencies/100`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 when the dependency is not visible', () => {
      let error: HttpErrorResponse | undefined;
      service.delete(REF, 100).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/dependencies/100`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });
});
