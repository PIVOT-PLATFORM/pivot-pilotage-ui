import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { WbsApiService } from '../data-access/wbs-api.service';
import { WbsTaskResponse } from '../data-access/wbs.models';
import { TaskSchedulingApiService } from '../data-access/task-scheduling-api.service';
import {
  SchedulingMode,
  TaskSchedulingApiError,
  TaskSchedulingProjectRef,
  TaskSchedulingResponse,
} from '../data-access/task-scheduling.models';

/**
 * Duration/effort/scheduling-mode editing panel for a single task (US22.4.2 — "Durées, effort,
 * planification auto vs manuelle"). Three independent levers, one per backend endpoint
 * (`TaskEffortService`, PR #49): duration (worked minutes), effort (a resource's units, from which
 * work = duration × units is server-derived) and the AUTO/MANUAL toggle.
 *
 * **Read gap (PO Agent Gate 1 resolution) — see `task-scheduling.models.ts`'s class TSDoc for the
 * full rationale.** PR #49 added only the three `PATCH` endpoints; there is no `GET` anywhere
 * that returns a task's current `schedulingMode`/`workMinutes`/manual-variance. This component:
 * - seeds its **duration** field and **node-kind** (needed for the "zero duration only on a
 *   milestone" rule) from the already-existing, already-tested `GET .../gantt/tree`
 *   ({@link WbsApiService.tree}) — the same reuse `DependencyManagerComponent` already makes for
 *   its task pickers;
 * - treats **effort/mode/dates/variance** as **unknown until the first successful write** from
 *   this panel: {@link scheduling} stays `null` and every derived field renders an explicit
 *   "not yet confirmed" placeholder (never a guessed default) until a `PATCH` response arrives, at
 *   which point {@link scheduling} becomes the single source of truth for all of them.
 *
 * **Read-only vs editable (summary requirement).** A `SUMMARY` WBS node's temporal fields are
 * always server-aggregated from its sub-tasks and flagged `readOnly` (US22.4.1c) — this panel
 * never offers duration/effort/mode forms for one, mirroring `WbsTreeComponent`'s own read-only
 * badge treatment; only its context (name, WBS code, aggregated duration) is shown.
 *
 * **No optimistic update.** Mirrors `WbsTreeComponent`'s structural-action posture: on a failed
 * write, the input the user was editing is reverted to the last **confirmed** value (from
 * {@link scheduling} if a previous write already succeeded, else the tree-seeded initial value) —
 * never left showing a value the backend never persisted (Error AC: "la tâche conserve ses valeurs
 * précédentes").
 *
 * **Client-side pre-validation.** The duration/units rules (negative, zero-on-non-milestone,
 * non-positive units) are fully knowable client-side once the node kind is known, so they are
 * pre-validated here for immediate feedback — the `422 INVALID_TASK_EFFORT` mapping stays a tested
 * defensive fallback for a race (e.g. the node kind changed concurrently), never the only path
 * covered, mirroring `DependencyManagerComponent`'s identical split between client- and
 * server-validated cases.
 *
 * **Security.** No client-side role gating (CLAUDE.md — isolation/authorization is exclusively a
 * backend concern, `WbsEditPolicy`, fail-closed today): every write is attempted regardless of the
 * caller's role, and a `403` is surfaced as an explicit, non-optimistic error.
 *
 * **A11y (AC).** The AUTO/MANUAL toggle is a pair of native `<button>`s carrying `aria-pressed`
 * (never a `<select>` — the AC names `aria-pressed` explicitly), duration/effort are labelled
 * native `<input>`s, and every outcome (a successful write, including the resulting variance for a
 * MANUAL task) is announced through an `aria-live="polite"` region ({@link announcement}),
 * mirroring `WbsTreeComponent`/`DependencyManagerComponent`'s identical pattern.
 *
 * **Route.** Expects `tenantId`/`teamId`/`projectId`/`taskId` as route params — same gap-era shape
 * as the rest of this feature (see {@link TaskSchedulingProjectRef}'s TSDoc).
 */
@Component({
  selector: 'app-task-scheduling',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './task-scheduling.component.html',
  styleUrl: './task-scheduling.component.scss',
})
export class TaskSchedulingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly wbsApi = inject(WbsApiService);
  private readonly schedulingApi = inject(TaskSchedulingApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  protected readonly projectRef: TaskSchedulingProjectRef = this.readProjectRef();
  protected readonly taskId: number = Number(this.route.snapshot.paramMap.get('taskId'));

  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  /** The node's read-only context (name, WBS code, node kind, `readOnly`) from `GET .../gantt/tree`. */
  protected readonly node = signal<WbsTaskResponse | null>(null);

  /** Authoritative post-write state — `null` until the first successful PATCH (see class TSDoc). */
  protected readonly scheduling = signal<TaskSchedulingResponse | null>(null);

  protected readonly isSummary = computed(() => this.node()?.readOnly === true);
  protected readonly isMilestone = computed(() => this.node()?.nodeKind === 'MILESTONE');

  /** Last outcome, announced via an `aria-live="polite"` region (A11y AC). */
  protected readonly announcement = signal<string | null>(null);

  // --- duration form -------------------------------------------------------------------------

  protected readonly durationInput = signal('0');
  protected readonly savingDuration = signal(false);
  protected readonly durationErrorKey = signal<string | null>(null);

  // --- effort form ----------------------------------------------------------------------------

  protected readonly resourceRefInput = signal('');
  protected readonly unitsPercentInput = signal('100');
  protected readonly savingEffort = signal(false);
  protected readonly effortErrorKey = signal<string | null>(null);

  // --- scheduling-mode toggle -----------------------------------------------------------------

  protected readonly savingMode = signal(false);
  protected readonly modeErrorKey = signal<string | null>(null);

  private readProjectRef(): TaskSchedulingProjectRef {
    const params = this.route.snapshot.paramMap;
    return {
      tenantId: Number(params.get('tenantId')),
      teamId: Number(params.get('teamId')),
      projectId: Number(params.get('projectId')),
    };
  }

  ngOnInit(): void {
    this.loadContext();
  }

  protected retryLoad(): void {
    this.loadContext();
  }

  /** Seeds the read-only context (name, WBS code, node kind) and the duration form's initial value from the tree (see class TSDoc "Read gap"). */
  private loadContext(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);

    this.wbsApi
      .tree(this.projectRef)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tree => {
          this.loading.set(false);
          const found = tree.nodes.find(n => n.taskId === this.taskId);
          if (!found) {
            this.loadErrorKey.set('gantt.taskScheduling.load.errors.NOT_FOUND');
            return;
          }
          this.node.set(found);
          this.durationInput.set(String(found.durationMinutes ?? 0));
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(
            error.status === 404 ? 'gantt.taskScheduling.load.errors.NOT_FOUND' : 'gantt.taskScheduling.load.errors.GENERIC',
          );
        },
      });
  }

  /** Last confirmed duration — the tree-seeded value until a write succeeds, then the fresh authoritative one (see class TSDoc "No optimistic update"). */
  private lastConfirmedDurationMinutes(): number {
    return this.scheduling()?.durationMinutes ?? this.node()?.durationMinutes ?? 0;
  }

  protected onDurationInput(event: Event): void {
    this.durationInput.set((event.target as HTMLInputElement).value);
  }

  /** Error AC — negative/zero-on-non-milestone/non-numeric duration is pre-validated and rejected client-side; the `422` mapping below stays a tested fallback for a race. */
  protected submitDuration(): void {
    this.durationErrorKey.set(null);
    const raw = this.durationInput().trim();

    if (raw === '') {
      this.durationErrorKey.set('gantt.taskScheduling.duration.errors.REQUIRED');
      this.durationInput.set(String(this.lastConfirmedDurationMinutes()));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      this.durationErrorKey.set('gantt.taskScheduling.duration.errors.NOT_A_NUMBER');
      this.durationInput.set(String(this.lastConfirmedDurationMinutes()));
      return;
    }
    if (parsed < 0) {
      this.durationErrorKey.set('gantt.taskScheduling.duration.errors.NEGATIVE');
      this.durationInput.set(String(this.lastConfirmedDurationMinutes()));
      return;
    }
    if (parsed === 0 && !this.isMilestone()) {
      this.durationErrorKey.set('gantt.taskScheduling.duration.errors.ZERO_NON_MILESTONE');
      this.durationInput.set(String(this.lastConfirmedDurationMinutes()));
      return;
    }

    this.savingDuration.set(true);
    this.schedulingApi
      .setDuration(this.projectRef, this.taskId, parsed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.savingDuration.set(false);
          this.scheduling.set(response);
          this.durationInput.set(String(response.durationMinutes ?? 0));
          this.announcement.set(
            this.transloco.translate('gantt.taskScheduling.duration.announceUpdated', {
              minutes: response.durationMinutes ?? 0,
            }),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.savingDuration.set(false);
          this.durationErrorKey.set(this.resolveDurationErrorKey(error));
          this.durationInput.set(String(this.lastConfirmedDurationMinutes()));
        },
      });
  }

  private resolveDurationErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as TaskSchedulingApiError | undefined)?.code;
    if (error.status === 422 && code === 'INVALID_TASK_EFFORT') {
      return 'gantt.taskScheduling.duration.errors.INVALID_TASK_EFFORT';
    }
    if (error.status === 403) {
      return 'gantt.taskScheduling.duration.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.taskScheduling.duration.errors.NOT_FOUND';
    }
    return 'gantt.taskScheduling.duration.errors.GENERIC';
  }

  // --- effort ---------------------------------------------------------------------------------

  protected onResourceRefInput(event: Event): void {
    this.resourceRefInput.set((event.target as HTMLInputElement).value);
  }

  protected onUnitsPercentInput(event: Event): void {
    this.unitsPercentInput.set((event.target as HTMLInputElement).value);
  }

  /** Error AC — a blank resource reference or a non-positive/non-numeric units value is pre-validated and rejected client-side; the `422` mapping stays a tested fallback. */
  protected submitEffort(): void {
    this.effortErrorKey.set(null);
    const resourceRef = this.resourceRefInput().trim();
    if (resourceRef === '') {
      this.effortErrorKey.set('gantt.taskScheduling.effort.errors.RESOURCE_REQUIRED');
      return;
    }
    const raw = this.unitsPercentInput().trim();
    if (raw === '') {
      this.effortErrorKey.set('gantt.taskScheduling.effort.errors.UNITS_REQUIRED');
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      this.effortErrorKey.set('gantt.taskScheduling.effort.errors.NOT_A_NUMBER');
      return;
    }
    if (parsed <= 0) {
      this.effortErrorKey.set('gantt.taskScheduling.effort.errors.NON_POSITIVE');
      return;
    }

    this.savingEffort.set(true);
    this.schedulingApi
      .setEffort(this.projectRef, this.taskId, resourceRef, parsed)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.savingEffort.set(false);
          this.scheduling.set(response);
          this.announcement.set(
            this.transloco.translate('gantt.taskScheduling.effort.announceUpdated', {
              resourceRef,
              units: parsed,
              work: response.workMinutes ?? 0,
            }),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.savingEffort.set(false);
          this.effortErrorKey.set(this.resolveEffortErrorKey(error));
        },
      });
  }

  private resolveEffortErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as TaskSchedulingApiError | undefined)?.code;
    if (error.status === 422 && code === 'INVALID_TASK_EFFORT') {
      return 'gantt.taskScheduling.effort.errors.INVALID_TASK_EFFORT';
    }
    if (error.status === 403) {
      return 'gantt.taskScheduling.effort.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.taskScheduling.effort.errors.NOT_FOUND';
    }
    return 'gantt.taskScheduling.effort.errors.GENERIC';
  }

  // --- scheduling mode --------------------------------------------------------------------------

  /** `true` while the current known mode is the given one — drives `aria-pressed` (A11y AC). Neither button is pressed until the mode is confirmed (see class TSDoc "Read gap"). */
  protected isMode(mode: SchedulingMode): boolean {
    return this.scheduling()?.effectiveMode === mode;
  }

  protected setSchedulingMode(mode: SchedulingMode): void {
    this.modeErrorKey.set(null);
    this.savingMode.set(true);
    this.schedulingApi
      .setSchedulingMode(this.projectRef, this.taskId, mode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.savingMode.set(false);
          this.scheduling.set(response);
          this.announcement.set(this.modeAnnouncementText(response));
        },
        error: (error: HttpErrorResponse) => {
          this.savingMode.set(false);
          this.modeErrorKey.set(this.resolveModeErrorKey(error));
        },
      });
  }

  /** Announces the new mode and, for MANUAL, the engine's variance (AC2 — "un écart est signalé"). */
  private modeAnnouncementText(response: TaskSchedulingResponse): string {
    if (response.effectiveMode === 'MANUAL' && response.deltaMinutes !== 0) {
      return this.transloco.translate('gantt.taskScheduling.mode.announceManualWithVariance', {
        deltaMinutes: response.deltaMinutes,
      });
    }
    return this.transloco.translate('gantt.taskScheduling.mode.announceChanged', {
      mode: this.transloco.translate(`gantt.taskScheduling.mode.${response.effectiveMode}`),
    });
  }

  private resolveModeErrorKey(error: HttpErrorResponse): string {
    if (error.status === 403) {
      return 'gantt.taskScheduling.mode.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.taskScheduling.mode.errors.NOT_FOUND';
    }
    return 'gantt.taskScheduling.mode.errors.GENERIC';
  }

  /** `yyyy-MM-dd` display for an ISO instant, or the shared "not yet confirmed" placeholder — never a guessed default (class TSDoc "Read gap"). */
  protected formatDate(iso: string | null | undefined): string {
    return iso ? iso.slice(0, 10) : this.transloco.translate('gantt.taskScheduling.unknownValue');
  }
}
