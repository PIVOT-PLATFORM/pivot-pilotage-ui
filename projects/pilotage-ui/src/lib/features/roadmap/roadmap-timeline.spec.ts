import { describe, it, expect } from 'vitest';
import {
  PERIOD_AXIS_LENGTH,
  PERIOD_WIDTH_PX,
  LANE_HEIGHT_PX,
  RoadmapTimeScale,
  buildTimeAxis,
  dateForPeriodIndex,
  periodIndexForDate,
  pixelsToLaneDelta,
  pixelsToPeriodDelta,
} from './roadmap-timeline';

describe('buildTimeAxis — QUARTER (parity with the fixed axis introduced by US22.3.1)', () => {
  it('starts at the anchor’s own quarter and generates the requested length', () => {
    const axis = buildTimeAxis(new Date(Date.UTC(2026, 1, 15)), 'QUARTER', 4); // Feb 2026 -> Q1 2026

    expect(axis).toHaveLength(4);
    expect(axis[0]).toEqual({ index: 0, startDate: '2026-01-01', endDate: '2026-03-31', label: 'Q1 2026' });
    expect(axis[1]).toEqual({ index: 1, startDate: '2026-04-01', endDate: '2026-06-30', label: 'Q2 2026' });
  });

  it('rolls over into the next year across a Q4 -> Q1 boundary', () => {
    const axis = buildTimeAxis(new Date(Date.UTC(2026, 10, 1)), 'QUARTER', 3); // Nov 2026 -> Q4 2026

    expect(axis[0].label).toBe('Q4 2026');
    expect(axis[1].label).toBe('Q1 2027');
    expect(axis[1].startDate).toBe('2027-01-01');
    expect(axis[2].label).toBe('Q2 2027');
  });

  it('defaults to the 8-quarter (2-year) axis length when none is supplied', () => {
    const axis = buildTimeAxis(new Date(Date.UTC(2026, 0, 1)), 'QUARTER');

    expect(axis).toHaveLength(8);
    expect(axis).toHaveLength(PERIOD_AXIS_LENGTH.QUARTER);
  });
});

describe('buildTimeAxis — MONTH', () => {
  it('starts at the anchor’s own month and generates the requested length', () => {
    const axis = buildTimeAxis(new Date(Date.UTC(2026, 1, 15)), 'MONTH', 3); // Feb 2026

    expect(axis).toHaveLength(3);
    expect(axis[0]).toEqual({ index: 0, startDate: '2026-02-01', endDate: '2026-02-28', label: 'Feb 2026' });
    expect(axis[1]).toEqual({ index: 1, startDate: '2026-03-01', endDate: '2026-03-31', label: 'Mar 2026' });
  });

  it('rolls over into the next year across a Dec -> Jan boundary', () => {
    const axis = buildTimeAxis(new Date(Date.UTC(2026, 11, 1)), 'MONTH', 2); // Dec 2026

    expect(axis[0].label).toBe('Dec 2026');
    expect(axis[1].label).toBe('Jan 2027');
    expect(axis[1].startDate).toBe('2027-01-01');
  });

  it('defaults to the 24-month (2-year) axis length when none is supplied', () => {
    const axis = buildTimeAxis(new Date(Date.UTC(2026, 0, 1)), 'MONTH');

    expect(axis).toHaveLength(24);
    expect(axis).toHaveLength(PERIOD_AXIS_LENGTH.MONTH);
  });
});

describe('buildTimeAxis — SEMESTER', () => {
  it('starts at the anchor’s own semester and generates the requested length, labelled H1/H2', () => {
    const axis = buildTimeAxis(new Date(Date.UTC(2026, 1, 15)), 'SEMESTER', 2); // Feb 2026 -> H1 2026

    expect(axis).toHaveLength(2);
    expect(axis[0]).toEqual({ index: 0, startDate: '2026-01-01', endDate: '2026-06-30', label: 'H1 2026' });
    expect(axis[1]).toEqual({ index: 1, startDate: '2026-07-01', endDate: '2026-12-31', label: 'H2 2026' });
  });

  it('rolls over into the next year across an H2 -> H1 boundary', () => {
    const axis = buildTimeAxis(new Date(Date.UTC(2026, 8, 1)), 'SEMESTER', 2); // Sep 2026 -> H2 2026

    expect(axis[0].label).toBe('H2 2026');
    expect(axis[1].label).toBe('H1 2027');
    expect(axis[1].startDate).toBe('2027-01-01');
  });

  it('defaults to the 4-semester (2-year) axis length when none is supplied', () => {
    const axis = buildTimeAxis(new Date(Date.UTC(2026, 0, 1)), 'SEMESTER');

    expect(axis).toHaveLength(4);
    expect(axis).toHaveLength(PERIOD_AXIS_LENGTH.SEMESTER);
  });
});

describe('periodIndexForDate', () => {
  const axis = buildTimeAxis(new Date(Date.UTC(2026, 0, 1)), 'QUARTER', 4); // Q1..Q4 2026

  it('finds the index of the period containing the date', () => {
    expect(periodIndexForDate('2026-05-15', axis)).toBe(1); // Q2 2026
  });

  it('clamps to the first visible period when the date is before the axis', () => {
    expect(periodIndexForDate('2020-01-01', axis)).toBe(0);
  });

  it('clamps to the last visible period when the date is after the axis', () => {
    expect(periodIndexForDate('2099-01-01', axis)).toBe(3);
  });
});

describe('dateForPeriodIndex', () => {
  const axis = buildTimeAxis(new Date(Date.UTC(2026, 0, 1)), 'QUARTER', 4);

  it('resolves the start boundary of the period at the given index', () => {
    expect(dateForPeriodIndex(1, axis, 'start')).toBe('2026-04-01');
  });

  it('resolves the end boundary of the period at the given index', () => {
    expect(dateForPeriodIndex(1, axis, 'end')).toBe('2026-06-30');
  });

  it('clamps a negative index to the first period', () => {
    expect(dateForPeriodIndex(-3, axis, 'start')).toBe('2026-01-01');
  });

  it('clamps an out-of-range index to the last period', () => {
    expect(dateForPeriodIndex(99, axis, 'end')).toBe('2026-12-31');
  });
});

describe('pixelsToPeriodDelta', () => {
  it('rounds a pixel delta to the nearest whole period-column, for any scale’s own width', () => {
    expect(pixelsToPeriodDelta(PERIOD_WIDTH_PX.QUARTER, PERIOD_WIDTH_PX.QUARTER)).toBe(1);
    expect(pixelsToPeriodDelta(PERIOD_WIDTH_PX.QUARTER * 2.4, PERIOD_WIDTH_PX.QUARTER)).toBe(2);
    expect(pixelsToPeriodDelta(-PERIOD_WIDTH_PX.QUARTER * 1.6, PERIOD_WIDTH_PX.QUARTER)).toBe(-2);
    expect(pixelsToPeriodDelta(10, PERIOD_WIDTH_PX.QUARTER)).toBe(0);
    expect(pixelsToPeriodDelta(PERIOD_WIDTH_PX.MONTH, PERIOD_WIDTH_PX.MONTH)).toBe(1);
  });
});

describe('pixelsToLaneDelta', () => {
  it('rounds a pixel delta to the nearest whole lane-row', () => {
    expect(pixelsToLaneDelta(LANE_HEIGHT_PX, LANE_HEIGHT_PX)).toBe(1);
    expect(pixelsToLaneDelta(-LANE_HEIGHT_PX * 0.4, LANE_HEIGHT_PX)).toBe(0);
    expect(pixelsToLaneDelta(LANE_HEIGHT_PX * 1.6, LANE_HEIGHT_PX)).toBe(2);
  });
});

describe('Error AC — a scale switch never loses or truncates an existing initiative’s stored period', () => {
  const scales: RoadmapTimeScale[] = ['MONTH', 'QUARTER', 'SEMESTER'];
  // Deliberately NOT aligned to any period boundary at any grain — a real "approximate" initiative.
  const initiativeStart = '2026-02-10';
  const initiativeEnd = '2026-02-20';
  const anchor = new Date(Date.UTC(2026, 0, 1));

  it('always resolves a valid, in-range column for the initiative’s stored dates, at every grain', () => {
    for (const scale of scales) {
      const axis = buildTimeAxis(anchor, scale);

      const startIndex = periodIndexForDate(initiativeStart, axis);
      const endIndex = periodIndexForDate(initiativeEnd, axis);

      expect(startIndex).toBeGreaterThanOrEqual(0);
      expect(startIndex).toBeLessThan(axis.length);
      expect(endIndex).toBeGreaterThanOrEqual(0);
      expect(endIndex).toBeLessThan(axis.length);
    }
  });

  it('re-building the same QUARTER axis after having rendered MONTH/SEMESTER in between yields byte-identical cells (idempotent, no drift)', () => {
    const quarterAxisBefore = buildTimeAxis(anchor, 'QUARTER');

    // Simulate the user cycling through the other grains and back — a pure function has no
    // state to accumulate drift in, but this documents/locks in that guarantee explicitly.
    buildTimeAxis(anchor, 'MONTH');
    buildTimeAxis(anchor, 'SEMESTER');
    const quarterAxisAfter = buildTimeAxis(anchor, 'QUARTER');

    expect(quarterAxisAfter).toEqual(quarterAxisBefore);
  });
});
