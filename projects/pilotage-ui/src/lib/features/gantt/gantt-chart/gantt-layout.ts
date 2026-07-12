/**
 * Pure timeline-geometry helpers for {@link GanttChartComponent} — no Angular, no DOM, no I/O, so
 * every layout decision (row placement, bar/milestone positioning, month columns, dependency
 * elbow paths) is unit-testable in isolation. Mirrors the "pure timeline maths beside the
 * component" split used elsewhere in the roadmap views.
 *
 * Nothing here is authoritative domain data: it consumes the backend-derived WBS tree
 * ({@link WbsTaskResponse}, read verbatim — hierarchy/dates/progress are never recomputed) plus the
 * typed dependency list, and returns only *pixel* coordinates for rendering.
 */
import { Dependency } from '../data-access/dependency.models';
import { WbsTaskResponse } from '../data-access/wbs.models';

/** Fixed vertical metrics (px) — kept in sync with `gantt-chart.component.scss`. */
export const GANTT_ROW_H = 52;
export const GANTT_GROUP_H = 32;
export const GANTT_HEAD_H = 44;
export const GANTT_BAR_H = 26;
/** Horizontal scale — a calendar month renders roughly this wide. */
export const GANTT_MONTH_W = 132;
const MS_PER_DAY = 86_400_000;

/** A month column of the timeline header + its background grid line. */
export interface GanttColumn {
  readonly label: string;
  readonly left: number;
  readonly width: number;
}

/** A rendered row — either a phase/summary band or a task/milestone line. Both carry `y`/`height` so the left list and the right timeline stay row-aligned. */
export type GanttRow = GanttGroupRow | GanttTaskRow;

export interface GanttGroupRow {
  readonly type: 'group';
  readonly y: number;
  readonly height: number;
  readonly name: string;
  readonly level: number;
}

export interface GanttTaskRow {
  readonly type: 'task';
  readonly y: number;
  readonly height: number;
  readonly taskId: number;
  readonly name: string;
  readonly isMilestone: boolean;
  /** Localised date label (`"17 août → 28 août"` or a single date for a milestone), or `null` when unscheduled. */
  readonly dateLabel: string | null;
  /** Initials placeholder for the assignee avatar — real assignees pending the backend `assignment` projection (deferred). */
  readonly initials: string | null;
  /** Present when the task has both start & finish — the timeline bar geometry. */
  readonly bar: { readonly left: number; readonly width: number; readonly pct: number } | null;
  /** Present for a milestone with a date — the diamond marker x. */
  readonly marker: { readonly x: number } | null;
  /** Progress label (`"70%"`) or null when untracked. */
  readonly pctLabel: string | null;
}

/** A dependency connector: an elbow poly-line path plus a small arrow-head path. */
export interface GanttDepPath {
  readonly line: string;
  readonly arrow: string;
}

export interface GanttLayout {
  readonly empty: boolean;
  readonly width: number;
  readonly bodyHeight: number;
  readonly columns: readonly GanttColumn[];
  readonly rows: readonly GanttRow[];
  readonly deps: readonly GanttDepPath[];
}

function parseDay(iso: string | null): number | null {
  if (!iso) {
    return null;
  }
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** Milestone/summary dates coincide (start === finish); a bar needs both, a marker needs the single date. */
function taskDates(node: WbsTaskResponse): { start: number | null; finish: number | null } {
  return { start: parseDay(node.startDate), finish: parseDay(node.finishDate) };
}

const MONTH_FMT = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const DAY_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function addMonth(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/**
 * Builds the full pixel layout of the Gantt from the (backend-authoritative) WBS tree and its
 * dependency edges. `SUMMARY` nodes become phase bands; `LEAF`/`RECURRING` become bars; `MILESTONE`
 * becomes a diamond marker. Returns `empty` when no node carries a usable date.
 */
export function buildGanttLayout(nodes: readonly WbsTaskResponse[], deps: readonly Dependency[]): GanttLayout {
  // Time bounds across every dated node.
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const n of nodes) {
    const { start, finish } = taskDates(n);
    for (const v of [start, finish]) {
      if (v !== null) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
  }
  const empty = !Number.isFinite(min) || !Number.isFinite(max);

  const rangeStart = empty ? 0 : startOfMonth(min);
  const rangeEnd = empty ? 0 : addMonth(max);
  const totalDays = Math.max(1, (rangeEnd - rangeStart) / MS_PER_DAY);
  const pxPerDay = GANTT_MONTH_W / 30.4;
  const width = empty ? 0 : Math.round(totalDays * pxPerDay);
  const x = (ms: number): number => Math.round(((ms - rangeStart) / MS_PER_DAY) * pxPerDay);

  // Month columns.
  const columns: GanttColumn[] = [];
  if (!empty) {
    for (let m = rangeStart; m < rangeEnd; m = addMonth(m)) {
      const left = x(m);
      const right = x(addMonth(m));
      columns.push({ label: MONTH_FMT.format(new Date(m)), left, width: right - left });
    }
  }

  // Rows (left list + right timeline, shared y) and a taskId → geometry map for dependencies.
  const rows: GanttRow[] = [];
  const geom = new Map<number, { y: number; startX: number | null; endX: number | null }>();
  let y = 0;
  for (const n of nodes) {
    if (n.nodeKind === 'SUMMARY') {
      rows.push({ type: 'group', y, height: GANTT_GROUP_H, name: n.name, level: n.ariaLevel });
      y += GANTT_GROUP_H;
      continue;
    }
    const { start, finish } = taskDates(n);
    const isMilestone = n.nodeKind === 'MILESTONE';
    let bar: GanttTaskRow['bar'] = null;
    let marker: GanttTaskRow['marker'] = null;
    let dateLabel: string | null = null;
    let startX: number | null = null;
    let endX: number | null = null;

    if (isMilestone && start !== null) {
      marker = { x: x(start) };
      dateLabel = DAY_FMT.format(new Date(start));
      startX = x(start);
      endX = x(start);
    } else if (start !== null && finish !== null) {
      const left = x(start);
      const w = Math.max(8, x(finish) - left);
      const pct = n.percentComplete ?? 0;
      bar = { left, width: w, pct: Math.max(0, Math.min(100, pct)) };
      dateLabel = `${DAY_FMT.format(new Date(start))} → ${DAY_FMT.format(new Date(finish))}`;
      startX = left;
      endX = left + w;
    }

    geom.set(n.taskId, { y: y + GANTT_ROW_H / 2, startX, endX });
    rows.push({
      type: 'task',
      y,
      height: GANTT_ROW_H,
      taskId: n.taskId,
      name: n.name,
      isMilestone,
      dateLabel,
      initials: null,
      bar,
      marker,
      pctLabel: n.progressLabel ?? (bar ? `${bar.pct}%` : null),
    });
    y += GANTT_ROW_H;
  }

  // Dependency elbow connectors (predecessor end → successor start).
  const depPaths: GanttDepPath[] = [];
  for (const dep of deps) {
    const from = geom.get(dep.predecessorTaskId);
    const to = geom.get(dep.successorTaskId);
    if (!from || !to || from.endX === null || to.startX === null) {
      continue;
    }
    const x1 = from.endX;
    const y1 = from.y;
    const x2 = to.startX;
    const y2 = to.y;
    const bend = x1 + 8;
    depPaths.push({
      line: `M${x1} ${y1} H${bend} V${y2} H${x2 - 4}`,
      arrow: `M${x2} ${y2} l-5 -3 v6 z`,
    });
  }

  return { empty, width, bodyHeight: y, columns, rows, deps: depPaths };
}
