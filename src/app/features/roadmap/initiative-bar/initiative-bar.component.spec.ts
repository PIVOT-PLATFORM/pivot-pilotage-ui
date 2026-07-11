import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, it, expect } from 'vitest';
import { InitiativeBarComponent } from './initiative-bar.component';
import { Initiative, InitiativePlacementChange } from '../data-access/roadmap.models';
import { LANE_HEIGHT_PX, QUARTER_WIDTH_PX, buildQuarterAxis } from '../roadmap-timeline';

const QUARTERS = buildQuarterAxis(new Date(Date.UTC(2026, 0, 1)), 8); // Q1 2026 .. Q4 2027
const LANE_IDS = [10, 20, 30];

function makeInitiative(overrides: Partial<Initiative> = {}): Initiative {
  return {
    id: 1,
    laneId: 10,
    name: 'Initiative A',
    fuzzyPeriodStart: '2026-01-01',
    fuzzyPeriodEnd: '2026-03-31', // Q1 2026 -> axis index 0
    temporalPrecision: 'QUARTER',
    revision: 0,
    ...overrides,
  };
}

function pointerEvt(type: string, init: { pointerId: number; clientX: number; clientY: number }): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
}

function keyEvt(key: string, shiftKey = false): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
}

interface Harness {
  fixture: ComponentFixture<InitiativeBarComponent>;
  component: InitiativeBarComponent;
  barEl: HTMLElement;
  emitted: InitiativePlacementChange[];
}

function create(initiative: Initiative = makeInitiative()): Harness {
  TestBed.configureTestingModule({
    imports: [InitiativeBarComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
  });
  const fixture = TestBed.createComponent(InitiativeBarComponent);
  fixture.componentRef.setInput('initiative', initiative);
  fixture.componentRef.setInput('quarters', QUARTERS);
  fixture.componentRef.setInput('laneIds', LANE_IDS);
  const component = fixture.componentInstance;
  const emitted: InitiativePlacementChange[] = [];
  component.placementChange.subscribe(change => emitted.push(change));
  fixture.detectChanges();
  const barEl = (fixture.nativeElement as HTMLElement).querySelector('.rm-bar') as HTMLElement;
  return { fixture, component, barEl, emitted };
}

describe('InitiativeBarComponent', () => {
  it('positions the bar from its fuzzy period and lane (Q1 2026, lane index 0)', () => {
    const { barEl } = create();

    expect(barEl.style.left).toBe('0px');
    expect(barEl.style.width).toBe(`${QUARTER_WIDTH_PX}px`);
    expect(barEl.style.top).toBe('0px');
  });

  it('positions an unplaced initiative (null period) as a single-quarter chip at index 0', () => {
    const { barEl } = create(makeInitiative({ fuzzyPeriodStart: null, fuzzyPeriodEnd: null }));

    expect(barEl.style.left).toBe('0px');
    expect(barEl.style.width).toBe(`${QUARTER_WIDTH_PX}px`);
  });

  it('exposes a focusable, labelled button role for AT and keyboard users', () => {
    const { barEl } = create();

    expect(barEl.getAttribute('role')).toBe('button');
    expect(barEl.getAttribute('tabindex')).toBe('0');
    expect(barEl.getAttribute('aria-label')).toContain('roadmap.board.bar.ariaLabel');
  });

  describe('mouse drag — move', () => {
    it('previews the move live and commits on drop, emitting the resolved placement', () => {
      const { fixture, barEl, emitted } = create();

      barEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 2, clientY: 0 }));
      fixture.detectChanges();

      expect(barEl.classList.contains('rm-bar--dragging')).toBe(true);
      expect(barEl.style.left).toBe(`${QUARTER_WIDTH_PX * 2}px`);

      barEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 2, clientY: 0 }));
      fixture.detectChanges();

      expect(barEl.classList.contains('rm-bar--dragging')).toBe(false);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({ laneId: 10, fuzzyPeriodStart: '2026-07-01', fuzzyPeriodEnd: '2026-09-30' });
    });

    it('moves vertically across lane rows', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: 0, clientY: LANE_HEIGHT_PX }));
      barEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: 0, clientY: LANE_HEIGHT_PX }));

      expect(emitted[0]?.laneId).toBe(20);
    });

    it('clamps the move at the start of the axis (no-op emits nothing)', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: -QUARTER_WIDTH_PX * 5, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: -QUARTER_WIDTH_PX * 5, clientY: 0 }));

      expect(emitted).toHaveLength(0);
    });

    it('does not emit when the pointer is released without any net movement', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }));

      expect(emitted).toHaveLength(0);
    });

    it('aborts without emitting on pointercancel, reverting to the pre-drag placement', () => {
      const { fixture, barEl, emitted } = create();

      barEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 3, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointercancel', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 3, clientY: 0 }));
      fixture.detectChanges();

      expect(barEl.classList.contains('rm-bar--dragging')).toBe(false);
      expect(barEl.style.left).toBe('0px');
      expect(emitted).toHaveLength(0);
    });

    it('ignores pointer events from a different, concurrent pointerId', () => {
      const { fixture, barEl } = create();

      barEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 2, clientX: QUARTER_WIDTH_PX * 3, clientY: 0 }));
      fixture.detectChanges();

      expect(barEl.style.left).toBe('0px');
    });

    it('never hijacks an in-progress gesture from a second, concurrent pointerdown (e.g. a second touch)', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      // A second pointer (e.g. a second finger) tries to start its own gesture — ignored, the
      // first pointer keeps driving the only active drag.
      barEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 2, clientX: 50, clientY: 50 }));
      barEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 2, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 2, clientY: 0 }));

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({ laneId: 10, fuzzyPeriodStart: '2026-07-01', fuzzyPeriodEnd: '2026-09-30' });
    });

    it('aborts without emitting on lostpointercapture, same as pointercancel', () => {
      const { fixture, barEl, emitted } = create();

      barEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 3, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('lostpointercapture', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 3, clientY: 0 }));
      fixture.detectChanges();

      expect(barEl.classList.contains('rm-bar--dragging')).toBe(false);
      expect(barEl.style.left).toBe('0px');
      expect(emitted).toHaveLength(0);
    });
  });

  describe('mouse drag — resize', () => {
    it('resizes from the end handle, keeping the start fixed', () => {
      const { barEl, emitted } = create();
      const endHandle = barEl.querySelector('.rm-bar__handle--end') as HTMLElement;

      endHandle.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      endHandle.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 2, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 2, clientY: 0 }));

      expect(emitted[0]).toEqual({ laneId: 10, fuzzyPeriodStart: '2026-01-01', fuzzyPeriodEnd: '2026-09-30' });
    });

    it('never lets the end handle shrink the bar past its own start', () => {
      const { barEl, emitted } = create(
        makeInitiative({ fuzzyPeriodStart: '2026-01-01', fuzzyPeriodEnd: '2026-09-30' }), // Q1..Q3
      );
      const endHandle = barEl.querySelector('.rm-bar__handle--end') as HTMLElement;

      endHandle.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      endHandle.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: -QUARTER_WIDTH_PX * 5, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: -QUARTER_WIDTH_PX * 5, clientY: 0 }));

      expect(emitted[0]?.fuzzyPeriodEnd).toBe('2026-03-31'); // clamped to the start's own quarter
    });

    it('resizes from the start handle, keeping the end fixed', () => {
      const { barEl, emitted } = create(
        makeInitiative({ fuzzyPeriodStart: '2026-04-01', fuzzyPeriodEnd: '2026-09-30' }), // Q2..Q3
      );
      const startHandle = barEl.querySelector('.rm-bar__handle--start') as HTMLElement;

      startHandle.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      startHandle.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: -QUARTER_WIDTH_PX, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: -QUARTER_WIDTH_PX, clientY: 0 }));

      expect(emitted[0]).toEqual({ laneId: 10, fuzzyPeriodStart: '2026-01-01', fuzzyPeriodEnd: '2026-09-30' });
    });

    it('never lets the start handle push past its own end (clamped back to the original — no-op)', () => {
      const { barEl, emitted } = create(
        makeInitiative({ fuzzyPeriodStart: '2026-04-01', fuzzyPeriodEnd: '2026-06-30' }), // Q2 only
      );
      const startHandle = barEl.querySelector('.rm-bar__handle--start') as HTMLElement;

      startHandle.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      startHandle.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 5, clientY: 0 }));
      barEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 5, clientY: 0 }));

      expect(emitted).toHaveLength(0);
    });
  });

  describe('keyboard (A11y — WCAG 2.1 AA)', () => {
    it('ArrowRight moves the whole bar one quarter forward', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(keyEvt('ArrowRight'));

      expect(emitted[0]).toEqual({ laneId: 10, fuzzyPeriodStart: '2026-04-01', fuzzyPeriodEnd: '2026-06-30' });
    });

    it('ArrowLeft is clamped at the start of the axis (no-op emits nothing)', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(keyEvt('ArrowLeft'));

      expect(emitted).toHaveLength(0);
    });

    it('Shift+ArrowRight grows the end boundary by one quarter', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(keyEvt('ArrowRight', true));

      expect(emitted[0]).toEqual({ laneId: 10, fuzzyPeriodStart: '2026-01-01', fuzzyPeriodEnd: '2026-06-30' });
    });

    it('Shift+ArrowLeft never shrinks the end boundary past the start (no-op emits nothing)', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(keyEvt('ArrowLeft', true));

      expect(emitted).toHaveLength(0);
    });

    it('ArrowDown moves the bar to the next lane row', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(keyEvt('ArrowDown'));

      expect(emitted[0]?.laneId).toBe(20);
    });

    it('ArrowUp is clamped at the first lane row (no-op emits nothing)', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(keyEvt('ArrowUp'));

      expect(emitted).toHaveLength(0);
    });

    it('ignores unrelated keys', () => {
      const { barEl, emitted } = create();

      barEl.dispatchEvent(keyEvt('Enter'));

      expect(emitted).toHaveLength(0);
    });
  });
});
