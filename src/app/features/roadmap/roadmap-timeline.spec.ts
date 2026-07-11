import { describe, it, expect } from 'vitest';
import {
  QUARTER_WIDTH_PX,
  LANE_HEIGHT_PX,
  buildQuarterAxis,
  dateForQuarterIndex,
  pixelsToLaneDelta,
  pixelsToQuarterDelta,
  quarterIndexForDate,
} from './roadmap-timeline';

describe('buildQuarterAxis', () => {
  it('starts at the anchor’s own quarter and generates the requested length', () => {
    const axis = buildQuarterAxis(new Date(Date.UTC(2026, 1, 15)), 4); // Feb 2026 -> Q1 2026

    expect(axis).toHaveLength(4);
    expect(axis[0]).toEqual({ index: 0, startDate: '2026-01-01', endDate: '2026-03-31', label: 'Q1 2026' });
    expect(axis[1]).toEqual({ index: 1, startDate: '2026-04-01', endDate: '2026-06-30', label: 'Q2 2026' });
  });

  it('rolls over into the next year across a Q4 -> Q1 boundary', () => {
    const axis = buildQuarterAxis(new Date(Date.UTC(2026, 10, 1)), 3); // Nov 2026 -> Q4 2026

    expect(axis[0].label).toBe('Q4 2026');
    expect(axis[1].label).toBe('Q1 2027');
    expect(axis[1].startDate).toBe('2027-01-01');
    expect(axis[2].label).toBe('Q2 2027');
  });

  it('defaults to the 8-quarter (2-year) axis length when none is supplied', () => {
    const axis = buildQuarterAxis(new Date(Date.UTC(2026, 0, 1)));

    expect(axis).toHaveLength(8);
  });
});

describe('quarterIndexForDate', () => {
  const axis = buildQuarterAxis(new Date(Date.UTC(2026, 0, 1)), 4); // Q1..Q4 2026

  it('finds the index of the quarter containing the date', () => {
    expect(quarterIndexForDate('2026-05-15', axis)).toBe(1); // Q2 2026
  });

  it('clamps to the first visible quarter when the date is before the axis', () => {
    expect(quarterIndexForDate('2020-01-01', axis)).toBe(0);
  });

  it('clamps to the last visible quarter when the date is after the axis', () => {
    expect(quarterIndexForDate('2099-01-01', axis)).toBe(3);
  });
});

describe('dateForQuarterIndex', () => {
  const axis = buildQuarterAxis(new Date(Date.UTC(2026, 0, 1)), 4);

  it('resolves the start boundary of the quarter at the given index', () => {
    expect(dateForQuarterIndex(1, axis, 'start')).toBe('2026-04-01');
  });

  it('resolves the end boundary of the quarter at the given index', () => {
    expect(dateForQuarterIndex(1, axis, 'end')).toBe('2026-06-30');
  });

  it('clamps a negative index to the first quarter', () => {
    expect(dateForQuarterIndex(-3, axis, 'start')).toBe('2026-01-01');
  });

  it('clamps an out-of-range index to the last quarter', () => {
    expect(dateForQuarterIndex(99, axis, 'end')).toBe('2026-12-31');
  });
});

describe('pixelsToQuarterDelta', () => {
  it('rounds a pixel delta to the nearest whole quarter-column', () => {
    expect(pixelsToQuarterDelta(QUARTER_WIDTH_PX, QUARTER_WIDTH_PX)).toBe(1);
    expect(pixelsToQuarterDelta(QUARTER_WIDTH_PX * 2.4, QUARTER_WIDTH_PX)).toBe(2);
    expect(pixelsToQuarterDelta(-QUARTER_WIDTH_PX * 1.6, QUARTER_WIDTH_PX)).toBe(-2);
    expect(pixelsToQuarterDelta(10, QUARTER_WIDTH_PX)).toBe(0);
  });
});

describe('pixelsToLaneDelta', () => {
  it('rounds a pixel delta to the nearest whole lane-row', () => {
    expect(pixelsToLaneDelta(LANE_HEIGHT_PX, LANE_HEIGHT_PX)).toBe(1);
    expect(pixelsToLaneDelta(-LANE_HEIGHT_PX * 0.4, LANE_HEIGHT_PX)).toBe(0);
    expect(pixelsToLaneDelta(LANE_HEIGHT_PX * 1.6, LANE_HEIGHT_PX)).toBe(2);
  });
});
