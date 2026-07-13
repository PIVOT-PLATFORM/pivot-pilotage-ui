/**
 * Pure geometry helpers mapping the roadmap-rapide board's fixed time axis to pixel offsets and
 * back — no Angular/DOM dependency, fully unit-testable in isolation (mirrors
 * `pivot-collaboratif-ui`'s `canvas-geometry.ts` pattern for `WhiteboardCanvasComponent`).
 *
 * US22.3.1 ("Créer une roadmap rapide") hard-coded a fixed QUARTER axis. US22.3.2 ("Échelle de
 * temps floue") is exactly what generalizes that fixed grain into a user-chosen one
 * (month/quarter/semester) — this module now builds the axis for whichever grain is selected,
 * still spanning a fixed ~2-year window around "today" so the board always has a concrete axis to
 * render and drag against.
 *
 * **This is a display-only projection.** Building an axis at a different grain never reads or
 * writes an `Initiative`'s stored `fuzzyPeriodStart`/`fuzzyPeriodEnd` — those ISO dates are the
 * single source of truth (EN22.1's "modèle temporel unique") and are left untouched by a scale
 * switch; only the axis cells used to *position* them on screen change. See
 * `RoadmapBoardComponent`/`RoadmapTimeScaleService` for how the chosen grain is picked and
 * persisted.
 */

import type { TemporalPrecision } from './data-access/roadmap.models';

/**
 * Time-axis grain the user can pick for the board's own axis rendering (US22.3.2). A view-only
 * rendering setting — see `RoadmapTimeScaleService` — completely distinct from
 * {@link TemporalPrecision} (`roadmap.models.ts`), which is a per-*initiative* backend field
 * describing how precisely that one initiative's own dates are known. Deliberately a subset of
 * that same enum (`Extract`) so the literal strings can never drift apart, restricted to the
 * three grains in scope here — `WEEK`/`DAY` belong to the detailed Gantt (F22.4), explicitly out
 * of scope (see this US's backlog file, "Hors périmètre").
 */
export type RoadmapTimeScale = Extract<TemporalPrecision, 'MONTH' | 'QUARTER' | 'SEMESTER'>;

/** One column of the board's time axis, at whichever grain is currently selected. */
export interface PeriodCell {
  /** 0-based offset from the axis start. */
  readonly index: number;
  /** First day of the period, ISO `yyyy-MM-dd`. */
  readonly startDate: string;
  /** Last day of the period, ISO `yyyy-MM-dd`. */
  readonly endDate: string;
  /** Display label, e.g. `"Q1 2026"`, `"Jan 2026"`, `"H1 2026"`. */
  readonly label: string;
}

/** How many calendar months make up one column, per grain. */
const MONTHS_PER_PERIOD: Record<RoadmapTimeScale, number> = {
  MONTH: 1,
  QUARTER: 3,
  SEMESTER: 6,
};

/**
 * Number of periods rendered on the board's fixed axis, per grain — chosen so every grain spans
 * the same ~2-year window regardless of how finely/coarsely it slices it up.
 */
export const PERIOD_AXIS_LENGTH: Record<RoadmapTimeScale, number> = {
  MONTH: 24,
  QUARTER: 8,
  SEMESTER: 4,
};

/** Pixel width of a single period column, per grain — narrower for MONTH, wider for SEMESTER. */
export const PERIOD_WIDTH_PX: Record<RoadmapTimeScale, number> = {
  MONTH: 64,
  QUARTER: 96,
  SEMESTER: 144,
};

/** Pixel height of a single lane row (used to translate a vertical drag into a lane change) — independent of the time scale. */
export const LANE_HEIGHT_PX = 64;

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Builds a column's display label for a given grain. Deliberately **not** run through Transloco —
 * mirrors this file's own pre-existing "Q1 2026" convention (US22.3.1): these are data labels
 * produced by a pure, Angular-free module, not UI copy. `H1`/`H2` for semesters matches the
 * notation this US's own backlog file uses ("« H1/H2 »").
 */
function periodLabel(scale: RoadmapTimeScale, periodOfYear0: number, year: number): string {
  switch (scale) {
    case 'MONTH':
      return `${MONTH_ABBREVIATIONS[periodOfYear0]} ${year}`;
    case 'SEMESTER':
      return `H${periodOfYear0 + 1} ${year}`;
    case 'QUARTER':
    default:
      return `Q${periodOfYear0 + 1} ${year}`;
  }
}

function periodStartDate(year: number, periodOfYear0: number, monthsPerPeriod: number): Date {
  return new Date(Date.UTC(year, periodOfYear0 * monthsPerPeriod, 1));
}

function periodEndDate(year: number, periodOfYear0: number, monthsPerPeriod: number): Date {
  // Day 0 of the month right after the period's last month = that period's own last day.
  return new Date(Date.UTC(year, periodOfYear0 * monthsPerPeriod + monthsPerPeriod, 0));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the board's fixed time axis at the given grain, starting at `anchor`'s own period.
 *
 * @param anchor typically "today" — see `RoadmapBoardComponent`
 * @param scale the grain to slice the axis into (month/quarter/semester)
 * @param length number of periods to generate (default {@link PERIOD_AXIS_LENGTH} for `scale`)
 */
export function buildTimeAxis(
  anchor: Date,
  scale: RoadmapTimeScale,
  length: number = PERIOD_AXIS_LENGTH[scale],
): PeriodCell[] {
  const monthsPerPeriod = MONTHS_PER_PERIOD[scale];
  const periodsPerYear = 12 / monthsPerPeriod;
  const anchorPeriodOfYear0 = Math.floor(anchor.getUTCMonth() / monthsPerPeriod);
  const anchorYear = anchor.getUTCFullYear();
  const cells: PeriodCell[] = [];

  for (let i = 0; i < length; i++) {
    const absolutePeriod = anchorPeriodOfYear0 + i;
    const year = anchorYear + Math.floor(absolutePeriod / periodsPerYear);
    const periodOfYear0 = ((absolutePeriod % periodsPerYear) + periodsPerYear) % periodsPerYear;
    cells.push({
      index: i,
      startDate: toIsoDate(periodStartDate(year, periodOfYear0, monthsPerPeriod)),
      endDate: toIsoDate(periodEndDate(year, periodOfYear0, monthsPerPeriod)),
      label: periodLabel(scale, periodOfYear0, year),
    });
  }

  return cells;
}

/**
 * Finds the axis index whose period contains `date`. An out-of-window date clamps to the nearest
 * visible edge rather than being rejected — this US's "approximate period" altitude never needs
 * to reject a value outside the rendered window, it just clamps into view. This also guarantees a
 * scale switch never "loses" an initiative: whatever the grain, some column always claims it.
 */
export function periodIndexForDate(date: string, periods: readonly PeriodCell[]): number {
  const found = periods.find(p => date >= p.startDate && date <= p.endDate);
  if (found) {
    return found.index;
  }
  return date < periods[0].startDate ? periods[0].index : periods[periods.length - 1].index;
}

/** Resolves the ISO date for the start or end boundary of the period at `index` (clamped to the axis). */
export function dateForPeriodIndex(
  index: number,
  periods: readonly PeriodCell[],
  boundary: 'start' | 'end',
): string {
  const clamped = Math.min(Math.max(index, 0), periods.length - 1);
  return boundary === 'start' ? periods[clamped].startDate : periods[clamped].endDate;
}

/** Converts a horizontal pixel delta (mouse drag) into a whole number of period-columns, rounded to nearest. */
export function pixelsToPeriodDelta(deltaPx: number, periodWidthPx: number): number {
  // `|| 0` normalizes `Math.round`'s `-0` (e.g. rounding -25.6px) to plain `0` — a delta of zero
  // should never be observably distinct from its own negation to any caller of this function.
  return Math.round(deltaPx / periodWidthPx) || 0;
}

/** Converts a vertical pixel delta (mouse drag) into a whole number of lane-rows, rounded to nearest. */
export function pixelsToLaneDelta(deltaPx: number, laneHeightPx: number = LANE_HEIGHT_PX): number {
  return Math.round(deltaPx / laneHeightPx) || 0;
}
