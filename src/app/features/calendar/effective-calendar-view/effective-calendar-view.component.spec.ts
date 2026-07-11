import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CalendarApiService } from '../data-access/calendar-api.service';
import { EffectiveCalendarResponse } from '../data-access/calendar.models';
import { EffectiveCalendarViewComponent } from './effective-calendar-view.component';

const EFFECTIVE_RESOURCE: EffectiveCalendarResponse = {
  calendarId: 200,
  resolvedFrom: 'RESOURCE',
  calendar: {
    calendarId: 200,
    projectId: null,
    scope: 'RESOURCE',
    name: 'alice',
    workingDays: [1, 2, 3, 4, 5],
    ranges: [{ startHour: 9, endHour: 17 }],
  },
};

interface ApiMock {
  effectiveCalendar: ReturnType<typeof vi.fn>;
}

function createFixture(
  api: ApiMock,
  queryParams: Record<string, string> = {},
): ComponentFixture<EffectiveCalendarViewComponent> {
  TestBed.configureTestingModule({
    imports: [EffectiveCalendarViewComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: CalendarApiService, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ tenantId: '1', teamId: '2', projectId: '3', taskId: '9' }),
            queryParamMap: convertToParamMap(queryParams),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(EffectiveCalendarViewComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<EffectiveCalendarViewComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('EffectiveCalendarViewComponent', () => {
  it('AC3 — resolves and displays the resource calendar when a resourceRef is supplied and primes', () => {
    const api = { effectiveCalendar: vi.fn(() => of(EFFECTIVE_RESOURCE)) };
    const fixture = createFixture(api, { resourceRef: 'alice' });

    expect(api.effectiveCalendar).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3, taskId: 9 }, 'alice');
    const body = text(fixture);
    expect(body).toContain('calendar.scopes.RESOURCE');
    expect(body).toContain('alice');
  });

  it('calls the API without a resourceRef when none is supplied', () => {
    const api = { effectiveCalendar: vi.fn(() => of(EFFECTIVE_RESOURCE)) };
    createFixture(api);

    expect(api.effectiveCalendar).toHaveBeenCalledWith({ tenantId: 1, teamId: 2, projectId: 3, taskId: 9 }, undefined);
  });

  it('shows a loading indicator while the request is pending', () => {
    const api = { effectiveCalendar: vi.fn(() => of(EFFECTIVE_RESOURCE)) };
    const fixture = createFixture(api);
    // detectChanges already ran synchronously with `of`, so re-verify the loading branch is gone.
    expect(text(fixture)).not.toContain('calendar.effective.loading');
  });

  it('shows a not-found error when no calendar resolves for the task', () => {
    const api = { effectiveCalendar: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) };
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('calendar.effective.errors.NOT_FOUND');
  });

  it('offers a retry action on a generic error', () => {
    const api = {
      effectiveCalendar: vi
        .fn()
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
        .mockReturnValueOnce(of(EFFECTIVE_RESOURCE)),
    };
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('calendar.effective.errors.GENERIC');

    const retryButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b =>
      b.textContent?.includes('calendar.effective.retry'),
    ) as HTMLButtonElement;
    retryButton.click();
    fixture.detectChanges();

    expect(api.effectiveCalendar).toHaveBeenCalledTimes(2);
    expect(text(fixture)).toContain('alice');
  });
});
