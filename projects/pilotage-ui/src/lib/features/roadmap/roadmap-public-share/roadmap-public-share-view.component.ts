import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoadmapPublicShareApiService } from '../data-access/roadmap-public-share-api.service';
import { RoadmapShareViewResponse } from '../data-access/roadmap-share.models';
import { Initiative } from '../data-access/roadmap.models';
import { RoadmapExportButtonComponent } from '../roadmap-export-button/roadmap-export-button.component';
import { LANE_HEIGHT_PX, PERIOD_WIDTH_PX, PeriodCell, buildTimeAxis, periodIndexForDate } from '../roadmap-timeline';

/**
 * Public, unauthenticated, **strictly read-only** roadmap view consumed via a share link
 * (US22.3.5 — "Partage & export de la roadmap"). Routed at `roadmap-shares/:token`
 * (`app.routes.ts`) **without any guard** — see `RoadmapPublicShareApiService`'s TSDoc for why
 * this route must never be gated by auth.
 *
 * **Structurally non-editable — not just visually.** Unlike `RoadmapBoardComponent`, this
 * component never imports `InitiativeBarComponent` (the interactive, draggable/keyboard-movable
 * bar) and renders no create-lane/create-initiative forms at all: the initiative "chips" below
 * are plain, non-focusable `<div>`s with **no** `pointerdown`/`keydown` handlers, no
 * `tabindex="0"`, no `role="button"`, and this component calls neither `RoadmapApiService` nor
 * `RoadmapShareApiService` (only the read-only `RoadmapPublicShareApiService`). There is therefore
 * no code path here that could ever fire an edit request, regardless of DOM manipulation or a
 * malicious page state — satisfying the AC that no edit action is "even technically reachable",
 * not merely hidden by CSS.
 *
 * **Fixed QUARTER time scale.** Unlike the editable board (US22.3.2's month/quarter/semester
 * picker), this view renders a single, fixed grain and exposes no `<select>` to change it — one
 * fewer interactive control on a page whose whole point is to have none beyond "read" and
 * "export". Geometry math is the same pure, Angular-free helpers `RoadmapBoardComponent` uses
 * (`roadmap-timeline.ts`) — no duplicated logic, only a duplicated (much simpler) template, since
 * sharing `RoadmapBoardComponent`'s own template/component would have re-imported all of its
 * editing affordances.
 *
 * **Error handling — single generic outcome, no partial display (Error AC).** See
 * `RoadmapPublicShareApiService`/`ShareLinkApiError`'s TSDoc: every failure from
 * `getSharedRoadmap` (404 `SHARE_LINK_INVALID` for an unknown/revoked/expired token, or any other
 * unexpected error) renders the exact same `errorKey` and never sets `view` — there is no state in
 * which a partial roadmap could render alongside an error.
 *
 * **A11y (AC — WCAG 2.1 AA equivalent to the editable board).** Heading hierarchy (`<h1>` project
 * name), a `role="status"`/`role="alert"` for loading/error states matching `RoadmapBoardComponent`'s
 * own convention, an explicit "read-only" notice, and the same verified-AA focus/contrast styling
 * (`roadmap-public-share-view.component.scss`) as the editable board's bars/lanes.
 */
@Component({
  selector: 'app-roadmap-public-share-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RoadmapExportButtonComponent],
  templateUrl: './roadmap-public-share-view.component.html',
  styleUrl: './roadmap-public-share-view.component.scss',
})
export class RoadmapPublicShareViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(RoadmapPublicShareApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** Fixed anchor for the axis, captured once — mirrors `RoadmapBoardComponent`'s own `axisAnchor`. */
  private readonly axisAnchor = new Date();
  protected readonly periods = computed<readonly PeriodCell[]>(() => buildTimeAxis(this.axisAnchor, 'QUARTER'));
  protected readonly periodWidthPx = PERIOD_WIDTH_PX.QUARTER;
  protected readonly laneLabelWidthPx = 180;
  protected readonly axisWidthPx = computed(() => this.periods().length * this.periodWidthPx);

  protected readonly loading = signal(true);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly view = signal<RoadmapShareViewResponse | null>(null);
  protected readonly laneIds = computed(() => (this.view()?.lanes ?? []).map(lane => lane.id));

  /** Capture target for `RoadmapExportButtonComponent` — see that component's TSDoc. */
  protected readonly captureAreaRef = viewChild<ElementRef<HTMLElement>>('publicCaptureArea');

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.api
      .getSharedRoadmap(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: view => {
          this.view.set(view);
          this.loading.set(false);
        },
        error: () => {
          // See class TSDoc — one single generic outcome for every failure on this endpoint.
          this.errorKey.set('roadmap.publicShare.errors.INVALID');
          this.loading.set(false);
        },
      });
  }

  protected barLeftPx(initiative: Initiative): number {
    return this.startIndex(initiative) * this.periodWidthPx;
  }

  protected barWidthPx(initiative: Initiative): number {
    return (this.endIndex(initiative) - this.startIndex(initiative) + 1) * this.periodWidthPx;
  }

  protected barTopPx(initiative: Initiative): number {
    const laneIndex = this.laneIds().indexOf(initiative.laneId);
    return Math.max(laneIndex, 0) * LANE_HEIGHT_PX;
  }

  /**
   * A11y (AC — WCAG 2.1 AA equivalent to the editable board): a sighted user infers an
   * initiative's period from its horizontal position on the axis, which conveys nothing to a
   * screen-reader user without this — mirrors `InitiativeBarComponent`'s own `periodLabel`.
   */
  protected periodLabel(initiative: Initiative): string {
    const periods = this.periods();
    const start = periods[this.startIndex(initiative)]?.label ?? '';
    const end = periods[this.endIndex(initiative)]?.label ?? '';
    return start === end ? start : `${start} – ${end}`;
  }

  private startIndex(initiative: Initiative): number {
    return initiative.fuzzyPeriodStart ? periodIndexForDate(initiative.fuzzyPeriodStart, this.periods()) : 0;
  }

  private endIndex(initiative: Initiative): number {
    return initiative.fuzzyPeriodEnd
      ? periodIndexForDate(initiative.fuzzyPeriodEnd, this.periods())
      : this.startIndex(initiative);
  }
}
