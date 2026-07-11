import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Milestone, MilestoneDateChange } from '../data-access/roadmap.models';
import { PERIOD_WIDTH_PX, PeriodCell, dateForPeriodIndex, periodIndexForDate, pixelsToPeriodDelta } from '../roadmap-timeline';

/**
 * A single strategic-milestone marker on the roadmap-rapide board (US22.3.4 — "Jalons
 * stratégiques") — same underlying `pilotage.task` row as an `Initiative` (see `Milestone`'s
 * TSDoc), rendered here as a **punctual** diamond marker rather than a period bar
 * (`InitiativeBarComponent`): a milestone has one `date`, never a start/end span.
 *
 * **A11y AC — "identifiable sans dépendre uniquement de la couleur".** The marker is a distinct
 * *shape* (a rotated-square/diamond `<svg>`, never just a colored rectangle) that always renders
 * next to its own visible text label (`milestone.name`) — never color alone. `role="button"` +
 * `aria-label` (name, date, and lane name when set) make it identifiable to assistive tech
 * exactly like `InitiativeBarComponent`'s own bar.
 *
 * **Positioning.** Reuses the exact same period-snapping helpers as `InitiativeBarComponent`
 * (`periodIndexForDate`/`dateForPeriodIndex`/`pixelsToPeriodDelta`) against whichever axis grain
 * `RoadmapBoardComponent` currently has selected (US22.3.2) — this view's "approximate" placement
 * editing never operates at finer-than-period granularity for either object kind, regardless of
 * the milestone's own backend `temporalPrecision: DAY`. An undated milestone (defensive — see
 * `Milestone`'s TSDoc) renders at axis index 0, mirroring `InitiativeBarComponent`'s own handling
 * of a `null` fuzzy period.
 *
 * **Mouse** — drag the marker horizontally to change its date (no resize handles: a milestone
 * has no span to resize). **Keyboard (WCAG 2.1 AA)** — `ArrowLeft`/`ArrowRight` nudge the date one
 * period backward/forward. Unlike `InitiativeBarComponent`, there is no `ArrowUp`/`ArrowDown`
 * lane change and no `Shift+Arrow` resize here — a milestone's `laneId` is set at creation only
 * (re-laning a milestone isn't required by any AC of this US) and it has nothing to resize.
 *
 * This component never calls `RoadmapApiService` itself — `RoadmapBoardComponent` owns the API
 * call, the optimistic update of its `milestones` list, and the rollback-on-error, exactly like
 * it does for `InitiativeBarComponent` (see that component's TSDoc for the rationale).
 */
@Component({
  selector: 'app-milestone-marker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './milestone-marker.component.html',
  styleUrl: './milestone-marker.component.scss',
})
export class MilestoneMarkerComponent {
  readonly milestone = input.required<Milestone>();
  /** The board's current time axis (US22.3.2) — any grain (month/quarter/semester), see class TSDoc. */
  readonly periods = input.required<readonly PeriodCell[]>();
  /** Pixel width of one axis column at the board's current grain — defaults to the QUARTER grain's width for standalone usage (e.g. this component's own spec). */
  readonly periodWidthPx = input<number>(PERIOD_WIDTH_PX.QUARTER);
  /** Resolved lane name for display when `milestone().laneId` is set — `null` renders as a cross-project marker (see `Milestone`'s TSDoc). Resolved by the parent (`RoadmapBoardComponent` owns `lanes()`), never looked up here. */
  readonly laneName = input<string | null>(null);

  readonly dateChange = output<MilestoneDateChange>();

  protected readonly dragging = signal(false);
  private readonly previewIndex = signal<number | null>(null);

  private readonly baseIndex = computed(() => {
    const date = this.milestone().date;
    return date ? periodIndexForDate(date, this.periods()) : 0;
  });

  protected readonly displayIndex = computed(() => this.previewIndex() ?? this.baseIndex());
  protected readonly leftPx = computed(() => this.displayIndex() * this.periodWidthPx());

  protected readonly periodLabel = computed(() => this.periods()[this.displayIndex()]?.label ?? '');

  private dragPointerId: number | null = null;
  private dragOriginClientX = 0;
  private dragOriginIndex = 0;

  protected onPointerDown(event: PointerEvent): void {
    if (this.dragPointerId !== null) {
      // A gesture is already in progress (e.g. a second pointer) — never hijack it, see
      // `InitiativeBarComponent.beginDrag`'s identical guard.
      return;
    }

    this.dragPointerId = event.pointerId;
    this.dragOriginClientX = event.clientX;
    this.dragOriginIndex = this.displayIndex();
    this.dragging.set(true);

    const target = event.currentTarget as Element | null;
    if (target && typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragPointerId === null || event.pointerId !== this.dragPointerId) {
      return;
    }

    const deltaXPx = event.clientX - this.dragOriginClientX;
    const periodDelta = pixelsToPeriodDelta(deltaXPx, this.periodWidthPx());
    const maxIndex = this.periods().length - 1;
    const newIndex = Math.min(Math.max(this.dragOriginIndex + periodDelta, 0), maxIndex);
    this.previewIndex.set(newIndex);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.dragPointerId === null || event.pointerId !== this.dragPointerId) {
      return;
    }
    this.commitDrag();
  }

  /** Shared abort path for `pointercancel`/`lostpointercapture` — see `InitiativeBarComponent`'s identical TSDoc. */
  protected onPointerCancel(event: PointerEvent): void {
    if (this.dragPointerId === null || event.pointerId !== this.dragPointerId) {
      return;
    }
    this.dragPointerId = null;
    this.dragging.set(false);
    this.previewIndex.set(null);
  }

  private commitDrag(): void {
    const finalIndex = this.previewIndex() ?? this.dragOriginIndex;
    const changed = finalIndex !== this.dragOriginIndex;

    if (changed) {
      this.emitDateChange(finalIndex);
    }

    this.dragPointerId = null;
    this.dragging.set(false);
    this.previewIndex.set(null);
  }

  /** Keyboard equivalent of the horizontal mouse drag above (A11y AC — WCAG 2.1 AA). */
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();

    const maxIndex = this.periods().length - 1;
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const current = this.displayIndex();
    const newIndex = Math.min(Math.max(current + direction, 0), maxIndex);

    if (newIndex !== current) {
      this.emitDateChange(newIndex);
    }
  }

  private emitDateChange(index: number): void {
    this.dateChange.emit({ date: dateForPeriodIndex(index, this.periods(), 'start') });
  }
}
