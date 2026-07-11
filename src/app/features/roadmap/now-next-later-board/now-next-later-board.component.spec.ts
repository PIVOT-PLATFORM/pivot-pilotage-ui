import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NowNextLaterBoardComponent } from './now-next-later-board.component';
import { HorizonViewResponse, Initiative, InitiativeHorizonChange } from '../data-access/roadmap.models';

const INITIATIVE_NOW: Initiative = {
  id: 1,
  laneId: 10,
  name: 'Initiative Now',
  fuzzyPeriodStart: null,
  fuzzyPeriodEnd: null,
  temporalPrecision: 'QUARTER',
  revision: 0,
  horizon: 'NOW',
};
const INITIATIVE_NEXT: Initiative = { ...INITIATIVE_NOW, id: 2, name: 'Initiative Next', horizon: 'NEXT' };
const INITIATIVE_LATER: Initiative = { ...INITIATIVE_NOW, id: 3, name: 'Initiative Later', horizon: 'LATER' };
const INITIATIVE_UNBUCKETED: Initiative = { ...INITIATIVE_NOW, id: 4, name: 'Initiative Untriaged', horizon: null };

function makeView(
  overrides: Partial<{ now: Initiative[]; next: Initiative[]; later: Initiative[]; unbucketed: Initiative[] }> = {},
): HorizonViewResponse {
  return {
    buckets: [
      { horizon: 'NOW', initiatives: overrides.now ?? [INITIATIVE_NOW] },
      { horizon: 'NEXT', initiatives: overrides.next ?? [INITIATIVE_NEXT] },
      { horizon: 'LATER', initiatives: overrides.later ?? [INITIATIVE_LATER] },
    ],
    unbucketed: overrides.unbucketed ?? [],
  };
}

function pointerEvt(type: string, init: { pointerId: number; clientX: number; clientY: number }): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
}

function keyEvt(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
}

interface Harness {
  fixture: ComponentFixture<NowNextLaterBoardComponent>;
  component: NowNextLaterBoardComponent;
  emitted: InitiativeHorizonChange[];
}

function create(view: HorizonViewResponse = makeView()): Harness {
  TestBed.configureTestingModule({
    imports: [NowNextLaterBoardComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
  });
  const fixture = TestBed.createComponent(NowNextLaterBoardComponent);
  fixture.componentRef.setInput('view', view);
  const component = fixture.componentInstance;
  const emitted: InitiativeHorizonChange[] = [];
  component.horizonChange.subscribe(change => emitted.push(change));
  fixture.detectChanges();
  return { fixture, component, emitted };
}

function columnEl(fixture: ComponentFixture<NowNextLaterBoardComponent>, marker: string): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-nnl-column="${marker}"]`) as HTMLElement;
}

function cardEl(fixture: ComponentFixture<NowNextLaterBoardComponent>, name: string): HTMLElement {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.nnl-card')).find(
    el => el.textContent?.trim() === name,
  ) as HTMLElement;
}

/** Defines `document.elementFromPoint` (absent entirely from jsdom, unlike a real browser) to return a fixed element, simulating hit-testing the drop point. */
function mockElementFromPoint(element: Element | null): void {
  Object.defineProperty(document, 'elementFromPoint', {
    value: () => element,
    configurable: true,
    writable: true,
  });
}

describe('NowNextLaterBoardComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering (AC1 — bascule vers une vue en 3 colonnes)', () => {
    it('renders the three real buckets as labelled columns, each with its initiatives', () => {
      const { fixture } = create();

      expect(columnEl(fixture, 'NOW').textContent).toContain('Initiative Now');
      expect(columnEl(fixture, 'NEXT').textContent).toContain('Initiative Next');
      expect(columnEl(fixture, 'LATER').textContent).toContain('Initiative Later');
    });

    it('shows an empty-bucket message when a column has no initiatives', () => {
      const { fixture } = create(makeView({ next: [] }));

      expect(columnEl(fixture, 'NEXT').querySelector('.nnl-column__empty')).not.toBeNull();
    });

    it('never renders the untriaged column when there is nothing unbucketed', () => {
      const { fixture } = create();

      expect(columnEl(fixture, 'UNBUCKETED')).toBeNull();
    });

    it('AC "même jeu d\'initiatives" — renders a trailing untriaged column so an unbucketed initiative is never invisible', () => {
      const { fixture } = create(makeView({ unbucketed: [INITIATIVE_UNBUCKETED] }));

      expect(columnEl(fixture, 'UNBUCKETED').textContent).toContain('Initiative Untriaged');
    });

    it('A11y — each column is a labelled list, each card a focusable, labelled button restating its horizon', () => {
      const { fixture } = create(makeView({ unbucketed: [INITIATIVE_UNBUCKETED] }));

      const nowColumn = columnEl(fixture, 'NOW');
      expect(nowColumn.getAttribute('role')).toBe('list');
      expect(nowColumn.getAttribute('aria-label')).toBeTruthy();

      const card = cardEl(fixture, 'Initiative Now');
      expect(card.getAttribute('role')).toBe('button');
      expect(card.getAttribute('tabindex')).toBe('0');
      expect(card.getAttribute('aria-label')).toContain('roadmap.board.nowNextLater.card.ariaLabel');

      const untriagedCard = cardEl(fixture, 'Initiative Untriaged');
      expect(untriagedCard.getAttribute('role')).toBe('button');
      expect(untriagedCard.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('mouse drag & drop (AC2)', () => {
    it('moving a card into a different column previews the drag and emits the resolved horizon on drop', () => {
      const { fixture, emitted } = create();
      const card = cardEl(fixture, 'Initiative Now');
      const nextColumn = columnEl(fixture, 'NEXT');
      mockElementFromPoint(nextColumn);

      card.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: 50, clientY: 10 }));
      fixture.detectChanges();

      expect(card.classList.contains('nnl-card--dragging')).toBe(true);
      expect(card.style.transform).toBe('translate(50px, 10px)');

      card.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: 50, clientY: 10 }));
      fixture.detectChanges();

      expect(card.classList.contains('nnl-card--dragging')).toBe(false);
      expect(emitted).toEqual([{ initiative: INITIATIVE_NOW, horizon: 'NEXT' }]);
    });

    it('dropping back on the same column is a no-op (no emit)', () => {
      const { fixture, emitted } = create();
      const card = cardEl(fixture, 'Initiative Now');
      mockElementFromPoint(columnEl(fixture, 'NOW'));

      card.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: 5, clientY: 0 }));

      expect(emitted).toHaveLength(0);
    });

    it('Error AC (invalid target) — dropping on the untriaged column is never a supported move, silently reverts', () => {
      const { fixture, emitted } = create(makeView({ unbucketed: [INITIATIVE_UNBUCKETED] }));
      const card = cardEl(fixture, 'Initiative Now');
      mockElementFromPoint(columnEl(fixture, 'UNBUCKETED'));

      card.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: 50, clientY: 0 }));

      expect(emitted).toHaveLength(0);
    });

    it('dropping outside any column (no element under the pointer) never emits', () => {
      const { fixture, emitted } = create();
      const card = cardEl(fixture, 'Initiative Now');
      mockElementFromPoint(null);

      card.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: 500, clientY: 500 }));

      expect(emitted).toHaveLength(0);
    });

    it('Error AC — aborts without emitting on pointercancel, reverting the drag preview', () => {
      const { fixture, emitted } = create();
      const card = cardEl(fixture, 'Initiative Now');
      mockElementFromPoint(columnEl(fixture, 'NEXT'));

      card.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: 80, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointercancel', { pointerId: 1, clientX: 80, clientY: 0 }));
      fixture.detectChanges();

      expect(card.classList.contains('nnl-card--dragging')).toBe(false);
      expect(card.style.transform).toBeFalsy();
      expect(emitted).toHaveLength(0);
    });

    it('aborts without emitting on lostpointercapture, same as pointercancel', () => {
      const { fixture, emitted } = create();
      const card = cardEl(fixture, 'Initiative Now');

      card.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: 80, clientY: 0 }));
      card.dispatchEvent(pointerEvt('lostpointercapture', { pointerId: 1, clientX: 80, clientY: 0 }));
      fixture.detectChanges();

      expect(card.classList.contains('nnl-card--dragging')).toBe(false);
      expect(emitted).toHaveLength(0);
    });

    it('never hijacks an in-progress gesture from a second, concurrent pointerdown', () => {
      const { fixture, emitted } = create();
      const card = cardEl(fixture, 'Initiative Now');
      mockElementFromPoint(columnEl(fixture, 'NEXT'));

      card.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointerdown', { pointerId: 2, clientX: 50, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointermove', { pointerId: 1, clientX: 60, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: 60, clientY: 0 }));

      expect(emitted).toEqual([{ initiative: INITIATIVE_NOW, horizon: 'NEXT' }]);
    });

    it('ignores pointer events from a different, concurrent pointerId', () => {
      const { fixture } = create();
      const card = cardEl(fixture, 'Initiative Now');

      card.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointermove', { pointerId: 2, clientX: 90, clientY: 0 }));
      fixture.detectChanges();

      // The drag (pointerId 1) is still in progress but untouched by the unrelated pointer's
      // move — the live preview stays at its zero-delta starting point.
      expect(card.style.transform).toBe('translate(0px, 0px)');
    });

    it('a card in the untriaged column can be dragged into a real bucket', () => {
      const { fixture, emitted } = create(makeView({ unbucketed: [INITIATIVE_UNBUCKETED] }));
      const card = cardEl(fixture, 'Initiative Untriaged');
      mockElementFromPoint(columnEl(fixture, 'LATER'));

      card.dispatchEvent(pointerEvt('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
      card.dispatchEvent(pointerEvt('pointerup', { pointerId: 1, clientX: 100, clientY: 0 }));

      expect(emitted).toEqual([{ initiative: INITIATIVE_UNBUCKETED, horizon: 'LATER' }]);
    });
  });

  describe('keyboard (A11y — WCAG 2.1 AA)', () => {
    it('ArrowRight moves a Now card to Next', () => {
      const { fixture, emitted } = create();
      cardEl(fixture, 'Initiative Now').dispatchEvent(keyEvt('ArrowRight'));

      expect(emitted).toEqual([{ initiative: INITIATIVE_NOW, horizon: 'NEXT' }]);
    });

    it('ArrowLeft on a Now card is a no-op (leftmost bucket)', () => {
      const { fixture, emitted } = create();
      cardEl(fixture, 'Initiative Now').dispatchEvent(keyEvt('ArrowLeft'));

      expect(emitted).toHaveLength(0);
    });

    it('ArrowLeft moves a Later card back to Next', () => {
      const { fixture, emitted } = create();
      cardEl(fixture, 'Initiative Later').dispatchEvent(keyEvt('ArrowLeft'));

      expect(emitted).toEqual([{ initiative: INITIATIVE_LATER, horizon: 'NEXT' }]);
    });

    it('ArrowRight on a Later card is a no-op (would require clearing the horizon)', () => {
      const { fixture, emitted } = create();
      cardEl(fixture, 'Initiative Later').dispatchEvent(keyEvt('ArrowRight'));

      expect(emitted).toHaveLength(0);
    });

    it('ArrowLeft on an untriaged card moves it to Later, the nearest real bucket', () => {
      const { fixture, emitted } = create(makeView({ unbucketed: [INITIATIVE_UNBUCKETED] }));
      cardEl(fixture, 'Initiative Untriaged').dispatchEvent(keyEvt('ArrowLeft'));

      expect(emitted).toEqual([{ initiative: INITIATIVE_UNBUCKETED, horizon: 'LATER' }]);
    });

    it('ArrowRight on an untriaged card is a no-op', () => {
      const { fixture, emitted } = create(makeView({ unbucketed: [INITIATIVE_UNBUCKETED] }));
      cardEl(fixture, 'Initiative Untriaged').dispatchEvent(keyEvt('ArrowRight'));

      expect(emitted).toHaveLength(0);
    });

    it('ignores unrelated keys', () => {
      const { fixture, emitted } = create();
      cardEl(fixture, 'Initiative Now').dispatchEvent(keyEvt('Enter'));

      expect(emitted).toHaveLength(0);
    });
  });
});
