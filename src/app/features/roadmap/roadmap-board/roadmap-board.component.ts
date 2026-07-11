import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import { RoadmapApiService } from '../data-access/roadmap-api.service';
import {
  Initiative,
  InitiativePlacementChange,
  Lane,
  RoadmapApiError,
  RoadmapProjectRef,
} from '../data-access/roadmap.models';
import { InitiativeBarComponent } from '../initiative-bar/initiative-bar.component';
import { QUARTER_WIDTH_PX, QuarterCell, buildQuarterAxis } from '../roadmap-timeline';

/**
 * Roadmap-rapide board (US22.3.1 — "Créer une roadmap rapide"): create lanes (flat groupings —
 * theme/team/objective), pose initiatives on them without requiring dates or child tasks (AC1),
 * and move/resize those initiatives with the mouse or the keyboard to set their approximate
 * period (AC2 + A11y AC).
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
 * **Route.** Expects `tenantId`/`teamId`/`projectId` as route params (mirroring the backend's
 * own path-segment shape — see {@link RoadmapProjectRef}'s TSDoc on why, given
 * `pivot-core-starter` isn't published yet). Not wired to this bootstrap's placeholder Home
 * route (see `app.routes.ts`) — once this module is genuinely lazy-loaded inside the `pivot-ui`
 * shell, the shell's own routing (which already resolves tenant/team context) supplies these
 * segments; this repo never types, stores or manages a tenant/team id itself.
 */
@Component({
  selector: 'app-roadmap-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InitiativeBarComponent, TranslocoPipe],
  templateUrl: './roadmap-board.component.html',
  styleUrl: './roadmap-board.component.scss',
})
export class RoadmapBoardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly roadmapApi = inject(RoadmapApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly quarterWidthPx = QUARTER_WIDTH_PX;
  protected readonly quarters: readonly QuarterCell[] = buildQuarterAxis(new Date());
  protected readonly axisWidthPx = this.quarters.length * QUARTER_WIDTH_PX;
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

  private readonly projectRef: RoadmapProjectRef = this.readProjectRef();

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

  protected initiativesForLane(laneId: number): Initiative[] {
    return this.initiatives().filter(initiative => initiative.laneId === laneId);
  }

  protected retryLoad(): void {
    this.loadRoadmap();
  }

  private loadRoadmap(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);

    forkJoin({
      lanes: this.roadmapApi.listLanes(this.projectRef),
      initiatives: this.roadmapApi.listInitiatives(this.projectRef),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ lanes, initiatives }) => {
          this.lanes.set(lanes);
          this.initiatives.set(initiatives);
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

  /** See class TSDoc — optimistic update, rollback on failure. */
  protected onPlacementChange(initiative: Initiative, change: InitiativePlacementChange): void {
    const previous = initiative;
    const optimistic: Initiative = { ...initiative, ...change };
    this.placementErrorKey.set(null);
    this.initiatives.update(list => list.map(i => (i.id === initiative.id ? optimistic : i)));
    this.announcement.set(
      `${initiative.name}: ${change.fuzzyPeriodStart} → ${change.fuzzyPeriodEnd}`,
    );

    this.roadmapApi
      .updatePlacement(this.projectRef, initiative.id, change)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.initiatives.update(list => list.map(i => (i.id === initiative.id ? updated : i)));
        },
        error: (error: HttpErrorResponse) => {
          this.initiatives.update(list => list.map(i => (i.id === initiative.id ? previous : i)));
          this.placementErrorKey.set(this.resolvePlacementErrorKey(error));
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
}
