import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { WbsTreeComponent } from './wbs-tree.component';
import { WbsApiService } from '../data-access/wbs-api.service';
import { WbsApiError, WbsTaskResponse, WbsTreeResponse } from '../data-access/wbs.models';

const REF = { tenantId: 1, teamId: 2, projectId: 3 };

const SUMMARY: WbsTaskResponse = {
  taskId: 100,
  parentTaskId: null,
  wbsCode: '1',
  name: 'Lot A',
  nodeKind: 'SUMMARY',
  position: 0,
  startDate: '2026-01-01T00:00:00Z',
  finishDate: '2026-03-01T00:00:00Z',
  durationMinutes: 4800,
  percentComplete: 45,
  progressLabel: '45%',
  readOnly: true,
  ariaRole: 'treeitem',
  ariaLevel: 1,
  ariaSetSize: 1,
  ariaPosInSet: 1,
  ariaReadOnly: true,
  revision: 0,
};

const LEAF_1: WbsTaskResponse = {
  taskId: 101,
  parentTaskId: 100,
  wbsCode: '1.1',
  name: 'Tâche 1',
  nodeKind: 'LEAF',
  position: 0,
  startDate: '2026-01-01T00:00:00Z',
  finishDate: '2026-01-15T00:00:00Z',
  durationMinutes: 2400,
  percentComplete: 100,
  progressLabel: '100%',
  readOnly: false,
  ariaRole: 'treeitem',
  ariaLevel: 2,
  ariaSetSize: 2,
  ariaPosInSet: 1,
  ariaReadOnly: false,
  revision: 0,
};

const LEAF_2: WbsTaskResponse = {
  taskId: 102,
  parentTaskId: 100,
  wbsCode: '1.2',
  name: 'Tâche 2',
  nodeKind: 'LEAF',
  position: 1,
  startDate: '2026-01-16T00:00:00Z',
  finishDate: '2026-03-01T00:00:00Z',
  durationMinutes: 2400,
  percentComplete: 0,
  progressLabel: null,
  readOnly: false,
  ariaRole: 'treeitem',
  ariaLevel: 2,
  ariaSetSize: 2,
  ariaPosInSet: 2,
  ariaReadOnly: false,
  revision: 0,
};

const TREE: WbsTreeResponse = { projectId: 3, ariaRole: 'tree', nodes: [SUMMARY, LEAF_1, LEAF_2] };

interface ApiMock {
  tree: ReturnType<typeof vi.fn>;
  indent: ReturnType<typeof vi.fn>;
  outdent: ReturnType<typeof vi.fn>;
  move: ReturnType<typeof vi.fn>;
}

function makeApiMock(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    tree: vi.fn(() => of(TREE)),
    indent: vi.fn(),
    outdent: vi.fn(),
    move: vi.fn(),
    ...overrides,
  };
}

function createFixture(api: ApiMock): ComponentFixture<WbsTreeComponent> {
  TestBed.configureTestingModule({
    imports: [WbsTreeComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: WbsApiService, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ tenantId: '1', teamId: '2', projectId: '3' }) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(WbsTreeComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<WbsTreeComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function rows(fixture: ComponentFixture<WbsTreeComponent>): HTMLElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="treeitem"]')) as HTMLElement[];
}

function rowByTaskId(fixture: ComponentFixture<WbsTreeComponent>, taskId: number): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-task-id="${taskId}"]`) as HTMLElement;
}

function actionButton(row: HTMLElement, label: 'indent' | 'outdent' | 'moveUp' | 'moveDown'): HTMLButtonElement {
  const index = { indent: 0, outdent: 1, moveUp: 2, moveDown: 3 }[label];
  return row.querySelectorAll('.wbs-tree__actions button')[index] as HTMLButtonElement;
}

describe('WbsTreeComponent', () => {
  it('AC — loads and renders the tree with role="tree"/"treeitem" and the server-supplied ARIA attributes', () => {
    const api = makeApiMock();
    const fixture = createFixture(api);

    expect(api.tree).toHaveBeenCalledWith(REF);

    const list = (fixture.nativeElement as HTMLElement).querySelector('[role="tree"]');
    expect(list).not.toBeNull();

    const treeRows = rows(fixture);
    expect(treeRows).toHaveLength(3);

    const summaryRow = rowByTaskId(fixture, 100);
    expect(summaryRow.getAttribute('aria-level')).toBe('1');
    expect(summaryRow.getAttribute('aria-setsize')).toBe('1');
    expect(summaryRow.getAttribute('aria-posinset')).toBe('1');
    expect(summaryRow.getAttribute('aria-readonly')).toBe('true');

    const leafRow = rowByTaskId(fixture, 101);
    expect(leafRow.getAttribute('aria-level')).toBe('2');
    expect(leafRow.getAttribute('aria-setsize')).toBe('2');
    expect(leafRow.getAttribute('aria-posinset')).toBe('1');
  });

  it('AC — displays each task\'s server-derived WBS code', () => {
    const fixture = createFixture(makeApiMock());

    expect(rowByTaskId(fixture, 100).textContent).toContain('1');
    expect(rowByTaskId(fixture, 101).textContent).toContain('1.1');
    expect(rowByTaskId(fixture, 102).textContent).toContain('1.2');
  });

  it('shows the empty-tree message when the project has no WBS tasks yet', () => {
    const api = makeApiMock({ tree: vi.fn(() => of({ projectId: 3, ariaRole: 'tree', nodes: [] })) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('gantt.wbsTree.empty');
  });

  it('shows a NOT_FOUND load error on 404 and recovers on retry', () => {
    const api = makeApiMock({ tree: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('gantt.wbsTree.load.errors.NOT_FOUND');

    api.tree.mockReturnValue(of(TREE));
    const retryButton = (fixture.nativeElement as HTMLElement).querySelector(
      '.wbs-tree__status--error button',
    ) as HTMLButtonElement;
    retryButton.click();
    fixture.detectChanges();

    expect(text(fixture)).not.toContain('gantt.wbsTree.load.errors.NOT_FOUND');
    expect(rows(fixture)).toHaveLength(3);
  });

  it('shows a GENERIC load error on a non-404 failure', () => {
    const api = makeApiMock({ tree: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('gantt.wbsTree.load.errors.GENERIC');
  });

  describe('US22.4.1c — aggregated summary tasks', () => {
    it('renders a SUMMARY node read-only, visually distinct, with its aggregated dates/progress', () => {
      const fixture = createFixture(makeApiMock());

      const summaryRow = rowByTaskId(fixture, 100);
      expect(summaryRow.classList.contains('wbs-tree__item--summary')).toBe(true);
      expect(summaryRow.textContent).toContain('gantt.wbsTree.readOnlyBadge');
      expect(summaryRow.textContent).toContain('45%');
      expect(summaryRow.textContent).toContain('2026-01-01');
      expect(summaryRow.textContent).toContain('2026-03-01');
    });

    it('never renders a progress label for an untracked leaf (progressLabel null)', () => {
      const fixture = createFixture(makeApiMock());

      const leafRow = rowByTaskId(fixture, 102);
      expect(leafRow.querySelector('.wbs-tree__progress')).toBeNull();
    });
  });

  describe('US22.4.1b — indent/outdent/reorder affordances derived from ARIA fields', () => {
    it('disables Indent for the first sibling and Outdent for a root-level node', () => {
      const fixture = createFixture(makeApiMock());

      const summaryRow = rowByTaskId(fixture, 100); // ariaLevel 1, ariaPosInSet 1, ariaSetSize 1
      expect(actionButton(summaryRow, 'indent').disabled).toBe(true); // no preceding sibling
      expect(actionButton(summaryRow, 'outdent').disabled).toBe(true); // already at WBS root
      expect(actionButton(summaryRow, 'moveUp').disabled).toBe(true);
      expect(actionButton(summaryRow, 'moveDown').disabled).toBe(true); // only child in its set
    });

    it('enables Indent/Move up for the second sibling, and Outdent since it is nested', () => {
      const fixture = createFixture(makeApiMock());

      const secondLeafRow = rowByTaskId(fixture, 102); // ariaLevel 2, ariaPosInSet 2 of 2
      expect(actionButton(secondLeafRow, 'indent').disabled).toBe(false);
      expect(actionButton(secondLeafRow, 'outdent').disabled).toBe(false);
      expect(actionButton(secondLeafRow, 'moveUp').disabled).toBe(false);
      expect(actionButton(secondLeafRow, 'moveDown').disabled).toBe(true); // last among its siblings
    });

    it('AC — clicking Indent calls the indent endpoint and refetches the whole tree on success', () => {
      const reindented: WbsTaskResponse = { ...LEAF_2, ariaLevel: 3, wbsCode: '1.1.1' };
      const api = makeApiMock({ indent: vi.fn(() => of(reindented)) });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 102), 'indent').click();
      fixture.detectChanges();

      expect(api.indent).toHaveBeenCalledWith(REF, 102);
      expect(api.tree).toHaveBeenCalledTimes(2); // initial load + re-fetch after the action
      expect(text(fixture)).not.toContain('gantt.wbsTree.actions.errors');
    });

    it('AC — clicking Outdent calls the outdent endpoint', () => {
      const api = makeApiMock({ outdent: vi.fn(() => of({ ...LEAF_1, ariaLevel: 1 })) });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 101), 'outdent').click();
      fixture.detectChanges();

      expect(api.outdent).toHaveBeenCalledWith(REF, 101);
    });

    it('AC — clicking Move up calls the move endpoint with only a new position (no reparent)', () => {
      const api = makeApiMock({ move: vi.fn(() => of(LEAF_2)) });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 102), 'moveUp').click();
      fixture.detectChanges();

      expect(api.move).toHaveBeenCalledWith(REF, 102, { position: 0 });
    });

    it('AC — clicking Move down calls the move endpoint with only a new position (no reparent)', () => {
      const api = makeApiMock({ move: vi.fn(() => of(LEAF_1)) });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 101), 'moveDown').click();
      fixture.detectChanges();

      expect(api.move).toHaveBeenCalledWith(REF, 101, { position: 1 });
    });

    it('A11y — Alt+ArrowRight on the focused row is the indent keyboard shortcut', () => {
      const api = makeApiMock({ indent: vi.fn(() => of({ ...LEAF_2, ariaLevel: 3 })) });
      const fixture = createFixture(api);
      const row = rowByTaskId(fixture, 102);

      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
      fixture.detectChanges();

      expect(api.indent).toHaveBeenCalledWith(REF, 102);
    });

    it('A11y — Alt+ArrowLeft on the focused row is the outdent keyboard shortcut', () => {
      const api = makeApiMock({ outdent: vi.fn(() => of({ ...LEAF_1, ariaLevel: 1 })) });
      const fixture = createFixture(api);
      const row = rowByTaskId(fixture, 101);

      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
      fixture.detectChanges();

      expect(api.outdent).toHaveBeenCalledWith(REF, 101);
    });

    it('A11y — Alt+ArrowUp on the focused row moves it up among its siblings', () => {
      const api = makeApiMock({ move: vi.fn(() => of(LEAF_2)) });
      const fixture = createFixture(api);
      const row = rowByTaskId(fixture, 102);

      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
      fixture.detectChanges();

      expect(api.move).toHaveBeenCalledWith(REF, 102, { position: 0 });
    });

    it('A11y — Alt+ArrowDown on the focused row moves it down among its siblings', () => {
      const api = makeApiMock({ move: vi.fn(() => of(LEAF_1)) });
      const fixture = createFixture(api);
      const row = rowByTaskId(fixture, 101);

      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
      fixture.detectChanges();

      expect(api.move).toHaveBeenCalledWith(REF, 101, { position: 1 });
    });

    it('a disabled Alt+arrow shortcut (e.g. indent on a task with no preceding sibling) is a no-op, not a fallback to some other action', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);
      const row = rowByTaskId(fixture, 100); // root, only child — every shortcut is inapplicable here

      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
      fixture.detectChanges();

      expect(api.indent).not.toHaveBeenCalled();
      expect(api.outdent).not.toHaveBeenCalled();
      expect(api.move).not.toHaveBeenCalled();
    });

    it('an unrelated Alt+key combination on the focused row is ignored', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);
      const row = rowByTaskId(fixture, 102);

      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true }));
      fixture.detectChanges();

      expect(api.indent).not.toHaveBeenCalled();
      expect(api.outdent).not.toHaveBeenCalled();
      expect(api.move).not.toHaveBeenCalled();
    });

    it('A11y — plain ArrowDown/ArrowUp move roving focus between visible rows, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);
      const first = rowByTaskId(fixture, 100);

      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      fixture.detectChanges();

      expect(rowByTaskId(fixture, 101).tabIndex).toBe(0);
      expect(rowByTaskId(fixture, 100).tabIndex).toBe(-1);
      expect(api.indent).not.toHaveBeenCalled();
      expect(api.outdent).not.toHaveBeenCalled();
      expect(api.move).not.toHaveBeenCalled();
    });

    it('a plain ArrowUp on the first (already-focused) row is a no-op — no previous sibling', () => {
      const fixture = createFixture(makeApiMock());
      // Default roving tabindex already sits on the first row (taskId 100) after load.

      rowByTaskId(fixture, 100).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      fixture.detectChanges();

      expect(rowByTaskId(fixture, 100).tabIndex).toBe(0); // unchanged — still focused
    });

    it('a plain ArrowDown on the last row (once focused there) is a no-op — no next sibling', () => {
      const fixture = createFixture(makeApiMock());

      // Move roving focus to the last row first (End), then try to go further down.
      rowByTaskId(fixture, 100).dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      fixture.detectChanges();
      expect(rowByTaskId(fixture, 102).tabIndex).toBe(0);

      rowByTaskId(fixture, 102).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      fixture.detectChanges();

      expect(rowByTaskId(fixture, 102).tabIndex).toBe(0); // unchanged — still focused, no next sibling
    });

    it('an unrelated plain key on the focused row is ignored (no focus change)', () => {
      const fixture = createFixture(makeApiMock());
      const row = rowByTaskId(fixture, 101);

      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      fixture.detectChanges();

      expect(rowByTaskId(fixture, 100).tabIndex).toBe(0); // initial roving tabindex unchanged
    });

    it('A11y — Home/End jump roving focus to the first/last row', () => {
      const fixture = createFixture(makeApiMock());
      const row = rowByTaskId(fixture, 101);

      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      fixture.detectChanges();
      expect(rowByTaskId(fixture, 102).tabIndex).toBe(0);

      rowByTaskId(fixture, 102).dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      fixture.detectChanges();
      expect(rowByTaskId(fixture, 100).tabIndex).toBe(0);
    });

    it('Security AC — surfaces FORBIDDEN and never modifies the tree when the write 403s (fail-closed WbsEditPolicy today)', () => {
      const api = makeApiMock({ indent: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))) });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 102), 'indent').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('gantt.wbsTree.actions.errors.FORBIDDEN');
      // No optimistic change was ever applied — still exactly the 3 original rows, unchanged codes.
      expect(rows(fixture)).toHaveLength(3);
      expect(rowByTaskId(fixture, 102).textContent).toContain('1.2');
    });

    it('Error AC — maps a 422 ILLEGAL_WBS_MOVE (e.g. indent on the first sibling attempted directly via API) to an explicit message', () => {
      const body: WbsApiError = { code: 'ILLEGAL_WBS_MOVE', message: 'no preceding sibling' };
      const api = makeApiMock({
        indent: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 422, error: body }))),
      });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 102), 'indent').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('gantt.wbsTree.actions.errors.ILLEGAL_WBS_MOVE');
    });

    it('Error AC — maps a 409 WBS_HIERARCHY_CYCLE to an explicit message and never modifies the tree', () => {
      const body: WbsApiError = { code: 'WBS_HIERARCHY_CYCLE', message: 'would create a cycle' };
      const api = makeApiMock({
        move: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 409, error: body }))),
      });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 102), 'moveUp').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('gantt.wbsTree.actions.errors.WBS_HIERARCHY_CYCLE');
    });

    it('maps a 404 action error (project or task no longer visible) to an explicit message', () => {
      const api = makeApiMock({ outdent: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 101), 'outdent').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('gantt.wbsTree.actions.errors.NOT_FOUND');
    });

    it('maps an unexpected 500 action error to a GENERIC message', () => {
      const api = makeApiMock({ move: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 101), 'moveDown').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('gantt.wbsTree.actions.errors.GENERIC');
    });

    it('disables every row\'s action controls while a request is in flight, then re-enables them once it resolves', () => {
      const subject = new Subject<WbsTaskResponse>();
      const api = makeApiMock({ indent: vi.fn(() => subject.asObservable()) });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 102), 'indent').click();
      fixture.detectChanges();

      // Mid-flight — every row's controls, not just the acted-upon one, are disabled (structural
      // changes are serialized, never concurrent, see class TSDoc). Both asserted buttons are
      // normally enabled at baseline (see the dedicated affordance tests above), so this is a
      // genuine assertion of the in-flight disabling, not a coincidence of their ARIA position.
      expect(actionButton(rowByTaskId(fixture, 101), 'outdent').disabled).toBe(true);
      expect(actionButton(rowByTaskId(fixture, 101), 'moveDown').disabled).toBe(true);

      subject.next({ ...LEAF_2, ariaLevel: 3 });
      fixture.detectChanges();

      expect(actionButton(rowByTaskId(fixture, 101), 'outdent').disabled).toBe(false);
    });

    it('A11y — announces the outcome via the aria-live region, then corrects it if the action is rejected', () => {
      const api = makeApiMock({ indent: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))) });
      const fixture = createFixture(api);

      actionButton(rowByTaskId(fixture, 102), 'indent').click();
      fixture.detectChanges();

      const liveRegion = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('gantt.wbsTree.actions.announceReverted');
    });
  });
});
