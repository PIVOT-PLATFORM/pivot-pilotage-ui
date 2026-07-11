import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { RoadmapBoardComponent } from './roadmap-board.component';
import { RoadmapApiService } from '../data-access/roadmap-api.service';
import { Initiative, Lane } from '../data-access/roadmap.models';
import { QUARTER_WIDTH_PX } from '../roadmap-timeline';

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

interface ApiMock {
  listLanes: ReturnType<typeof vi.fn>;
  createLane: ReturnType<typeof vi.fn>;
  listInitiatives: ReturnType<typeof vi.fn>;
  createInitiative: ReturnType<typeof vi.fn>;
  updatePlacement: ReturnType<typeof vi.fn>;
}

function makeApiMock(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    listLanes: vi.fn(() => of([LANE_A, LANE_B])),
    createLane: vi.fn(),
    listInitiatives: vi.fn(() => of([INITIATIVE_A])),
    createInitiative: vi.fn(),
    updatePlacement: vi.fn(),
    ...overrides,
  };
}

function createFixture(api: ApiMock): ComponentFixture<RoadmapBoardComponent> {
  TestBed.configureTestingModule({
    imports: [RoadmapBoardComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: RoadmapApiService, useValue: api },
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
  it('loads and renders lanes and initiatives on init', () => {
    const api = makeApiMock();
    const fixture = createFixture(api);

    expect(api.listLanes).toHaveBeenCalledWith(REF);
    expect(api.listInitiatives).toHaveBeenCalledWith(REF);

    const laneLabels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.rm-lane__label'),
    ).map(el => el.textContent?.trim());
    expect(laneLabels).toEqual(['Thème A', 'Thème B']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-initiative-bar')).toHaveLength(1);
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

  it('shows the empty-lanes message when there are no lanes yet', () => {
    const api = makeApiMock({ listLanes: vi.fn(() => of([])), listInitiatives: vi.fn(() => of([])) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('roadmap.board.noLanes');
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
});
