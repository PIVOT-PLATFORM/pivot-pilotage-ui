import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { CalendarApiService } from '../data-access/calendar-api.service';
import { CalendarApiError, CalendarExceptionResponse, CalendarTeamRef, WorkingTimeRange, formatHour } from '../data-access/calendar.models';

/** A working-range row being drafted for an exceptionally-worked day, before validation. */
interface RangeDraft {
  startHour: number;
  endHour: number;
}

/**
 * Exception management panel for one calendar (US22.4.5 — "Calendriers ouvrés & exceptions"):
 * list, add and remove derogatory days (public holidays/closures, or exceptionally-worked days)
 * attached to {@link calendarId}. Embedded by `CalendarManagerComponent` per selected calendar —
 * see that component's TSDoc for the toggle/mount lifecycle (one instance per open calendar).
 *
 * **AC2 (a holiday extends a task's duration) — frontend scope.** The scheduling effect of an
 * exception (a public holiday pushing a task's finish date, an exceptionally-worked day pulling
 * it in) is resolved by the pure engine `WorkingCalendar`, already covered by
 * `CalendarServiceIT.holidayException_removesThatDayFromWorkedTime`/
 * `exceptionalWorkingDay_addsThatDayToWorkedTime` (out of scope here, see US22.4.2). This panel's
 * job is the CRUD + explicit labelling: an exception is created, listed and removable, always
 * announced by its type — "non travaillé"/"travaillé" — never by color alone (A11y AC).
 *
 * **Error AC — end date before start date.** {@link submitAdd} rejects client-side, with an
 * explicit translated message, before ever calling the API — same "check first, defense in depth
 * second" posture as `RoadmapSharePanelComponent`'s expiry check: the identical
 * `422 INVALID_CALENDAR_EXCEPTION` server error is mapped to the same message if it still occurs.
 *
 * **Security AC — no client-side role gating.** `addException`/`removeException` 403 server-side
 * today (`DenyAllCalendarEditPolicy`, fail-closed) — same documented posture as
 * `CalendarManagerComponent`: the add form and remove buttons are shown unconditionally, a `403`
 * surfaces as an explicit error.
 */
@Component({
  selector: 'app-calendar-exceptions-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './calendar-exceptions-panel.component.html',
  styleUrl: './calendar-exceptions-panel.component.scss',
})
export class CalendarExceptionsPanelComponent implements OnInit {
  readonly teamRef = input.required<CalendarTeamRef>();
  readonly calendarId = input.required<number>();

  private readonly calendarApi = inject(CalendarApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatHour = formatHour;

  protected readonly exceptions = signal<CalendarExceptionResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  protected readonly startDateInput = signal('');
  protected readonly endDateInput = signal('');
  protected readonly working = signal(false);
  protected readonly ranges = signal<RangeDraft[]>([]);
  protected readonly adding = signal(false);
  protected readonly addErrorKey = signal<string | null>(null);

  protected readonly confirmingRemoveId = signal<number | null>(null);
  protected readonly removeErrorKey = signal<string | null>(null);

  ngOnInit(): void {
    this.loadExceptions();
  }

  protected retryLoad(): void {
    this.loadExceptions();
  }

  private loadExceptions(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);
    this.calendarApi
      .listExceptions(this.teamRef(), this.calendarId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: exceptions => {
          this.exceptions.set(exceptions);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(this.resolveScopedErrorKey('load', error));
        },
      });
  }

  protected onStartDateInput(event: Event): void {
    this.startDateInput.set((event.target as HTMLInputElement).value);
  }

  protected onEndDateInput(event: Event): void {
    this.endDateInput.set((event.target as HTMLInputElement).value);
  }

  protected onWorkingChange(event: Event): void {
    this.working.set((event.target as HTMLInputElement).value === 'true');
  }

  protected addRange(): void {
    this.ranges.update(r => [...r, { startHour: 9, endHour: 17 }]);
  }

  protected removeRange(index: number): void {
    this.ranges.update(r => r.filter((_, i) => i !== index));
  }

  protected updateRange(index: number, field: 'startHour' | 'endHour', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.ranges.update(r => r.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  /**
   * AC2 support + Error AC. Validates the interval client-side before ever contacting the backend:
   * both dates required, and `endDate` must not be before `startDate` (Error AC — explicit,
   * translated message, same wording family the 422 mapping falls back to).
   */
  protected submitAdd(): void {
    this.addErrorKey.set(null);
    const startDate = this.startDateInput();
    const endDate = this.endDateInput();
    if (!startDate || !endDate) {
      this.addErrorKey.set('calendar.exceptions.add.errors.DATES_REQUIRED');
      return;
    }
    if (endDate < startDate) {
      this.addErrorKey.set('calendar.exceptions.add.errors.END_BEFORE_START');
      return;
    }

    let ranges: WorkingTimeRange[] | undefined;
    if (this.working() && this.ranges().length > 0) {
      const validated = this.ranges().every(r => Number.isFinite(r.startHour) && Number.isFinite(r.endHour) && r.endHour > r.startHour);
      if (!validated) {
        this.addErrorKey.set('calendar.exceptions.add.errors.INVALID_RANGE');
        return;
      }
      ranges = this.ranges().map(r => ({ startHour: r.startHour, endHour: r.endHour }));
    }

    this.adding.set(true);
    this.calendarApi
      .addException(this.teamRef(), this.calendarId(), {
        startDate,
        endDate,
        working: this.working(),
        ...(ranges ? { ranges } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.adding.set(false);
          this.resetAddForm();
          this.loadExceptions();
        },
        error: (error: HttpErrorResponse) => {
          this.adding.set(false);
          this.addErrorKey.set(this.resolveAddErrorKey(error));
        },
      });
  }

  private resetAddForm(): void {
    this.startDateInput.set('');
    this.endDateInput.set('');
    this.working.set(false);
    this.ranges.set([]);
  }

  protected requestRemove(exceptionId: number): void {
    this.removeErrorKey.set(null);
    this.confirmingRemoveId.set(exceptionId);
  }

  protected cancelRemove(): void {
    this.confirmingRemoveId.set(null);
  }

  protected confirmRemove(exceptionId: number): void {
    this.removeErrorKey.set(null);
    this.calendarApi
      .removeException(this.teamRef(), this.calendarId(), exceptionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmingRemoveId.set(null);
          this.loadExceptions();
        },
        error: (error: HttpErrorResponse) => {
          this.confirmingRemoveId.set(null);
          this.removeErrorKey.set(this.resolveScopedErrorKey('remove', error));
        },
      });
  }

  private resolveAddErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as CalendarApiError | undefined)?.code;
    if (error.status === 422 && code === 'INVALID_CALENDAR_EXCEPTION') {
      return 'calendar.exceptions.add.errors.END_BEFORE_START';
    }
    return this.resolveScopedErrorKey('add', error);
  }

  private resolveScopedErrorKey(scope: 'load' | 'add' | 'remove', error: HttpErrorResponse): string {
    if (error.status === 403) {
      return `calendar.exceptions.${scope}.errors.FORBIDDEN`;
    }
    if (error.status === 404) {
      return `calendar.exceptions.${scope}.errors.NOT_FOUND`;
    }
    return `calendar.exceptions.${scope}.errors.GENERIC`;
  }
}
