import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Initiative, InitiativePlacementChange } from '../data-access/roadmap.models';
import {
  LANE_HEIGHT_PX,
  PERIOD_WIDTH_PX,
  PeriodCell,
  dateForPeriodIndex,
  periodIndexForDate,
  pixelsToLaneDelta,
  pixelsToPeriodDelta,
} from '../roadmap-timeline';

type DragMode = 'move' | 'resize-start' | 'resize-end';

/**
 * A single initiative "bar" on the roadmap-rapide board (US22.3.1) — a macro view of an
 * underlying `pilotage.task`, positioned on its lane's row by its approximate
 * (`fuzzyPeriodStart`/`fuzzyPeriodEnd`) period, against whichever axis grain
 * `RoadmapBoardComponent` currently has selected (US22.3.2 — "Échelle de temps floue":
 * month/quarter/semester, see `roadmap-timeline.ts`'s `RoadmapTimeScale`). This component is
 * entirely grain-agnostic — it only ever deals in axis-relative `PeriodCell` indices, never in
 * a hard-coded "quarter" concept, so the board can hand it any grain's axis unmodified.
 *
 * **Mouse** — drag the bar body to move it (both horizontally across periods and vertically
 * across lanes); drag either edge handle to resize (shrink/grow) one boundary only. Modelled on
 * `pivot-collaboratif-ui`'s `WhiteboardCanvasComponent`: native Pointer Events (`setPointerCapture`
 * so the drag survives the cursor leaving the element — no Angular CDK DragDrop, absent
 * platform-wide per `ADR-007`), and the same "snapshot the original geometry at drag-start,
 * apply the *total* delta on every move, never compound per-frame deltas" principle.
 *
 * **Keyboard (WCAG 2.1 AA)** — the bar itself is the single focusable, interactive unit
 * (`tabindex="0"`, `role="button"`):
 * - `ArrowLeft`/`ArrowRight` — move the whole bar by one period of the board's current grain
 *   (both bounds shift together).
 * - `Shift+ArrowLeft`/`Shift+ArrowRight` — resize: shrink/grow the **end** boundary by one
 *   period. This deliberately repurposes the "Shift" modifier compared to
 *   `WhiteboardCanvasComponent` (there, Shift only means "bigger step" on the *same* move
 *   operation): a roadmap bar has two genuinely distinct operations (move vs. resize) that a
 *   free-form canvas object doesn't, so Shift here switches operation rather than step size.
 * - `ArrowUp`/`ArrowDown` — move the bar to the previous/next lane row.
 * - No `aria-grabbed`/`aria-dropeffect` (deprecated ARIA 1.1 drag-and-drop attributes, poor AT
 *   support, absent from this codebase's own whiteboard precedent) — plain `role="button"` +
 *   an `aria-label` describing the current lane/period, kept live via the input recomputing on
 *   every successful placement change.
 *
 * Every committed change (mouse drop or keyboard nudge) emits a fully-resolved
 * {@link InitiativePlacementChange} — this component never calls `RoadmapApiService` itself
 * (`RoadmapBoardComponent` owns the API call, the optimistic update of its `initiatives` list,
 * and the rollback-on-error — see its TSDoc). This keeps a lane re-assignment a pure "tell the
 * parent, let it re-render me under a different lane row" concern, which this component alone
 * cannot do (it does not own the list of lane rows).
 */
@Component({
  selector: 'app-initiative-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './initiative-bar.component.html',
  styleUrl: './initiative-bar.component.scss',
})
export class InitiativeBarComponent {
  readonly initiative = input.required<Initiative>();
  /** The board's current time axis (US22.3.2) — any grain (month/quarter/semester), see class TSDoc. */
  readonly periods = input.required<readonly PeriodCell[]>();
  /** Lane ids, ordered by row position — used to resolve/clamp a vertical (cross-lane) move. */
  readonly laneIds = input.required<readonly number[]>();
  /** Pixel width of one axis column at the board's current grain — defaults to the QUARTER grain's width for standalone usage (e.g. this component's own spec). */
  readonly periodWidthPx = input<number>(PERIOD_WIDTH_PX.QUARTER);
  readonly laneHeightPx = input<number>(LANE_HEIGHT_PX);

  readonly placementChange = output<InitiativePlacementChange>();

  protected readonly dragging = signal(false);
  private readonly previewStartIndex = signal<number | null>(null);
  private readonly previewEndIndex = signal<number | null>(null);
  private readonly previewLaneIndex = signal<number | null>(null);

  private readonly baseStartIndex = computed(() => {
    const start = this.initiative().fuzzyPeriodStart;
    return start ? periodIndexForDate(start, this.periods()) : 0;
  });

  private readonly baseEndIndex = computed(() => {
    const end = this.initiative().fuzzyPeriodEnd;
    return end ? periodIndexForDate(end, this.periods()) : this.baseStartIndex();
  });

  private readonly baseLaneIndex = computed(() => {
    const index = this.laneIds().indexOf(this.initiative().laneId);
    return index === -1 ? 0 : index;
  });

  protected readonly displayStartIndex = computed(() => this.previewStartIndex() ?? this.baseStartIndex());
  protected readonly displayEndIndex = computed(() => this.previewEndIndex() ?? this.baseEndIndex());
  protected readonly displayLaneIndex = computed(() => this.previewLaneIndex() ?? this.baseLaneIndex());

  protected readonly leftPx = computed(() => this.displayStartIndex() * this.periodWidthPx());
  protected readonly widthPx = computed(
    () => (this.displayEndIndex() - this.displayStartIndex() + 1) * this.periodWidthPx(),
  );
  protected readonly topPx = computed(() => this.displayLaneIndex() * this.laneHeightPx());

  protected readonly periodLabel = computed(() => {
    const periods = this.periods();
    const start = periods[this.displayStartIndex()]?.label ?? '';
    const end = periods[this.displayEndIndex()]?.label ?? '';
    return start === end ? start : `${start} – ${end}`;
  });

  private dragMode: DragMode | null = null;
  private dragPointerId: number | null = null;
  private dragOriginClientX = 0;
  private dragOriginClientY = 0;
  private dragOriginStartIndex = 0;
  private dragOriginEndIndex = 0;
  private dragOriginLaneIndex = 0;

  protected onBarPointerDown(event: PointerEvent): void {
    this.beginDrag('move', event);
  }

  protected onStartHandlePointerDown(event: PointerEvent): void {
    event.stopPropagation();
    this.beginDrag('resize-start', event);
  }

  protected onEndHandlePointerDown(event: PointerEvent): void {
    event.stopPropagation();
    this.beginDrag('resize-end', event);
  }

  private beginDrag(mode: DragMode, event: PointerEvent): void {
    if (this.dragMode !== null) {
      // A gesture is already in progress (e.g. a second finger/pointer on touch, since
      // `touch-action: none` deliberately allows touch dragging) — never hijack it: the first
      // pointer's `setPointerCapture` stays valid and its `pointermove`/`pointerup` keep working
      // normally, this second, extra pointerdown is simply ignored.
      return;
    }

    this.dragMode = mode;
    this.dragPointerId = event.pointerId;
    this.dragOriginClientX = event.clientX;
    this.dragOriginClientY = event.clientY;
    this.dragOriginStartIndex = this.displayStartIndex();
    this.dragOriginEndIndex = this.displayEndIndex();
    this.dragOriginLaneIndex = this.displayLaneIndex();
    this.dragging.set(true);

    const target = event.currentTarget as Element | null;
    if (target && typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragMode === null || event.pointerId !== this.dragPointerId) {
      return;
    }

    const deltaXPx = event.clientX - this.dragOriginClientX;
    const deltaYPx = event.clientY - this.dragOriginClientY;
    const periodDelta = pixelsToPeriodDelta(deltaXPx, this.periodWidthPx());
    const maxIndex = this.periods().length - 1;

    if (this.dragMode === 'move') {
      const span = this.dragOriginEndIndex - this.dragOriginStartIndex;
      const newStart = Math.min(Math.max(this.dragOriginStartIndex + periodDelta, 0), maxIndex - span);
      this.previewStartIndex.set(newStart);
      this.previewEndIndex.set(newStart + span);

      const laneDelta = pixelsToLaneDelta(deltaYPx, this.laneHeightPx());
      const newLaneIndex = Math.min(Math.max(this.dragOriginLaneIndex + laneDelta, 0), this.laneIds().length - 1);
      this.previewLaneIndex.set(newLaneIndex);
    } else if (this.dragMode === 'resize-start') {
      const newStart = Math.min(Math.max(this.dragOriginStartIndex + periodDelta, 0), this.dragOriginEndIndex);
      this.previewStartIndex.set(newStart);
    } else {
      const newEnd = Math.max(Math.min(this.dragOriginEndIndex + periodDelta, maxIndex), this.dragOriginStartIndex);
      this.previewEndIndex.set(newEnd);
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.dragMode === null || event.pointerId !== this.dragPointerId) {
      return;
    }
    this.commitDrag();
  }

  /**
   * Shared abort path for both `pointercancel` (OS/browser-initiated gesture interrupt) and
   * `lostpointercapture` (capture force-released outside a normal `pointerup`, e.g. a platform
   * focus-loss case) — either way, never commit a gesture that didn't end in a proper drop.
   */
  protected onPointerCancel(event: PointerEvent): void {
    if (this.dragMode === null || event.pointerId !== this.dragPointerId) {
      return;
    }
    // Abort — revert to the pre-drag placement, never commit a cancelled gesture.
    this.dragMode = null;
    this.dragPointerId = null;
    this.dragging.set(false);
    this.previewStartIndex.set(null);
    this.previewEndIndex.set(null);
    this.previewLaneIndex.set(null);
  }

  private commitDrag(): void {
    const finalStart = this.previewStartIndex() ?? this.dragOriginStartIndex;
    const finalEnd = this.previewEndIndex() ?? this.dragOriginEndIndex;
    const finalLaneIndex = this.previewLaneIndex() ?? this.dragOriginLaneIndex;

    const changed =
      finalStart !== this.dragOriginStartIndex ||
      finalEnd !== this.dragOriginEndIndex ||
      finalLaneIndex !== this.dragOriginLaneIndex;

    if (changed) {
      this.emitPlacement(finalStart, finalEnd, finalLaneIndex);
    }

    this.dragMode = null;
    this.dragPointerId = null;
    this.dragging.set(false);
    this.previewStartIndex.set(null);
    this.previewEndIndex.set(null);
    this.previewLaneIndex.set(null);
  }

  /**
   * Keyboard equivalent of the mouse drag/resize gestures above (A11y AC — WCAG 2.1 AA). See
   * class TSDoc for the exact key mapping and the rationale for repurposing `Shift`.
   */
  protected onKeyDown(event: KeyboardEvent): void {
    const maxIndex = this.periods().length - 1;
    const start = this.displayStartIndex();
    const end = this.displayEndIndex();
    const laneIndex = this.displayLaneIndex();

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;

      if (event.shiftKey) {
        const newEnd = Math.min(Math.max(end + direction, start), maxIndex);
        if (newEnd !== end) {
          this.emitPlacement(start, newEnd, laneIndex);
        }
        return;
      }

      const span = end - start;
      const newStart = Math.min(Math.max(start + direction, 0), maxIndex - span);
      if (newStart !== start) {
        this.emitPlacement(newStart, newStart + span, laneIndex);
      }
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const newLaneIndex = Math.min(Math.max(laneIndex + direction, 0), this.laneIds().length - 1);
      if (newLaneIndex !== laneIndex) {
        this.emitPlacement(start, end, newLaneIndex);
      }
    }
  }

  private emitPlacement(startIndex: number, endIndex: number, laneIndex: number): void {
    const periods = this.periods();
    this.placementChange.emit({
      laneId: this.laneIds()[laneIndex],
      fuzzyPeriodStart: dateForPeriodIndex(startIndex, periods, 'start'),
      fuzzyPeriodEnd: dateForPeriodIndex(endIndex, periods, 'end'),
    });
  }
}
