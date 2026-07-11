import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { RoadmapBoardComponent } from './roadmap-board.component';
import { RoadmapApiService } from '../data-access/roadmap-api.service';
import { Initiative, Lane, Milestone } from '../data-access/roadmap.models';
import { RoadmapTimeScaleService } from '../roadmap-time-scale.service';
import { PERIOD_WIDTH_PX, RoadmapTimeScale } from '../roadmap-timeline';

const QUARTER_WIDTH_PX = PERIOD_WIDTH_PX.QUARTER;
const REF = { tenantId: 1, teamId: 2, projectId: 3 };
const LANE_A: Lane = { id: 10, name: 'Thème A', position: 0 };
const LANE_B: Lane = { id: 20, name: 'Thème B', position: 1 };

const INITIATIVE_A: Initiative = {
  id: 100,
  laneId: 10,
  name: 'Initiative A',
  fuzzyPeriodStart: null,
  fuzzyPeriodEnd: null,
  temporalPrecision: 'QUARTER',
  revision: 0,
};

const MILESTONE_A: Milestone = {
  id: 200,
  laneId: null,
  name: 'Go/No-Go',
  date: '2026-02-15',
  temporalPrecision: 'DAY',
  revision: 0,
};

interface ApiMock {
  listLanes: ReturnType<typeof vi.fn>;
  createLane: ReturnType<typeof vi.fn>;
  listInitiatives: ReturnType<typeof vi.fn>;
  createInitiative: ReturnType<typeof vi.fn>;
  updatePlacement: ReturnType<typeof vi.fn>;
  listMilestones: ReturnType<typeof vi.fn>;
  createMilestone: ReturnType<typeof vi.fn>;
  updateMilestone: ReturnType<typeof vi.fn>;
}

interface TimeScaleServiceMock {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
}

function makeApiMock(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    listLanes: vi.fn(() => of([LANE_A, LANE_B])),
    createLane: vi.fn(),
    listInitiatives: vi.fn(() => of([INITIATIVE_A])),
    createInitiative: vi.fn(),
    updatePlacement: vi.fn(),
    listMilestones: vi.fn(() => of([MILESTONE_A])),
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
    ...overrides,
  };
}

function makeTimeScaleServiceMock(initial: RoadmapTimeScale = 'QUARTER'): TimeScaleServiceMock {
  return {
    read: vi.fn(() => initial),
    write: vi.fn(),
  };
}

function createFixture(
  api: ApiMock,
  timeScaleService: TimeScaleServiceMock = makeTimeScaleServiceMock(),
): ComponentFixture<RoadmapBoardComponent> {
  TestBed.configureTestingModule({
    imports: [RoadmapBoardComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: RoadmapApiService, useValue: api },
      { provide: RoadmapTimeScaleService, useValue: timeScaleService },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ tenantId: '1', teamId: '2', projectId: '3' }) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(RoadmapBoardComponent);
  fixture.detectChanges();
  return fixture;
}

function setTimeScale(fixture: ComponentFixture<RoadmapBoardComponent>, scale: RoadmapTimeScale): void {
  const select = (fixture.nativeElement as HTMLElement).querySelector('#rm-time-scale') as HTMLSelectElement;
  select.value = scale;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
}

function text(fixture: ComponentFixture<RoadmapBoardComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function setInputValue(fixture: ComponentFixture<RoadmapBoardComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement | HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  fixture.detectChanges();
}

function submitForm(fixture: ComponentFixture<RoadmapBoardComponent>, formIndex: number): void {
  const form = (fixture.nativeElement as HTMLElement).querySelectorAll('form')[formIndex];
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}

describe('RoadmapBoardComponent', () => {
  it('loads and renders lanes, initiatives and milestones on init', () => {
    const api = makeApiMock();
    const fixture = createFixture(api);

    expect(api.listLanes).toHaveBeenCalledWith(REF);
    expect(api.listInitiatives).toHaveBeenCalledWith(REF);
    expect(api.listMilestones).toHaveBeenCalledWith(REF);

    const laneLabels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.rm-lane__label'),
    ).map(el => el.textContent?.trim());
    expect(laneLabels).toEqual(['Thème A', 'Thème B']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-initiative-bar')).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-milestone-marker')).toHaveLength(1);
  });

  it('shows a NOT_FOUND load error on 404 and recovers on retry', () => {
    const api = makeApiMock({
      listLanes: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))),
    });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('roadmap.board.load.errors.NOT_FOUND');

    api.listLanes.mockReturnValue(of([LANE_A]));
    const retryButton = (fixture.nativeElement as HTMLElement).querySelector(
      '.rm-board__status--error button',
    ) as HTMLButtonElement;
    retryButton.click();
    fixture.detectChanges();

    expect(text(fixture)).not.toContain('roadmap.board.load.errors.NOT_FOUND');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.rm-lane__label')).toHaveLength(1);
  });

  it('shows a GENERIC load error on a non-404 failure', () => {
    const api = makeApiMock({
      listLanes: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))),
    });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('roadmap.board.load.errors.GENERIC');
  });

  it('shows the empty-lanes message when there are no lanes, initiatives or milestones yet', () => {
    const api = makeApiMock({
      listLanes: vi.fn(() => of([])),
      listInitiatives: vi.fn(() => of([])),
      listMilestones: vi.fn(() => of([])),
    });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('roadmap.board.noLanes');
  });

  it('US22.3.4 — still renders the milestones row (no "empty" message) when there are no lanes but a laneless milestone exists', () => {
    const api = makeApiMock({
      listLanes: vi.fn(() => of([])),
      listInitiatives: vi.fn(() => of([])),
      listMilestones: vi.fn(() => of([MILESTONE_A])),
    });
    const fixture = createFixture(api);

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-milestone-marker')).toHaveLength(1);
  });

  describe('create lane', () => {
    it('rejects an empty name client-side without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      submitForm(fixture, 0);

      expect(api.createLane).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('roadmap.board.createLane.errors.NAME_REQUIRED');
    });

    it('creates a lane and appends it to the rendered list on success', () => {
      const newLane: Lane = { id: 30, name: 'Thème C', position: 2 };
      const api = makeApiMock({ createLane: vi.fn(() => of(newLane)) });
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-lane-name', 'Thème C');
      submitForm(fixture, 0);

      expect(api.createLane).toHaveBeenCalledWith(REF, { name: 'Thème C' });
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('.rm-lane__label')).toHaveLength(3);
    });

    it.each([
      [409, 'LANE_DUPLICATE', 'roadmap.board.createLane.errors.LANE_DUPLICATE'],
      [400, undefined, 'roadmap.board.createLane.errors.INVALID_NAME'],
      [403, undefined, 'roadmap.board.createLane.errors.FORBIDDEN'],
      [404, undefined, 'roadmap.board.createLane.errors.NOT_FOUND'],
      [500, undefined, 'roadmap.board.createLane.errors.GENERIC'],
    ])('maps a %d error (code=%s) to %s', (status, code, expectedKey) => {
      const api = makeApiMock({
        createLane: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? { code } : null })),
        ),
      });
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-lane-name', 'Thème C');
      submitForm(fixture, 0);

      expect(text(fixture)).toContain(expectedKey);
    });
  });

  describe('create initiative', () => {
    it('rejects an empty name client-side without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-initiative-lane', '10');
      submitForm(fixture, 1);

      expect(api.createInitiative).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('roadmap.board.createInitiative.errors.NAME_REQUIRED');
    });

    it('Error AC — rejects a missing lane client-side with an explicit message, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-initiative-name', 'Initiative B');
      submitForm(fixture, 1);

      expect(api.createInitiative).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('roadmap.board.createInitiative.errors.LANE_REQUIRED');
    });

    it('AC1 — creates an initiative with no date/task required, and renders it on success', () => {
      const created: Initiative = { ...INITIATIVE_A, id: 200, name: 'Initiative B' };
      const api = makeApiMock({ createInitiative: vi.fn(() => of(created)) });
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-initiative-name', 'Initiative B');
      setInputValue(fixture, '#rm-new-initiative-lane', '10');
      submitForm(fixture, 1);

      expect(api.createInitiative).toHaveBeenCalledWith(REF, { name: 'Initiative B', laneId: 10 });
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-initiative-bar')).toHaveLength(2);
    });

    it.each([
      [400, 'LANE_REQUIRED', 'roadmap.board.createInitiative.errors.LANE_REQUIRED'],
      [400, 'LANE_NOT_FOUND', 'roadmap.board.createInitiative.errors.LANE_NOT_FOUND'],
      [400, 'INVALID_PERIOD', 'roadmap.board.createInitiative.errors.INVALID_PERIOD'],
      [403, undefined, 'roadmap.board.createInitiative.errors.FORBIDDEN'],
      [404, undefined, 'roadmap.board.createInitiative.errors.NOT_FOUND'],
      [500, undefined, 'roadmap.board.createInitiative.errors.GENERIC'],
    ])('Error AC — maps a %d error (code=%s) to %s', (status, code, expectedKey) => {
      const api = makeApiMock({
        createInitiative: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? { code } : null })),
        ),
      });
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-initiative-name', 'Initiative B');
      setInputValue(fixture, '#rm-new-initiative-lane', '10');
      submitForm(fixture, 1);

      expect(text(fixture)).toContain(expectedKey);
    });
  });

  describe('create milestone (US22.3.4 — Jalons stratégiques)', () => {
    it('rejects an empty name client-side without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-milestone-date', '2026-06-01');
      submitForm(fixture, 2);

      expect(api.createMilestone).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('roadmap.board.createMilestone.errors.NAME_REQUIRED');
    });

    it('Error AC — rejects a missing date client-side with an explicit message (MILESTONE_DATE_REQUIRED), without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-milestone-name', 'Go/No-Go');
      submitForm(fixture, 2);

      expect(api.createMilestone).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('roadmap.board.createMilestone.errors.MILESTONE_DATE_REQUIRED');
    });

    it('AC — creates a milestone with no laneId required (cross-project marker), and renders it on success', () => {
      const created: Milestone = { ...MILESTONE_A, id: 300, name: 'Comité de pilotage' };
      const api = makeApiMock({ createMilestone: vi.fn(() => of(created)) });
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-milestone-name', 'Comité de pilotage');
      setInputValue(fixture, '#rm-new-milestone-date', '2026-06-01');
      submitForm(fixture, 2);

      expect(api.createMilestone).toHaveBeenCalledWith(REF, { name: 'Comité de pilotage', date: '2026-06-01' });
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-milestone-marker')).toHaveLength(2);
    });

    it('AC — creates a milestone pinned to a chosen lane', () => {
      const created: Milestone = { ...MILESTONE_A, id: 300, laneId: 10, name: 'Go/No-Go v2' };
      const api = makeApiMock({ createMilestone: vi.fn(() => of(created)) });
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-milestone-name', 'Go/No-Go v2');
      setInputValue(fixture, '#rm-new-milestone-date', '2026-06-01');
      setInputValue(fixture, '#rm-new-milestone-lane', '10');
      submitForm(fixture, 2);

      expect(api.createMilestone).toHaveBeenCalledWith(REF, {
        name: 'Go/No-Go v2',
        date: '2026-06-01',
        laneId: 10,
      });
    });

    it.each([
      [400, 'MILESTONE_DATE_REQUIRED', 'roadmap.board.createMilestone.errors.MILESTONE_DATE_REQUIRED'],
      [400, 'MILESTONE_DATE_OUT_OF_BOUNDS', 'roadmap.board.createMilestone.errors.MILESTONE_DATE_OUT_OF_BOUNDS'],
      [400, 'LANE_NOT_FOUND', 'roadmap.board.createMilestone.errors.LANE_NOT_FOUND'],
      [403, undefined, 'roadmap.board.createMilestone.errors.FORBIDDEN'],
      [404, undefined, 'roadmap.board.createMilestone.errors.NOT_FOUND'],
      [500, undefined, 'roadmap.board.createMilestone.errors.GENERIC'],
    ])('Error AC — maps a %d error (code=%s) to %s', (status, code, expectedKey) => {
      const api = makeApiMock({
        createMilestone: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? { code } : null })),
        ),
      });
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-new-milestone-name', 'Go/No-Go');
      setInputValue(fixture, '#rm-new-milestone-date', '2026-06-01');
      submitForm(fixture, 2);

      expect(text(fixture)).toContain(expectedKey);
    });
  });

  describe('moving a milestone (date change AC, A11y AC, Security AC) — via the rendered marker', () => {
    function pressArrowRightOnMarker(fixture: ComponentFixture<RoadmapBoardComponent>): void {
      const marker = (fixture.nativeElement as HTMLElement).querySelector('.rm-milestone') as HTMLElement;
      marker.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      fixture.detectChanges();
    }

    it('AC/A11y — a keyboard nudge on the rendered marker applies the new date optimistically', () => {
      const api = makeApiMock({
        updateMilestone: vi.fn(() => of({ ...MILESTONE_A, date: '2026-04-01' })),
      });
      const fixture = createFixture(api);

      pressArrowRightOnMarker(fixture);

      expect(api.updateMilestone).toHaveBeenCalledWith(REF, MILESTONE_A.id, { date: expect.any(String) });
      expect(text(fixture)).not.toContain('roadmap.board.milestoneDate.errors');
    });

    it('Security AC — rolls back and surfaces FORBIDDEN when the write 403s (fail-closed backend today)', () => {
      const api = makeApiMock({
        updateMilestone: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))),
      });
      const fixture = createFixture(api);

      pressArrowRightOnMarker(fixture);

      expect(text(fixture)).toContain('roadmap.board.milestoneDate.errors.FORBIDDEN');
      // Rolled back — still exactly one marker, the board hasn't lost the milestone.
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-milestone-marker')).toHaveLength(1);
    });

    it.each([
      [400, 'MILESTONE_DATE_OUT_OF_BOUNDS', 'roadmap.board.milestoneDate.errors.MILESTONE_DATE_OUT_OF_BOUNDS'],
      [400, 'LANE_NOT_FOUND', 'roadmap.board.milestoneDate.errors.LANE_NOT_FOUND'],
      [404, undefined, 'roadmap.board.milestoneDate.errors.NOT_FOUND'],
      [500, undefined, 'roadmap.board.milestoneDate.errors.GENERIC'],
    ])('maps a %d date-change error (code=%s) to %s', (status, code, expectedKey) => {
      const api = makeApiMock({
        updateMilestone: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? { code } : null })),
        ),
      });
      const fixture = createFixture(api);

      pressArrowRightOnMarker(fixture);

      expect(text(fixture)).toContain(expectedKey);
    });

    it('A11y — announces a "moved" message optimistically, then corrects it to "reverted" on rollback', () => {
      const api = makeApiMock({
        updateMilestone: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))),
      });
      const fixture = createFixture(api);

      pressArrowRightOnMarker(fixture);

      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('roadmap.board.milestones.marker.announceReverted');
    });

    it('Staleness guard — an out-of-order (older) PATCH response never clobbers a newer date change', () => {
      const responses: Subject<Milestone>[] = [];
      const api = makeApiMock({
        updateMilestone: vi.fn(() => {
          const subject = new Subject<Milestone>();
          responses.push(subject);
          return subject.asObservable();
        }),
      });
      const fixture = createFixture(api);
      const marker = (fixture.nativeElement as HTMLElement).querySelector('.rm-milestone') as HTMLElement;

      marker.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      marker.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      fixture.detectChanges();

      expect(responses).toHaveLength(2);

      const firstRequestBody = api.updateMilestone.mock.calls[0][2] as { date: string };
      const secondRequestBody = api.updateMilestone.mock.calls[1][2] as { date: string };

      // The SECOND (newer) request's response arrives FIRST (network reordering).
      responses[1].next({ ...MILESTONE_A, ...secondRequestBody });
      // The FIRST (now-superseded) request's response arrives LAST — must be a no-op.
      responses[0].next({ ...MILESTONE_A, ...firstRequestBody });
      fixture.detectChanges();

      expect(marker.style.left).toBe(`${QUARTER_WIDTH_PX * 2}px`);
    });
  });

  describe('moving/resizing an initiative (AC2, A11y AC, Security AC) — via the rendered bar', () => {
    function pressArrowRight(fixture: ComponentFixture<RoadmapBoardComponent>): void {
      const bar = (fixture.nativeElement as HTMLElement).querySelector('.rm-bar') as HTMLElement;
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      fixture.detectChanges();
    }

    it('AC2/A11y — a keyboard nudge on the rendered bar applies the new placement optimistically', () => {
      const api = makeApiMock({
        updatePlacement: vi.fn(() => of({ ...INITIATIVE_A, fuzzyPeriodStart: '2026-04-01', fuzzyPeriodEnd: '2026-06-30' })),
      });
      const fixture = createFixture(api);

      pressArrowRight(fixture);

      expect(api.updatePlacement).toHaveBeenCalledWith(REF, INITIATIVE_A.id, {
        laneId: 10,
        fuzzyPeriodStart: expect.any(String),
        fuzzyPeriodEnd: expect.any(String),
      });
      expect(text(fixture)).not.toContain('roadmap.board.placement.errors');
    });

    it('Security AC — rolls back and surfaces FORBIDDEN when the write 403s (fail-closed backend today)', () => {
      const api = makeApiMock({
        updatePlacement: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))),
      });
      const fixture = createFixture(api);

      pressArrowRight(fixture);

      expect(text(fixture)).toContain('roadmap.board.placement.errors.FORBIDDEN');
      // Rolled back — still exactly one bar, and the board hasn't lost the initiative.
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-initiative-bar')).toHaveLength(1);
    });

    it.each([
      [400, 'LANE_NOT_FOUND', 'roadmap.board.placement.errors.LANE_NOT_FOUND'],
      [400, 'INVALID_PERIOD', 'roadmap.board.placement.errors.INVALID_PERIOD'],
      [404, undefined, 'roadmap.board.placement.errors.NOT_FOUND'],
      [500, undefined, 'roadmap.board.placement.errors.GENERIC'],
    ])('maps a %d placement error (code=%s) to %s', (status, code, expectedKey) => {
      const api = makeApiMock({
        updatePlacement: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? { code } : null })),
        ),
      });
      const fixture = createFixture(api);

      pressArrowRight(fixture);

      expect(text(fixture)).toContain(expectedKey);
    });

    it('A11y — announces a "moved" message optimistically, then corrects it to "reverted" on rollback', () => {
      const api = makeApiMock({
        updatePlacement: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))),
      });
      const fixture = createFixture(api);

      pressArrowRight(fixture);

      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      // TranslocoTestingModule's stub doesn't interpolate — the raw key is what's asserted (see
      // `wheel-detail.component.spec.ts` in pivot-agilite-ui for the same established pattern).
      expect(liveRegion?.textContent).toContain('roadmap.board.bar.announceReverted');
    });

    it('Staleness guard — an out-of-order (older) PATCH response never clobbers a newer placement change', () => {
      const responses: Subject<Initiative>[] = [];
      const api = makeApiMock({
        updatePlacement: vi.fn(() => {
          const subject = new Subject<Initiative>();
          responses.push(subject);
          return subject.asObservable();
        }),
      });
      const fixture = createFixture(api);
      const bar = (fixture.nativeElement as HTMLElement).querySelector('.rm-bar') as HTMLElement;

      // Two nudges in quick succession on the SAME initiative — each fires its own PATCH, neither
      // has resolved yet. CD is flushed between them so the second nudge builds on the first's
      // already-applied optimistic update (Q1 -> Q2 -> Q3), exactly like two real keypresses.
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      fixture.detectChanges();

      expect(responses).toHaveLength(2);

      // Echo back exactly what each request actually asked for, as a real backend would — the
      // board's quarter axis is anchored on `new Date()` (today), never a fixed calendar date,
      // so the response bodies must be derived from the real requests, not hardcoded dates.
      const firstRequestBody = api.updatePlacement.mock.calls[0][2] as {
        laneId: number;
        fuzzyPeriodStart: string;
        fuzzyPeriodEnd: string;
      };
      const secondRequestBody = api.updatePlacement.mock.calls[1][2] as {
        laneId: number;
        fuzzyPeriodStart: string;
        fuzzyPeriodEnd: string;
      };

      // The SECOND (newer) request's response arrives FIRST (network reordering).
      responses[1].next({ ...INITIATIVE_A, ...secondRequestBody });
      // The FIRST (now-superseded) request's response arrives LAST — must be a no-op, not undo
      // the second response's result.
      responses[0].next({ ...INITIATIVE_A, ...firstRequestBody });
      fixture.detectChanges();

      // Final rendered position reflects the SECOND (Q3, axis index 2) response, not the
      // first's (Q2, index 1) — pixel position is asserted rather than text, since the bar's
      // aria-label isn't interpolated under TranslocoTestingModule's stub.
      expect(bar.style.left).toBe(`${QUARTER_WIDTH_PX * 2}px`);
    });
  });

  describe('time scale (US22.3.2 — "Échelle de temps floue")', () => {
    it('renders the scale selector as a labelled, native <select> defaulting to QUARTER', () => {
      const fixture = createFixture(makeApiMock());

      const label = (fixture.nativeElement as HTMLElement).querySelector('label[for="rm-time-scale"]');
      const select = (fixture.nativeElement as HTMLElement).querySelector('#rm-time-scale') as HTMLSelectElement;

      expect(label).not.toBeNull();
      expect(select.tagName).toBe('SELECT');
      expect(select.value).toBe('QUARTER');
    });

    it('AC — aligns bars on quarter boundaries by default (2 columns wide for a whole-quarter period)', () => {
      const fixture = createFixture(makeApiMock());

      const bar = (fixture.nativeElement as HTMLElement).querySelector('.rm-bar') as HTMLElement;
      expect(bar.style.width).toBe(`${QUARTER_WIDTH_PX}px`);
    });

    it('AC — switching to MONTH re-projects the period header at month granularity (12 columns/year)', () => {
      const fixture = createFixture(makeApiMock());

      setTimeScale(fixture, 'MONTH');

      const cells = (fixture.nativeElement as HTMLElement).querySelectorAll('.rm-board__period-cell');
      expect(cells).toHaveLength(24); // PERIOD_AXIS_LENGTH.MONTH
      expect(cells[0].textContent?.trim()).toMatch(/^[A-Za-z]{3} \d{4}$/);
    });

    it('AC — switching to SEMESTER re-projects the period header labelled H1/H2', () => {
      const fixture = createFixture(makeApiMock());

      setTimeScale(fixture, 'SEMESTER');

      const cells = (fixture.nativeElement as HTMLElement).querySelectorAll('.rm-board__period-cell');
      expect(cells).toHaveLength(4); // PERIOD_AXIS_LENGTH.SEMESTER
      expect(cells[0].textContent?.trim()).toMatch(/^H[12] \d{4}$/);
    });

    it('persists the chosen scale via RoadmapTimeScaleService, scoped to this roadmap', () => {
      const timeScaleService = makeTimeScaleServiceMock();
      const fixture = createFixture(makeApiMock(), timeScaleService);

      setTimeScale(fixture, 'MONTH');

      expect(timeScaleService.write).toHaveBeenCalledWith(REF, 'MONTH');
    });

    it('restores a previously-persisted scale on load (reads it once from RoadmapTimeScaleService)', () => {
      const timeScaleService = makeTimeScaleServiceMock('SEMESTER');
      const fixture = createFixture(makeApiMock(), timeScaleService);

      const select = (fixture.nativeElement as HTMLElement).querySelector('#rm-time-scale') as HTMLSelectElement;
      expect(select.value).toBe('SEMESTER');
      expect(timeScaleService.read).toHaveBeenCalledWith(REF);
    });

    it('Security AC — switching scale never calls the roadmap API (pure client-side view setting)', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setTimeScale(fixture, 'MONTH');
      setTimeScale(fixture, 'SEMESTER');

      expect(api.listLanes).toHaveBeenCalledTimes(1);
      expect(api.listInitiatives).toHaveBeenCalledTimes(1);
      expect(api.updatePlacement).not.toHaveBeenCalled();
      expect(api.createLane).not.toHaveBeenCalled();
      expect(api.createInitiative).not.toHaveBeenCalled();
    });

    it('Error AC — cycling through every scale and back to the original never drifts the bar (no loss/truncation of the stored period)', () => {
      const initiative: Initiative = { ...INITIATIVE_A, fuzzyPeriodStart: '2026-02-10', fuzzyPeriodEnd: '2026-02-20' };
      const api = makeApiMock({ listInitiatives: vi.fn(() => of([initiative])) });
      const fixture = createFixture(api);
      const bar = () => (fixture.nativeElement as HTMLElement).querySelector('.rm-bar') as HTMLElement;

      const originalLeft = bar().style.left;
      const originalWidth = bar().style.width;

      setTimeScale(fixture, 'MONTH');
      setTimeScale(fixture, 'SEMESTER');
      setTimeScale(fixture, 'QUARTER');

      expect(bar().style.left).toBe(originalLeft);
      expect(bar().style.width).toBe(originalWidth);
      expect(api.updatePlacement).not.toHaveBeenCalled();
    });

    it('AC — an initiative with no precise date is never assigned one merely by switching scale', () => {
      const unplaced: Initiative = { ...INITIATIVE_A, fuzzyPeriodStart: null, fuzzyPeriodEnd: null };
      const api = makeApiMock({ listInitiatives: vi.fn(() => of([unplaced])) });
      const fixture = createFixture(api);

      setTimeScale(fixture, 'MONTH');

      expect(api.updatePlacement).not.toHaveBeenCalled();
      // Still renders as a single-column chip at the axis start — never forced onto a fabricated date.
      const bar = (fixture.nativeElement as HTMLElement).querySelector('.rm-bar') as HTMLElement;
      expect(bar.style.left).toBe('0px');
    });

    it('A11y — the select is keyboard-focusable and its accessible label is programmatically associated', () => {
      const fixture = createFixture(makeApiMock());

      const select = (fixture.nativeElement as HTMLElement).querySelector('#rm-time-scale') as HTMLSelectElement;
      select.focus();

      expect(document.activeElement).toBe(select);
      expect(select.getAttribute('id')).toBe('rm-time-scale');
      const label = (fixture.nativeElement as HTMLElement).querySelector('label[for="rm-time-scale"]');
      expect(label?.getAttribute('for')).toBe(select.id);
    });
  });
});
