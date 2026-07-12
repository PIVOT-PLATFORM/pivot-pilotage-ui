import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { BaselineApiService } from './baseline-api.service';
import { BaselineApiError, BaselineComparison, BaselineProjectRef, BaselineSummary, BaselineVariance } from './baseline.models';

const REF: BaselineProjectRef = { tenantId: 1, teamId: 2, projectId: 3 };
const BASE = `${environment.apiUrl}/tenants/1/teams/2/projects/3/baselines`;

const SUMMARY: BaselineSummary = { id: 10, baselineIndex: 0, capturedAt: '2026-07-01T09:00:00Z', taskCount: 42 };

describe('BaselineApiService', () => {
  let service: BaselineApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BaselineApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('list', () => {
    it('GETs the baselines endpoint', () => {
      let result: BaselineSummary[] | undefined;
      service.list(REF).subscribe(v => (result = v));

      const req = httpMock.expectOne(BASE);
      expect(req.request.method).toBe('GET');
      req.flush([SUMMARY]);

      expect(result).toEqual([SUMMARY]);
    });

    it('propagates a bodyless 404 (project not visible, or cross-tenant — non-disclosure)', () => {
      let error: HttpErrorResponse | undefined;
      service.list(REF).subscribe({ error: e => (error = e) });

      httpMock.expectOne(BASE).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('setBaseline', () => {
    it('POSTs an explicit index', () => {
      let result: BaselineSummary | undefined;
      service.setBaseline(REF, { baselineIndex: 3 }).subscribe(v => (result = v));

      const req = httpMock.expectOne(BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ baselineIndex: 3 });
      req.flush({ ...SUMMARY, baselineIndex: 3 });

      expect(result?.baselineIndex).toBe(3);
    });

    it('POSTs an explicit-null body to auto-assign the lowest free slot', () => {
      service.setBaseline(REF, { baselineIndex: null }).subscribe();

      const req = httpMock.expectOne(BASE);
      expect(req.request.body).toEqual({ baselineIndex: null });
      req.flush(SUMMARY);
    });

    it('propagates a 422 INVALID_BASELINE_INDEX error body', () => {
      let error: HttpErrorResponse | undefined;
      service.setBaseline(REF, { baselineIndex: 99 }).subscribe({ error: e => (error = e) });

      const body: BaselineApiError = { code: 'INVALID_BASELINE_INDEX', message: 'baselineIndex must be between 0 and 10' };
      httpMock.expectOne(BASE).flush(body, { status: 422, statusText: 'Unprocessable Entity' });

      expect(error?.status).toBe(422);
      expect((error?.error as BaselineApiError).code).toBe('INVALID_BASELINE_INDEX');
    });

    it('propagates a 409 BASELINE_LIMIT_EXCEEDED error body (error AC — 12th baseline)', () => {
      let error: HttpErrorResponse | undefined;
      service.setBaseline(REF, { baselineIndex: null }).subscribe({ error: e => (error = e) });

      const body: BaselineApiError = { code: 'BASELINE_LIMIT_EXCEEDED', message: 'all 11 baseline slots are already used' };
      httpMock.expectOne(BASE).flush(body, { status: 409, statusText: 'Conflict' });

      expect(error?.status).toBe(409);
      expect((error?.error as BaselineApiError).code).toBe('BASELINE_LIMIT_EXCEEDED');
    });

    it('propagates a bodyless 403 (fail-closed BaselineEditPolicy)', () => {
      let error: HttpErrorResponse | undefined;
      service.setBaseline(REF, { baselineIndex: null }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(BASE).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });
  });

  describe('deleteBaseline', () => {
    it('DELETEs the indexed baseline', () => {
      let completed = false;
      service.deleteBaseline(REF, 2).subscribe({ complete: () => (completed = true) });

      const req = httpMock.expectOne(`${BASE}/2`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      expect(completed).toBe(true);
    });

    it('propagates a bodyless 404 (no baseline at that index)', () => {
      let error: HttpErrorResponse | undefined;
      service.deleteBaseline(REF, 2).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/2`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });

    it('propagates a bodyless 403 (fail-closed BaselineEditPolicy)', () => {
      let error: HttpErrorResponse | undefined;
      service.deleteBaseline(REF, 2).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/2`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });
  });

  describe('variance', () => {
    const VARIANCE: BaselineVariance = { baselineIndex: 0, baselineCapturedAt: '2026-07-01T09:00:00Z', tasks: [] };

    it('GETs the variance endpoint', () => {
      let result: BaselineVariance | undefined;
      service.variance(REF, 0).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/0/variance`);
      expect(req.request.method).toBe('GET');
      req.flush(VARIANCE);

      expect(result).toEqual(VARIANCE);
    });

    it('propagates a bodyless 404 (baseline not visible)', () => {
      let error: HttpErrorResponse | undefined;
      service.variance(REF, 0).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/0/variance`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('compare', () => {
    const COMPARISON: BaselineComparison = {
      fromIndex: 0,
      fromCapturedAt: '2026-07-01T09:00:00Z',
      toIndex: 1,
      toCapturedAt: '2026-07-08T09:00:00Z',
      tasks: [],
    };

    it('GETs the compare endpoint', () => {
      let result: BaselineComparison | undefined;
      service.compare(REF, 0, 1).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/0/compare/1`);
      expect(req.request.method).toBe('GET');
      req.flush(COMPARISON);

      expect(result).toEqual(COMPARISON);
    });

    it('propagates a bodyless 404 (either index not visible)', () => {
      let error: HttpErrorResponse | undefined;
      service.compare(REF, 0, 1).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/0/compare/1`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });
});
