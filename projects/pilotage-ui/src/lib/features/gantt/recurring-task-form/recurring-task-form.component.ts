import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NodeKindIconComponent } from '../node-kind-icon/node-kind-icon.component';
import { WbsApiService } from '../data-access/wbs-api.service';
import {
  CreateRecurringTaskRequest,
  GanttProjectRef,
  MAX_RECURRING_OCCURRENCES,
  RecurrenceFrequency,
  RecurringTaskResponse,
  WbsApiError,
  WbsTaskResponse,
} from '../data-access/wbs.models';

/** The three cadences this form offers, in display order — mirrors `RecurrenceFrequency`. */
const FREQUENCIES: readonly RecurrenceFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

/**
 * Periodic-task series creation form (US22.4.6 — "Jalons & tâches périodiques", second half:
 * "given une tâche périodique (fréquence, occurrences), when je la crée, then les occurrences
 * sont générées selon le calendrier"). Single `POST .../gantt/tasks/recurring` call
 * ({@link WbsApiService.createRecurringTask}) creates a `RECURRING` series task plus every
 * generated occurrence in one backend transaction — see that method's TSDoc for the exact
 * request/response contract.
 *
 * **Everything about *where* an occurrence lands is backend-derived, never computed here.** The
 * date of each occurrence is the frequency/interval offset from `firstOccurrenceDate`, then
 * snapped forward onto the project's working calendar (US22.4.5) — this form only ever displays
 * the dates the response comes back with, exactly like `WbsTreeComponent` never recomputes a
 * hierarchy client-side.
 *
 * **MILESTONE vs LEAF occurrences (AC1 reuse).** An omitted/zero {@link durationMinutesInput}
 * classifies every generated occurrence `MILESTONE` (same `durationMinutes=0` rule as a plain
 * task creation); a positive one classifies them `LEAF`. The result panel renders each
 * occurrence's kind with the same {@link NodeKindIconComponent} losange `WbsTreeComponent` uses,
 * so a periodic series of jalons reads identically wherever it appears.
 *
 * **Client-side pre-validation.** `name`/`firstOccurrenceDate`/`frequency` blank, or
 * `occurrenceCount` non-positive/non-integer/over {@link MAX_RECURRING_OCCURRENCES}, are rejected
 * client-side with an immediate, field-specific message — no round trip. The `422
 * INVALID_RECURRENCE` mapping stays a tested defensive fallback for a race (e.g. a concurrent
 * config change), never the only path covered — same posture as `DependencyManagerComponent`'s
 * identical split between client- and server-validated cases.
 *
 * **Parent picker.** Populated from {@link WbsApiService.tree} — a read of the existing WBS
 * (labelled `"{wbsCode} — {name}"`, same convention as `DependencyManagerComponent`'s task
 * pickers) for context only; this component never edits that tree directly. Leaving it unselected
 * attaches the new series at the WBS root (`parentTaskId` omitted from the request body).
 *
 * **Security.** No client-side role gating (CLAUDE.md — isolation/authorization is exclusively a
 * backend concern, `WbsEditPolicy`, fail-closed today): the write is attempted regardless of the
 * caller's role, and a `403` is surfaced as an explicit, non-optimistic error. A `404` (project or
 * a supplied `parentTaskId` not visible) is shown as one single non-disclosure message — never
 * distinguishing which resource was missing, and never retried with different data (CLAUDE.md
 * tenant-isolation rule).
 *
 * **A11y (AC).** Every interactive control is a native `<input>`/`<select>`/`<button>` — reachable
 * and operable with the keyboard alone. A successful creation is announced through an
 * `aria-live="polite"` region ({@link announcement}), mirroring every other Gantt form in this
 * repo; the generated series/occurrences are additionally rendered as a `role="list"` so
 * assistive tech reports the resulting count.
 *
 * **Route.** Expects `tenantId`/`teamId`/`projectId` as route params — same gap-era shape as
 * `WbsTreeComponent` (see {@link GanttProjectRef}'s TSDoc).
 */
@Component({
  selector: 'app-recurring-task-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, NodeKindIconComponent],
  templateUrl: './recurring-task-form.component.html',
  styleUrl: './recurring-task-form.component.scss',
})
export class RecurringTaskFormComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly wbsApi = inject(WbsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  protected readonly projectRef: GanttProjectRef = this.readProjectRef();
  protected readonly frequencies = FREQUENCIES;
  protected readonly maxOccurrences = MAX_RECURRING_OCCURRENCES;

  protected readonly tasks = signal<WbsTaskResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  /** Last outcome, announced via an `aria-live="polite"` region (A11y AC). */
  protected readonly announcement = signal<string | null>(null);

  // --- form fields ------------------------------------------------------------------------------

  protected readonly nameInput = signal('');
  protected readonly parentTaskIdInput = signal<number | null>(null);
  protected readonly firstOccurrenceDateInput = signal('');
  protected readonly frequencyInput = signal<RecurrenceFrequency | ''>('');
  protected readonly intervalCountInput = signal('1');
  protected readonly occurrenceCountInput = signal('');
  protected readonly durationMinutesInput = signal('');

  protected readonly creating = signal(false);
  protected readonly createErrorKey = signal<string | null>(null);

  protected readonly result = signal<RecurringTaskResponse | null>(null);

  private readProjectRef(): GanttProjectRef {
    const params = this.route.snapshot.paramMap;
    return {
      tenantId: Number(params.get('tenantId')),
      teamId: Number(params.get('teamId')),
      projectId: Number(params.get('projectId')),
    };
  }

  ngOnInit(): void {
    this.loadTasks();
  }

  protected retryLoad(): void {
    this.loadTasks();
  }

  /** Seeds the parent-task picker from the existing WBS tree (see class TSDoc "Parent picker"). */
  private loadTasks(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);

    this.wbsApi
      .tree(this.projectRef)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tree => {
          this.tasks.set(tree.nodes);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(
            error.status === 404 ? 'gantt.recurringTask.load.errors.NOT_FOUND' : 'gantt.recurringTask.load.errors.GENERIC',
          );
        },
      });
  }

  // --- field handlers -----------------------------------------------------------------------------

  protected onNameInput(event: Event): void {
    this.nameInput.set((event.target as HTMLInputElement).value);
  }

  protected onParentTaskIdChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.parentTaskIdInput.set(value ? Number(value) : null);
  }

  protected onFirstOccurrenceDateInput(event: Event): void {
    this.firstOccurrenceDateInput.set((event.target as HTMLInputElement).value);
  }

  protected onFrequencyChange(event: Event): void {
    this.frequencyInput.set((event.target as HTMLSelectElement).value as RecurrenceFrequency | '');
  }

  protected onIntervalCountInput(event: Event): void {
    this.intervalCountInput.set((event.target as HTMLInputElement).value);
  }

  protected onOccurrenceCountInput(event: Event): void {
    this.occurrenceCountInput.set((event.target as HTMLInputElement).value);
  }

  protected onDurationMinutesInput(event: Event): void {
    this.durationMinutesInput.set((event.target as HTMLInputElement).value);
  }

  // --- submit --------------------------------------------------------------------------------------

  /**
   * Error AC ("given une tâche périodique sans fréquence ni nombre d'occurrences valide, then la
   * création est refusée avec un message explicite") — `frequency` and `occurrenceCount` are
   * pre-validated here, client-side, before any request is sent; see class TSDoc
   * "Client-side pre-validation".
   */
  protected submitCreate(): void {
    this.createErrorKey.set(null);

    const name = this.nameInput().trim();
    if (name === '') {
      this.createErrorKey.set('gantt.recurringTask.create.errors.NAME_REQUIRED');
      return;
    }

    const firstOccurrenceDate = this.firstOccurrenceDateInput().trim();
    if (firstOccurrenceDate === '') {
      this.createErrorKey.set('gantt.recurringTask.create.errors.DATE_REQUIRED');
      return;
    }

    const frequency = this.frequencyInput();
    if (frequency === '') {
      this.createErrorKey.set('gantt.recurringTask.create.errors.FREQUENCY_REQUIRED');
      return;
    }

    const occurrenceCount = this.parsePositiveInteger(this.occurrenceCountInput());
    if (occurrenceCount === null) {
      this.createErrorKey.set('gantt.recurringTask.create.errors.OCCURRENCE_COUNT_INVALID');
      return;
    }
    if (occurrenceCount > MAX_RECURRING_OCCURRENCES) {
      this.createErrorKey.set('gantt.recurringTask.create.errors.OCCURRENCE_COUNT_TOO_HIGH');
      return;
    }

    const intervalCountRaw = this.intervalCountInput().trim();
    let intervalCount: number | undefined;
    if (intervalCountRaw !== '') {
      const parsedInterval = this.parsePositiveInteger(intervalCountRaw);
      if (parsedInterval === null) {
        this.createErrorKey.set('gantt.recurringTask.create.errors.INTERVAL_INVALID');
        return;
      }
      intervalCount = parsedInterval;
    }

    const durationMinutesRaw = this.durationMinutesInput().trim();
    let durationMinutes: number | undefined;
    if (durationMinutesRaw !== '') {
      const parsedDuration = Number(durationMinutesRaw);
      if (!Number.isInteger(parsedDuration) || parsedDuration < 0) {
        this.createErrorKey.set('gantt.recurringTask.create.errors.DURATION_INVALID');
        return;
      }
      durationMinutes = parsedDuration;
    }

    const request: CreateRecurringTaskRequest = {
      name,
      parentTaskId: this.parentTaskIdInput() ?? undefined,
      firstOccurrenceDate,
      frequency,
      intervalCount,
      occurrenceCount,
      durationMinutes,
    };

    this.creating.set(true);
    this.wbsApi
      .createRecurringTask(this.projectRef, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.creating.set(false);
          this.result.set(response);
          this.announcement.set(
            this.transloco.translate('gantt.recurringTask.create.announceCreated', {
              name: response.series.name,
              count: response.occurrences.length,
            }),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.creating.set(false);
          this.createErrorKey.set(this.resolveCreateErrorKey(error));
        },
      });
  }

  private parsePositiveInteger(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private resolveCreateErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as WbsApiError | undefined)?.code;
    if (error.status === 422 && code === 'INVALID_RECURRENCE') {
      return 'gantt.recurringTask.create.errors.INVALID_RECURRENCE';
    }
    if (error.status === 403) {
      return 'gantt.recurringTask.create.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.recurringTask.create.errors.NOT_FOUND';
    }
    return 'gantt.recurringTask.create.errors.GENERIC';
  }

  /** `yyyy-MM-dd` display for an occurrence's ISO start date, or a placeholder — same convention as `WbsTreeComponent.dateRangeLabel`'s underlying formatter. */
  protected formatOccurrenceDate(iso: string | null): string {
    return iso ? iso.slice(0, 10) : this.transloco.translate('gantt.recurringTask.result.noDate');
  }
}
