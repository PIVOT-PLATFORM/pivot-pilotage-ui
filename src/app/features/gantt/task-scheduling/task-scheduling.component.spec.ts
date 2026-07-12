import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { WbsApiService } from '../data-access/wbs-api.service';
import { WbsTaskResponse, WbsTreeResponse } from '../data-access/wbs.models';
import { TaskSchedulingApiService } from '../data-access/task-scheduling-api.service';
import { TaskSchedulingApiError, TaskSchedulingResponse } from '../data-access/task-scheduling.models';
import { TaskSchedulingComponent } from './task-scheduling.component';

const LEAF_TASK: WbsTaskResponse = {
  taskId: 100,
  parentTaskId: null,
  wbsCode: '1',
  name: 'Développement',
  nodeKind: 'LEAF',
  nodeKindLabel: 'Task',
  position: 0,
  startDate: '2026-01-05T09:00:00Z',
  finishDate: '2026-01-05T17:00:00Z',
  durationMinutes: 480,
  percentComplete: 0,
  progressLabel: '0%',
  readOnly: false,
  ariaRole: 'treeitem',
  ariaLevel: 1,
  ariaSetSize: 1,
  ariaPosInSet: 1,
  ariaReadOnly: false,
  revision: 0,
};

const MILESTONE_TASK: WbsTaskResponse = {
  ...LEAF_TASK,
  taskId: 200,
  wbsCode: '2',
  name: 'Kickoff',
  nodeKind: 'MILESTONE',
  nodeKindLabel: 'Milestone',
  durationMinutes: 0,
};

const SUMMARY_TASK: WbsTaskResponse = {
  ...LEAF_TASK,
  taskId: 300,
  wbsCode: '3',
  name: 'Lot A',
  nodeKind: 'SUMMARY',
  nodeKindLabel: 'Summary task',
  durationMinutes: 4800,
  readOnly: true,
  ariaReadOnly: true,
};

const SCHEDULING_RESPONSE: TaskSchedulingResponse = {
  taskId: 100,
  schedulingMode: null,
  effectiveMode: 'AUTO',
  durationMinutes: 480,
  workMinutes: 480,
  startDate: '2026-01-05T09:00:00Z',
  finishDate: '2026-01-05T17:00:00Z',
  plannedManual: null,
  wouldBeAuto: null,
  deltaMinutes: 0,
  revision: 1,
};

interface WbsApiMock {
  tree: ReturnType<typeof vi.fn>;
}

interface SchedulingApiMock {
  setDuration: ReturnType<typeof vi.fn>;
  setEffort: ReturnType<typeof vi.fn>;
  setSchedulingMode: ReturnType<typeof vi.fn>;
}

function makeWbsApiMock(nodes: WbsTaskResponse[] = [LEAF_TASK]): WbsApiMock {
  const tree: WbsTreeResponse = { projectId: 3, ariaRole: 'tree', nodes };
  return { tree: vi.fn(() => of(tree)) };
}

function makeSchedulingApiMock(overrides: Partial<SchedulingApiMock> = {}): SchedulingApiMock {
  return {
    setDuration: vi.fn(() => of(SCHEDULING_RESPONSE)),
    setEffort: vi.fn(() => of({ ...SCHEDULING_RESPONSE, workMinutes: 240 })),
    setSchedulingMode: vi.fn(() => of({ ...SCHEDULING_RESPONSE, schedulingMode: 'MANUAL', effectiveMode: 'MANUAL' as const })),
    ...overrides,
  };
}

function createFixture(
  wbsApi: WbsApiMock,
  schedulingApi: SchedulingApiMock,
  taskId = '100',
): ComponentFixture<TaskSchedulingComponent> {
  TestBed.configureTestingModule({
    imports: [TaskSchedulingComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: WbsApiService, useValue: wbsApi },
      { provide: TaskSchedulingApiService, useValue: schedulingApi },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ tenantId: '1', teamId: '2', projectId: '3', taskId }) },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TaskSchedulingComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<TaskSchedulingComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function setInputValue(fixture: ComponentFixture<TaskSchedulingComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function submitForm(fixture: ComponentFixture<TaskSchedulingComponent>, index: number): void {
  const forms = (fixture.nativeElement as HTMLElement).querySelectorAll('form');
  forms[index].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}

function findButton(fixture: ComponentFixture<TaskSchedulingComponent>, label: string): HTMLButtonElement {
  const btn = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b =>
    b.textContent?.trim().includes(label),
  );
  if (!btn) {
    throw new Error(`No button found with label "${label}"`);
  }
  return btn as HTMLButtonElement;
}

describe('TaskSchedulingComponent', () => {
  describe('loading the task context', () => {
    it('loads and renders the task context from the WBS tree', () => {
      const fixture = createFixture(makeWbsApiMock(), makeSchedulingApiMock());

      expect(text(fixture)).toContain('1');
      expect(text(fixture)).toContain('Développement');
    });

    it('shows a NOT_FOUND error when the taskId is not present in the tree', () => {
      const fixture = createFixture(makeWbsApiMock([]), makeSchedulingApiMock());

      expect(text(fixture)).toContain('gantt.taskScheduling.load.errors.NOT_FOUND');
    });

    it.each([
      [404, 'gantt.taskScheduling.load.errors.NOT_FOUND'],
      [500, 'gantt.taskScheduling.load.errors.GENERIC'],
    ])('maps a %d load error to %s, and retry re-fetches', (status, expectedKey) => {
      const wbsApi: WbsApiMock = { tree: vi.fn(() => throwError(() => new HttpErrorResponse({ status }))) };
      const fixture = createFixture(wbsApi, makeSchedulingApiMock());

      expect(text(fixture)).toContain(expectedKey);

      wbsApi.tree.mockReturnValue(of({ projectId: 3, ariaRole: 'tree', nodes: [LEAF_TASK] }));
      findButton(fixture, 'gantt.taskScheduling.retry').click();
      fixture.detectChanges();

      expect(text(fixture)).not.toContain(expectedKey);
      expect(text(fixture)).toContain('Développement');
    });

    it('shows a read-only badge and no editable forms for a SUMMARY task (US22.4.1c consistency)', () => {
      const fixture = createFixture(makeWbsApiMock([SUMMARY_TASK]), makeSchedulingApiMock(), '300');

      expect(text(fixture)).toContain('gantt.taskScheduling.readOnlyBadge');
      expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
    });
  });

  describe('duration (A11y — labelled native input, keyboard-operable)', () => {
    it('seeds the duration input from the tree-read value', () => {
      const fixture = createFixture(makeWbsApiMock(), makeSchedulingApiMock());
      const input = (fixture.nativeElement as HTMLElement).querySelector('#task-scheduling-duration') as HTMLInputElement;
      expect(input.value).toBe('480');
    });

    it('duration input is a labelled native <input>', () => {
      const fixture = createFixture(makeWbsApiMock(), makeSchedulingApiMock());
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('label[for="task-scheduling-duration"]')).not.toBeNull();
      expect(el.querySelector('#task-scheduling-duration')?.tagName).toBe('INPUT');
    });

    it('Error AC — rejects an empty duration client-side, without calling the API, and reverts the input', () => {
      const schedulingApi = makeSchedulingApiMock();
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      setInputValue(fixture, '#task-scheduling-duration', '');
      submitForm(fixture, 0);

      expect(schedulingApi.setDuration).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskScheduling.duration.errors.REQUIRED');
      const input = (fixture.nativeElement as HTMLElement).querySelector('#task-scheduling-duration') as HTMLInputElement;
      expect(input.value).toBe('480');
    });

    it('Error AC — rejects a fractional (non-integer) duration client-side, without calling the API, and reverts the input', () => {
      const schedulingApi = makeSchedulingApiMock();
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      // A number input still accepts a fractional string programmatically (only the `step`
      // attribute's constraint-validation UI is affected) — same posture as
      // `DependencyManagerComponent`'s equivalent lag-input test.
      setInputValue(fixture, '#task-scheduling-duration', '1.5');
      submitForm(fixture, 0);

      expect(schedulingApi.setDuration).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskScheduling.duration.errors.NOT_A_NUMBER');
      const input = (fixture.nativeElement as HTMLElement).querySelector('#task-scheduling-duration') as HTMLInputElement;
      expect(input.value).toBe('480');
    });

    it('Error AC — rejects a negative duration client-side, without calling the API, and reverts the input', () => {
      const schedulingApi = makeSchedulingApiMock();
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      setInputValue(fixture, '#task-scheduling-duration', '-10');
      submitForm(fixture, 0);

      expect(schedulingApi.setDuration).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskScheduling.duration.errors.NEGATIVE');
      const input = (fixture.nativeElement as HTMLElement).querySelector('#task-scheduling-duration') as HTMLInputElement;
      expect(input.value).toBe('480');
    });

    it('Error AC — rejects a zero duration on a non-milestone task client-side, without calling the API, and reverts the input', () => {
      const schedulingApi = makeSchedulingApiMock();
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      setInputValue(fixture, '#task-scheduling-duration', '0');
      submitForm(fixture, 0);

      expect(schedulingApi.setDuration).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskScheduling.duration.errors.ZERO_NON_MILESTONE');
      const input = (fixture.nativeElement as HTMLElement).querySelector('#task-scheduling-duration') as HTMLInputElement;
      expect(input.value).toBe('480');
    });

    it('accepts a zero duration on a milestone task', () => {
      const schedulingApi = makeSchedulingApiMock({
        setDuration: vi.fn(() => of({ ...SCHEDULING_RESPONSE, taskId: 200, durationMinutes: 0 })),
      });
      const fixture = createFixture(makeWbsApiMock([MILESTONE_TASK]), schedulingApi, '200');

      setInputValue(fixture, '#task-scheduling-duration', '0');
      submitForm(fixture, 0);

      expect(schedulingApi.setDuration).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 200, 0);
    });

    it('submits a valid duration, updates the derived state, and announces it (aria-live)', () => {
      const schedulingApi = makeSchedulingApiMock();
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      setInputValue(fixture, '#task-scheduling-duration', '960');
      submitForm(fixture, 0);

      expect(schedulingApi.setDuration).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 100, 960);
      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.taskScheduling.duration.announceUpdated');
    });

    it.each([
      [422, 'INVALID_TASK_EFFORT', 'gantt.taskScheduling.duration.errors.INVALID_TASK_EFFORT'],
      [403, undefined, 'gantt.taskScheduling.duration.errors.FORBIDDEN'],
      [404, undefined, 'gantt.taskScheduling.duration.errors.NOT_FOUND'],
      [500, undefined, 'gantt.taskScheduling.duration.errors.GENERIC'],
    ])('Security/Error AC — maps a %d duration error (code=%s) to %s, and reverts the input', (status, code, expectedKey) => {
      const schedulingApi = makeSchedulingApiMock({
        setDuration: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? ({ code } as TaskSchedulingApiError) : null })),
        ),
      });
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      setInputValue(fixture, '#task-scheduling-duration', '960');
      submitForm(fixture, 0);

      expect(text(fixture)).toContain(expectedKey);
      const input = (fixture.nativeElement as HTMLElement).querySelector('#task-scheduling-duration') as HTMLInputElement;
      expect(input.value).toBe('480');
    });
  });

  describe('effort (A11y — labelled native inputs)', () => {
    it('resource-ref and units inputs are labelled native <input>s', () => {
      const fixture = createFixture(makeWbsApiMock(), makeSchedulingApiMock());
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('label[for="task-scheduling-resource-ref"]')).not.toBeNull();
      expect(el.querySelector('label[for="task-scheduling-units"]')).not.toBeNull();
      expect(el.querySelector('#task-scheduling-resource-ref')?.tagName).toBe('INPUT');
      expect(el.querySelector('#task-scheduling-units')?.tagName).toBe('INPUT');
    });

    it('Error AC — rejects a blank resource reference client-side, without calling the API', () => {
      const schedulingApi = makeSchedulingApiMock();
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      submitForm(fixture, 1);

      expect(schedulingApi.setEffort).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskScheduling.effort.errors.RESOURCE_REQUIRED');
    });

    it('Error AC — rejects a blank units value client-side, without calling the API', () => {
      const schedulingApi = makeSchedulingApiMock();
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      setInputValue(fixture, '#task-scheduling-resource-ref', 'alice');
      setInputValue(fixture, '#task-scheduling-units', '');
      submitForm(fixture, 1);

      expect(schedulingApi.setEffort).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskScheduling.effort.errors.UNITS_REQUIRED');
    });

    it('Error AC — rejects non-positive units client-side, without calling the API', () => {
      const schedulingApi = makeSchedulingApiMock();
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      setInputValue(fixture, '#task-scheduling-resource-ref', 'alice');
      setInputValue(fixture, '#task-scheduling-units', '0');
      submitForm(fixture, 1);

      expect(schedulingApi.setEffort).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.taskScheduling.effort.errors.NON_POSITIVE');
    });

    it('submits valid effort, derives the total work, and announces it', () => {
      const schedulingApi = makeSchedulingApiMock();
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      setInputValue(fixture, '#task-scheduling-resource-ref', 'alice');
      setInputValue(fixture, '#task-scheduling-units', '50');
      submitForm(fixture, 1);

      expect(schedulingApi.setEffort).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 100, 'alice', 50);
      expect(text(fixture)).toContain('240');
      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.taskScheduling.effort.announceUpdated');
    });

    it.each([
      [422, 'INVALID_TASK_EFFORT', 'gantt.taskScheduling.effort.errors.INVALID_TASK_EFFORT'],
      [403, undefined, 'gantt.taskScheduling.effort.errors.FORBIDDEN'],
      [404, undefined, 'gantt.taskScheduling.effort.errors.NOT_FOUND'],
      [500, undefined, 'gantt.taskScheduling.effort.errors.GENERIC'],
    ])('Security/Error AC — maps a %d effort error (code=%s) to %s', (status, code, expectedKey) => {
      const schedulingApi = makeSchedulingApiMock({
        setEffort: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? ({ code } as TaskSchedulingApiError) : null })),
        ),
      });
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      setInputValue(fixture, '#task-scheduling-resource-ref', 'alice');
      setInputValue(fixture, '#task-scheduling-units', '50');
      submitForm(fixture, 1);

      expect(text(fixture)).toContain(expectedKey);
    });
  });

  describe('scheduling mode (A11y — aria-pressed toggle, AC1/AC2 auto vs manual)', () => {
    it('neither AUTO nor MANUAL is pressed before any confirmed state (read-gap posture)', () => {
      const fixture = createFixture(makeWbsApiMock(), makeSchedulingApiMock());

      expect(findButton(fixture, 'gantt.taskScheduling.mode.AUTO').getAttribute('aria-pressed')).toBe('false');
      expect(findButton(fixture, 'gantt.taskScheduling.mode.MANUAL').getAttribute('aria-pressed')).toBe('false');
    });

    it('AC2 — switching to MANUAL surfaces the pinned dates and the variance, and announces it', () => {
      const schedulingApi = makeSchedulingApiMock({
        setSchedulingMode: vi.fn(() =>
          of({
            ...SCHEDULING_RESPONSE,
            schedulingMode: 'MANUAL' as const,
            effectiveMode: 'MANUAL' as const,
            plannedManual: '2026-01-08T09:00:00Z',
            wouldBeAuto: '2026-01-05T09:00:00Z',
            deltaMinutes: 480,
          }),
        ),
      });
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      findButton(fixture, 'gantt.taskScheduling.mode.MANUAL').click();
      fixture.detectChanges();

      expect(schedulingApi.setSchedulingMode).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 100, 'MANUAL');
      expect(findButton(fixture, 'gantt.taskScheduling.mode.MANUAL').getAttribute('aria-pressed')).toBe('true');
      expect(text(fixture)).toContain('2026-01-08');
      expect(text(fixture)).toContain('2026-01-05');
      expect(text(fixture)).toContain('480');
      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.taskScheduling.mode.announceManualWithVariance');
    });

    it('AC1 — switching to AUTO announces the change without a variance', () => {
      const schedulingApi = makeSchedulingApiMock({
        setSchedulingMode: vi.fn(() => of({ ...SCHEDULING_RESPONSE, schedulingMode: 'AUTO' as const, effectiveMode: 'AUTO' as const })),
      });
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      findButton(fixture, 'gantt.taskScheduling.mode.AUTO').click();
      fixture.detectChanges();

      expect(schedulingApi.setSchedulingMode).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, 100, 'AUTO');
      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.taskScheduling.mode.announceChanged');
    });

    it.each([
      [403, 'gantt.taskScheduling.mode.errors.FORBIDDEN'],
      [404, 'gantt.taskScheduling.mode.errors.NOT_FOUND'],
      [500, 'gantt.taskScheduling.mode.errors.GENERIC'],
    ])('Security/Error AC — maps a %d scheduling-mode error to %s', (status, expectedKey) => {
      const schedulingApi = makeSchedulingApiMock({
        setSchedulingMode: vi.fn(() => throwError(() => new HttpErrorResponse({ status }))),
      });
      const fixture = createFixture(makeWbsApiMock(), schedulingApi);

      findButton(fixture, 'gantt.taskScheduling.mode.MANUAL').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain(expectedKey);
    });
  });
});
