import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CalendarApiService } from '../data-access/calendar-api.service';
import { CalendarTaskRef, EffectiveCalendarResponse, ISO_WEEK_DAYS, formatHour, isoDayI18nKey } from '../data-access/calendar.models';

/**
 * Read-only view of the calendar that effectively governs a task's (optionally a resource's)
 * working time (US22.4.5, AC3 — "given une ressource avec son propre calendrier... son calendrier
 * prime pour son travail"). Resolves and displays `CalendarApiService.effectiveCalendar`'s
 * **resource &gt; task &gt; project** priority (EN22.1, decision D7) — never re-implements that
 * resolution client-side, it only surfaces the backend's already-computed answer.
 *
 * **Route.** Expects `tenantId`/`teamId`/`projectId`/`taskId` as route params, `resourceRef` as an
 * optional query param — same gap-era path-segment convention as the rest of this feature (see
 * {@link CalendarTaskRef}'s TSDoc).
 *
 * **A11y (AC3 observability).** `resolvedFrom` is rendered as an explicit, translated label
 * ("Résolu depuis : Ressource/Tâche/Projet" family) — never implied by position or color alone —
 * so a chef de projet can see *why* a given calendar applies to this task.
 *
 * **Read-only.** No write here — this view only calls the effective-calendar endpoint, which is
 * never gated by `CalendarEditPolicy` (a read, see `CalendarApiService`'s TSDoc).
 */
@Component({
  selector: 'app-effective-calendar-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './effective-calendar-view.component.html',
  styleUrl: './effective-calendar-view.component.scss',
})
export class EffectiveCalendarViewComponent implements OnInit {
  private readonly calendarApi = inject(CalendarApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isoWeekDays = ISO_WEEK_DAYS;
  protected readonly formatHour = formatHour;

  /** Builds the full `calendar.days.{key}` i18n key for an ISO week day — see {@link isoDayI18nKey}. */
  protected dayLabelKey(day: number): string {
    return `calendar.days.${isoDayI18nKey(day)}`;
  }

  protected readonly taskRef: CalendarTaskRef = this.readTaskRef();
  protected readonly resourceRef: string | null = this.route.snapshot.queryParamMap.get('resourceRef');

  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);
  protected readonly result = signal<EffectiveCalendarResponse | null>(null);

  private readTaskRef(): CalendarTaskRef {
    const params = this.route.snapshot.paramMap;
    return {
      tenantId: Number(params.get('tenantId')),
      teamId: Number(params.get('teamId')),
      projectId: Number(params.get('projectId')),
      taskId: Number(params.get('taskId')),
    };
  }

  ngOnInit(): void {
    this.load();
  }

  protected retryLoad(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);
    this.calendarApi
      .effectiveCalendar(this.taskRef, this.resourceRef ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.result.set(response);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(this.resolveErrorKey(error));
        },
      });
  }

  private resolveErrorKey(error: HttpErrorResponse): string {
    if (error.status === 404) {
      return 'calendar.effective.errors.NOT_FOUND';
    }
    return 'calendar.effective.errors.GENERIC';
  }
}
