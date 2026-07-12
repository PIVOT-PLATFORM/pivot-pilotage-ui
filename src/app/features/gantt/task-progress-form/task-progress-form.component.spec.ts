import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { WbsApiService } from '../data-access/wbs-api.service';
import { WbsTaskResponse, WbsTreeResponse } from '../data-access/wbs.models';
import { TaskProgressApiService } from '../data-access/task-progress-api.service';
import { TaskProgressApiError, TaskProgressResponse, UpdateTaskProgressRequest } from '../data-access/task-progress.models';
import { TaskProgressFormComponent } from './task-progress-form.component';

const LEAF_TASK: WbsTaskResponse = {
  taskId: 100,
  parentTaskId: null,
  wbsCode: '1',
  name: 'Développement',
  nodeKind: 'LEAF',
  nodeKindLabel: 'Task',
  position: 0,
  startDate: '2026-01-05T09:00:00Z',
  finishDate: '2026-01-20T17:00:00Z',
  durationMinutes: 2400,
  percentComplete: 45,
  progressLabel: '45%',
  expectedPercentComplete: 60,
  late: true,
  progressVarianceLabel: '3d late',
  readOnly: false,
  ariaRole: 'treeitem',
  ariaLevel: 1,
  ariaSetSize: 1,
  ariaPosInSet: 1,
  ariaReadOnly: false,
  revision: 0,
};

const SUMMARY_TASK: WbsTaskResponse = {
  ...LEAF_TASK,
  taskId: 300,
  wbsCode: '3',
  name: 'Lot A',
  nodeKind: 'SUMMARY',
  nodeKindLabel: 'Summary task',
  readOnly: true,
  ariaReadOnly: true,
};

const PROGRESS_RESPONSE: TaskProgressResponse = {
  taskId: 100,
  percentComplete: 60,
  progressLabel: '60%',
  physicalPercentComplete: 55,
  actualWorkMinutes: 1440,
  remainingWorkMinutes: 960,
  totalWorkMinutes: 2400,
  actualStart: '2026-01-05T09:00:00Z',
  actualFinish: null,
  statusDate: '2026-01-15',
  revision: 1,
};

interface WbsApiMock {
  tree: ReturnType<typeof vi.fn>;
}

interface ProgressApiMock {
  set: ReturnType<typeof vi.fn>;
}

function makeWbsApiMock(nodes: WbsTaskResponse[] = [LEAF_TASK]): WbsApiMock {
  const tree: WbsTreeResponse = { projectId: 3, ariaRole: 'tree', nodes };
  return { tree: vi.fn(() => of(tree)) };
}

function makeProgressApiMock(overrides: Partial<ProgressApiMock> = {}): ProgressApiMock {
  return {
    set: vi.fn(() => of(PROGRESS_RESPONSE)),
    ...overrides,
  };
}

function createFixture(
  wbsApi: WbsApiMock,
  progressApi: ProgressApiMock,
  taskId = '100',
): ComponentFixture<TaskProgressFormComponent> {
  TestBed.configureTestingModule({
    imports: [TaskProgressFormComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: WbsApiService, useValue: wbsApi },
      { provide: TaskProgressApiService, useValue: progressApi },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ tenantId: '1', teamId: '2', projectId: '3', taskId }) },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TaskProgressFormComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<TaskProgressFormComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function setInputValue(fixture: ComponentFixture<TaskProgressFormComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function submitForm(fixture: ComponentFixture<TaskProgressFormComponent>): void {
  const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}

function findButton(fixture: ComponentFixture<TaskProgressFormComponent>, label: string): HTMLButtonElement {
  const btn = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b =>
    b.textContent?.trim().includes(label),
  );
  if (!btn) {
    throw new Error(`No button found with label "${label}"`);
  }
  return btn as HTMLButtonElement;
}

/** Fills every required field with a valid value, ready for a successful submit. */
function fillValidForm(fixture: ComponentFixture<TaskProgressFormComponent>): void {
  setInputValue(fixture, '#task-progress-percent', '60');
  setInputValue(fixture, '#task-progress-actor-ref', 'jdupont');
}

describe('TaskProgressFormComponent', () => {
  describe('loading the task context (read gap, same posture as TaskSchedulingComponent)', () => {
    it('loads and renders the task context from the WBS tree, seeding the percent-complete input', () => {
      const fixture = createFixture(makeWbsApiMock(), makeProgressApiMock());

      expect(text(fixture)).toContain('1');
      expect(text(fixture)).toContain('Développement');
      const input = (fixture.nativeElement as HTMLElement).querySelector('#task-progress-percent') as HTMLInputElement;
      expect(input.value).toBe('45');
    });

    it('shows a NOT_FOUND error when the taskId is not present in the tree', () => {
      const fixture = createFixture(makeWbsApiMock([]), makeProgressApiMock());

      expect(text(fixture)).toContain('gantt.taskProgress.load.errors.NOT_FOUND');
    });

    it.each([
      [404, 'gantt.taskProgress.load.errors.NOT_FOUND'],
      [500, 'gantt.taskProgress.load.errors.GENERIC'],
    ])('maps a %d load error to %s, and retry re-fetches', (status, expectedKey) => {
      const wbsApi: WbsApiMock = { tree: vi.fn(() => throwError(() => new HttpErrorResponse({ status }))) };
      const fixture = createFixture(wbsApi, makeProgressApiMock());

      expect(text(fixture)).toContain(expectedKey);

      wbsApi.tree.mockReturnValue(of({ projectId: 3, ariaRole: 'tree', nodes: [LEAF_TASK] }));
      findButton(fixture, 'gantt.taskProgress.retry').click();
      fixture.detectChanges();

      expect(text(fixture)).not.toContain(expectedKey);
      expect(text(fixture)).toContain('Développement');
    });

    it('Error AC (summary posture) — shows a read-only badge and no editable form for a SUMMARY task, same rule as US22.4.1c', () => {
      const fixture = createFixture(makeWbsApiMock([SUMMARY_TASK]), makeProgressApiMock(), '300');

      expect(text(fixture)).toContain('gantt.taskProgress.readOnlyBadge');
      expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
    });
  });

  describe('the bar (AC — always exposes its value as text, never colour/fill alone)', () => {
    it('renders the tree-seeded percent/label before any write', () => {
      const fixture = createFixture(makeWbsApiMock(), makeProgressApiMock());
      expect(text(fixture)).toContain('45%');
    });

    it('renders the fresh authoritative percent/label after a successful write', () => {
      const progressApi = makeProgressApiMock();
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      fillValidForm(fixture);
      submitForm(fixture);

      expect(text(fixture)).toContain('60%');
    });
  });

  describe('fields are labelled native inputs (A11y)', () => {
    it('every field has an associated label', () => {
      const fixture = createFixture(makeWbsApiMock(), makeProgressApiMock());
      const el = fixture.nativeElement as HTMLElement;
      for (const id of [
        'task-progress-percent',
        'task-progress-physical-percent',
        'task-progress-actual-start',
        'task-progress-actual-finish',
        'task-progress-status-date',
        'task-progress-actor-ref',
      ]) {
        expect(el.querySelector(`label[for="${id}"]`)).not.toBeNull();
        expect(el.querySelector(`#${id}`)?.tagName).toBe('INPUT');
      }
    });
  });

  describe('client-side validation (Error AC)', () => {
    it('rejects an empty percent complete, without calling the API', () => {
      const progressApi = makeProgressApiMock();
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      setInputValue(fixture, '#task-progress-percent', '');
      setInputValue(fixture, '#task-progress-actor-ref', 'jdupont');
      submitForm(fixture);

      expect(progressApi.set).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskProgress.form.errors.PERCENT_REQUIRED');
    });

    it.each(['-1', '101'])('Error AC — rejects a percent complete out of [0, 100] (%s), without calling the API', value => {
      const progressApi = makeProgressApiMock();
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      setInputValue(fixture, '#task-progress-percent', value);
      setInputValue(fixture, '#task-progress-actor-ref', 'jdupont');
      submitForm(fixture);

      expect(progressApi.set).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskProgress.form.errors.PERCENT_OUT_OF_RANGE');
    });

    it('rejects an out-of-range physical percent complete, without calling the API', () => {
      const progressApi = makeProgressApiMock();
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      fillValidForm(fixture);
      setInputValue(fixture, '#task-progress-physical-percent', '150');
      submitForm(fixture);

      expect(progressApi.set).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskProgress.form.errors.PHYSICAL_PERCENT_OUT_OF_RANGE');
    });

    it('Error AC — rejects an actual finish preceding the actual start, without calling the API', () => {
      const progressApi = makeProgressApiMock();
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      fillValidForm(fixture);
      setInputValue(fixture, '#task-progress-actual-start', '2026-01-10T09:00');
      setInputValue(fixture, '#task-progress-actual-finish', '2026-01-05T09:00');
      submitForm(fixture);

      expect(progressApi.set).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskProgress.form.errors.ACTUAL_FINISH_BEFORE_START');
    });

    it('accepts an actual finish equal to the actual start (not "before")', () => {
      const progressApi = makeProgressApiMock();
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      fillValidForm(fixture);
      setInputValue(fixture, '#task-progress-actual-start', '2026-01-10T09:00');
      setInputValue(fixture, '#task-progress-actual-finish', '2026-01-10T09:00');
      submitForm(fixture);

      expect(progressApi.set).toHaveBeenCalledTimes(1);
    });

    it('rejects a blank actor reference, without calling the API', () => {
      const progressApi = makeProgressApiMock();
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      setInputValue(fixture, '#task-progress-percent', '60');
      submitForm(fixture);

      expect(progressApi.set).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskProgress.form.errors.ACTOR_REF_REQUIRED');
    });
  });

  describe('submitting valid progress (AC — bar and remaining work update)', () => {
    it('AC — submits percent complete and actor reference only, omitting every unset optional field', () => {
      const progressApi = makeProgressApiMock();
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      fillValidForm(fixture);
      submitForm(fixture);

      const expected: UpdateTaskProgressRequest = {
        percentComplete: 60,
        physicalPercentComplete: null,
        actualStart: null,
        actualFinish: null,
        statusDate: null,
        actorRef: 'jdupont',
      };
      expect(progressApi.set).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 100, expected);
    });

    it('AC — submits every optional field, converting local datetime inputs to ISO instants', () => {
      const progressApi = makeProgressApiMock();
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      fillValidForm(fixture);
      setInputValue(fixture, '#task-progress-physical-percent', '55');
      setInputValue(fixture, '#task-progress-actual-start', '2026-01-05T09:00');
      setInputValue(fixture, '#task-progress-actual-finish', '2026-01-15T17:00');
      setInputValue(fixture, '#task-progress-status-date', '2026-01-15');
      submitForm(fixture);

      const expected: UpdateTaskProgressRequest = {
        percentComplete: 60,
        physicalPercentComplete: 55,
        actualStart: new Date('2026-01-05T09:00').toISOString(),
        actualFinish: new Date('2026-01-15T17:00').toISOString(),
        statusDate: '2026-01-15',
        actorRef: 'jdupont',
      };
      expect(progressApi.set).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 100, expected);
    });

    it('AC — updates the derived bar/actual/remaining/total work readout and announces it (aria-live)', () => {
      const progressApi = makeProgressApiMock();
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      fillValidForm(fixture);
      submitForm(fixture);

      expect(text(fixture)).toContain('1440'); // actualWorkMinutes
      expect(text(fixture)).toContain('960'); // remainingWorkMinutes
      expect(text(fixture)).toContain('2400'); // totalWorkMinutes
      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.taskProgress.form.announceUpdated');
    });

    it('renders the "not yet confirmed" placeholder for the derived fields before any write', () => {
      const fixture = createFixture(makeWbsApiMock(), makeProgressApiMock());
      expect(text(fixture)).toContain('gantt.taskProgress.unknownValue');
    });
  });

  describe('Security/Error AC — server-side error mapping', () => {
    it.each([
      [422, 'INVALID_TASK_PROGRESS', 'gantt.taskProgress.form.errors.INVALID_TASK_PROGRESS'],
      [422, 'DERIVED_FIELD_NOT_EDITABLE', 'gantt.taskProgress.form.errors.DERIVED_FIELD_NOT_EDITABLE'],
      [403, undefined, 'gantt.taskProgress.form.errors.FORBIDDEN'],
      [404, undefined, 'gantt.taskProgress.form.errors.NOT_FOUND'],
      [500, undefined, 'gantt.taskProgress.form.errors.GENERIC'],
    ])('maps a %d save error (code=%s) to %s', (status, code, expectedKey) => {
      const progressApi = makeProgressApiMock({
        set: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? ({ code } as TaskProgressApiError) : null })),
        ),
      });
      const fixture = createFixture(makeWbsApiMock(), progressApi);

      fillValidForm(fixture);
      submitForm(fixture);

      expect(text(fixture)).toContain(expectedKey);
      // A failed save is never silently retried with different data (tenant-isolation rule).
      expect(progressApi.set).toHaveBeenCalledTimes(1);
    });
  });
});
