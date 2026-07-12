import { describe, it, expect } from 'vitest';
import { Dependency } from '../data-access/dependency.models';
import { WbsTaskResponse } from '../data-access/wbs.models';
import { GANTT_GROUP_H, GANTT_ROW_H, GanttTaskRow, buildGanttLayout } from './gantt-layout';

/** Minimal WBS node factory — only the fields {@link buildGanttLayout} reads. */
function node(partial: Partial<WbsTaskResponse> & Pick<WbsTaskResponse, 'taskId' | 'name' | 'nodeKind'>): WbsTaskResponse {
  return {
    parentTaskId: null,
    wbsCode: '',
    nodeKindLabel: '',
    position: 0,
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
    ariaSetSize: 1,
    ariaPosInSet: 1,
    ariaReadOnly: false,
    revision: 0,
    ...partial,
  };
}

describe('buildGanttLayout', () => {
  it('returns an empty layout when no node carries a date', () => {
    const layout = buildGanttLayout([node({ taskId: 1, name: 'x', nodeKind: 'LEAF' })], []);
    expect(layout.empty).toBe(true);
    expect(layout.width).toBe(0);
    expect(layout.columns).toHaveLength(0);
  });

  it('renders SUMMARY as a group band and LEAF as a positioned bar with progress', () => {
    const nodes = [
      node({ taskId: 1, name: 'Phase', nodeKind: 'SUMMARY' }),
      node({
        taskId: 2,
        name: 'Tâche',
        nodeKind: 'LEAF',
        startDate: '2026-01-05T00:00:00Z',
        finishDate: '2026-01-15T00:00:00Z',
        percentComplete: 40,
        progressLabel: '40%',
      }),
    ];
    const layout = buildGanttLayout(nodes, []);
    expect(layout.empty).toBe(false);

    const group = layout.rows[0];
    expect(group.type).toBe('group');
    expect(group.height).toBe(GANTT_GROUP_H);

    const task = layout.rows[1] as GanttTaskRow;
    expect(task.type).toBe('task');
    expect(task.height).toBe(GANTT_ROW_H);
    expect(task.y).toBe(GANTT_GROUP_H); // sous la bande de groupe
    expect(task.bar).not.toBeNull();
    expect(task.bar!.left).toBeGreaterThanOrEqual(0);
    expect(task.bar!.width).toBeGreaterThanOrEqual(8);
    expect(task.bar!.pct).toBe(40);
    expect(task.pctLabel).toBe('40%');
    expect(task.marker).toBeNull();
    expect(task.dateLabel).toContain('→');
  });

  it('clamps out-of-range progress and falls back to a computed pct label', () => {
    const layout = buildGanttLayout(
      [
        node({
          taskId: 3,
          name: 'Over',
          nodeKind: 'LEAF',
          startDate: '2026-02-01T00:00:00Z',
          finishDate: '2026-02-02T00:00:00Z',
          percentComplete: 250,
        }),
      ],
      [],
    );
    const task = layout.rows.find((r): r is GanttTaskRow => r.type === 'task')!;
    expect(task.bar!.pct).toBe(100);
    expect(task.pctLabel).toBe('100%');
  });

  it('renders a MILESTONE as a marker (no bar) at its date', () => {
    const layout = buildGanttLayout(
      [node({ taskId: 4, name: 'Jalon', nodeKind: 'MILESTONE', startDate: '2026-03-01T00:00:00Z', finishDate: '2026-03-01T00:00:00Z' })],
      [],
    );
    const task = layout.rows.find((r): r is GanttTaskRow => r.type === 'task')!;
    expect(task.isMilestone).toBe(true);
    expect(task.bar).toBeNull();
    expect(task.marker).not.toBeNull();
    expect(task.dateLabel).not.toContain('→');
  });

  it('renders a task with no dates as a row without bar or marker', () => {
    const layout = buildGanttLayout(
      [
        node({ taskId: 5, name: 'Daté', nodeKind: 'LEAF', startDate: '2026-04-01T00:00:00Z', finishDate: '2026-04-03T00:00:00Z' }),
        node({ taskId: 6, name: 'Non daté', nodeKind: 'LEAF' }),
      ],
      [],
    );
    const unscheduled = layout.rows.find((r): r is GanttTaskRow => r.type === 'task' && r.taskId === 6)!;
    expect(unscheduled.bar).toBeNull();
    expect(unscheduled.marker).toBeNull();
    expect(unscheduled.dateLabel).toBeNull();
  });

  it('builds one month column per calendar month spanned', () => {
    const layout = buildGanttLayout(
      [node({ taskId: 7, name: 't', nodeKind: 'LEAF', startDate: '2026-01-10T00:00:00Z', finishDate: '2026-03-20T00:00:00Z' })],
      [],
    );
    // janv, févr, mars
    expect(layout.columns).toHaveLength(3);
    expect(layout.columns[0].left).toBe(0);
    layout.columns.forEach((c) => expect(c.width).toBeGreaterThan(0));
  });

  it('emits an elbow connector + arrow for a dependency between two dated tasks', () => {
    const nodes = [
      node({ taskId: 10, name: 'A', nodeKind: 'LEAF', startDate: '2026-01-01T00:00:00Z', finishDate: '2026-01-05T00:00:00Z' }),
      node({ taskId: 11, name: 'B', nodeKind: 'LEAF', startDate: '2026-01-10T00:00:00Z', finishDate: '2026-01-15T00:00:00Z' }),
    ];
    const deps: Dependency[] = [{ dependencyId: 1, predecessorTaskId: 10, successorTaskId: 11, linkType: 'FS', lagMinutes: 0 }];
    const layout = buildGanttLayout(nodes, deps);
    expect(layout.deps).toHaveLength(1);
    expect(layout.deps[0].line).toMatch(/^M[\d.]+ [\d.]+ H/);
    expect(layout.deps[0].arrow).toContain('l-5 -3');
  });

  it('skips a dependency when an endpoint is unknown or unscheduled', () => {
    const nodes = [node({ taskId: 20, name: 'A', nodeKind: 'LEAF', startDate: '2026-01-01T00:00:00Z', finishDate: '2026-01-05T00:00:00Z' })];
    const deps: Dependency[] = [
      { dependencyId: 1, predecessorTaskId: 20, successorTaskId: 999, linkType: 'FS', lagMinutes: 0 },
    ];
    expect(buildGanttLayout(nodes, deps).deps).toHaveLength(0);
  });
});
