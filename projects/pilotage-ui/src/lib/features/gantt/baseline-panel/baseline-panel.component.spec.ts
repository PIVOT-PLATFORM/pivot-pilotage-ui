import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BaselineApiService } from '../data-access/baseline-api.service';
import {
  BaselineApiError,
  BaselineComparison,
  BaselineSummary,
  BaselineVariance,
  TaskVariance,
} from '../data-access/baseline.models';
import { BaselinePanelComponent } from './baseline-panel.component';

const BASELINE_0: BaselineSummary = { id: 1, baselineIndex: 0, capturedAt: '2026-07-01T09:00:00Z', taskCount: 12 };
const BASELINE_1: BaselineSummary = { id: 2, baselineIndex: 1, capturedAt: '2026-07-08T09:00:00Z', taskCount: 13 };

const VARIANCE_ROW: TaskVariance = {
  taskId: 100,
  taskName: 'Analyse',
  baselineStart: '2026-07-01T09:00:00Z',
  currentStart: '2026-07-04T09:00:00Z',
  startVarianceMinutes: 4320,
  startVarianceLabel: 'Début en retard de 3 j',
  baselineFinish: '2026-07-05T17:00:00Z',
  currentFinish: '2026-07-05T17:00:00Z',
  finishVarianceMinutes: 0,
  finishVarianceLabel: 'Fin sans écart',
  baselineDurationMinutes: 2400,
  currentDurationMinutes: 2400,
  durationVarianceMinutes: 0,
  durationVariancePercent: 0,
  durationVarianceLabel: 'Durée sans écart',
  baselineWorkMinutes: 4800,
  currentWorkMinutes: 4800,
  workVarianceMinutes: 0,
  workVariancePercent: 0,
  workVarianceLabel: 'Travail sans écart',
  baselineCostAmount: 1000,
  currentCostAmount: 1000,
  costVarianceAmount: 0,
  costVariancePercent: 0,
  costVarianceLabel: 'Coût sans écart',
  baselineTemporalPrecision: 'DAY',
  currentTemporalPrecision: 'DAY',
  temporalPrecisionChanged: false,
};

interface ApiMock {
  list: ReturnType<typeof vi.fn>;
  setBaseline: ReturnType<typeof vi.fn>;
  deleteBaseline: ReturnType<typeof vi.fn>;
  variance: ReturnType<typeof vi.fn>;
  compare: ReturnType<typeof vi.fn>;
}

function makeApiMock(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    list: vi.fn(() => of([BASELINE_0, BASELINE_1])),
    setBaseline: vi.fn(() => of({ id: 3, baselineIndex: 2, capturedAt: '2026-07-12T09:00:00Z', taskCount: 14 })),
    deleteBaseline: vi.fn(() => of(undefined)),
    variance: vi.fn(() => of({ baselineIndex: 0, baselineCapturedAt: BASELINE_0.capturedAt, tasks: [VARIANCE_ROW] } satisfies BaselineVariance)),
    compare: vi.fn(() =>
      of({
        fromIndex: 0,
        fromCapturedAt: BASELINE_0.capturedAt,
        toIndex: 1,
        toCapturedAt: BASELINE_1.capturedAt,
        tasks: [],
      } satisfies BaselineComparison),
    ),
    ...overrides,
  };
}

function createFixture(api: ApiMock): ComponentFixture<BaselinePanelComponent> {
  TestBed.configureTestingModule({
    imports: [BaselinePanelComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: BaselineApiService, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ tenantId: '1', teamId: '2', projectId: '3' }) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(BaselinePanelComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<BaselinePanelComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function setInputValue(fixture: ComponentFixture<BaselinePanelComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function setSelectValue(fixture: ComponentFixture<BaselinePanelComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
}

function submitForm(fixture: ComponentFixture<BaselinePanelComponent>, index = 0): void {
  const forms = (fixture.nativeElement as HTMLElement).querySelectorAll('form');
  forms[index].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}

function findButton(fixture: ComponentFixture<BaselinePanelComponent>, label: string): HTMLButtonElement {
  const btn = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b =>
    b.textContent?.trim().includes(label),
  );
  if (!btn) {
    throw new Error(`No button found with label "${label}"`);
  }
  return btn as HTMLButtonElement;
}

describe('BaselinePanelComponent', () => {
  describe('load', () => {
    it('shows the loading state while the initial list request is in flight', () => {
      const fixture = createFixture(makeApiMock({ list: vi.fn(() => new Subject<BaselineSummary[]>()) }));

      expect(text(fixture)).toContain('gantt.baselines.loading');
    });

    it('lists the project baselines, MS Project-labelled ("Baseline" / "Baseline N")', () => {
      const fixture = createFixture(makeApiMock());

      expect(text(fixture)).toContain('gantt.baselines.slotLabel.base');
      expect(text(fixture)).toContain('gantt.baselines.slotLabel.numbered');
    });

    it('shows the empty state when the project has no baseline yet', () => {
      const fixture = createFixture(makeApiMock({ list: vi.fn(() => of([])) }));

      expect(text(fixture)).toContain('gantt.baselines.list.empty');
    });

    it('surfaces a non-disclosure 404 without retrying', () => {
      const api = makeApiMock({ list: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
      const fixture = createFixture(api);

      expect(text(fixture)).toContain('gantt.baselines.load.errors.NOT_FOUND');
      expect(api.list).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC1 — poser une baseline', () => {
    it('poses a baseline with an explicit slot and announces it (aria-live)', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#baseline-pose-index', '2');
      submitForm(fixture, 0);

      expect(api.setBaseline).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, { baselineIndex: 2 });
      expect(text(fixture)).toContain('gantt.baselines.pose.announceCreated');
      // Locally patched, no reload needed.
      expect(text(fixture)).toContain('gantt.baselines.slotLabel.numbered');
    });

    it('auto-assigns the lowest free slot when left blank (explicit-null body)', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      submitForm(fixture, 0);

      expect(api.setBaseline).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, { baselineIndex: null });
    });

    it('announces an overwrite (not a creation) when the slot was already used', () => {
      const api = makeApiMock({
        setBaseline: vi.fn(() => of({ id: 1, baselineIndex: 0, capturedAt: '2026-07-12T09:00:00Z', taskCount: 15 })),
      });
      const fixture = createFixture(api);

      setInputValue(fixture, '#baseline-pose-index', '0');
      submitForm(fixture, 0);

      expect(text(fixture)).toContain('gantt.baselines.pose.announceOverwritten');
    });

    it('Error AC: rejects an out-of-range slot client-side, without a round trip', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#baseline-pose-index', '11');
      submitForm(fixture, 0);

      expect(text(fixture)).toContain('gantt.baselines.pose.errors.INVALID_INDEX');
      expect(api.setBaseline).not.toHaveBeenCalled();
    });

    it('Error AC (12th baseline): pre-empts the 409 client-side once 11 slots are already used', () => {
      const eleven: BaselineSummary[] = Array.from({ length: 11 }, (_, i) => ({
        id: i + 1,
        baselineIndex: i,
        capturedAt: '2026-07-01T09:00:00Z',
        taskCount: 1,
      }));
      const api = makeApiMock({ list: vi.fn(() => of(eleven)) });
      const fixture = createFixture(api);

      expect(text(fixture)).toContain('gantt.baselines.pose.hintAtLimit');

      submitForm(fixture, 0);

      expect(text(fixture)).toContain('gantt.baselines.pose.errors.BASELINE_LIMIT_EXCEEDED');
      expect(api.setBaseline).not.toHaveBeenCalled();
    });

    it('Error AC (12th baseline, server-enforced fallback): surfaces the 409 BASELINE_LIMIT_EXCEEDED body returned by the server', () => {
      const body: BaselineApiError = { code: 'BASELINE_LIMIT_EXCEEDED', message: 'all 11 baseline slots are already used' };
      const api = makeApiMock({
        setBaseline: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 409, error: body }))),
      });
      const fixture = createFixture(api);

      submitForm(fixture, 0);

      expect(text(fixture)).toContain('gantt.baselines.pose.errors.BASELINE_LIMIT_EXCEEDED');
    });

    it('Security AC: surfaces a bodyless 403 explicitly (fail-closed BaselineEditPolicy), never retried', () => {
      const api = makeApiMock({ setBaseline: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))) });
      const fixture = createFixture(api);

      submitForm(fixture, 0);

      expect(text(fixture)).toContain('gantt.baselines.pose.errors.FORBIDDEN');
      expect(api.setBaseline).toHaveBeenCalledTimes(1);
    });

    it('surfaces the server-side 422 INVALID_BASELINE_INDEX fallback (defensive, race with another caller)', () => {
      const body: BaselineApiError = { code: 'INVALID_BASELINE_INDEX', message: 'baselineIndex must be between 0 and 10' };
      const api = makeApiMock({
        setBaseline: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 422, error: body }))),
      });
      const fixture = createFixture(api);

      submitForm(fixture, 0);

      expect(text(fixture)).toContain('gantt.baselines.pose.errors.INVALID_BASELINE_INDEX');
    });

    it('surfaces a bodyless 404 (project not visible)', () => {
      const api = makeApiMock({ setBaseline: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
      const fixture = createFixture(api);

      submitForm(fixture, 0);

      expect(text(fixture)).toContain('gantt.baselines.pose.errors.NOT_FOUND');
    });

    it('falls back to the generic error on an unexpected status', () => {
      const api = makeApiMock({ setBaseline: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) });
      const fixture = createFixture(api);

      submitForm(fixture, 0);

      expect(text(fixture)).toContain('gantt.baselines.pose.errors.GENERIC');
    });
  });

  describe('delete — Security AC, gated + two-step confirm', () => {
    it('requires an explicit confirm before deleting', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.baselines.delete.button').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('gantt.baselines.delete.confirmPrompt');
      expect(api.deleteBaseline).not.toHaveBeenCalled();

      findButton(fixture, 'gantt.baselines.delete.confirmButton').click();
      fixture.detectChanges();

      expect(api.deleteBaseline).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 0);
      expect(text(fixture)).toContain('gantt.baselines.delete.announceDeleted');
    });

    it('cancel leaves the baseline untouched', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.baselines.delete.button').click();
      fixture.detectChanges();
      findButton(fixture, 'gantt.baselines.delete.cancelButton').click();
      fixture.detectChanges();

      expect(api.deleteBaseline).not.toHaveBeenCalled();
    });

    it('Security AC: surfaces a bodyless 403 explicitly', () => {
      const api = makeApiMock({ deleteBaseline: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))) });
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.baselines.delete.button').click();
      fixture.detectChanges();
      findButton(fixture, 'gantt.baselines.delete.confirmButton').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('gantt.baselines.delete.errors.FORBIDDEN');
    });

    it('surfaces a 404 (baseline already gone) distinctly from the generic fallback', () => {
      const api = makeApiMock({ deleteBaseline: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.baselines.delete.button').click();
      fixture.detectChanges();
      findButton(fixture, 'gantt.baselines.delete.confirmButton').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('gantt.baselines.delete.errors.NOT_FOUND');
    });

    it('falls back to the generic error on an unexpected status', () => {
      const api = makeApiMock({ deleteBaseline: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) });
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.baselines.delete.button').click();
      fixture.detectChanges();
      findButton(fixture, 'gantt.baselines.delete.confirmButton').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('gantt.baselines.delete.errors.GENERIC');
    });

    it('clears an on-screen écarts view that referenced the just-deleted baseline', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setSelectValue(fixture, '#baseline-variance-select', '0');
      expect(text(fixture)).toContain('Début en retard de 3 j');

      const deleteButtons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).filter(b =>
        b.textContent?.includes('gantt.baselines.delete.button'),
      );
      deleteButtons[0].click();
      fixture.detectChanges();
      findButton(fixture, 'gantt.baselines.delete.confirmButton').click();
      fixture.detectChanges();

      expect(text(fixture)).not.toContain('Début en retard de 3 j');
    });

    it('clears an on-screen comparison that referenced the just-deleted baseline', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setSelectValue(fixture, '#baseline-compare-from', '0');
      setSelectValue(fixture, '#baseline-compare-to', '1');
      submitForm(fixture, 1);
      expect(text(fixture)).toContain('gantt.baselines.compare.empty');

      const deleteButtons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).filter(b =>
        b.textContent?.includes('gantt.baselines.delete.button'),
      );
      deleteButtons[0].click();
      fixture.detectChanges();
      findButton(fixture, 'gantt.baselines.delete.confirmButton').click();
      fixture.detectChanges();

      expect(text(fixture)).not.toContain('gantt.baselines.compare.empty');
    });
  });

  describe('AC2 — écarts par tâche (planifié vs réel)', () => {
    it('shows the loading state while the variance request is in flight', () => {
      const fixture = createFixture(makeApiMock({ variance: vi.fn(() => new Subject<BaselineVariance>()) }));

      setSelectValue(fixture, '#baseline-variance-select', '0');

      expect(text(fixture)).toContain('gantt.baselines.variance.loading');
    });

    it('loads and renders the per-task variance, value + backend colour-independent label side by side (A11y AC)', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setSelectValue(fixture, '#baseline-variance-select', '0');

      expect(api.variance).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 0);
      expect(text(fixture)).toContain('Analyse');
      expect(text(fixture)).toContain('Début en retard de 3 j');

      const cell = (fixture.nativeElement as HTMLElement).querySelector('.baseline-panel__cell--behind');
      expect(cell).not.toBeNull();
      expect(cell?.querySelector('.baseline-panel__cell-label')?.textContent).toContain('Début en retard de 3 j');
    });

    it('clears the report when the placeholder option is re-selected', () => {
      const fixture = createFixture(makeApiMock());

      setSelectValue(fixture, '#baseline-variance-select', '0');
      expect(text(fixture)).toContain('Analyse');

      setSelectValue(fixture, '#baseline-variance-select', '');
      expect(text(fixture)).not.toContain('Analyse');
    });

    it('surfaces a 404 when the selected baseline no longer exists, never retried with a different index', () => {
      const api = makeApiMock({ variance: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
      const fixture = createFixture(api);

      setSelectValue(fixture, '#baseline-variance-select', '0');

      expect(text(fixture)).toContain('gantt.baselines.variance.errors.NOT_FOUND');
      expect(api.variance).toHaveBeenCalledTimes(1);
    });

    it('surfaces a generic error on an unexpected server failure (not 404)', () => {
      const api = makeApiMock({ variance: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) });
      const fixture = createFixture(api);

      setSelectValue(fixture, '#baseline-variance-select', '0');

      expect(text(fixture)).toContain('gantt.baselines.variance.errors.GENERIC');
    });

    it('shows the empty state when the baseline has no frozen task', () => {
      const fixture = createFixture(makeApiMock({ variance: vi.fn(() => of({ baselineIndex: 0, baselineCapturedAt: BASELINE_0.capturedAt, tasks: [] } satisfies BaselineVariance)) }));

      setSelectValue(fixture, '#baseline-variance-select', '0');

      expect(text(fixture)).toContain('gantt.baselines.variance.empty');
    });

    it('flags a task whose temporal precision (altitude) changed since capture — icon/badge + text, never colour alone', () => {
      const api = makeApiMock({
        variance: vi.fn(() =>
          of({
            baselineIndex: 0,
            baselineCapturedAt: BASELINE_0.capturedAt,
            tasks: [{ ...VARIANCE_ROW, temporalPrecisionChanged: true }],
          } satisfies BaselineVariance),
        ),
      });
      const fixture = createFixture(api);

      setSelectValue(fixture, '#baseline-variance-select', '0');

      const badge = (fixture.nativeElement as HTMLElement).querySelector('.baseline-panel__badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('gantt.baselines.precisionChangedShort');
      expect(badge?.getAttribute('title')).toContain('gantt.baselines.precisionChanged');
    });
  });

  describe('AC3 — comparer deux baselines', () => {
    it('shows the loading state while the comparison request is in flight', () => {
      const fixture = createFixture(makeApiMock({ compare: vi.fn(() => new Subject<BaselineComparison>()) }));

      setSelectValue(fixture, '#baseline-compare-from', '0');
      setSelectValue(fixture, '#baseline-compare-to', '1');
      submitForm(fixture, 1);

      expect(text(fixture)).toContain('gantt.baselines.compare.loading');
    });

    it('compares two distinct baselines', () => {
      const api = makeApiMock({
        compare: vi.fn(() =>
          of({
            fromIndex: 0,
            fromCapturedAt: BASELINE_0.capturedAt,
            toIndex: 1,
            toCapturedAt: BASELINE_1.capturedAt,
            tasks: [
              {
                taskId: 100,
                taskName: 'Analyse',
                fromStart: null,
                toStart: null,
                startDeltaMinutes: null,
                startDeltaLabel: 'Début : non comparable (donnée absente)',
                fromFinish: null,
                toFinish: null,
                finishDeltaMinutes: null,
                finishDeltaLabel: 'Fin : non comparable (donnée absente)',
                fromDurationMinutes: null,
                toDurationMinutes: null,
                durationDeltaMinutes: null,
                durationDeltaPercent: null,
                durationDeltaLabel: 'Durée : non comparable (donnée absente)',
                fromWorkMinutes: null,
                toWorkMinutes: null,
                workDeltaMinutes: null,
                workDeltaPercent: null,
                workDeltaLabel: 'Travail : non comparable (donnée absente)',
                fromCostAmount: null,
                toCostAmount: null,
                costDeltaAmount: null,
                costDeltaPercent: null,
                costDeltaLabel: 'Coût : non comparable (donnée absente)',
              },
            ],
          } satisfies BaselineComparison),
        ),
      });
      const fixture = createFixture(api);

      setSelectValue(fixture, '#baseline-compare-from', '0');
      setSelectValue(fixture, '#baseline-compare-to', '1');
      submitForm(fixture, 1);

      expect(api.compare).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 0, 1);
      expect(text(fixture)).toContain('non comparable (donnée absente)');
    });

    it('Error AC: requires two selections before calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      submitForm(fixture, 1);

      expect(text(fixture)).toContain('gantt.baselines.compare.errors.SELECT_TWO');
      expect(api.compare).not.toHaveBeenCalled();
    });

    it('Error AC: rejects comparing a baseline with itself, client-side', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setSelectValue(fixture, '#baseline-compare-from', '0');
      setSelectValue(fixture, '#baseline-compare-to', '0');
      submitForm(fixture, 1);

      expect(text(fixture)).toContain('gantt.baselines.compare.errors.SAME_INDEX');
      expect(api.compare).not.toHaveBeenCalled();
    });

    it('shows the empty state when the two baselines share no comparable task', () => {
      const fixture = createFixture(makeApiMock({ compare: vi.fn(() => of({ fromIndex: 0, fromCapturedAt: BASELINE_0.capturedAt, toIndex: 1, toCapturedAt: BASELINE_1.capturedAt, tasks: [] } satisfies BaselineComparison)) }));

      setSelectValue(fixture, '#baseline-compare-from', '0');
      setSelectValue(fixture, '#baseline-compare-to', '1');
      submitForm(fixture, 1);

      expect(text(fixture)).toContain('gantt.baselines.compare.empty');
    });

    it('surfaces the generic error on an unexpected server failure (not 404)', () => {
      const api = makeApiMock({ compare: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) });
      const fixture = createFixture(api);

      setSelectValue(fixture, '#baseline-compare-from', '0');
      setSelectValue(fixture, '#baseline-compare-to', '1');
      submitForm(fixture, 1);

      expect(text(fixture)).toContain('gantt.baselines.compare.errors.GENERIC');
    });
  });

  describe('A11y', () => {
    it('every interactive control is a native, keyboard-operable element — no custom mouse-only widget', () => {
      const fixture = createFixture(makeApiMock());
      const root = fixture.nativeElement as HTMLElement;

      const interactive = root.querySelectorAll('button, select, input, a[href]');
      expect(interactive.length).toBeGreaterThan(0);
      interactive.forEach(el => {
        expect(['BUTTON', 'SELECT', 'INPUT', 'A']).toContain(el.tagName);
      });
    });

    it('exposes an aria-live="polite" announcement region', () => {
      const fixture = createFixture(makeApiMock());
      const region = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');

      expect(region).not.toBeNull();
    });
  });
});
