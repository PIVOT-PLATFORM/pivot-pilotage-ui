import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { TaskConstraintApiService } from '../data-access/task-constraint-api.service';
import {
  CONSTRAINT_TYPES,
  ConstraintType,
  ConstraintWarningType,
  DATELESS_CONSTRAINT_TYPES,
  TaskConstraint,
  TaskConstraintApiError,
  TaskConstraintProjectRef,
} from '../data-access/task-constraint.models';

/** Decorative (`aria-hidden`) glyph per warning kind — always paired with a translated text label, never the sole conveyor of meaning (A11y AC — "icône + texte", never colour alone). */
const WARNING_ICONS: Readonly<Record<ConstraintWarningType, string>> = {
  CONSTRAINT_CONFLICT: '⚠',
  DEADLINE_MISSED: '⏰',
  NEGATIVE_FLOAT: '⚠',
  REJECTED: '✕',
};

/**
 * Constraint/deadline editing panel for a single Gantt task (US22.4.4 — "Contraintes de date &
 * échéances"): read and set the task's single scheduling constraint (ASAP/ALAP/MSO/MFO/SNET/SNLT/
 * FNET/FNLT, MS Project referential, EN22.1a) plus an independent soft deadline, and surface the
 * engine's live warnings about it (`CONSTRAINT_CONFLICT`, `DEADLINE_MISSED`, `NEGATIVE_FLOAT`,
 * `REJECTED`).
 *
 * **No read gap (unlike `TaskSchedulingComponent`).** `GET .../constraint` already returns the full
 * state — this panel never needs to fall back on `GET .../gantt/tree` for context, see
 * `task-constraint.models.ts`'s class TSDoc.
 *
 * **AC1/AC2 — warnings are never computed client-side.** Whether a "Doit finir le" constraint is
 * honoured or conflicts with a hard dependency, and whether the computed finish date has passed a
 * deadline, are both CPM outcomes only the engine can know (EN22.1b) — this component only ever
 * *renders* {@link TaskConstraint.warnings} verbatim, exactly the "pas de logique métier dans les
 * composants" rule (CLAUDE.md). A deadline miss is never blocking (AC2 — "sans bloquer"): it is
 * rendered as one more warning entry, the form itself is never disabled by it.
 *
 * **Error AC — the date-required rule is pre-validated client-side** (a date-bearing type submitted
 * without `constraintDate` is fully knowable before any round trip) for immediate feedback; the
 * `422 INVALID_TASK_CONSTRAINT` mapping stays a tested defensive fallback for a race, never the only
 * path covered — same split `DependencyManagerComponent`/`TaskSchedulingComponent` already establish
 * for their own client-validatable rules.
 *
 * **Security.** No client-side role gating (CLAUDE.md — isolation/authorization is exclusively a
 * backend concern, `WbsEditPolicy`, fail-closed today): the form is always shown, every write is
 * attempted regardless of the caller's role, and a `403` is surfaced as an explicit, non-optimistic
 * error — same posture as `DependencyManagerComponent`/`TaskSchedulingComponent`. The `GET` itself is
 * unconditional (not gated server-side), so a conflict an editor raises stays visible read-only to
 * every other role without requiring a fresh write (Security AC), with no special-casing needed here.
 * A failed request (403/404/422) is never retried with different data (tenant-isolation rule).
 *
 * **A11y (AC).** Every warning is rendered as an icon (`aria-hidden`, decorative) *and* a translated
 * text label plus the backend's own detail sentence — never colour alone. The warnings list sits in
 * an `aria-live="polite"` region so a change (new/cleared warning, on load or after a write) is
 * announced; a successful save is separately announced through {@link announcement}, mirroring
 * `DependencyManagerComponent`/`TaskSchedulingComponent`'s identical pattern for their own mutations.
 *
 * **Route.** Expects `tenantId`/`teamId`/`projectId`/`taskId` as route params — same gap-era shape as
 * `TaskSchedulingComponent` (see {@link TaskConstraintProjectRef}'s TSDoc).
 */
@Component({
  selector: 'app-task-constraint',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './task-constraint.component.html',
  styleUrl: './task-constraint.component.scss',
})
export class TaskConstraintComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly constraintApi = inject(TaskConstraintApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  protected readonly constraintTypes = CONSTRAINT_TYPES;

  protected readonly projectRef: TaskConstraintProjectRef = this.readProjectRef();
  protected readonly taskId: number = Number(this.route.snapshot.paramMap.get('taskId'));

  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  /** Last confirmed server state (`GET` on load, `PUT` response after a successful save). */
  protected readonly constraint = signal<TaskConstraint | null>(null);

  /** Last save outcome, announced via an `aria-live="polite"` region (A11y AC). */
  protected readonly announcement = signal<string | null>(null);

  // --- form -----------------------------------------------------------------------------------

  protected readonly typeInput = signal<ConstraintType>('ASAP');
  protected readonly dateInput = signal('');
  protected readonly deadlineInput = signal('');
  protected readonly saving = signal(false);
  protected readonly saveErrorKey = signal<string | null>(null);

  /** Drives disabling/clearing the date field — ASAP/ALAP never carry a date (Error AC, EN22.1a). */
  protected readonly isDateless = computed(() => DATELESS_CONSTRAINT_TYPES.has(this.typeInput()));

  private readProjectRef(): TaskConstraintProjectRef {
    const params = this.route.snapshot.paramMap;
    return {
      tenantId: Number(params.get('tenantId')),
      teamId: Number(params.get('teamId')),
      projectId: Number(params.get('projectId')),
    };
  }

  ngOnInit(): void {
    this.loadConstraint();
  }

  protected retryLoad(): void {
    this.loadConstraint();
  }

  private loadConstraint(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);

    this.constraintApi
      .get(this.projectRef, this.taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.loading.set(false);
          this.applyResponse(response);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(
            error.status === 404
              ? 'gantt.taskConstraint.load.errors.NOT_FOUND'
              : 'gantt.taskConstraint.load.errors.GENERIC',
          );
        },
      });
  }

  /** Seeds both the read-only state and the form from a fresh server response (`GET` or `PUT`). */
  private applyResponse(response: TaskConstraint): void {
    this.constraint.set(response);
    this.typeInput.set(response.constraintType);
    this.dateInput.set(this.toLocalInputValue(response.constraintDate));
    this.deadlineInput.set(this.toLocalInputValue(response.deadline));
  }

  protected onTypeChange(event: Event): void {
    const type = (event.target as HTMLSelectElement).value as ConstraintType;
    this.typeInput.set(type);
    if (DATELESS_CONSTRAINT_TYPES.has(type)) {
      this.dateInput.set('');
    }
  }

  protected onDateInput(event: Event): void {
    this.dateInput.set((event.target as HTMLInputElement).value);
  }

  protected onDeadlineInput(event: Event): void {
    this.deadlineInput.set((event.target as HTMLInputElement).value);
  }

  /** Error AC — a date-bearing type submitted without a date is rejected client-side with an explicit message, before any round trip. */
  protected submit(): void {
    this.saveErrorKey.set(null);
    const type = this.typeInput();
    const dateless = DATELESS_CONSTRAINT_TYPES.has(type);

    let constraintDate: string | null = null;
    if (!dateless) {
      const parsed = this.parseLocalInput(this.dateInput());
      if (parsed === 'EMPTY') {
        this.saveErrorKey.set('gantt.taskConstraint.form.errors.DATE_REQUIRED');
        return;
      }
      if (parsed === 'INVALID') {
        this.saveErrorKey.set('gantt.taskConstraint.form.errors.INVALID_DATE');
        return;
      }
      constraintDate = parsed;
    }

    const parsedDeadline = this.parseLocalInput(this.deadlineInput());
    if (parsedDeadline === 'INVALID') {
      this.saveErrorKey.set('gantt.taskConstraint.form.errors.INVALID_DEADLINE');
      return;
    }
    const deadline = parsedDeadline === 'EMPTY' ? null : parsedDeadline;

    this.saving.set(true);
    this.constraintApi
      .set(this.projectRef, this.taskId, { constraintType: type, constraintDate, deadline })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.saving.set(false);
          this.applyResponse(response);
          this.announcement.set(this.announcementText(response));
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.saveErrorKey.set(this.resolveSaveErrorKey(error));
        },
      });
  }

  private announcementText(response: TaskConstraint): string {
    const typeLabel = this.transloco.translate(`gantt.taskConstraint.type.${response.constraintType}`);
    if (response.warnings.length > 0) {
      return this.transloco.translate('gantt.taskConstraint.form.announceUpdatedWithWarnings', {
        type: typeLabel,
        count: response.warnings.length,
      });
    }
    return this.transloco.translate('gantt.taskConstraint.form.announceUpdated', { type: typeLabel });
  }

  private resolveSaveErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as TaskConstraintApiError | undefined)?.code;
    if (error.status === 422 && code === 'INVALID_TASK_CONSTRAINT') {
      return 'gantt.taskConstraint.form.errors.INVALID_TASK_CONSTRAINT';
    }
    if (error.status === 403) {
      return 'gantt.taskConstraint.form.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.taskConstraint.form.errors.NOT_FOUND';
    }
    return 'gantt.taskConstraint.form.errors.GENERIC';
  }

  /** Decorative icon for a warning kind (A11y AC — always paired with translated text, see {@link WARNING_ICONS}). */
  protected warningIcon(type: ConstraintWarningType): string {
    return WARNING_ICONS[type];
  }

  /**
   * `<input type="datetime-local">` yields a local-time string with no offset — `new Date(...)`
   * interprets that as the browser's local time, then `toISOString()` serialises the correct UTC
   * instant, mirroring `RoadmapSharePanelComponent.submitCreate`'s identical conversion.
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

  /** Reverse of {@link parseLocalInput} — seeds a `datetime-local` input from a server ISO instant, in the browser's local time. */
  private toLocalInputValue(iso: string | null): string {
    if (!iso) {
      return '';
    }
    const date = new Date(iso);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
