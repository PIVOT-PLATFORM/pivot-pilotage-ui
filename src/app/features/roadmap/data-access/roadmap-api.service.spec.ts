import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RoadmapApiService } from './roadmap-api.service';
import { Initiative, Lane, Milestone, RoadmapApiError, RoadmapProjectRef } from './roadmap.models';
import { environment } from '../../../../environments/environment';

const REF: RoadmapProjectRef = { tenantId: 1, teamId: 2, projectId: 3 };
const BASE = `${environment.apiUrl}/tenants/1/teams/2/projects/3/roadmap`;

const LANE: Lane = { id: 10, name: 'Thème A', position: 0 };
const INITIATIVE: Initiative = {
  id: 100,
  laneId: 10,
  name: 'Initiative A',
  fuzzyPeriodStart: null,
  fuzzyPeriodEnd: null,
  temporalPrecision: 'QUARTER',
  revision: 0,
};
const MILESTONE: Milestone = {
  id: 200,
  laneId: null,
  name: 'Go/No-Go',
  date: '2026-06-01',
  temporalPrecision: 'DAY',
  revision: 0,
};

describe('RoadmapApiService', () => {
  let service: RoadmapApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RoadmapApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('listLanes', () => {
    it('GETs the ordered lanes for a project', () => {
      let result: Lane[] | undefined;
      service.listLanes(REF).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/lanes`);
      expect(req.request.method).toBe('GET');
      req.flush([LANE]);

      expect(result).toEqual([LANE]);
    });

    it('propagates 404 when the tenant/team/project triplet resolves to no visible project', () => {
      let error: HttpErrorResponse | undefined;
      service.listLanes(REF).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/lanes`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('createLane', () => {
    it('POSTs the lane name and returns the created lane', () => {
      let result: Lane | undefined;
      service.createLane(REF, { name: 'Thème A' }).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/lanes`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Thème A' });
      req.flush(LANE, { status: 201, statusText: 'Created' });

      expect(result).toEqual(LANE);
    });

    it('propagates 400 with an ApiError body on an empty name', () => {
      let error: HttpErrorResponse | undefined;
      service.createLane(REF, { name: '' }).subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'INVALID_NAME', message: 'name must not be blank' };
      httpMock.expectOne(`${BASE}/lanes`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('INVALID_NAME');
    });

    it('propagates a bodyless 403 when the write is unauthorized (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service.createLane(REF, { name: 'Thème A' }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/lanes`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 when the project is not visible', () => {
      let error: HttpErrorResponse | undefined;
      service.createLane(REF, { name: 'Thème A' }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/lanes`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });

    it('propagates 409 (LANE_DUPLICATE) with an ApiError body on a duplicate label', () => {
      let error: HttpErrorResponse | undefined;
      service.createLane(REF, { name: 'Thème A' }).subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'LANE_DUPLICATE', message: 'Lane "Thème A" already exists' };
      httpMock.expectOne(`${BASE}/lanes`).flush(body, { status: 409, statusText: 'Conflict' });

      expect(error?.status).toBe(409);
      expect((error?.error as RoadmapApiError).code).toBe('LANE_DUPLICATE');
    });
  });

  describe('listInitiatives', () => {
    it('GETs the ordered initiatives for a project', () => {
      let result: Initiative[] | undefined;
      service.listInitiatives(REF).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/initiatives`);
      expect(req.request.method).toBe('GET');
      req.flush([INITIATIVE]);

      expect(result).toEqual([INITIATIVE]);
    });

    it('propagates 404', () => {
      let error: HttpErrorResponse | undefined;
      service.listInitiatives(REF).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/initiatives`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('createInitiative', () => {
    it('POSTs the initiative payload (no dates required) and returns the created initiative', () => {
      let result: Initiative | undefined;
      service.createInitiative(REF, { name: 'Initiative A', laneId: 10 }).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/initiatives`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Initiative A', laneId: 10 });
      req.flush(INITIATIVE, { status: 201, statusText: 'Created' });

      expect(result).toEqual(INITIATIVE);
    });

    it('propagates 400 (LANE_REQUIRED) when no laneId is supplied', () => {
      let error: HttpErrorResponse | undefined;
      service
        .createInitiative(REF, { name: 'Initiative A' } as unknown as { name: string; laneId: number })
        .subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'LANE_REQUIRED', message: 'A lane is required to create an initiative on project 3' };
      httpMock.expectOne(`${BASE}/initiatives`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('LANE_REQUIRED');
    });

    it('propagates 400 (LANE_NOT_FOUND) for an unknown/foreign laneId', () => {
      let error: HttpErrorResponse | undefined;
      service.createInitiative(REF, { name: 'Initiative A', laneId: 999 }).subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'LANE_NOT_FOUND', message: 'No lane 999 on project 3' };
      httpMock.expectOne(`${BASE}/initiatives`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('LANE_NOT_FOUND');
    });

    it('propagates 400 (INVALID_PERIOD) when only one fuzzy bound is supplied', () => {
      let error: HttpErrorResponse | undefined;
      service
        .createInitiative(REF, { name: 'Initiative A', laneId: 10, fuzzyPeriodStart: '2026-01-01' })
        .subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'INVALID_PERIOD', message: 'Both bounds must be supplied together' };
      httpMock.expectOne(`${BASE}/initiatives`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('INVALID_PERIOD');
    });

    it('propagates a bodyless 403 when the write is unauthorized (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service.createInitiative(REF, { name: 'Initiative A', laneId: 10 }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/initiatives`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 when the project is not visible', () => {
      let error: HttpErrorResponse | undefined;
      service.createInitiative(REF, { name: 'Initiative A', laneId: 10 }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/initiatives`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('updatePlacement', () => {
    it('PATCHes only the supplied fields and returns the updated initiative', () => {
      let result: Initiative | undefined;
      service
        .updatePlacement(REF, 100, { fuzzyPeriodStart: '2026-01-01', fuzzyPeriodEnd: '2026-03-31' })
        .subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/initiatives/100`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ fuzzyPeriodStart: '2026-01-01', fuzzyPeriodEnd: '2026-03-31' });
      req.flush({ ...INITIATIVE, fuzzyPeriodStart: '2026-01-01', fuzzyPeriodEnd: '2026-03-31' });

      expect(result?.fuzzyPeriodStart).toBe('2026-01-01');
    });

    it('propagates 400 (LANE_NOT_FOUND) when re-laning to an unknown lane', () => {
      let error: HttpErrorResponse | undefined;
      service.updatePlacement(REF, 100, { laneId: 999 }).subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'LANE_NOT_FOUND', message: 'No lane 999 on project 3' };
      httpMock.expectOne(`${BASE}/initiatives/100`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('LANE_NOT_FOUND');
    });

    it('propagates 400 (INVALID_PERIOD) when the end precedes the start', () => {
      let error: HttpErrorResponse | undefined;
      service
        .updatePlacement(REF, 100, { fuzzyPeriodStart: '2026-06-01', fuzzyPeriodEnd: '2026-01-01' })
        .subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'INVALID_PERIOD', message: 'end must not precede start' };
      httpMock.expectOne(`${BASE}/initiatives/100`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('INVALID_PERIOD');
    });

    it('propagates a bodyless 403 when the write is unauthorized (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service.updatePlacement(REF, 100, { laneId: 10 }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/initiatives/100`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 when the project or the initiative is not visible', () => {
      let error: HttpErrorResponse | undefined;
      service.updatePlacement(REF, 100, { laneId: 10 }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/initiatives/100`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('listMilestones', () => {
    it('GETs the milestones for a project', () => {
      let result: Milestone[] | undefined;
      service.listMilestones(REF).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/milestones`);
      expect(req.request.method).toBe('GET');
      req.flush([MILESTONE]);

      expect(result).toEqual([MILESTONE]);
    });

    it('propagates 404 when the tenant/team/project triplet resolves to no visible project', () => {
      let error: HttpErrorResponse | undefined;
      service.listMilestones(REF).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/milestones`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('createMilestone', () => {
    it('POSTs the milestone payload (no laneId required) and returns the created milestone', () => {
      let result: Milestone | undefined;
      service.createMilestone(REF, { name: 'Go/No-Go', date: '2026-06-01' }).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/milestones`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Go/No-Go', date: '2026-06-01' });
      req.flush(MILESTONE, { status: 201, statusText: 'Created' });

      expect(result).toEqual(MILESTONE);
    });

    it('propagates 400 (MILESTONE_DATE_REQUIRED) when no date is supplied', () => {
      let error: HttpErrorResponse | undefined;
      service
        .createMilestone(REF, { name: 'Go/No-Go' } as unknown as { name: string; date: string })
        .subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'MILESTONE_DATE_REQUIRED', message: 'A date is required' };
      httpMock.expectOne(`${BASE}/milestones`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('MILESTONE_DATE_REQUIRED');
    });

    it('propagates 400 (MILESTONE_DATE_OUT_OF_BOUNDS) when the date is outside the project bounds', () => {
      let error: HttpErrorResponse | undefined;
      service.createMilestone(REF, { name: 'Go/No-Go', date: '1999-01-01' }).subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'MILESTONE_DATE_OUT_OF_BOUNDS', message: 'Date outside project bounds' };
      httpMock.expectOne(`${BASE}/milestones`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('MILESTONE_DATE_OUT_OF_BOUNDS');
    });

    it('propagates 400 (LANE_NOT_FOUND) for an unknown/foreign laneId', () => {
      let error: HttpErrorResponse | undefined;
      service
        .createMilestone(REF, { name: 'Go/No-Go', date: '2026-06-01', laneId: 999 })
        .subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'LANE_NOT_FOUND', message: 'No lane 999 on project 3' };
      httpMock.expectOne(`${BASE}/milestones`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('LANE_NOT_FOUND');
    });

    it('propagates a bodyless 403 when the write is unauthorized (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service.createMilestone(REF, { name: 'Go/No-Go', date: '2026-06-01' }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/milestones`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 when the project is not visible', () => {
      let error: HttpErrorResponse | undefined;
      service.createMilestone(REF, { name: 'Go/No-Go', date: '2026-06-01' }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/milestones`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('updateMilestone', () => {
    it('PATCHes only the supplied fields and returns the updated milestone', () => {
      let result: Milestone | undefined;
      service.updateMilestone(REF, 200, { date: '2026-07-01' }).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}/milestones/200`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ date: '2026-07-01' });
      req.flush({ ...MILESTONE, date: '2026-07-01' });

      expect(result?.date).toBe('2026-07-01');
    });

    it('propagates 400 (MILESTONE_DATE_OUT_OF_BOUNDS) when the new date is outside the project bounds', () => {
      let error: HttpErrorResponse | undefined;
      service.updateMilestone(REF, 200, { date: '1999-01-01' }).subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'MILESTONE_DATE_OUT_OF_BOUNDS', message: 'Date outside project bounds' };
      httpMock.expectOne(`${BASE}/milestones/200`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('MILESTONE_DATE_OUT_OF_BOUNDS');
    });

    it('propagates 400 (LANE_NOT_FOUND) when re-laning to an unknown lane', () => {
      let error: HttpErrorResponse | undefined;
      service.updateMilestone(REF, 200, { laneId: 999 }).subscribe({ error: e => (error = e) });

      const body: RoadmapApiError = { code: 'LANE_NOT_FOUND', message: 'No lane 999 on project 3' };
      httpMock.expectOne(`${BASE}/milestones/200`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as RoadmapApiError).code).toBe('LANE_NOT_FOUND');
    });

    it('propagates a bodyless 403 when the write is unauthorized (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service.updateMilestone(REF, 200, { date: '2026-07-01' }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/milestones/200`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 when the project or the milestone is not visible', () => {
      let error: HttpErrorResponse | undefined;
      service.updateMilestone(REF, 200, { date: '2026-07-01' }).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/milestones/200`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });
});
