import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, it, expect } from 'vitest';
import { DEFAULT_TIME_SCALE, RoadmapTimeScaleService } from './roadmap-time-scale.service';
import { RoadmapProjectRef } from './data-access/roadmap.models';

const REF: RoadmapProjectRef = { tenantId: 1, teamId: 2, projectId: 3 };
const OTHER_PROJECT_REF: RoadmapProjectRef = { tenantId: 1, teamId: 2, projectId: 4 };

describe('RoadmapTimeScaleService', () => {
  let service: RoadmapTimeScaleService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(RoadmapTimeScaleService);
  });

  it('defaults to QUARTER when nothing has been persisted yet', () => {
    expect(service.read(REF)).toBe('QUARTER');
    expect(DEFAULT_TIME_SCALE).toBe('QUARTER');
  });

  it('persists and reads back a chosen scale', () => {
    service.write(REF, 'MONTH');

    expect(service.read(REF)).toBe('MONTH');
  });

  it('scopes the persisted scale per roadmap (tenant/team/project) — one project never leaks into another', () => {
    service.write(REF, 'SEMESTER');

    expect(service.read(OTHER_PROJECT_REF)).toBe('QUARTER');
    expect(service.read(REF)).toBe('SEMESTER');
  });

  it('falls back to the default when the stored value is not a recognised scale (e.g. corrupted/legacy value)', () => {
    localStorage.setItem('pivot.roadmap.timeScale.1.2.3', 'WEEK');

    expect(service.read(REF)).toBe('QUARTER');
  });

  it('never calls any network API — the value only ever lives in localStorage', () => {
    service.write(REF, 'MONTH');

    expect(localStorage.getItem('pivot.roadmap.timeScale.1.2.3')).toBe('MONTH');
  });
});
