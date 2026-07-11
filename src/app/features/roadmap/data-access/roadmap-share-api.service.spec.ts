import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { RoadmapShareApiService } from './roadmap-share-api.service';
import { CreateShareLinkResponse, ShareLinkApiError, ShareLinkResponse } from './roadmap-share.models';
import { RoadmapProjectRef } from './roadmap.models';

const REF: RoadmapProjectRef = { tenantId: 1, teamId: 2, projectId: 3 };
const BASE = `${environment.apiUrl}/tenants/1/teams/2/projects/3/roadmap/share-links`;

const CREATED: CreateShareLinkResponse = {
  id: 10,
  token: 'a'.repeat(64),
  createdAt: '2026-07-11T10:00:00Z',
  expiresAt: null,
};

const LINK: ShareLinkResponse = {
  id: 10,
  createdAt: '2026-07-11T10:00:00Z',
  expiresAt: null,
  revokedAt: null,
  active: true,
};

describe('RoadmapShareApiService', () => {
  let service: RoadmapShareApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RoadmapShareApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('createShareLink', () => {
    it('AC1 — POSTs the (optional) expiry and returns the one-time token response', () => {
      let result: CreateShareLinkResponse | undefined;
      service.createShareLink(REF, { expiresAt: '2027-01-01T00:00:00Z' }).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ expiresAt: '2027-01-01T00:00:00Z' });
      req.flush(CREATED, { status: 201, statusText: 'Created' });

      expect(result).toEqual(CREATED);
    });

    it('POSTs an empty body when no expiry is supplied (link never self-expires)', () => {
      service.createShareLink(REF, {}).subscribe();

      const req = httpMock.expectOne(`${BASE}`);
      expect(req.request.body).toEqual({});
      req.flush(CREATED, { status: 201, statusText: 'Created' });
    });

    it('Error AC — propagates 400 (SHARE_LINK_EXPIRY_INVALID) for a non-future expiry', () => {
      let error: HttpErrorResponse | undefined;
      service.createShareLink(REF, { expiresAt: '2020-01-01T00:00:00Z' }).subscribe({ error: e => (error = e) });

      const body: ShareLinkApiError = { code: 'SHARE_LINK_EXPIRY_INVALID', message: 'expiresAt must be in the future' };
      httpMock.expectOne(`${BASE}`).flush(body, { status: 400, statusText: 'Bad Request' });

      expect(error?.status).toBe(400);
      expect((error?.error as ShareLinkApiError).code).toBe('SHARE_LINK_EXPIRY_INVALID');
    });

    it('Security AC — propagates a bodyless 403 when the caller cannot edit this roadmap (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service.createShareLink(REF, {}).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 when the project is not visible', () => {
      let error: HttpErrorResponse | undefined;
      service.createShareLink(REF, {}).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('listShareLinks', () => {
    it('GETs the project share links, never exposing a token/hash field', () => {
      let result: ShareLinkResponse[] | undefined;
      service.listShareLinks(REF).subscribe(v => (result = v));

      const req = httpMock.expectOne(`${BASE}`);
      expect(req.request.method).toBe('GET');
      req.flush([LINK]);

      expect(result).toEqual([LINK]);
      expect(result?.[0]).not.toHaveProperty('token');
    });

    it('Security AC — propagates a bodyless 403 (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service.listShareLinks(REF).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404', () => {
      let error: HttpErrorResponse | undefined;
      service.listShareLinks(REF).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('revokeShareLink', () => {
    it('Security AC — DELETEs the link (idempotent 204, see backend contract)', () => {
      let completed = false;
      service.revokeShareLink(REF, 10).subscribe({ complete: () => (completed = true) });

      const req = httpMock.expectOne(`${BASE}/10`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(completed).toBe(true);
    });

    it('Security AC — propagates a bodyless 403 (fail-closed today)', () => {
      let error: HttpErrorResponse | undefined;
      service.revokeShareLink(REF, 10).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/10`).flush(null, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
    });

    it('propagates a bodyless 404 when the link does not exist on this project', () => {
      let error: HttpErrorResponse | undefined;
      service.revokeShareLink(REF, 10).subscribe({ error: e => (error = e) });

      httpMock.expectOne(`${BASE}/10`).flush(null, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });
});
