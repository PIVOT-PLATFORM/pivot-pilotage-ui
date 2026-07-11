import { HttpErrorResponse } from '@angular/common/http';
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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import { RoadmapApiService } from '../data-access/roadmap-api.service';
import {
  Initiative,
  InitiativePlacementChange,
  Lane,
  Milestone,
  MilestoneDateChange,
  RoadmapApiError,
  RoadmapProjectRef,
} from '../data-access/roadmap.models';
import { InitiativeBarComponent } from '../initiative-bar/initiative-bar.component';
import { MilestoneMarkerComponent } from '../milestone-marker/milestone-marker.component';
import { RoadmapExportButtonComponent } from '../roadmap-export-button/roadmap-export-button.component';
import { RoadmapSharePanelComponent } from '../roadmap-share-panel/roadmap-share-panel.component';
import { RoadmapTimeScaleService } from '../roadmap-time-scale.service';
import { PERIOD_WIDTH_PX, PeriodCell, RoadmapTimeScale, buildTimeAxis } from '../roadmap-timeline';

/**
 * Roadmap-rapide board (US22.3.1 — "Créer une roadmap rapide"): create lanes (flat groupings —
 * theme/team/objective), pose initiatives on them without requiring dates or child tasks (AC1),
 * and move/resize those initiatives with the mouse or the keyboard to set their approximate
 * period (AC2 + A11y AC).
 *
 * **Time scale (US22.3.2 — "Échelle de temps floue").** The axis rendered above the lanes can be
 * sliced at three grains — month/quarter/semester (see `RoadmapTimeScale`) — picked via the
 * `<select>` bound to {@link timeScale}. This is a **display-only projection**: switching the
 * grain only rebuilds which `PeriodCell`s the same, untouched `initiatives()` are positioned
 * against (`roadmap-timeline.ts`'s `buildTimeAxis`/`periodIndexForDate`) — it never reads or
 * writes `fuzzyPeriodStart`/`fuzzyPeriodEnd`, so it can never lose or truncate an initiative's
 * stored period (Error AC), and it never calls `RoadmapApiService` (Security AC: a pure view
 * setting, local to this browser/user — see `RoadmapTimeScaleService`, which also persists it).
 *
 * Owns the canonical `lanes`/`initiatives` lists and every `RoadmapApiService` call — child
 * `InitiativeBarComponent`s are purely presentational/interactive, they only emit a resolved
 * {@link InitiativePlacementChange} (see that component's TSDoc for why a lane re-assignment
 * cannot be handled by the bar itself).
 *
 * **Optimistic updates.** `onPlacementChange` applies the new placement to the `initiatives`
 * signal *before* the `PATCH` resolves, so the bar's displayed position updates immediately
 * (AC2's "mise à jour immédiate") without waiting on a network round trip. On failure, the
 * previous value is restored and the error is surfaced via {@link placementErrorKey}. The same
 * "apply now, roll back on failure" flow is used for `createLane`/`createInitiative` (append
 * optimistically is *not* done there — a create needs the server-assigned `id`, so those wait
 * for the response, unlike a placement update on an already-`id`-bearing initiative).
 *
 * **Known platform gap** — see `RoadmapApiService`'s TSDoc: every write 403s unconditionally
 * server-side today (`DenyAllRoadmapEditPolicy`, fail-closed pending `pivot-core-starter`). This
 * component's error handling for 403 is fully exercised by tests; it is simply the outcome any
 * real write will hit until that backend gap closes.
 *
 * **Strategic milestones (US22.3.4 — "Jalons stratégiques").** Loaded alongside lanes/initiatives
 * and rendered as `MilestoneMarkerComponent`s in their own `.rm-board__milestones-row` band —
 * deliberately **not** interleaved into the per-lane bars overlay (`.rm-board__bars`): a milestone
 * is punctual and may have no `laneId` at all (a cross-project marker, see `Milestone`'s TSDoc),
 * so giving it a dedicated row sidesteps re-deriving `InitiativeBarComponent`'s lane-row math for
 * an object that doesn't always belong to a lane, without touching that existing, tested overlay.
 * Same optimistic-update/rollback/staleness-guard flow as `onPlacementChange` below, applied to
 * `onMilestoneDateChange`. Security AC: no client-side role gating — same fail-closed backend
 * policy (`RoadmapEditPolicy`, shared with initiatives) is the sole enforcement point; an
 * unauthorized create/date-change attempt 403s and is rolled back, same posture as initiatives.
 *
 * **Route.** Expects `tenantId`/`teamId`/`projectId` as route params (mirroring the backend's
 * own path-segment shape — see {@link RoadmapProjectRef}'s TSDoc on why, given
 * `pivot-core-starter` isn't published yet). Not wired to this bootstrap's placeholder Home
 * route (see `app.routes.ts`) — once this module is genuinely lazy-loaded inside the `pivot-ui`
 * shell, the shell's own routing (which already resolves tenant/team context) supplies these
 * segments; this repo never types, stores or manages a tenant/team id itself.
 *
 * **Share & export (US22.3.5).** `RoadmapSharePanelComponent` (toggled via {@link sharePanelOpen})
 * and `RoadmapExportButtonComponent` are embedded here purely additively — this component still
 * owns none of their logic, it only supplies `projectRef` and a `#roadmapCaptureArea` template
 * ref (via {@link captureAreaRef}) pointing at `.rm-board__timeline` for the export button to
 * capture. See those components' own TSDoc for the share-link and PNG/PDF-export behaviour.
 */
@Component({
  selector: 'app-roadmap-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    InitiativeBarComponent,
    MilestoneMarkerComponent,
    RoadmapExportButtonComponent,
    RoadmapSharePanelComponent,
    TranslocoPipe,
  ],
  templateUrl: './roadmap-board.component.html',
  styleUrl: './roadmap-board.component.scss',
})
export class RoadmapBoardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly roadmapApi = inject(RoadmapApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);
  private readonly timeScaleService = inject(RoadmapTimeScaleService);

  /** `protected` (not `private`) — bound directly in the template by `RoadmapSharePanelComponent`'s `[projectRef]` input (US22.3.5). */
  protected readonly projectRef: RoadmapProjectRef = this.readProjectRef();

  /** Anchor date for the time axis, captured once — see `buildTimeAxis`'s `anchor` param. Fixed for the component's lifetime so cycling through scales never drifts the axis's "today" reference. */
  private readonly axisAnchor = new Date();

  /** Currently selected axis grain (US22.3.2) — initialised from, and persisted to, `RoadmapTimeScaleService`. */
  protected readonly timeScale = signal<RoadmapTimeScale>(this.timeScaleService.read(this.projectRef));
  protected readonly periods = computed<readonly PeriodCell[]>(() => buildTimeAxis(this.axisAnchor, this.timeScale()));
  protected readonly periodWidthPx = computed(() => PERIOD_WIDTH_PX[this.timeScale()]);
  protected readonly axisWidthPx = computed(() => this.periods().length * this.periodWidthPx());
  /** Fixed width of the lane-label column — the bars overlay starts right after it. */
  protected readonly laneLabelWidthPx = 180;

  protected readonly lanes = signal<Lane[]>([]);
  protected readonly initiatives = signal<Initiative[]>([]);
  protected readonly laneIds = computed(() => this.lanes().map(lane => lane.id));

  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  protected readonly newLaneName = signal('');
  protected readonly creatingLane = signal(false);
  protected readonly createLaneErrorKey = signal<string | null>(null);

  protected readonly newInitiativeName = signal('');
  protected readonly newInitiativeLaneId = signal<number | null>(null);
  protected readonly creatingInitiative = signal(false);
  protected readonly createInitiativeErrorKey = signal<string | null>(null);

  protected readonly placementErrorKey = signal<string | null>(null);
  /** Last placement outcome, announced via an `aria-live="polite"` region (A11y AC). */
  protected readonly announcement = signal<string | null>(null);

  /** US22.3.5 — toggles the share-link management panel (`RoadmapSharePanelComponent`), collapsed by default. */
  protected readonly sharePanelOpen = signal(false);
  /** US22.3.5 — capture target for `RoadmapExportButtonComponent`, resolved once `.rm-board__timeline` is rendered (null while `lanes()` is empty). */
  protected readonly captureAreaRef = viewChild<ElementRef<HTMLElement>>('roadmapCaptureArea');

  /**
   * One in-flight-request token per initiative id — guards `onPlacementChange` against an
   * out-of-order response (e.g. two rapid keyboard nudges on the same bar) silently clobbering a
   * newer optimistic update/rollback with an older, now-superseded one. See that method's TSDoc.
   */
  private readonly pendingPlacementTokens = new Map<number, symbol>();

  // --- US22.3.4 — Jalons stratégiques ---------------------------------------------------------

  protected readonly milestones = signal<Milestone[]>([]);

  protected readonly newMilestoneName = signal('');
  protected readonly newMilestoneDate = signal('');
  protected readonly newMilestoneLaneId = signal<number | null>(null);
  protected readonly creatingMilestone = signal(false);
  protected readonly createMilestoneErrorKey = signal<string | null>(null);

  protected readonly milestoneDateErrorKey = signal<string | null>(null);

  /** Same staleness-guard pattern as {@link pendingPlacementTokens}, scoped to milestone date changes. */
  private readonly pendingMilestoneTokens = new Map<number, symbol>();

  /** Resolves a lane's display name for a milestone's aria-label — `null` when the milestone has no `laneId` (cross-project marker, see `Milestone`'s TSDoc). */
  protected laneNameFor(laneId: number | null): string | null {
    if (laneId === null) {
      return null;
    }
    return this.lanes().find(lane => lane.id === laneId)?.name ?? null;
  }

  private readProjectRef(): RoadmapProjectRef {
    const params = this.route.snapshot.paramMap;
    return {
      tenantId: Number(params.get('tenantId')),
      teamId: Number(params.get('teamId')),
      projectId: Number(params.get('projectId')),
    };
  }

  ngOnInit(): void {
    this.loadRoadmap();
  }

  protected retryLoad(): void {
    this.loadRoadmap();
  }

  /**
   * US22.3.2 — switches the board's axis grain and persists the choice for this roadmap (see
   * `RoadmapTimeScaleService`). Purely a re-projection of the already-loaded `initiatives()` onto
   * a differently-sliced axis — never touches `lanes`/`initiatives`, never calls
   * `RoadmapApiService` (Security AC: a local, per-user view setting, not project data).
   */
  protected onTimeScaleChange(event: Event): void {
    const scale = (event.target as HTMLSelectElement).value as RoadmapTimeScale;
    this.timeScale.set(scale);
    this.timeScaleService.write(this.projectRef, scale);
  }

  /** US22.3.5 — shows/hides the share-link management panel. */
  protected toggleSharePanel(): void {
    this.sharePanelOpen.update(open => !open);
  }

  private loadRoadmap(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);

    forkJoin({
      lanes: this.roadmapApi.listLanes(this.projectRef),
      initiatives: this.roadmapApi.listInitiatives(this.projectRef),
      milestones: this.roadmapApi.listMilestones(this.projectRef),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ lanes, initiatives, milestones }) => {
          this.lanes.set(lanes);
          this.initiatives.set(initiatives);
          this.milestones.set(milestones);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(
            error.status === 404 ? 'roadmap.board.load.errors.NOT_FOUND' : 'roadmap.board.load.errors.GENERIC',
          );
        },
      });
  }

  protected onLaneNameInput(event: Event): void {
    this.newLaneName.set((event.target as HTMLInputElement).value);
  }

  protected submitCreateLane(): void {
    const name = this.newLaneName().trim();
    this.createLaneErrorKey.set(null);

    if (!name) {
      this.createLaneErrorKey.set('roadmap.board.createLane.errors.NAME_REQUIRED');
      return;
    }

    this.creatingLane.set(true);
    this.roadmapApi
      .createLane(this.projectRef, { name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.lanes.update(list => [...list, created]);
          this.newLaneName.set('');
          this.creatingLane.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.creatingLane.set(false);
          this.createLaneErrorKey.set(this.resolveCreateLaneErrorKey(error));
        },
      });
  }

  private resolveCreateLaneErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as RoadmapApiError | undefined)?.code;
    if (error.status === 409 && code === 'LANE_DUPLICATE') {
      return 'roadmap.board.createLane.errors.LANE_DUPLICATE';
    }
    if (error.status === 400) {
      return 'roadmap.board.createLane.errors.INVALID_NAME';
    }
    if (error.status === 403) {
      return 'roadmap.board.createLane.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'roadmap.board.createLane.errors.NOT_FOUND';
    }
    return 'roadmap.board.createLane.errors.GENERIC';
  }

  protected onInitiativeNameInput(event: Event): void {
    this.newInitiativeName.set((event.target as HTMLInputElement).value);
  }

  protected onInitiativeLaneChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.newInitiativeLaneId.set(value ? Number(value) : null);
  }

  /**
   * AC1 (create without dates) + Error AC ("given an initiative without a target lane... a
   * message indicates a lane is required"). The lane requirement is checked client-side first
   * (immediate feedback, no round trip needed when the roadmap has no lane yet) — the identical
   * `LANE_REQUIRED`/`LANE_NOT_FOUND` server error is handled the same way if it still occurs
   * (e.g. the chosen lane was concurrently deleted).
   */
  protected submitCreateInitiative(): void {
    const name = this.newInitiativeName().trim();
    const laneId = this.newInitiativeLaneId();
    this.createInitiativeErrorKey.set(null);

    if (!name) {
      this.createInitiativeErrorKey.set('roadmap.board.createInitiative.errors.NAME_REQUIRED');
      return;
    }
    if (laneId === null) {
      this.createInitiativeErrorKey.set('roadmap.board.createInitiative.errors.LANE_REQUIRED');
      return;
    }

    this.creatingInitiative.set(true);
    this.roadmapApi
      .createInitiative(this.projectRef, { name, laneId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.initiatives.update(list => [...list, created]);
          this.newInitiativeName.set('');
          this.newInitiativeLaneId.set(null);
          this.creatingInitiative.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.creatingInitiative.set(false);
          this.createInitiativeErrorKey.set(this.resolveCreateInitiativeErrorKey(error));
        },
      });
  }

  private resolveCreateInitiativeErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as RoadmapApiError | undefined)?.code;
    if (error.status === 400 && code) {
      // LANE_REQUIRED / LANE_NOT_FOUND / INVALID_PERIOD all have a dedicated catalogue entry.
      return `roadmap.board.createInitiative.errors.${code}`;
    }
    if (error.status === 403) {
      return 'roadmap.board.createInitiative.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'roadmap.board.createInitiative.errors.NOT_FOUND';
    }
    return 'roadmap.board.createInitiative.errors.GENERIC';
  }

  /**
   * See class TSDoc — optimistic update, rollback on failure.
   *
   * **Staleness guard.** `previous` is re-read from the live `initiatives` signal (never trusted
   * from the `@for`-bound `initiative` parameter, which can be a stale reference by the time this
   * handler runs) and each call stamps a fresh token into {@link pendingPlacementTokens} for this
   * initiative id. If a second placement change fires on the *same* initiative before the first
   * one's HTTP response arrives (e.g. two rapid keyboard nudges, or a keyboard nudge racing a
   * mouse drop), the first response's `next`/`error` callback finds its token superseded and
   * no-ops instead of clobbering the second, more recent change with stale data.
   */
  protected onPlacementChange(initiative: Initiative, change: InitiativePlacementChange): void {
    const previous = this.initiatives().find(i => i.id === initiative.id) ?? initiative;
    const optimistic: Initiative = { ...previous, ...change };
    const token = Symbol();
    this.pendingPlacementTokens.set(initiative.id, token);

    this.placementErrorKey.set(null);
    this.initiatives.update(list => list.map(i => (i.id === initiative.id ? optimistic : i)));
    this.announcement.set(
      this.transloco.translate('roadmap.board.bar.announceMoved', {
        name: previous.name,
        start: change.fuzzyPeriodStart,
        end: change.fuzzyPeriodEnd,
      }),
    );

    this.roadmapApi
      .updatePlacement(this.projectRef, initiative.id, change)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          if (this.pendingPlacementTokens.get(initiative.id) !== token) {
            return; // superseded by a more recent placement change on this initiative
          }
          this.initiatives.update(list => list.map(i => (i.id === initiative.id ? updated : i)));
        },
        error: (error: HttpErrorResponse) => {
          if (this.pendingPlacementTokens.get(initiative.id) !== token) {
            return; // superseded — a newer change already owns this initiative's outcome
          }
          this.initiatives.update(list => list.map(i => (i.id === initiative.id ? previous : i)));
          this.placementErrorKey.set(this.resolvePlacementErrorKey(error));
          // A11y — the earlier "moved" announcement must be corrected, not left standing, so a
          // screen-reader user isn't told a move succeeded when it was actually reverted.
          this.announcement.set(
            this.transloco.translate('roadmap.board.bar.announceReverted', { name: previous.name }),
          );
        },
      });
  }

  private resolvePlacementErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as RoadmapApiError | undefined)?.code;
    if (error.status === 400 && code) {
      return `roadmap.board.placement.errors.${code}`;
    }
    if (error.status === 403) {
      return 'roadmap.board.placement.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'roadmap.board.placement.errors.NOT_FOUND';
    }
    return 'roadmap.board.placement.errors.GENERIC';
  }

  // --- US22.3.4 — Jalons stratégiques -----------------------------------------------------------

  protected onMilestoneNameInput(event: Event): void {
    this.newMilestoneName.set((event.target as HTMLInputElement).value);
  }

  protected onMilestoneDateInput(event: Event): void {
    this.newMilestoneDate.set((event.target as HTMLInputElement).value);
  }

  protected onMilestoneLaneChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.newMilestoneLaneId.set(value ? Number(value) : null);
  }

  /**
   * Error AC ("given un jalon sans date... rejeté avec un message explicite" —
   * `MILESTONE_DATE_REQUIRED`). The date requirement is checked client-side first (immediate
   * feedback, no round trip) — the identical server error is handled the same way if it still
   * occurs. "Out of bounds" (`MILESTONE_DATE_OUT_OF_BOUNDS`) cannot be pre-validated client-side —
   * the project's bounds are derived server-side from the other tasks already planned on it (see
   * the backlog file's PO Agent decision) — so that error is always surfaced from the 400 response.
   */
  protected submitCreateMilestone(): void {
    const name = this.newMilestoneName().trim();
    const date = this.newMilestoneDate();
    const laneId = this.newMilestoneLaneId();
    this.createMilestoneErrorKey.set(null);

    if (!name) {
      this.createMilestoneErrorKey.set('roadmap.board.createMilestone.errors.NAME_REQUIRED');
      return;
    }
    if (!date) {
      this.createMilestoneErrorKey.set('roadmap.board.createMilestone.errors.MILESTONE_DATE_REQUIRED');
      return;
    }

    this.creatingMilestone.set(true);
    this.roadmapApi
      .createMilestone(this.projectRef, { name, date, ...(laneId !== null ? { laneId } : {}) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.milestones.update(list => [...list, created]);
          this.newMilestoneName.set('');
          this.newMilestoneDate.set('');
          this.newMilestoneLaneId.set(null);
          this.creatingMilestone.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.creatingMilestone.set(false);
          this.createMilestoneErrorKey.set(this.resolveCreateMilestoneErrorKey(error));
        },
      });
  }

  private resolveCreateMilestoneErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as RoadmapApiError | undefined)?.code;
    if (error.status === 400 && code) {
      // MILESTONE_DATE_REQUIRED / MILESTONE_DATE_OUT_OF_BOUNDS / LANE_NOT_FOUND all have a
      // dedicated catalogue entry (gérés explicitement — see this US's implementation notes).
      return `roadmap.board.createMilestone.errors.${code}`;
    }
    if (error.status === 403) {
      return 'roadmap.board.createMilestone.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'roadmap.board.createMilestone.errors.NOT_FOUND';
    }
    return 'roadmap.board.createMilestone.errors.GENERIC';
  }

  /**
   * See `onPlacementChange`'s TSDoc — identical optimistic-update/rollback/staleness-guard flow,
   * applied to a milestone's `date` instead of an initiative's fuzzy period. This is also the AC
   * "changement de date propagé partout" in action: the same `PATCH` this view issues is the
   * sole write path a future Gantt consumer would use too (see `Milestone`'s TSDoc) — there is no
   * separate propagation step, both views simply read the same row back.
   */
  protected onMilestoneDateChange(milestone: Milestone, change: MilestoneDateChange): void {
    const previous = this.milestones().find(m => m.id === milestone.id) ?? milestone;
    const optimistic: Milestone = { ...previous, ...change };
    const token = Symbol();
    this.pendingMilestoneTokens.set(milestone.id, token);

    this.milestoneDateErrorKey.set(null);
    this.milestones.update(list => list.map(m => (m.id === milestone.id ? optimistic : m)));
    this.announcement.set(
      this.transloco.translate('roadmap.board.milestones.marker.announceMoved', {
        name: previous.name,
        date: change.date,
      }),
    );

    this.roadmapApi
      .updateMilestone(this.projectRef, milestone.id, change)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          if (this.pendingMilestoneTokens.get(milestone.id) !== token) {
            return; // superseded by a more recent date change on this milestone
          }
          this.milestones.update(list => list.map(m => (m.id === milestone.id ? updated : m)));
        },
        error: (error: HttpErrorResponse) => {
          if (this.pendingMilestoneTokens.get(milestone.id) !== token) {
            return; // superseded — a newer change already owns this milestone's outcome
          }
          this.milestones.update(list => list.map(m => (m.id === milestone.id ? previous : m)));
          this.milestoneDateErrorKey.set(this.resolveMilestoneDateErrorKey(error));
          this.announcement.set(
            this.transloco.translate('roadmap.board.milestones.marker.announceReverted', { name: previous.name }),
          );
        },
      });
  }

  private resolveMilestoneDateErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as RoadmapApiError | undefined)?.code;
    if (error.status === 400 && code) {
      return `roadmap.board.milestoneDate.errors.${code}`;
    }
    if (error.status === 403) {
      return 'roadmap.board.milestoneDate.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'roadmap.board.milestoneDate.errors.NOT_FOUND';
    }
    return 'roadmap.board.milestoneDate.errors.GENERIC';
  }
}
