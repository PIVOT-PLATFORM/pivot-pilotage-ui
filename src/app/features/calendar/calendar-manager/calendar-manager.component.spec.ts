import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CalendarApiService } from '../data-access/calendar-api.service';
import { CalendarApiError, CalendarResponse } from '../data-access/calendar.models';
import { CalendarManagerComponent } from './calendar-manager.component';

const CALENDAR: CalendarResponse = {
  calendarId: 100,
  projectId: 3,
  scope: 'PROJECT',
  name: 'Standard',
  workingDays: [1, 2, 3, 4, 5],
  ranges: [{ startHour: 9, endHour: 17 }],
};

interface ApiMock {
  listCalendars: ReturnType<typeof vi.fn>;
  createCalendar: ReturnType<typeof vi.fn>;
  updateCalendar: ReturnType<typeof vi.fn>;
  deleteCalendar: ReturnType<typeof vi.fn>;
  listExceptions: ReturnType<typeof vi.fn>;
  addException: ReturnType<typeof vi.fn>;
  removeException: ReturnType<typeof vi.fn>;
  effectiveCalendar: ReturnType<typeof vi.fn>;
}

function makeApiMock(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    listCalendars: vi.fn(() => of([CALENDAR])),
    createCalendar: vi.fn(() => of(CALENDAR)),
    updateCalendar: vi.fn(() => of(CALENDAR)),
    deleteCalendar: vi.fn(() => of(undefined)),
    listExceptions: vi.fn(() => of([])),
    addException: vi.fn(() => of([])),
    removeException: vi.fn(() => of(undefined)),
    effectiveCalendar: vi.fn(),
    ...overrides,
  };
}

function createFixture(api: ApiMock): ComponentFixture<CalendarManagerComponent> {
  TestBed.configureTestingModule({
    imports: [CalendarManagerComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: CalendarApiService, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ tenantId: '1', teamId: '2' }) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(CalendarManagerComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<CalendarManagerComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function setInputValue(fixture: ComponentFixture<CalendarManagerComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement | HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  fixture.detectChanges();
}

function findButton(fixture: ComponentFixture<CalendarManagerComponent>, label: string, root: HTMLElement = fixture.nativeElement): HTMLButtonElement {
  const btn = Array.from(root.querySelectorAll('button')).find(b => b.textContent?.trim().includes(label));
  if (!btn) {
    throw new Error(`No button found with label "${label}"`);
  }
  return btn as HTMLButtonElement;
}

function submitForm(form: HTMLFormElement): void {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('CalendarManagerComponent', () => {
  it('loads and renders the team calendars on init', () => {
    const api = makeApiMock();
    const fixture = createFixture(api);

    expect(api.listCalendars).toHaveBeenCalledWith({ tenantId: 1, teamId: 2 });
    expect(text(fixture)).toContain('Standard');
  });

  it('shows a loading indicator while the list request is pending', () => {
    const pending = new Subject<CalendarResponse[]>();
    const api = makeApiMock({ listCalendars: vi.fn(() => pending.asObservable()) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('calendar.manager.list.loading');

    pending.next([CALENDAR]);
    fixture.detectChanges();
    expect(text(fixture)).not.toContain('calendar.manager.list.loading');
  });

  it('shows the empty-state message when there are no calendars yet', () => {
    const api = makeApiMock({ listCalendars: vi.fn(() => of([])) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('calendar.manager.list.empty');
  });

  it('shows a retry action on a load error and reloads on click', () => {
    const api = makeApiMock({
      listCalendars: vi
        .fn()
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
        .mockReturnValueOnce(of([CALENDAR])),
    });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('calendar.manager.load.errors.GENERIC');

    findButton(fixture, 'calendar.manager.list.retry').click();
    fixture.detectChanges();

    expect(api.listCalendars).toHaveBeenCalledTimes(2);
    expect(text(fixture)).toContain('Standard');
  });

  it('shows the not-found message on a 404 load error', () => {
    const api = makeApiMock({ listCalendars: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('calendar.manager.load.errors.NOT_FOUND');
  });

  describe('create calendar', () => {
    it('sends the scope selected via the scope picker', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#cal-create-name', 'Alice');
      setInputValue(fixture, '#cal-create-scope', 'RESOURCE');
      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__create-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(api.createCalendar).toHaveBeenCalledWith({ tenantId: 1, teamId: 2 }, expect.objectContaining({ scope: 'RESOURCE' }));
    });

    it('supports adding and removing a working-hour range row', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#cal-create-name', 'Std');
      findButton(fixture, 'calendar.manager.range.add').click();
      fixture.detectChanges();
      setInputValue(fixture, '#cal-create-start-1', '18');
      setInputValue(fixture, '#cal-create-end-1', '20');

      // Remove the first (default 09:00-17:00) row, keeping only the newly added one.
      const removeButtons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.cal-mgr__create-form button')).filter(b =>
        b.textContent?.trim().includes('calendar.manager.range.remove'),
      );
      (removeButtons[0] as HTMLButtonElement).click();
      fixture.detectChanges();

      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__create-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(api.createCalendar).toHaveBeenCalledWith(
        { tenantId: 1, teamId: 2 },
        expect.objectContaining({ ranges: [{ startHour: 18, endHour: 20 }] }),
      );
    });

    it('AC1 — creates a calendar with the selected working days and ranges', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#cal-create-name', 'Std');
      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__create-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(api.createCalendar).toHaveBeenCalledWith(
        { tenantId: 1, teamId: 2 },
        expect.objectContaining({ scope: 'PROJECT', name: 'Std', workingDays: [1, 2, 3, 4, 5], ranges: [{ startHour: 9, endHour: 17 }] }),
      );
    });

    it('rejects an empty name client-side without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__create-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(api.createCalendar).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('calendar.manager.create.errors.NAME_REQUIRED');
    });

    it('rejects a calendar with no working day selected', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);
      setInputValue(fixture, '#cal-create-name', 'Std');

      // Default selection is Mon..Fri (the first 5 checkboxes) — untoggle exactly those so the
      // form ends up with zero working days; Sat/Sun (already unchecked) are left untouched.
      const checkboxes = (fixture.nativeElement as HTMLElement).querySelectorAll('.cal-mgr__create-form .cal-mgr__working-days input[type="checkbox"]');
      Array.from(checkboxes)
        .slice(0, 5)
        .forEach(cb => cb.dispatchEvent(new Event('change', { bubbles: true })));
      fixture.detectChanges();

      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__create-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(api.createCalendar).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('calendar.manager.create.errors.WORKING_DAYS_REQUIRED');
    });

    it('rejects a working-hour range whose end is not strictly after its start', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);
      setInputValue(fixture, '#cal-create-name', 'Std');
      setInputValue(fixture, '#cal-create-start-0', '17');
      setInputValue(fixture, '#cal-create-end-0', '9');

      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__create-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(api.createCalendar).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('calendar.manager.create.errors.INVALID_RANGE');
    });

    it('rejects a non-numeric project id', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);
      setInputValue(fixture, '#cal-create-name', 'Std');
      setInputValue(fixture, '#cal-create-project-id', 'abc');

      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__create-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(api.createCalendar).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('calendar.manager.create.errors.INVALID_PROJECT_ID');
    });

    it('Security AC — surfaces a 403 as an explicit error (fail-closed platform gap)', () => {
      const api = makeApiMock({ createCalendar: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))) });
      const fixture = createFixture(api);
      setInputValue(fixture, '#cal-create-name', 'Std');

      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__create-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(text(fixture)).toContain('calendar.manager.create.errors.FORBIDDEN');
    });

    it('maps a 422 INVALID_CALENDAR_EXCEPTION server error to the invalid-range message', () => {
      const apiError: CalendarApiError = { code: 'INVALID_CALENDAR_EXCEPTION', message: 'bad' };
      const api = makeApiMock({ createCalendar: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 422, error: apiError }))) });
      const fixture = createFixture(api);
      setInputValue(fixture, '#cal-create-name', 'Std');

      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__create-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(text(fixture)).toContain('calendar.manager.create.errors.INVALID_RANGE');
    });
  });

  describe('edit calendar', () => {
    it('pre-fills the edit form from the selected calendar and submits an update', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.manager.list.actions.edit').click();
      fixture.detectChanges();

      const nameInput = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__edit-form input[type="text"]') as HTMLInputElement;
      expect(nameInput.value).toBe('Standard');

      nameInput.value = 'Renamed';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();

      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__edit-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(api.updateCalendar).toHaveBeenCalledWith(
        { tenantId: 1, teamId: 2 },
        100,
        expect.objectContaining({ name: 'Renamed' }),
      );
    });

    it('cancel closes the edit form without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.manager.list.actions.edit').click();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__edit-form')).toBeTruthy();

      findButton(fixture, 'calendar.manager.edit.cancel').click();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__edit-form')).toBeFalsy();
      expect(api.updateCalendar).not.toHaveBeenCalled();
    });

    it('supports toggling a working day and adding/removing/editing a range in the edit form', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.manager.list.actions.edit').click();
      fixture.detectChanges();

      const editForm = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__edit-form') as HTMLElement;
      // Untick Monday (first of the pre-checked Mon..Fri checkboxes).
      const dayCheckbox = editForm.querySelector('.cal-mgr__working-days input[type="checkbox"]') as HTMLInputElement;
      dayCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();

      const addRangeButton = Array.from(editForm.querySelectorAll('button')).find(b => b.textContent?.trim().includes('calendar.manager.range.add')) as HTMLButtonElement;
      addRangeButton.click();
      fixture.detectChanges();
      setInputValue(fixture, '#cal-edit-start-1', '18');
      setInputValue(fixture, '#cal-edit-end-1', '20');

      const removeButtons = Array.from(editForm.querySelectorAll('button')).filter(b => b.textContent?.trim().includes('calendar.manager.range.remove'));
      (removeButtons[0] as HTMLButtonElement).click();
      fixture.detectChanges();

      submitForm(editForm.querySelector('form') ?? (editForm as HTMLFormElement));
      fixture.detectChanges();

      expect(api.updateCalendar).toHaveBeenCalledWith(
        { tenantId: 1, teamId: 2 },
        100,
        expect.objectContaining({ workingDays: [2, 3, 4, 5], ranges: [{ startHour: 18, endHour: 20 }] }),
      );
    });

    it('surfaces a not-found error when updating a calendar that no longer exists', () => {
      const api = makeApiMock({ updateCalendar: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.manager.list.actions.edit').click();
      fixture.detectChanges();
      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__edit-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(text(fixture)).toContain('calendar.manager.edit.errors.NOT_FOUND');
    });

    it('surfaces a generic error for an unexpected update failure', () => {
      const api = makeApiMock({ updateCalendar: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) });
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.manager.list.actions.edit').click();
      fixture.detectChanges();
      const form = (fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__edit-form') as HTMLFormElement;
      submitForm(form);
      fixture.detectChanges();

      expect(text(fixture)).toContain('calendar.manager.edit.errors.GENERIC');
    });
  });

  describe('delete calendar', () => {
    it('requires a two-step confirmation before calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.manager.delete.button').click();
      fixture.detectChanges();
      expect(api.deleteCalendar).not.toHaveBeenCalled();

      findButton(fixture, 'calendar.manager.delete.confirmButton').click();
      fixture.detectChanges();

      expect(api.deleteCalendar).toHaveBeenCalledWith({ tenantId: 1, teamId: 2 }, 100);
    });

    it('cancel dismisses the confirmation without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.manager.delete.button').click();
      fixture.detectChanges();
      findButton(fixture, 'calendar.manager.delete.cancelButton').click();
      fixture.detectChanges();

      expect(api.deleteCalendar).not.toHaveBeenCalled();
      expect(findButton(fixture, 'calendar.manager.delete.button')).toBeTruthy();
    });

    it('closes an open edit form and exceptions panel for the calendar being deleted', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.manager.list.actions.edit').click();
      findButton(fixture, 'calendar.manager.list.actions.exceptions').click();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__edit-form')).toBeTruthy();
      expect((fixture.nativeElement as HTMLElement).querySelector('app-calendar-exceptions-panel')).toBeTruthy();

      findButton(fixture, 'calendar.manager.delete.button').click();
      fixture.detectChanges();
      findButton(fixture, 'calendar.manager.delete.confirmButton').click();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelector('.cal-mgr__edit-form')).toBeFalsy();
      expect((fixture.nativeElement as HTMLElement).querySelector('app-calendar-exceptions-panel')).toBeFalsy();
    });

    it('surfaces an explicit error when the delete request fails', () => {
      const api = makeApiMock({ deleteCalendar: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) });
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.manager.delete.button').click();
      fixture.detectChanges();
      findButton(fixture, 'calendar.manager.delete.confirmButton').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('calendar.manager.delete.errors.GENERIC');
    });
  });

  describe('exceptions panel toggle', () => {
    it('shows the exceptions panel for a calendar when its action button is clicked, and hides it on a second click', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'calendar.manager.list.actions.exceptions').click();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('app-calendar-exceptions-panel')).toBeTruthy();

      findButton(fixture, 'calendar.manager.list.actions.exceptions').click();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('app-calendar-exceptions-panel')).toBeFalsy();
    });
  });
});
