import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CalendarApiService } from '../data-access/calendar-api.service';
import { CalendarApiError, CalendarExceptionResponse, CalendarTeamRef } from '../data-access/calendar.models';
import { CalendarExceptionsPanelComponent } from './calendar-exceptions-panel.component';

const TEAM_REF: CalendarTeamRef = { tenantId: 1, teamId: 2 };
const CALENDAR_ID = 100;

const HOLIDAY: CalendarExceptionResponse = {
  exceptionId: 1,
  calendarId: CALENDAR_ID,
  exceptionDate: '2026-05-01',
  working: false,
  ranges: [],
};

const WORKED_SATURDAY: CalendarExceptionResponse = {
  exceptionId: 2,
  calendarId: CALENDAR_ID,
  exceptionDate: '2026-05-02',
  working: true,
  ranges: [{ startHour: 9, endHour: 13 }],
};

interface ApiMock {
  listExceptions: ReturnType<typeof vi.fn>;
  addException: ReturnType<typeof vi.fn>;
  removeException: ReturnType<typeof vi.fn>;
}

function makeApiMock(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    listExceptions: vi.fn(() => of([HOLIDAY])),
    addException: vi.fn(() => of([HOLIDAY])),
    removeException: vi.fn(() => of(undefined)),
    ...overrides,
  };
}

function createFixture(api: ApiMock): ComponentFixture<CalendarExceptionsPanelComponent> {
  TestBed.configureTestingModule({
    imports: [CalendarExceptionsPanelComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [{ provide: CalendarApiService, useValue: api }],
  });
  const fixture = TestBed.createComponent(CalendarExceptionsPanelComponent);
  fixture.componentRef.setInput('teamRef', TEAM_REF);
  fixture.componentRef.setInput('calendarId', CALENDAR_ID);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<CalendarExceptionsPanelComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function setInputValue(fixture: ComponentFixture<CalendarExceptionsPanelComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function findButton(fixture: ComponentFixture<CalendarExceptionsPanelComponent>, label: string): HTMLButtonElement {
  const btn = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.trim().includes(label));
  if (!btn) {
    throw new Error(`No button found with label "${label}"`);
  }
  return btn as HTMLButtonElement;
}

function submitAddForm(fixture: ComponentFixture<CalendarExceptionsPanelComponent>): void {
  const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-exc__add-form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}

describe('CalendarExceptionsPanelComponent', () => {
  it('loads and lists the calendar exceptions on init', () => {
    const api = makeApiMock({ listExceptions: vi.fn(() => of([HOLIDAY, WORKED_SATURDAY])) });
    const fixture = createFixture(api);

    expect(api.listExceptions).toHaveBeenCalledWith(TEAM_REF, CALENDAR_ID);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
  });

  it('A11y AC — a day off and an exceptionally-worked day are announced by an explicit text label, not color alone', () => {
    const api = makeApiMock({ listExceptions: vi.fn(() => of([HOLIDAY, WORKED_SATURDAY])) });
    const fixture = createFixture(api);

    const body = text(fixture);
    expect(body).toContain('calendar.exceptions.list.type.off');
    expect(body).toContain('calendar.exceptions.list.type.working');
  });

  it('shows the empty-state message when there are no exceptions yet', () => {
    const api = makeApiMock({ listExceptions: vi.fn(() => of([])) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('calendar.exceptions.list.empty');
  });

  it('shows a loading indicator while the list request is pending', () => {
    const pending = new Subject<CalendarExceptionResponse[]>();
    const api = makeApiMock({ listExceptions: vi.fn(() => pending.asObservable()) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('calendar.exceptions.list.loading');
    pending.next([]);
    fixture.detectChanges();
    expect(text(fixture)).not.toContain('calendar.exceptions.list.loading');
  });

  it('shows a not-found message on a 404 load error and reloads on retry', () => {
    const api = makeApiMock({
      listExceptions: vi
        .fn()
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })))
        .mockReturnValueOnce(of([HOLIDAY])),
    });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('calendar.exceptions.load.errors.NOT_FOUND');

    findButton(fixture, 'calendar.exceptions.list.retry').click();
    fixture.detectChanges();

    expect(api.listExceptions).toHaveBeenCalledTimes(2);
    expect(text(fixture)).not.toContain('calendar.exceptions.load.errors.NOT_FOUND');
  });

  describe('add exception', () => {
    it('AC2 — adds a public-holiday interval (off) and reloads the list', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#cal-exc-start', '2026-05-01');
      setInputValue(fixture, '#cal-exc-end', '2026-05-01');
      submitAddForm(fixture);

      expect(api.addException).toHaveBeenCalledWith(TEAM_REF, CALENDAR_ID, { startDate: '2026-05-01', endDate: '2026-05-01', working: false });
    });

    it('Error AC — rejects an end date before the start date client-side, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#cal-exc-start', '2026-05-05');
      setInputValue(fixture, '#cal-exc-end', '2026-05-01');
      submitAddForm(fixture);

      expect(api.addException).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('calendar.exceptions.add.errors.END_BEFORE_START');
    });

    it('requires both dates before submitting', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      submitAddForm(fixture);

      expect(api.addException).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('calendar.exceptions.add.errors.DATES_REQUIRED');
    });

    it('maps the identical 422 INVALID_CALENDAR_EXCEPTION server error to the same end-before-start message (defense in depth)', () => {
      const apiError: CalendarApiError = { code: 'INVALID_CALENDAR_EXCEPTION', message: 'end before start' };
      const api = makeApiMock({ addException: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 422, error: apiError }))) });
      const fixture = createFixture(api);

      setInputValue(fixture, '#cal-exc-start', '2026-05-01');
      setInputValue(fixture, '#cal-exc-end', '2026-05-03');
      submitAddForm(fixture);

      expect(text(fixture)).toContain('calendar.exceptions.add.errors.END_BEFORE_START');
    });

    it('Security AC — surfaces a 403 as an explicit error (fail-closed platform gap)', () => {
      const api = makeApiMock({ addException: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))) });
      const fixture = createFixture(api);

      setInputValue(fixture, '#cal-exc-start', '2026-05-01');
      setInputValue(fixture, '#cal-exc-end', '2026-05-01');
      submitAddForm(fixture);

      expect(text(fixture)).toContain('calendar.exceptions.add.errors.FORBIDDEN');
    });

    it('AC2 — adds an exceptionally-worked day with a specific range when "working" is selected', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#cal-exc-start', '2026-05-02');
      setInputValue(fixture, '#cal-exc-end', '2026-05-02');
      const workingRadio = (fixture.nativeElement as HTMLElement).querySelector('input[type="radio"][value="true"]') as HTMLInputElement;
      workingRadio.checked = true;
      workingRadio.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();

      findButton(fixture, 'calendar.exceptions.add.addRange').click();
      fixture.detectChanges();
      setInputValue(fixture, '#cal-exc-range-start-0', '9');
      setInputValue(fixture, '#cal-exc-range-end-0', '13');

      submitAddForm(fixture);

      expect(api.addException).toHaveBeenCalledWith(TEAM_REF, CALENDAR_ID, {
        startDate: '2026-05-02',
        endDate: '2026-05-02',
        working: true,
        ranges: [{ startHour: 9, endHour: 13 }],
      });
    });

    it('supports adding then removing a range row before submit', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      const workingRadio = (fixture.nativeElement as HTMLElement).querySelector('input[type="radio"][value="true"]') as HTMLInputElement;
      workingRadio.checked = true;
      workingRadio.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();

      findButton(fixture, 'calendar.exceptions.add.addRange').click();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('#cal-exc-range-start-0')).toBeTruthy();

      const removeButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.cal-exc__ranges button')).find(b =>
        b.textContent?.trim().includes('calendar.manager.range.remove'),
      ) as HTMLButtonElement;
      removeButton.click();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelector('#cal-exc-range-start-0')).toBeFalsy();
    });

    it('rejects an exceptionally-worked day whose range end is not strictly after its start', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#cal-exc-start', '2026-05-02');
      setInputValue(fixture, '#cal-exc-end', '2026-05-02');
      const workingRadio = (fixture.nativeElement as HTMLElement).querySelector('input[type="radio"][value="true"]') as HTMLInputElement;
      workingRadio.checked = true;
      workingRadio.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();

      findButton(fixture, 'calendar.exceptions.add.addRange').click();
      fixture.detectChanges();
      setInputValue(fixture, '#cal-exc-range-start-0', '13');
      setInputValue(fixture, '#cal-exc-range-end-0', '9');

      submitAddForm(fixture);

      expect(api.addException).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('calendar.exceptions.add.errors.INVALID_RANGE');
    });
  });

  describe('remove exception', () => {
    it('requires a two-step confirmation before calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.exceptions.remove.button').click();
      fixture.detectChanges();
      expect(api.removeException).not.toHaveBeenCalled();

      findButton(fixture, 'calendar.exceptions.remove.confirmButton').click();
      fixture.detectChanges();

      expect(api.removeException).toHaveBeenCalledWith(TEAM_REF, CALENDAR_ID, HOLIDAY.exceptionId);
    });

    it('cancel dismisses the confirmation without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.exceptions.remove.button').click();
      fixture.detectChanges();
      findButton(fixture, 'calendar.exceptions.remove.cancelButton').click();
      fixture.detectChanges();

      expect(api.removeException).not.toHaveBeenCalled();
    });

    it('surfaces an explicit error when the remove request fails', () => {
      const api = makeApiMock({ removeException: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))) });
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.exceptions.remove.button').click();
      fixture.detectChanges();
      findButton(fixture, 'calendar.exceptions.remove.confirmButton').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('calendar.exceptions.remove.errors.FORBIDDEN');
    });
  });
});
