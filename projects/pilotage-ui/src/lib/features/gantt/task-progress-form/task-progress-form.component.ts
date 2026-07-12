import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { WbsApiService } from '../data-access/wbs-api.service';
import { WbsTaskResponse } from '../data-access/wbs.models';
import { TaskProgressApiService } from '../data-access/task-progress-api.service';
import {
  TaskProgressApiError,
  TaskProgressProjectRef,
  TaskProgressResponse,
  UpdateTaskProgressRequest,
} from '../data-access/task-progress.models';

/**
 * Progress-tracking form for a single Gantt task (US22.4.8 — "Suivi d'avancement (% réalisé,
 * réel/restant)"): captures percent complete, an optional distinct physical percent, optional
 * actual start/finish dates and this entry's own status (freshness) date, then displays the
 * refreshed bar and actual/remaining work the server derives from it. Single
 * `PATCH .../gantt/tasks/{taskId}/progress` call ({@link TaskProgressApiService.set}).
 *
 * **Read gap (PO Agent Gate 1 resolution) — same posture as `TaskSchedulingComponent`, see
 * `task-progress.models.ts`'s class TSDoc for the full rationale.** This US adds only the
 * `PATCH` endpoint; there is no dedicated `GET` for a task's physical percent/actual dates/status
 * date/actual-remaining-total work. This component:
 * - seeds its **percent complete** field, and its read-only context (name, WBS code, node kind,
 *   `readOnly`), from the already-existing, already-tested `GET .../gantt/tree`
 *   ({@link WbsApiService.tree});
 * - treats **physical percent / actual work / remaining work / total work / actual start-finish /
 *   status date / revision** as **unknown until the first successful write** from this form:
 *   {@link progress} stays `null` and every derived field renders an explicit "not yet confirmed"
 *   placeholder (never a guessed default) until a `PATCH` response arrives, at which point
 *   {@link progress} becomes the single source of truth for all of them.
 *
 * **Read-only vs editable (summary requirement, Error AC).** A `SUMMARY` WBS node's percent
 * complete is always server-aggregated from its sub-tasks (EN22.1c rollup, charge-weighted mean)
 * and flagged `readOnly` (US22.4.1c) — a direct edit attempt is rejected `422
 * DERIVED_FIELD_NOT_EDITABLE` server-side. This form never offers an editable form for one,
 * mirroring `TaskSchedulingComponent`'s identical summary-vs-leaf branching: only the aggregated
 * percent/label are shown, read-only.
 *
 * **Client-side pre-validation (Error AC).** The `[0, 100]` range on percent/physical percent and
 * the "actual finish not before actual start" rule are both fully knowable client-side, so they
 * are pre-validated here for immediate feedback — the `422 INVALID_TASK_PROGRESS` mapping stays a
 * tested defensive fallback for a race, never the only path covered, mirroring
 * `TaskConstraintComponent`'s identical split between client- and server-validated cases.
 *
 * **`actorRef` — free-form logical reference, not a real identity (gap-era, ADR-006).** Same
 * posture as `TaskSchedulingComponent`'s `resourceRef` field: a text input the user types, never a
 * real `userId`/authenticated identity (none is consumable yet, `pivot-core-starter` gap) and
 * never used for authorization — it only stamps the audit trail's "auteur" column, server-side
 * (Security AC "l'historique des saisies est tracé (auteur, date)").
 *
 * **No optimistic update.** Same spirit as `TaskSchedulingComponent`'s posture: the derived
 * read-only section ({@link progress}) only ever reflects a *confirmed* server response, never a
 * guess — a failed write leaves the editable inputs exactly as the user left them (so they can
 * correct and resubmit) without touching that derived section, mirroring
 * `TaskConstraintComponent`'s simpler "leave the form as typed on error" posture (this form's
 * inputs are never the sole display of the confirmed state, unlike `TaskSchedulingComponent`'s
 * duration field, so there is nothing to revert).
 *
 * **Security.** No client-side role gating (CLAUDE.md — isolation/authorization is exclusively a
 * backend concern, `WbsEditPolicy`, fail-closed today): the write is attempted regardless of the
 * caller's role, and a `403` is surfaced as an explicit, non-optimistic error. A failed request
 * (403/404/422) is never retried with different data (tenant-isolation rule).
 *
 * **A11y (AC).** The percent complete and the derived bar/remaining-work readout expose their
 * value as text (never colour/fill alone) — see the template's `.task-progress-form__bar-label`
 * and the `<dl>` derived section. A successful save is announced through an `aria-live="polite"`
 * region ({@link announcement}), mirroring every other Gantt form in this repo.
 *
 * **Route.** Expects `tenantId`/`teamId`/`projectId`/`taskId` as route params — same gap-era shape
 * as `TaskSchedulingComponent`/`TaskConstraintComponent` (see {@link TaskProgressProjectRef}'s
 * TSDoc).
 */
@Component({
  selector: 'app-task-progress-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './task-progress-form.component.html',
  styleUrl: './task-progress-form.component.scss',
})
export class TaskProgressFormComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly wbsApi = inject(WbsApiService);
  private readonly progressApi = inject(TaskProgressApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  protected readonly projectRef: TaskProgressProjectRef = this.readProjectRef();
  protected readonly taskId: number = Number(this.route.snapshot.paramMap.get('taskId'));

  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  /** The node's read-only context (name, WBS code, node kind, `readOnly`, aggregated percent) from `GET .../gantt/tree`. */
  protected readonly node = signal<WbsTaskResponse | null>(null);

  /** Authoritative post-write state — `null` until the first successful PATCH (see class TSDoc). */
  protected readonly progress = signal<TaskProgressResponse | null>(null);

  protected readonly isSummary = computed(() => this.node()?.readOnly === true);

  /** Last outcome, announced via an `aria-live="polite"` region (A11y AC). */
  protected readonly announcement = signal<string | null>(null);

  // --- form -----------------------------------------------------------------------------------

  protected readonly percentCompleteInput = signal('0');
  protected readonly physicalPercentCompleteInput = signal('');
  protected readonly actualStartInput = signal('');
  protected readonly actualFinishInput = signal('');
  protected readonly statusDateInput = signal('');
  protected readonly actorRefInput = signal('');

  protected readonly saving = signal(false);
  protected readonly saveErrorKey = signal<string | null>(null);

  private readProjectRef(): TaskProgressProjectRef {
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

  /** Seeds the read-only context and the percent-complete form field from the tree (see class TSDoc "Read gap"). */
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
            this.loadErrorKey.set('gantt.taskProgress.load.errors.NOT_FOUND');
            return;
          }
          this.node.set(found);
          this.percentCompleteInput.set(String(found.percentComplete ?? 0));
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(
            error.status === 404 ? 'gantt.taskProgress.load.errors.NOT_FOUND' : 'gantt.taskProgress.load.errors.GENERIC',
          );
        },
      });
  }

  // --- field handlers ---------------------------------------------------------------------------

  protected onPercentCompleteInput(event: Event): void {
    this.percentCompleteInput.set((event.target as HTMLInputElement).value);
  }

  protected onPhysicalPercentCompleteInput(event: Event): void {
    this.physicalPercentCompleteInput.set((event.target as HTMLInputElement).value);
  }

  protected onActualStartInput(event: Event): void {
    this.actualStartInput.set((event.target as HTMLInputElement).value);
  }

  protected onActualFinishInput(event: Event): void {
    this.actualFinishInput.set((event.target as HTMLInputElement).value);
  }

  protected onStatusDateInput(event: Event): void {
    this.statusDateInput.set((event.target as HTMLInputElement).value);
  }

  protected onActorRefInput(event: Event): void {
    this.actorRefInput.set((event.target as HTMLInputElement).value);
  }

  // --- submit ------------------------------------------------------------------------------------

  /**
   * Error AC — an out-of-range percent (own or physical) or an actual finish preceding the actual
   * start is rejected client-side with an immediate, field-specific message, before any round
   * trip; see class TSDoc "Client-side pre-validation".
   */
  protected submit(): void {
    this.saveErrorKey.set(null);

    const percentComplete = this.parsePercent(this.percentCompleteInput());
    if (percentComplete === 'EMPTY' || percentComplete === 'INVALID') {
      this.saveErrorKey.set(
        percentComplete === 'EMPTY'
          ? 'gantt.taskProgress.form.errors.PERCENT_REQUIRED'
          : 'gantt.taskProgress.form.errors.PERCENT_NOT_A_NUMBER',
      );
      return;
    }
    if (percentComplete < 0 || percentComplete > 100) {
      this.saveErrorKey.set('gantt.taskProgress.form.errors.PERCENT_OUT_OF_RANGE');
      return;
    }

    const physicalPercentComplete = this.parsePercent(this.physicalPercentCompleteInput());
    if (physicalPercentComplete === 'INVALID') {
      this.saveErrorKey.set('gantt.taskProgress.form.errors.PHYSICAL_PERCENT_NOT_A_NUMBER');
      return;
    }
    if (physicalPercentComplete !== 'EMPTY' && (physicalPercentComplete < 0 || physicalPercentComplete > 100)) {
      this.saveErrorKey.set('gantt.taskProgress.form.errors.PHYSICAL_PERCENT_OUT_OF_RANGE');
      return;
    }

    const actualStart = this.parseLocalInput(this.actualStartInput());
    if (actualStart === 'INVALID') {
      this.saveErrorKey.set('gantt.taskProgress.form.errors.INVALID_ACTUAL_START');
      return;
    }
    const actualFinish = this.parseLocalInput(this.actualFinishInput());
    if (actualFinish === 'INVALID') {
      this.saveErrorKey.set('gantt.taskProgress.form.errors.INVALID_ACTUAL_FINISH');
      return;
    }
    if (actualStart !== 'EMPTY' && actualFinish !== 'EMPTY' && actualFinish < actualStart) {
      this.saveErrorKey.set('gantt.taskProgress.form.errors.ACTUAL_FINISH_BEFORE_START');
      return;
    }

    const statusDateRaw = this.statusDateInput().trim();
    if (statusDateRaw !== '' && Number.isNaN(new Date(statusDateRaw).getTime())) {
      this.saveErrorKey.set('gantt.taskProgress.form.errors.INVALID_STATUS_DATE');
      return;
    }

    const actorRef = this.actorRefInput().trim();
    if (actorRef === '') {
      this.saveErrorKey.set('gantt.taskProgress.form.errors.ACTOR_REF_REQUIRED');
      return;
    }

    const request: UpdateTaskProgressRequest = {
      percentComplete,
      physicalPercentComplete: physicalPercentComplete === 'EMPTY' ? null : physicalPercentComplete,
      actualStart: actualStart === 'EMPTY' ? null : actualStart,
      actualFinish: actualFinish === 'EMPTY' ? null : actualFinish,
      statusDate: statusDateRaw === '' ? null : statusDateRaw,
      actorRef,
    };

    this.saving.set(true);
    this.progressApi
      .set(this.projectRef, this.taskId, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.saving.set(false);
          this.progress.set(response);
          this.announcement.set(
            this.transloco.translate('gantt.taskProgress.form.announceUpdated', { progress: response.progressLabel }),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.saveErrorKey.set(this.resolveSaveErrorKey(error));
        },
      });
  }

  private resolveSaveErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as TaskProgressApiError | undefined)?.code;
    if (error.status === 422 && code === 'INVALID_TASK_PROGRESS') {
      return 'gantt.taskProgress.form.errors.INVALID_TASK_PROGRESS';
    }
    if (error.status === 422 && code === 'DERIVED_FIELD_NOT_EDITABLE') {
      return 'gantt.taskProgress.form.errors.DERIVED_FIELD_NOT_EDITABLE';
    }
    if (error.status === 403) {
      return 'gantt.taskProgress.form.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.taskProgress.form.errors.NOT_FOUND';
    }
    return 'gantt.taskProgress.form.errors.GENERIC';
  }

  /**
   * Defensive only: a real `type="number"` input normalizes any non-numeric keystroke to `''`
   * (caught by the `'EMPTY'` case below) before the `'INVALID'` branch is ever reached from this
   * form's own UI — same posture as `TaskSchedulingComponent.submitEffort`'s identical comment on
   * its own units-input validation.
   *
   * @returns the parsed percent, `'EMPTY'` when the input is blank, or `'INVALID'` when
   *          unparsable — range checking (`[0, 100]`) is the caller's responsibility, see
   *          {@link submit}.
   */
  private parsePercent(raw: string): number | 'EMPTY' | 'INVALID' {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return 'EMPTY';
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 'INVALID';
  }

  /**
   * `<input type="datetime-local">` yields a local-time string with no offset — `new Date(...)`
   * interprets that as the browser's local time, then `toISOString()` serialises the correct UTC
   * instant, mirroring `TaskConstraintComponent.parseLocalInput`'s identical conversion.
   *
   * @returns the ISO instant, `'EMPTY'` when the input is blank, or `'INVALID'` when unparsable
   */
  private parseLocalInput(raw: string): string | 'EMPTY' | 'INVALID' {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return 'EMPTY';
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? 'INVALID' : parsed.toISOString();
  }

  /** `yyyy-MM-dd` display for an ISO instant, or the shared "not yet confirmed" placeholder — never a guessed default (class TSDoc "Read gap"). */
  protected formatInstant(iso: string | null | undefined): string {
    return iso ? iso.slice(0, 10) : this.transloco.translate('gantt.taskProgress.unknownValue');
  }
}
