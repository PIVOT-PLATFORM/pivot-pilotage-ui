import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, it, expect } from 'vitest';
import { MilestoneMarkerComponent } from './milestone-marker.component';
import { Milestone, MilestoneDateChange } from '../data-access/roadmap.models';
import { PERIOD_WIDTH_PX, buildTimeAxis } from '../roadmap-timeline';

const QUARTER_WIDTH_PX = PERIOD_WIDTH_PX.QUARTER;
const QUARTERS = buildTimeAxis(new Date(Date.UTC(2026, 0, 1)), 'QUARTER', 8); // Q1 2026 .. Q4 2027

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 1,
    laneId: null,
    name: 'Go/No-Go',
    date: '2026-02-15', // Q1 2026 -> axis index 0
    temporalPrecision: 'DAY',
    revision: 0,
    ...overrides,
  };
}

function pointerEvt(type: string, init: { pointerId: number; clientX: number; clientY: number }): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
}

function keyEvt(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
}

interface Harness {
  fixture: ComponentFixture<MilestoneMarkerComponent>;
  component: MilestoneMarkerComponent;
  markerEl: HTMLElement;
  emitted: MilestoneDateChange[];
}

function create(milestone: Milestone = makeMilestone(), laneName: string | null = null): Harness {
  TestBed.configureTestingModule({
    imports: [MilestoneMarkerComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
  });
  const fixture = TestBed.createComponent(MilestoneMarkerComponent);
  fixture.componentRef.setInput('milestone', milestone);
  fixture.componentRef.setInput('periods', QUARTERS);
  fixture.componentRef.setInput('laneName', laneName);
  const component = fixture.componentInstance;
  const emitted: MilestoneDateChange[] = [];
  component.dateChange.subscribe(change => emitted.push(change));
  fixture.detectChanges();
  const markerEl = (fixture.nativeElement as HTMLElement).querySelector('.rm-milestone') as HTMLElement;
  return { fixture, component, markerEl, emitted };
}

describe('MilestoneMarkerComponent', () => {
  it('positions the marker from its date (Q1 2026 -> axis index 0)', () => {
    const { markerEl } = create();

    expect(markerEl.style.left).toBe('0px');
  });

  it('positions an undated milestone (null date) at axis index 0, defensively — never mis-rendered as "today"', () => {
    const { markerEl } = create(makeMilestone({ date: null }));

    expect(markerEl.style.left).toBe('0px');
  });

  it('renders a distinct diamond icon alongside the visible name — A11y AC: not color alone', () => {
    const { fixture } = create();

    const icon = (fixture.nativeElement as HTMLElement).querySelector('.rm-milestone__icon');
    const label = (fixture.nativeElement as HTMLElement).querySelector('.rm-milestone__label');

    expect(icon).not.toBeNull();
    expect(icon?.tagName.toLowerCase()).toBe('svg');
    expect(label?.textContent).toContain('Go/No-Go');
  });

  it('exposes a focusable, labelled button role for AT and keyboard users', () => {
    const { markerEl } = create();

    expect(markerEl.getAttribute('role')).toBe('button');
    expect(markerEl.getAttribute('tabindex')).toBe('0');
    expect(markerEl.getAttribute('aria-label')).toContain('roadmap.board.milestones.marker.ariaLabel');
  });

  it('uses the lane-aware aria-label when a lane name is supplied', () => {
    const { markerEl } = create(makeMilestone({ laneId: 10 }), 'Thème A');

    expect(markerEl.getAttribute('aria-label')).toContain('roadmap.board.milestones.marker.ariaLabelWithLane');
  });

  describe('mouse drag — horizontal only (a milestone is punctual, no resize handles)', () => {
    it('previews the move live and commits on drop, emitting the resolved date', () => {
      const { fixture, markerEl, emitted } = create();

      markerEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 2, clientY: 0 }));
      fixture.detectChanges();

      expect(markerEl.classList.contains('rm-milestone--dragging')).toBe(true);
      expect(markerEl.style.left).toBe(`${QUARTER_WIDTH_PX * 2}px`);

      markerEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 2, clientY: 0 }));
      fixture.detectChanges();

      expect(markerEl.classList.contains('rm-milestone--dragging')).toBe(false);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({ date: '2026-07-01' }); // Q3 2026 start
    });

    it('clamps the move at the start of the axis (no-op emits nothing)', () => {
      const { markerEl, emitted } = create();

      markerEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: -QUARTER_WIDTH_PX * 5, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: -QUARTER_WIDTH_PX * 5, clientY: 0 }));

      expect(emitted).toHaveLength(0);
    });

    it('does not emit when the pointer is released without any net movement', () => {
      const { markerEl, emitted } = create();

      markerEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: 0, clientY: 0 }));

      expect(emitted).toHaveLength(0);
    });

    it('aborts without emitting on pointercancel, reverting to the pre-drag position', () => {
      const { fixture, markerEl, emitted } = create();

      markerEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 3, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointercancel', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 3, clientY: 0 }));
      fixture.detectChanges();

      expect(markerEl.classList.contains('rm-milestone--dragging')).toBe(false);
      expect(markerEl.style.left).toBe('0px');
      expect(emitted).toHaveLength(0);
    });

    it('aborts without emitting on lostpointercapture, same as pointercancel', () => {
      const { fixture, markerEl, emitted } = create();

      markerEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 3, clientY: 0 }));
      markerEl.dispatchEvent(
        pointerEvt('lostpointercapture', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 3, clientY: 0 }),
      );
      fixture.detectChanges();

      expect(markerEl.classList.contains('rm-milestone--dragging')).toBe(false);
      expect(markerEl.style.left).toBe('0px');
      expect(emitted).toHaveLength(0);
    });

    it('never hijacks an in-progress gesture from a second, concurrent pointerdown', () => {
      const { markerEl, emitted } = create();

      markerEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 2, clientX: 50, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 2, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: QUARTER_WIDTH_PX * 2, clientY: 0 }));

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({ date: '2026-07-01' });
    });

    it('ignores pointer events from a different, concurrent pointerId', () => {
      const { fixture, markerEl } = create();

      markerEl.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      markerEl.dispatchEvent(pointerEvt('pointermove', { pointerId: 2, clientX: QUARTER_WIDTH_PX * 3, clientY: 0 }));
      fixture.detectChanges();

      expect(markerEl.style.left).toBe('0px');
    });
  });

  describe('keyboard (A11y — WCAG 2.1 AA)', () => {
    it('ArrowRight moves the marker one quarter forward', () => {
      const { markerEl, emitted } = create();

      markerEl.dispatchEvent(keyEvt('ArrowRight'));

      expect(emitted[0]).toEqual({ date: '2026-04-01' }); // Q2 2026 start
    });

    it('ArrowLeft is clamped at the start of the axis (no-op emits nothing)', () => {
      const { markerEl, emitted } = create();

      markerEl.dispatchEvent(keyEvt('ArrowLeft'));

      expect(emitted).toHaveLength(0);
    });

    it('has no lane-change or resize keys — a milestone is punctual and re-laned only at creation', () => {
      const { markerEl, emitted } = create();

      markerEl.dispatchEvent(keyEvt('ArrowUp'));
      markerEl.dispatchEvent(keyEvt('ArrowDown'));

      expect(emitted).toHaveLength(0);
    });

    it('ignores unrelated keys', () => {
      const { markerEl, emitted } = create();

      markerEl.dispatchEvent(keyEvt('Enter'));

      expect(emitted).toHaveLength(0);
    });
  });
});
