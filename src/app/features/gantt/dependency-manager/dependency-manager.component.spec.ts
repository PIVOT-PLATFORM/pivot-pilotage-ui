import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DependencyApiService } from '../data-access/dependency-api.service';
import { Dependency, DependencyApiError, TaskOption } from '../data-access/dependency.models';
import { DependencyManagerComponent } from './dependency-manager.component';

const TASK_A: TaskOption = { taskId: 10, wbsCode: '1', name: 'Analyse' };
const TASK_B: TaskOption = { taskId: 20, wbsCode: '2', name: 'Conception' };
const TASK_C: TaskOption = { taskId: 30, wbsCode: '3', name: 'Développement' };

const DEPENDENCY: Dependency = {
  dependencyId: 100,
  predecessorTaskId: 10,
  successorTaskId: 20,
  linkType: 'FS',
  lagMinutes: 0,
};

interface ApiMock {
  listTasks: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function makeApiMock(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    listTasks: vi.fn(() => of([TASK_A, TASK_B, TASK_C])),
    list: vi.fn(() => of([DEPENDENCY])),
    create: vi.fn(() => of({ ...DEPENDENCY, dependencyId: 101 })),
    update: vi.fn(() => of({ ...DEPENDENCY, linkType: 'SS', lagMinutes: 480 })),
    delete: vi.fn(() => of(undefined)),
    ...overrides,
  };
}

function createFixture(api: ApiMock): ComponentFixture<DependencyManagerComponent> {
  TestBed.configureTestingModule({
    imports: [DependencyManagerComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: DependencyApiService, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ tenantId: '1', teamId: '2', projectId: '3' }) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(DependencyManagerComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<DependencyManagerComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function setSelectValue(fixture: ComponentFixture<DependencyManagerComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
}

function setInputValue(fixture: ComponentFixture<DependencyManagerComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function submitCreateForm(fixture: ComponentFixture<DependencyManagerComponent>): void {
  const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}

function findButton(fixture: ComponentFixture<DependencyManagerComponent>, label: string): HTMLButtonElement {
  const btn = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b =>
    b.textContent?.trim().includes(label),
  );
  if (!btn) {
    throw new Error(`No button found with label "${label}"`);
  }
  return btn as HTMLButtonElement;
}

/** Fills and submits the create form for a valid FS link A→B with no lag. */
function createValidDependency(fixture: ComponentFixture<DependencyManagerComponent>): void {
  setSelectValue(fixture, '#gantt-deps-predecessor', String(TASK_A.taskId));
  setSelectValue(fixture, '#gantt-deps-successor', String(TASK_B.taskId));
  submitCreateForm(fixture);
}

describe('DependencyManagerComponent', () => {
  describe('loading tasks and dependencies', () => {
    it('loads and renders the project dependencies on init, with human-readable task labels', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      expect(api.listTasks).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 });
      expect(api.list).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 });
      const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
      expect(rows).toHaveLength(1);
      expect(text(fixture)).toContain('1 — Analyse');
      expect(text(fixture)).toContain('2 — Conception');
    });

    it('shows the tasksEmpty message (no create form) when fewer than two tasks exist', () => {
      const api = makeApiMock({ listTasks: vi.fn(() => of([TASK_A])) });
      const fixture = createFixture(api);

      expect(text(fixture)).toContain('gantt.dependencies.tasksEmpty');
      expect((fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();
    });

    it('shows the empty-state message when the project has no dependencies yet', () => {
      const api = makeApiMock({ list: vi.fn(() => of([])) });
      const fixture = createFixture(api);

      expect(text(fixture)).toContain('gantt.dependencies.empty');
    });

    it('shows a loading indicator while requests are pending', () => {
      const pending = new Subject<Dependency[]>();
      const api = makeApiMock({ list: vi.fn(() => pending.asObservable()) });
      const fixture = createFixture(api);

      expect(text(fixture)).toContain('gantt.dependencies.loading');

      // forkJoin (tasks + dependencies) only emits once every source completes — mirrors how a
      // real HttpClient request always completes right after its single emission.
      pending.next([DEPENDENCY]);
      pending.complete();
      fixture.detectChanges();
      expect(text(fixture)).not.toContain('gantt.dependencies.loading');
    });

    it.each([
      [404, 'gantt.dependencies.load.errors.NOT_FOUND'],
      [500, 'gantt.dependencies.load.errors.GENERIC'],
    ])('maps a %d load error to %s, and retry re-fetches', (status, expectedKey) => {
      const api = makeApiMock({ list: vi.fn(() => throwError(() => new HttpErrorResponse({ status }))) });
      const fixture = createFixture(api);

      expect(text(fixture)).toContain(expectedKey);

      api.list.mockReturnValue(of([DEPENDENCY]));
      findButton(fixture, 'gantt.dependencies.retry').click();
      fixture.detectChanges();

      expect(text(fixture)).not.toContain(expectedKey);
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).toHaveLength(1);
    });
  });

  describe('create (A11y — keyboard-operable native selects/input, AC "typé FS par défaut")', () => {
    it('defaults the link-type picker to FS', () => {
      const fixture = createFixture(makeApiMock());
      const select = (fixture.nativeElement as HTMLElement).querySelector('#gantt-deps-link-type') as HTMLSelectElement;
      expect(select.value).toBe('FS');
    });

    it('predecessor/successor pickers are labelled native <select> elements (keyboard-operable, no drag needed)', () => {
      const fixture = createFixture(makeApiMock());
      const el = fixture.nativeElement as HTMLElement;

      const predecessorLabel = el.querySelector('label[for="gantt-deps-predecessor"]');
      const successorLabel = el.querySelector('label[for="gantt-deps-successor"]');
      expect(predecessorLabel).not.toBeNull();
      expect(successorLabel).not.toBeNull();
      expect(el.querySelector('#gantt-deps-predecessor')?.tagName).toBe('SELECT');
      expect(el.querySelector('#gantt-deps-successor')?.tagName).toBe('SELECT');
    });

    it('AC1 — creates a typed dependency with a signed lag and announces it (aria-live)', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setSelectValue(fixture, '#gantt-deps-predecessor', String(TASK_A.taskId));
      setSelectValue(fixture, '#gantt-deps-successor', String(TASK_B.taskId));
      setSelectValue(fixture, '#gantt-deps-link-type', 'SS');
      setInputValue(fixture, '#gantt-deps-lag', '-480');
      submitCreateForm(fixture);

      expect(api.create).toHaveBeenCalledWith(
        { tenantId: 1, teamId: 2, projectId: 3 },
        { predecessorTaskId: 10, successorTaskId: 20, linkType: 'SS', lagMinutes: -480 },
      );
      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.dependencies.create.announceCreated');
    });

    it('resets the form and refreshes the list after a successful create', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      createValidDependency(fixture);

      expect((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).toHaveLength(2);
      const linkTypeSelect = (fixture.nativeElement as HTMLElement).querySelector(
        '#gantt-deps-link-type',
      ) as HTMLSelectElement;
      expect(linkTypeSelect.value).toBe('FS');
    });

    it('Error AC — rejects when predecessor/successor are not both selected, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      submitCreateForm(fixture);

      expect(api.create).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.dependencies.create.errors.TASKS_REQUIRED');
    });

    it('Error AC — rejects a self-dependency client-side, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setSelectValue(fixture, '#gantt-deps-predecessor', String(TASK_A.taskId));
      setSelectValue(fixture, '#gantt-deps-successor', String(TASK_A.taskId));
      submitCreateForm(fixture);

      expect(api.create).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.dependencies.create.errors.INVALID_DEPENDENCY');
    });

    it('Error AC — rejects a non-integer lag client-side, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setSelectValue(fixture, '#gantt-deps-predecessor', String(TASK_A.taskId));
      setSelectValue(fixture, '#gantt-deps-successor', String(TASK_B.taskId));
      // A number input still accepts a fractional string programmatically (only the `step`
      // attribute's constraint-validation UI is affected) — a genuinely non-numeric string like
      // "abc" is emptied by the DOM itself on a `type="number"` input, so it can never reach this
      // component's own validation; a fractional lag is the realistic client-side case to cover.
      setInputValue(fixture, '#gantt-deps-lag', '1.5');
      submitCreateForm(fixture);

      expect(api.create).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.dependencies.create.errors.INVALID_LAG');
    });

    it.each([
      [422, 'INVALID_DEPENDENCY', 'gantt.dependencies.create.errors.INVALID_DEPENDENCY'],
      [409, 'DUPLICATE_DEPENDENCY', 'gantt.dependencies.create.errors.DUPLICATE_DEPENDENCY'],
      [409, 'SCHEDULE_CYCLE', 'gantt.dependencies.create.errors.SCHEDULE_CYCLE'],
      [403, undefined, 'gantt.dependencies.create.errors.FORBIDDEN'],
      [404, undefined, 'gantt.dependencies.create.errors.NOT_FOUND'],
      [500, undefined, 'gantt.dependencies.create.errors.GENERIC'],
    ])('Security/Error AC — maps a %d error (code=%s) to %s', (status, code, expectedKey) => {
      const api = makeApiMock({
        create: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? ({ code } as DependencyApiError) : null })),
        ),
      });
      const fixture = createFixture(api);

      createValidDependency(fixture);

      expect(text(fixture)).toContain(expectedKey);
      // A failed create must never be silently retried with different data (tenant-isolation rule).
      expect(api.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('edit (retype/relag — AC "modifiable")', () => {
    it('retypes and relags an existing dependency, then announces the update', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.dependencies.edit.button').click();
      fixture.detectChanges();
      setSelectValue(fixture, 'td select', 'SS');
      setInputValue(fixture, 'td input[type="number"]', '480');
      findButton(fixture, 'gantt.dependencies.edit.confirmButton').click();
      fixture.detectChanges();

      expect(api.update).toHaveBeenCalledWith(
        { tenantId: 1, teamId: 2, projectId: 3 },
        DEPENDENCY.dependencyId,
        { linkType: 'SS', lagMinutes: 480 },
      );
      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.dependencies.edit.announceUpdated');
    });

    it('cancelling an edit does not call the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.dependencies.edit.button').click();
      fixture.detectChanges();
      findButton(fixture, 'gantt.dependencies.edit.cancelButton').click();
      fixture.detectChanges();

      expect(api.update).not.toHaveBeenCalled();
    });

    it('Error AC — rejects a non-integer lag client-side while editing, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.dependencies.edit.button').click();
      fixture.detectChanges();
      // See the equivalent create-form test's comment: a fractional value is the realistic
      // non-integer case for a `type="number"` input, "abc" never reaches the component at all.
      setInputValue(fixture, 'td input[type="number"]', '1.5');
      findButton(fixture, 'gantt.dependencies.edit.confirmButton').click();
      fixture.detectChanges();

      expect(api.update).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('gantt.dependencies.edit.errors.INVALID_LAG');
    });

    it.each([
      [409, 'DUPLICATE_DEPENDENCY', 'gantt.dependencies.edit.errors.DUPLICATE_DEPENDENCY'],
      [409, 'SCHEDULE_CYCLE', 'gantt.dependencies.edit.errors.SCHEDULE_CYCLE'],
      [403, undefined, 'gantt.dependencies.edit.errors.FORBIDDEN'],
      [404, undefined, 'gantt.dependencies.edit.errors.NOT_FOUND'],
      [500, undefined, 'gantt.dependencies.edit.errors.GENERIC'],
    ])('maps a %d edit error (code=%s) to %s', (status, code, expectedKey) => {
      const api = makeApiMock({
        update: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? ({ code } as DependencyApiError) : null })),
        ),
      });
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.dependencies.edit.button').click();
      fixture.detectChanges();
      findButton(fixture, 'gantt.dependencies.edit.confirmButton').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain(expectedKey);
    });
  });

  describe('delete (Security AC — no accidental removal)', () => {
    it('requires an inline confirmation before actually deleting (no native confirm() dialog)', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.dependencies.delete.button').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('gantt.dependencies.delete.confirmPrompt');
      expect(api.delete).not.toHaveBeenCalled();

      findButton(fixture, 'gantt.dependencies.delete.cancelButton').click();
      fixture.detectChanges();

      expect(text(fixture)).not.toContain('gantt.dependencies.delete.confirmPrompt');
      expect(api.delete).not.toHaveBeenCalled();
    });

    it('confirming deletes the dependency, removes the row, and announces it', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.dependencies.delete.button').click();
      fixture.detectChanges();
      findButton(fixture, 'gantt.dependencies.delete.confirmButton').click();
      fixture.detectChanges();

      expect(api.delete).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3 }, DEPENDENCY.dependencyId);
      expect(text(fixture)).toContain('gantt.dependencies.empty');
      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.dependencies.delete.announceDeleted');
    });

    it.each([
      [403, 'gantt.dependencies.delete.errors.FORBIDDEN'],
      [404, 'gantt.dependencies.delete.errors.NOT_FOUND'],
      [500, 'gantt.dependencies.delete.errors.GENERIC'],
    ])('maps a %d delete error to %s', (status, expectedKey) => {
      const api = makeApiMock({ delete: vi.fn(() => throwError(() => new HttpErrorResponse({ status }))) });
      const fixture = createFixture(api);

      findButton(fixture, 'gantt.dependencies.delete.button').click();
      fixture.detectChanges();
      findButton(fixture, 'gantt.dependencies.delete.confirmButton').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain(expectedKey);
    });
  });
});
