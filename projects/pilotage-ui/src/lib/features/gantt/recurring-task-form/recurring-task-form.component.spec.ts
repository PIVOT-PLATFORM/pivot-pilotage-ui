import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { WbsApiService } from '../data-access/wbs-api.service';
import { RecurringTaskResponse, WbsApiError, WbsTaskResponse, WbsTreeResponse } from '../data-access/wbs.models';
import { RecurringTaskFormComponent } from './recurring-task-form.component';

const REF = { tenantId: 1, teamId: 2, projectId: 3 };

const EXISTING_TASK: WbsTaskResponse = {
  taskId: 10,
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

const TREE: WbsTreeResponse = { projectId: 3, ariaRole: 'tree', nodes: [EXISTING_TASK] };

const SERIES: WbsTaskResponse = {
  taskId: 501,
  parentTaskId: null,
  wbsCode: '3',
  name: 'Comité hebdo',
  nodeKind: 'RECURRING',
  nodeKindLabel: 'Recurring task series',
  position: 1,
  startDate: null,
  finishDate: null,
  durationMinutes: null,
  percentComplete: null,
  progressLabel: null,
  expectedPercentComplete: null,
  late: false,
  progressVarianceLabel: null,
  readOnly: false,
  ariaRole: 'treeitem',
  ariaLevel: 1,
  ariaSetSize: 2,
  ariaPosInSet: 2,
  ariaReadOnly: false,
  revision: 0,
};

const OCCURRENCE_1: WbsTaskResponse = {
  ...SERIES,
  taskId: 502,
  parentTaskId: 501,
  wbsCode: '3.1',
  name: 'Comité hebdo — occurrence 1/2',
  nodeKind: 'MILESTONE',
  nodeKindLabel: 'Milestone',
  startDate: '2026-08-03T00:00:00Z',
};

const OCCURRENCE_2: WbsTaskResponse = {
  ...SERIES,
  taskId: 503,
  parentTaskId: 501,
  wbsCode: '3.2',
  name: 'Comité hebdo — occurrence 2/2',
  nodeKind: 'MILESTONE',
  nodeKindLabel: 'Milestone',
  startDate: '2026-08-10T00:00:00Z',
};

const RECURRING_RESPONSE: RecurringTaskResponse = {
  series: SERIES,
  recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=2;DTSTART=2026-08-01',
  occurrences: [OCCURRENCE_1, OCCURRENCE_2],
};

interface ApiMock {
  tree: ReturnType<typeof vi.fn>;
  createRecurringTask: ReturnType<typeof vi.fn>;
}

function makeApiMock(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    tree: vi.fn(() => of(TREE)),
    createRecurringTask: vi.fn(() => of(RECURRING_RESPONSE)),
    ...overrides,
  };
}

function createFixture(api: ApiMock): ComponentFixture<RecurringTaskFormComponent> {
  TestBed.configureTestingModule({
    imports: [RecurringTaskFormComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: WbsApiService, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ tenantId: '1', teamId: '2', projectId: '3' }) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(RecurringTaskFormComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<RecurringTaskFormComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function setInputValue(fixture: ComponentFixture<RecurringTaskFormComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function setSelectValue(fixture: ComponentFixture<RecurringTaskFormComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<RecurringTaskFormComponent>): void {
  const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}

/** Fills every required field with a valid value (name, first-occurrence date, frequency, occurrence count) — does not submit. */
function fillValidForm(fixture: ComponentFixture<RecurringTaskFormComponent>): void {
  setInputValue(fixture, '#rt-name', 'Comité hebdo');
  setInputValue(fixture, '#rt-first-date', '2026-08-01');
  setSelectValue(fixture, '#rt-frequency', 'WEEKLY');
  setInputValue(fixture, '#rt-occurrence-count', '10');
}

describe('RecurringTaskFormComponent', () => {
  it('loads the project WBS tree on init to seed the parent-task picker', () => {
    const api = makeApiMock();
    const fixture = createFixture(api);

    expect(api.tree).toHaveBeenCalledWith(REF);
    expect(text(fixture)).toContain('1 — Lot A');
  });

  it('shows a NOT_FOUND load error on 404 and recovers on retry', () => {
    const api = makeApiMock({ tree: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('gantt.recurringTask.load.errors.NOT_FOUND');

    api.tree.mockReturnValue(of(TREE));
    const retryButton = (fixture.nativeElement as HTMLElement).querySelector(
      '.recurring-task__status--error button',
    ) as HTMLButtonElement;
    retryButton.click();
    fixture.detectChanges();

    expect(text(fixture)).not.toContain('gantt.recurringTask.load.errors.NOT_FOUND');
  });

  it('shows a GENERIC load error on a non-404 failure', () => {
    const api = makeApiMock({ tree: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('gantt.recurringTask.load.errors.GENERIC');
  });

  describe('AC — creating a periodic series', () => {
    it('submits the exact request body and renders the returned series + generated occurrences', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      fillValidForm(fixture);
      setInputValue(fixture, '#rt-interval', '1');
      submit(fixture);

      expect(api.createRecurringTask).toHaveBeenCalledWith(REF, {
        name: 'Comité hebdo',
        parentTaskId: undefined,
        firstOccurrenceDate: '2026-08-01',
        frequency: 'WEEKLY',
        intervalCount: 1,
        occurrenceCount: 10,
        durationMinutes: undefined,
      });

      expect(text(fixture)).toContain('Comité hebdo');
      expect(text(fixture)).toContain('3.1');
      expect(text(fixture)).toContain('Comité hebdo — occurrence 1/2');
      expect(text(fixture)).toContain('3.2');
      expect(text(fixture)).toContain('Comité hebdo — occurrence 2/2');

      const occurrenceItems = (fixture.nativeElement as HTMLElement).querySelectorAll('.recurring-task__occurrence');
      expect(occurrenceItems).toHaveLength(2);
    });

    it('includes a positive durationMinutes and a selected parentTaskId in the request when provided', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      fillValidForm(fixture);
      setSelectValue(fixture, '#rt-parent', '10');
      setInputValue(fixture, '#rt-duration', '480');
      submit(fixture);

      expect(api.createRecurringTask).toHaveBeenCalledWith(
        REF,
        expect.objectContaining({ parentTaskId: 10, durationMinutes: 480 }),
      );
    });

    it('A11y — announces the created series and occurrence count via the aria-live region', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      fillValidForm(fixture);
      submit(fixture);

      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.recurringTask.create.announceCreated');
    });

    it('renders each occurrence with the losange glyph when it is classified MILESTONE', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      fillValidForm(fixture);
      submit(fixture);

      const occurrenceItems = (fixture.nativeElement as HTMLElement).querySelectorAll('.recurring-task__occurrence');
      occurrenceItems.forEach(item => {
        expect(item.querySelector('svg.node-kind-icon__glyph--milestone')).not.toBeNull();
      });
    });
  });

  describe('Error AC — missing/invalid frequency or occurrence count', () => {
    it('rejects a missing name client-side, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#rt-first-date', '2026-08-01');
      setSelectValue(fixture, '#rt-frequency', 'WEEKLY');
      setInputValue(fixture, '#rt-occurrence-count', '10');
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.NAME_REQUIRED');
      expect(api.createRecurringTask).not.toHaveBeenCalled();
    });

    it('rejects a missing first-occurrence date client-side, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#rt-name', 'Comité hebdo');
      setSelectValue(fixture, '#rt-frequency', 'WEEKLY');
      setInputValue(fixture, '#rt-occurrence-count', '10');
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.DATE_REQUIRED');
      expect(api.createRecurringTask).not.toHaveBeenCalled();
    });

    it('rejects a missing frequency client-side, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#rt-name', 'Comité hebdo');
      setInputValue(fixture, '#rt-first-date', '2026-08-01');
      setInputValue(fixture, '#rt-occurrence-count', '10');
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.FREQUENCY_REQUIRED');
      expect(api.createRecurringTask).not.toHaveBeenCalled();
    });

    it('rejects a missing occurrence count client-side, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#rt-name', 'Comité hebdo');
      setInputValue(fixture, '#rt-first-date', '2026-08-01');
      setSelectValue(fixture, '#rt-frequency', 'WEEKLY');
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.OCCURRENCE_COUNT_INVALID');
      expect(api.createRecurringTask).not.toHaveBeenCalled();
    });

    it('rejects a zero/negative occurrence count client-side', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      fillValidForm(fixture);
      setInputValue(fixture, '#rt-occurrence-count', '0');
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.OCCURRENCE_COUNT_INVALID');
      expect(api.createRecurringTask).not.toHaveBeenCalled();
    });

    it('rejects an occurrence count over the 500 cap client-side', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      fillValidForm(fixture);
      setInputValue(fixture, '#rt-occurrence-count', '501');
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.OCCURRENCE_COUNT_TOO_HIGH');
      expect(api.createRecurringTask).not.toHaveBeenCalled();
    });

    it('rejects a zero/negative interval count client-side', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      fillValidForm(fixture);
      setInputValue(fixture, '#rt-interval', '0');
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.INTERVAL_INVALID');
      expect(api.createRecurringTask).not.toHaveBeenCalled();
    });

    it('rejects a negative duration client-side', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      fillValidForm(fixture);
      setInputValue(fixture, '#rt-duration', '-10');
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.DURATION_INVALID');
      expect(api.createRecurringTask).not.toHaveBeenCalled();
    });

    it('maps a 422 INVALID_RECURRENCE server response to an explicit message (defensive fallback for a race)', () => {
      const body: WbsApiError = { code: 'INVALID_RECURRENCE', message: 'frequency is required' };
      const api = makeApiMock({
        createRecurringTask: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 422, error: body }))),
      });
      const fixture = createFixture(api);

      fillValidForm(fixture);
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.INVALID_RECURRENCE');
    });
  });

  describe('Security AC', () => {
    it('surfaces FORBIDDEN on a 403 (fail-closed WbsEditPolicy today), without rendering a result', () => {
      const api = makeApiMock({
        createRecurringTask: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))),
      });
      const fixture = createFixture(api);

      fillValidForm(fixture);
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.FORBIDDEN');
      expect((fixture.nativeElement as HTMLElement).querySelector('.recurring-task__result')).toBeNull();
    });

    it('surfaces a single non-disclosure NOT_FOUND message on a 404 (project or parentTaskId not visible)', () => {
      const api = makeApiMock({
        createRecurringTask: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))),
      });
      const fixture = createFixture(api);

      fillValidForm(fixture);
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.NOT_FOUND');
    });

    it('maps an unexpected 500 to a GENERIC message', () => {
      const api = makeApiMock({
        createRecurringTask: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))),
      });
      const fixture = createFixture(api);

      fillValidForm(fixture);
      submit(fixture);

      expect(text(fixture)).toContain('gantt.recurringTask.create.errors.GENERIC');
    });
  });
});
