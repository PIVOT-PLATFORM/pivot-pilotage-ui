/**
 * Pure geometry helpers mapping the roadmap-rapide board's fixed quarter axis to pixel offsets
 * and back — no Angular/DOM dependency, fully unit-testable in isolation (mirrors
 * `pivot-collaboratif-ui`'s `canvas-geometry.ts` pattern for `WhiteboardCanvasComponent`).
 *
 * US22.3.2 ("Échelle de temps floue") owns letting the user pick the month/quarter/semester
 * grain — explicitly out of scope for US22.3.1 (see its backlog file's "Hors périmètre"). This
 * module hard-codes a fixed QUARTER axis (the backend's own default `temporalPrecision` for a
 * roadmap-rapide initiative, see `CreateInitiativeRequest` JavaDoc on `pivot-pilotage-core`)
 * spanning a fixed window around "today", so the board has a concrete axis to render and drag
 * against today, with zero contract change expected when US22.3.2 lands.
 */

/** One column of the board's fixed time axis. */
export interface QuarterCell {
  /** 0-based offset from the axis start. */
  readonly index: number;
  /** First day of the quarter, ISO `yyyy-MM-dd`. */
  readonly startDate: string;
  /** Last day of the quarter, ISO `yyyy-MM-dd`. */
  readonly endDate: string;
  /** Display label, e.g. `"Q1 2026"`. */
  readonly label: string;
}

/** Number of quarters rendered on the board's fixed axis (2 years). */
export const QUARTER_AXIS_LENGTH = 8;

/** Pixel width of a single quarter column. */
export const QUARTER_WIDTH_PX = 96;

/** Pixel height of a single lane row (used to translate a vertical drag into a lane change). */
export const LANE_HEIGHT_PX = 64;

function quarterStartDate(year: number, quarterIndex0: number): Date {
  return new Date(Date.UTC(year, quarterIndex0 * 3, 1));
}

function quarterEndDate(year: number, quarterIndex0: number): Date {
  // Day 0 of the month right after the quarter's last month = that quarter's own last day.
  return new Date(Date.UTC(year, quarterIndex0 * 3 + 3, 0));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the board's fixed quarter axis, starting at `anchor`'s own quarter.
 *
 * @param anchor typically "today" — see `RoadmapBoardComponent`
 * @param length number of quarters to generate (default {@link QUARTER_AXIS_LENGTH})
 */
export function buildQuarterAxis(anchor: Date, length: number = QUARTER_AXIS_LENGTH): QuarterCell[] {
  const anchorQuarter0 = Math.floor(anchor.getUTCMonth() / 3);
  const anchorYear = anchor.getUTCFullYear();
  const cells: QuarterCell[] = [];

  for (let i = 0; i < length; i++) {
    const absoluteQuarter = anchorQuarter0 + i;
    const year = anchorYear + Math.floor(absoluteQuarter / 4);
    const quarter0 = ((absoluteQuarter % 4) + 4) % 4;
    cells.push({
      index: i,
      startDate: toIsoDate(quarterStartDate(year, quarter0)),
      endDate: toIsoDate(quarterEndDate(year, quarter0)),
      label: `Q${quarter0 + 1} ${year}`,
    });
  }

  return cells;
}

/**
 * Finds the axis index whose quarter contains `date`. An out-of-window date clamps to the
 * nearest visible edge rather than being rejected — this US's "approximate period" altitude
 * never needs to reject a value outside the rendered window, it just clamps into view.
 */
export function quarterIndexForDate(date: string, quarters: readonly QuarterCell[]): number {
  const found = quarters.find(q => date >= q.startDate && date <= q.endDate);
  if (found) {
    return found.index;
  }
  return date < quarters[0].startDate ? quarters[0].index : quarters[quarters.length - 1].index;
}

/** Resolves the ISO date for the start or end boundary of the quarter at `index` (clamped to the axis). */
export function dateForQuarterIndex(
  index: number,
  quarters: readonly QuarterCell[],
  boundary: 'start' | 'end',
): string {
  const clamped = Math.min(Math.max(index, 0), quarters.length - 1);
  return boundary === 'start' ? quarters[clamped].startDate : quarters[clamped].endDate;
}

/** Converts a horizontal pixel delta (mouse drag) into a whole number of quarter-columns, rounded to nearest. */
export function pixelsToQuarterDelta(deltaPx: number, quarterWidthPx: number = QUARTER_WIDTH_PX): number {
  // `|| 0` normalizes `Math.round`'s `-0` (e.g. rounding -25.6px) to plain `0` — a delta of zero
  // should never be observably distinct from its own negation to any caller of this function.
  return Math.round(deltaPx / quarterWidthPx) || 0;
}

/** Converts a vertical pixel delta (mouse drag) into a whole number of lane-rows, rounded to nearest. */
export function pixelsToLaneDelta(deltaPx: number, laneHeightPx: number = LANE_HEIGHT_PX): number {
  return Math.round(deltaPx / laneHeightPx) || 0;
}
