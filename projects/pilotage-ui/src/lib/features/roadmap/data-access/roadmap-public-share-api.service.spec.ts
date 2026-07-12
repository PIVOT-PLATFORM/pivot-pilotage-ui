import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PILOTAGE_API_URL } from '../../../core/config/tokens';

const API_URL = 'http://test.local/api/pilotage';
import { RoadmapPublicShareApiService } from './roadmap-public-share-api.service';
import { RoadmapShareViewResponse } from './roadmap-share.models';

const TOKEN = 'b'.repeat(64);
const VIEW: RoadmapShareViewResponse = {
  projectName: 'Projet Alpha',
  lanes: [{ id: 10, name: 'Thème A', position: 0 }],
  initiatives: [
    {
      id: 100,
      laneId: 10,
      name: 'Initiative A',
      fuzzyPeriodStart: '2026-01-01',
      fuzzyPeriodEnd: '2026-03-31',
      temporalPrecision: 'QUARTER',
      revision: 0,
      horizon: 'NOW',
    },
  ],
};

describe('RoadmapPublicShareApiService', () => {
  let service: RoadmapPublicShareApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PILOTAGE_API_URL, useValue: API_URL }],
    });
    service = TestBed.inject(RoadmapPublicShareApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('AC — GETs the public, unauthenticated view for a token, with no tenant/team/project segment in the URL', () => {
    let result: RoadmapShareViewResponse | undefined;
    service.getSharedRoadmap(TOKEN).subscribe(v => (result = v));

    const req = httpMock.expectOne(`${API_URL}/public/roadmap-shares/${TOKEN}`);
    expect(req.request.method).toBe('GET');
    req.flush(VIEW);

    expect(result).toEqual(VIEW);
  });

  it('URL-encodes the token', () => {
    const weirdToken = 'abc def/ghi';
    service.getSharedRoadmap(weirdToken).subscribe();

    httpMock.expectOne(`${API_URL}/public/roadmap-shares/${encodeURIComponent(weirdToken)}`).flush(VIEW);
  });

  it('Error AC — propagates 404 (SHARE_LINK_INVALID) for an unknown/revoked/expired token', () => {
    let error: HttpErrorResponse | undefined;
    service.getSharedRoadmap(TOKEN).subscribe({ error: e => (error = e) });

    httpMock
      .expectOne(`${API_URL}/public/roadmap-shares/${TOKEN}`)
      .flush({ code: 'SHARE_LINK_INVALID', message: 'invalid' }, { status: 404, statusText: 'Not Found' });

    expect(error?.status).toBe(404);
  });
});
