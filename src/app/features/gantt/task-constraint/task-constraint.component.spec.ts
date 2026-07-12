import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TaskConstraintApiService } from '../data-access/task-constraint-api.service';
import { TaskConstraint, TaskConstraintApiError } from '../data-access/task-constraint.models';
import { TaskConstraintComponent } from './task-constraint.component';

const DEFAULT_RESPONSE: TaskConstraint = {
  taskId: 100,
  constraintType: 'ASAP',
  constraintDate: null,
  deadline: null,
  warnings: [],
};

const MFO_WITH_CONFLICT: TaskConstraint = {
  taskId: 100,
  constraintType: 'MFO',
  constraintDate: '2026-08-14T17:00:00Z',
  deadline: '2026-08-20T17:00:00Z',
  warnings: [
    { type: 'CONSTRAINT_CONFLICT', detail: 'constraint MFO target precedes hard dependency floor; dependency honoured' },
  ],
};

interface ApiMock {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

function makeApiMock(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    get: vi.fn(() => of(DEFAULT_RESPONSE)),
    set: vi.fn(() => of({ ...DEFAULT_RESPONSE, constraintType: 'MFO', constraintDate: '2026-08-14T17:00:00Z' })),
    ...overrides,
  };
}

function createFixture(api: ApiMock): ComponentFixture<TaskConstraintComponent> {
  TestBed.configureTestingModule({
    imports: [TaskConstraintComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: TaskConstraintApiService, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ tenantId: '1', teamId: '2', projectId: '3', taskId: '100' }) },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TaskConstraintComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<TaskConstraintComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function setSelectValue(fixture: ComponentFixture<TaskConstraintComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
}

function setInputValue(fixture: ComponentFixture<TaskConstraintComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function submitForm(fixture: ComponentFixture<TaskConstraintComponent>): void {
  const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}

describe('TaskConstraintComponent', () => {
  describe('loading the current constraint', () => {
    it('loads and renders the default ASAP state with a disabled, empty date field', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      expect(api.get).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 100);
      const typeSelect = (fixture.nativeElement as HTMLElement).querySelector('#task-constraint-type') as HTMLSelectElement;
      const dateInput = (fixture.nativeElement as HTMLElement).querySelector('#task-constraint-date') as HTMLInputElement;
      expect(typeSelect.value).toBe('ASAP');
      expect(dateInput.disabled).toBe(true);
      expect(dateInput.value).toBe('');
    });

    it('renders a date-bearing constraint with its date, deadline and enabled date field', () => {
      const api = makeApiMock({ get: vi.fn(() => of(MFO_WITH_CONFLICT)) });
      const fixture = createFixture(api);

      const typeSelect = (fixture.nativeElement as HTMLElement).querySelector('#task-constraint-type') as HTMLSelectElement;
      const dateInput = (fixture.nativeElement as HTMLElement).querySelector('#task-constraint-date') as HTMLInputElement;
      expect(typeSelect.value).toBe('MFO');
      expect(dateInput.disabled).toBe(false);
      expect(dateInput.value).not.toBe('');
    });

    it('shows a loading indicator while the request is pending', () => {
      const pending = new Subject<TaskConstraint>();
      const api = makeApiMock({ get: vi.fn(() => pending.asObservable()) });
      const fixture = createFixture(api);

      expect(text(fixture)).toContain('gantt.taskConstraint.loading');

      pending.next(DEFAULT_RESPONSE);
      pending.complete();
      fixture.detectChanges();
      expect(text(fixture)).not.toContain('gantt.taskConstraint.loading');
    });

    it.each([
      [404, 'gantt.taskConstraint.load.errors.NOT_FOUND'],
      [500, 'gantt.taskConstraint.load.errors.GENERIC'],
    ])('maps a %d load error to %s, and retry re-fetches', (status, expectedKey) => {
      const api = makeApiMock({ get: vi.fn(() => throwError(() => new HttpErrorResponse({ status }))) });
      const fixture = createFixture(api);

      expect(text(fixture)).toContain(expectedKey);

      api.get.mockReturnValue(of(DEFAULT_RESPONSE));
      const retryButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b =>
        b.textContent?.includes('gantt.taskConstraint.retry'),
      ) as HTMLButtonElement;
      retryButton.click();
      fixture.detectChanges();

      expect(text(fixture)).not.toContain(expectedKey);
      expect((fixture.nativeElement as HTMLElement).querySelector('form')).not.toBeNull();
    });
  });

  describe('warnings (AC1/AC2/Error AC — icon + text, aria-live, never colour alone)', () => {
    it('renders no warnings section content when the task has none', () => {
      const fixture = createFixture(makeApiMock());
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('.task-constraint__warning')).toHaveLength(0);
    });

    it('renders each warning with an aria-hidden icon and a translated label + backend detail, inside an aria-live region', () => {
      const fixture = createFixture(makeApiMock({ get: vi.fn(() => of(MFO_WITH_CONFLICT)) }));
      const el = fixture.nativeElement as HTMLElement;

      const warningsSection = el.querySelector('.task-constraint__warnings');
      expect(warningsSection?.getAttribute('aria-live')).toBe('polite');

      const items = el.querySelectorAll('.task-constraint__warning');
      expect(items).toHaveLength(1);
      const icon = items[0].querySelector('.task-constraint__warning-icon');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(items[0].textContent).toContain('gantt.taskConstraint.warnings.CONSTRAINT_CONFLICT');
      expect(items[0].textContent).toContain('constraint MFO target precedes hard dependency floor');
    });
  });

  describe('editing the constraint (AC1/AC2)', () => {
    it('switching to a date-bearing type enables the date field; switching back to ASAP clears and disables it', () => {
      const fixture = createFixture(makeApiMock());
      const dateInput = (fixture.nativeElement as HTMLElement).querySelector('#task-constraint-date') as HTMLInputElement;

      setSelectValue(fixture, '#task-constraint-type', 'MFO');
      expect(dateInput.disabled).toBe(false);

      setInputValue(fixture, '#task-constraint-date', '2026-08-14T17:00');
      setSelectValue(fixture, '#task-constraint-type', 'ASAP');
      expect(dateInput.disabled).toBe(true);
      expect(dateInput.value).toBe('');
    });

    it('Error AC — rejects a date-bearing type submitted without a date, client-side, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setSelectValue(fixture, '#task-constraint-type', 'MSO');
      submitForm(fixture);

      expect(api.set).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskConstraint.form.errors.DATE_REQUIRED');
    });

    it('AC1 — sets a "must finish on" constraint with a date, converted to an ISO instant, and announces it (aria-live)', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setSelectValue(fixture, '#task-constraint-type', 'MFO');
      setInputValue(fixture, '#task-constraint-date', '2026-08-14T17:00');
      submitForm(fixture);

      expect(api.set).toHaveBeenCalledWith(
        { tenantId: 1, teamId: 2, projectId: 3 },
        100,
        { constraintType: 'MFO', constraintDate: new Date('2026-08-14T17:00').toISOString(), deadline: null },
      );
      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('p[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.taskConstraint.form.announceUpdated');
    });

    it('AC2 — sets a deadline independent of the constraint type, converted to an ISO instant', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#task-constraint-deadline', '2026-08-20T17:00');
      submitForm(fixture);

      expect(api.set).toHaveBeenCalledWith(
        { tenantId: 1, teamId: 2, projectId: 3 },
        100,
        { constraintType: 'ASAP', constraintDate: null, deadline: new Date('2026-08-20T17:00').toISOString() },
      );
    });

    it('announces the warning count when the response carries warnings', () => {
      const api = makeApiMock({ set: vi.fn(() => of(MFO_WITH_CONFLICT)) });
      const fixture = createFixture(api);

      setSelectValue(fixture, '#task-constraint-type', 'MFO');
      setInputValue(fixture, '#task-constraint-date', '2026-08-14T17:00');
      submitForm(fixture);

      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('p[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.taskConstraint.form.announceUpdatedWithWarnings');
    });

    it.each([
      [422, 'INVALID_TASK_CONSTRAINT', 'gantt.taskConstraint.form.errors.INVALID_TASK_CONSTRAINT'],
      [403, undefined, 'gantt.taskConstraint.form.errors.FORBIDDEN'],
      [404, undefined, 'gantt.taskConstraint.form.errors.NOT_FOUND'],
      [500, undefined, 'gantt.taskConstraint.form.errors.GENERIC'],
    ])('Security/Error AC — maps a %d save error (code=%s) to %s', (status, code, expectedKey) => {
      const api = makeApiMock({
        set: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? ({ code } as TaskConstraintApiError) : null })),
        ),
      });
      const fixture = createFixture(api);

      submitForm(fixture);

      expect(text(fixture)).toContain(expectedKey);
      // A failed save is never silently retried with different data (tenant-isolation rule).
      expect(api.set).toHaveBeenCalledTimes(1);
    });
  });
});
