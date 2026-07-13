import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CalendarApiService } from '../data-access/calendar-api.service';
import {
  CalendarApiError,
  CalendarResponse,
  CalendarScope,
  CalendarTeamRef,
  ISO_WEEK_DAYS,
  UpdateCalendarRequest,
  WorkingTimeRange,
  formatHour,
  isoDayI18nKey,
} from '../data-access/calendar.models';
import { CalendarExceptionsPanelComponent } from '../calendar-exceptions/calendar-exceptions-panel.component';

/** A working-range row being edited in a create/edit form, before it is validated into a {@link WorkingTimeRange}. */
interface RangeDraft {
  startHour: number;
  endHour: number;
}

const DEFAULT_WORKING_DAYS: readonly number[] = [1, 2, 3, 4, 5];
const DEFAULT_RANGE: RangeDraft = { startHour: 9, endHour: 17 };

/**
 * Calendar manager (US22.4.5 — "Calendriers ouvrés & exceptions"): create/list/delete a team's
 * working-time calendars, edit an existing one's name/working days/ranges, and manage a selected
 * calendar's exceptions (delegated to {@link CalendarExceptionsPanelComponent}).
 *
 * **AC1 (working days/hours are respected) — frontend scope.** The actual scheduling
 * enforcement (a task only occupying working days/hours) is the pure engine
 * `fr.pivot.pilotage.schedule.engine.WorkingCalendar`, already covered by `CalendarServiceIT`
 * server-side (out of scope here — see backlog file's "Hors périmètre", US22.4.2). This
 * component's responsibility is the CRUD surface: a calendar's working days/ranges are created,
 * persisted and displayed accurately (traced by this component's own tests) — the same
 * information any effective-calendar resolution (AC3) or scheduling pass ultimately reads.
 *
 * **Security AC — no client-side role gating.** Every write here (`CalendarApiService.
 * createCalendar`/`updateCalendar`/`deleteCalendar`) 403s unconditionally server-side today
 * (`DenyAllCalendarEditPolicy`, fail-closed pending `pivot-core-starter`'s project membership —
 * see that service's TSDoc). This component follows the exact same established pattern as
 * `RoadmapBoardComponent`'s own `createLane`/`createInitiative` forms and
 * `RoadmapSharePanelComponent`: forms are shown unconditionally (no role claims are available
 * client-side yet), and a `403` is surfaced as an explicit, translated error rather than
 * pre-emptively hidden. The backend gate remains the sole enforcement point either way.
 *
 * **Route.** Expects `tenantId`/`teamId` as route params — same gap-era path-segment convention
 * as `RoadmapProjectRef` (see {@link CalendarTeamRef}'s TSDoc): `pivot-core-starter`'s
 * `TenantContext` is not published yet, so this repo never types/stores/manages these ids itself.
 *
 * **A11y.** Working days are native `<input type="checkbox">`s (natively keyboard-operable, no
 * custom widget) grouped in a `<fieldset>`/`<legend>`; working-time ranges are native
 * `<input type="number">` pairs. Every day/range is announced by its translated label — never a
 * bare number or a color alone.
 */
@Component({
  selector: 'app-calendar-manager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, CalendarExceptionsPanelComponent],
  templateUrl: './calendar-manager.component.html',
  styleUrl: './calendar-manager.component.scss',
})
export class CalendarManagerComponent implements OnInit {
  private readonly calendarApi = inject(CalendarApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly teamRef: CalendarTeamRef = this.readTeamRef();
  protected readonly isoWeekDays = ISO_WEEK_DAYS;
  protected readonly formatHour = formatHour;

  /** Builds the full `calendar.days.{key}` i18n key for an ISO week day — see {@link isoDayI18nKey}. */
  protected dayLabelKey(day: number): string {
    return `calendar.days.${isoDayI18nKey(day)}`;
  }

  protected readonly calendars = signal<CalendarResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  // ---- create form -------------------------------------------------------------------------
  protected readonly createScope = signal<CalendarScope>('PROJECT');
  protected readonly createProjectIdInput = signal('');
  protected readonly createName = signal('');
  protected readonly createWorkingDays = signal<number[]>([...DEFAULT_WORKING_DAYS]);
  protected readonly createRanges = signal<RangeDraft[]>([{ ...DEFAULT_RANGE }]);
  protected readonly creating = signal(false);
  protected readonly createErrorKey = signal<string | null>(null);

  // ---- edit form ----------------------------------------------------------------------------
  protected readonly editingCalendarId = signal<number | null>(null);
  protected readonly editName = signal('');
  protected readonly editWorkingDays = signal<number[]>([]);
  protected readonly editRanges = signal<RangeDraft[]>([]);
  protected readonly updating = signal(false);
  protected readonly updateErrorKey = signal<string | null>(null);

  // ---- delete confirm -------------------------------------------------------------------------
  protected readonly confirmingDeleteId = signal<number | null>(null);
  protected readonly deleteErrorKey = signal<string | null>(null);

  // ---- exceptions panel toggle ----------------------------------------------------------------
  protected readonly exceptionsCalendarId = signal<number | null>(null);

  private readTeamRef(): CalendarTeamRef {
    const params = this.route.snapshot.paramMap;
    return {
      tenantId: Number(params.get('tenantId')),
      teamId: Number(params.get('teamId')),
    };
  }

  ngOnInit(): void {
    this.loadCalendars();
  }

  protected retryLoad(): void {
    this.loadCalendars();
  }

  private loadCalendars(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);
    this.calendarApi
      .listCalendars(this.teamRef)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: calendars => {
          this.calendars.set(calendars);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(this.resolveReadErrorKey(error));
        },
      });
  }

  // ---- create ---------------------------------------------------------------------------------

  protected onCreateScopeChange(event: Event): void {
    this.createScope.set((event.target as HTMLSelectElement).value as CalendarScope);
  }

  protected onCreateProjectIdInput(event: Event): void {
    this.createProjectIdInput.set((event.target as HTMLInputElement).value);
  }

  protected onCreateNameInput(event: Event): void {
    this.createName.set((event.target as HTMLInputElement).value);
  }

  protected toggleCreateWorkingDay(day: number): void {
    this.createWorkingDays.update(days => toggleDay(days, day));
  }

  protected addCreateRange(): void {
    this.createRanges.update(ranges => [...ranges, { ...DEFAULT_RANGE }]);
  }

  protected removeCreateRange(index: number): void {
    this.createRanges.update(ranges => (ranges.length > 1 ? ranges.filter((_, i) => i !== index) : ranges));
  }

  protected updateCreateRange(index: number, field: 'startHour' | 'endHour', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.createRanges.update(ranges => ranges.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  protected submitCreate(): void {
    this.createErrorKey.set(null);
    const name = this.createName().trim();
    if (!name) {
      this.createErrorKey.set('calendar.manager.create.errors.NAME_REQUIRED');
      return;
    }
    const workingDays = this.createWorkingDays();
    if (workingDays.length === 0) {
      this.createErrorKey.set('calendar.manager.create.errors.WORKING_DAYS_REQUIRED');
      return;
    }
    const ranges = validateRanges(this.createRanges());
    if (!ranges) {
      this.createErrorKey.set('calendar.manager.create.errors.INVALID_RANGE');
      return;
    }
    const rawProjectId = this.createProjectIdInput().trim();
    const projectId = rawProjectId ? Number(rawProjectId) : undefined;
    if (rawProjectId && !Number.isFinite(projectId)) {
      this.createErrorKey.set('calendar.manager.create.errors.INVALID_PROJECT_ID');
      return;
    }

    this.creating.set(true);
    this.calendarApi
      .createCalendar(this.teamRef, {
        scope: this.createScope(),
        ...(projectId !== undefined ? { projectId } : {}),
        name,
        workingDays,
        ranges,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.resetCreateForm();
          this.loadCalendars();
        },
        error: (error: HttpErrorResponse) => {
          this.creating.set(false);
          this.createErrorKey.set(this.resolveWriteErrorKey('create', error));
        },
      });
  }

  private resetCreateForm(): void {
    this.createScope.set('PROJECT');
    this.createProjectIdInput.set('');
    this.createName.set('');
    this.createWorkingDays.set([...DEFAULT_WORKING_DAYS]);
    this.createRanges.set([{ ...DEFAULT_RANGE }]);
  }

  // ---- edit -----------------------------------------------------------------------------------

  protected startEdit(calendar: CalendarResponse): void {
    this.editingCalendarId.set(calendar.calendarId);
    this.editName.set(calendar.name);
    this.editWorkingDays.set([...calendar.workingDays]);
    this.editRanges.set(calendar.ranges.map(r => ({ ...r })));
    this.updateErrorKey.set(null);
  }

  protected cancelEdit(): void {
    this.editingCalendarId.set(null);
    this.updateErrorKey.set(null);
  }

  protected onEditNameInput(event: Event): void {
    this.editName.set((event.target as HTMLInputElement).value);
  }

  protected toggleEditWorkingDay(day: number): void {
    this.editWorkingDays.update(days => toggleDay(days, day));
  }

  protected addEditRange(): void {
    this.editRanges.update(ranges => [...ranges, { ...DEFAULT_RANGE }]);
  }

  protected removeEditRange(index: number): void {
    this.editRanges.update(ranges => (ranges.length > 1 ? ranges.filter((_, i) => i !== index) : ranges));
  }

  protected updateEditRange(index: number, field: 'startHour' | 'endHour', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.editRanges.update(ranges => ranges.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  protected submitUpdate(): void {
    const calendarId = this.editingCalendarId();
    if (calendarId === null) {
      return;
    }
    this.updateErrorKey.set(null);
    const name = this.editName().trim();
    if (!name) {
      this.updateErrorKey.set('calendar.manager.edit.errors.NAME_REQUIRED');
      return;
    }
    const workingDays = this.editWorkingDays();
    if (workingDays.length === 0) {
      this.updateErrorKey.set('calendar.manager.edit.errors.WORKING_DAYS_REQUIRED');
      return;
    }
    const ranges = validateRanges(this.editRanges());
    if (!ranges) {
      this.updateErrorKey.set('calendar.manager.edit.errors.INVALID_RANGE');
      return;
    }

    const request: UpdateCalendarRequest = { name, workingDays, ranges };
    this.updating.set(true);
    this.calendarApi
      .updateCalendar(this.teamRef, calendarId, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.updating.set(false);
          this.editingCalendarId.set(null);
          this.loadCalendars();
        },
        error: (error: HttpErrorResponse) => {
          this.updating.set(false);
          this.updateErrorKey.set(this.resolveWriteErrorKey('edit', error));
        },
      });
  }

  // ---- delete ---------------------------------------------------------------------------------

  protected requestDelete(calendarId: number): void {
    this.deleteErrorKey.set(null);
    this.confirmingDeleteId.set(calendarId);
  }

  protected cancelDelete(): void {
    this.confirmingDeleteId.set(null);
  }

  protected confirmDelete(calendarId: number): void {
    this.deleteErrorKey.set(null);
    this.calendarApi
      .deleteCalendar(this.teamRef, calendarId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmingDeleteId.set(null);
          if (this.editingCalendarId() === calendarId) {
            this.editingCalendarId.set(null);
          }
          if (this.exceptionsCalendarId() === calendarId) {
            this.exceptionsCalendarId.set(null);
          }
          this.loadCalendars();
        },
        error: (error: HttpErrorResponse) => {
          this.confirmingDeleteId.set(null);
          this.deleteErrorKey.set(this.resolveWriteErrorKey('delete', error));
        },
      });
  }

  // ---- exceptions toggle ------------------------------------------------------------------------

  protected toggleExceptions(calendarId: number): void {
    this.exceptionsCalendarId.set(this.exceptionsCalendarId() === calendarId ? null : calendarId);
  }

  // ---- error mapping ----------------------------------------------------------------------------

  private resolveReadErrorKey(error: HttpErrorResponse): string {
    if (error.status === 404) {
      return 'calendar.manager.load.errors.NOT_FOUND';
    }
    return 'calendar.manager.load.errors.GENERIC';
  }

  private resolveWriteErrorKey(scope: 'create' | 'edit' | 'delete', error: HttpErrorResponse): string {
    const code = (error.error as CalendarApiError | undefined)?.code;
    if (error.status === 422 && code === 'INVALID_CALENDAR_EXCEPTION') {
      return `calendar.manager.${scope}.errors.INVALID_RANGE`;
    }
    if (error.status === 403) {
      return `calendar.manager.${scope}.errors.FORBIDDEN`;
    }
    if (error.status === 404) {
      return `calendar.manager.${scope}.errors.NOT_FOUND`;
    }
    return `calendar.manager.${scope}.errors.GENERIC`;
  }
}

/** Toggles `day` in an ascending, deduplicated working-days list. */
function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a, b) => a - b);
}

/**
 * Validates a create/edit form's range drafts client-side (AC — a range end must be strictly
 * after its start, mirroring the server's `InvalidCalendarException` check) before they are sent
 * as a {@link WorkingTimeRange} list. Returns `null` when at least one row is invalid.
 */
function validateRanges(drafts: RangeDraft[]): WorkingTimeRange[] | null {
  if (drafts.length === 0) {
    return null;
  }
  for (const draft of drafts) {
    if (!Number.isFinite(draft.startHour) || !Number.isFinite(draft.endHour) || draft.endHour <= draft.startHour) {
      return null;
    }
  }
  return drafts.map(d => ({ startHour: d.startHour, endHour: d.endHour }));
}
