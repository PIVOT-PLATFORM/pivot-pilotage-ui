import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RoadmapPublicShareApiService } from '../data-access/roadmap-public-share-api.service';
import { RoadmapShareViewResponse } from '../data-access/roadmap-share.models';
import { RoadmapPublicShareViewComponent } from './roadmap-public-share-view.component';

const TOKEN = 'd'.repeat(64);

const VIEW: RoadmapShareViewResponse = {
  projectName: 'Projet Alpha',
  lanes: [
    { id: 10, name: 'Thème A', position: 0 },
    { id: 20, name: 'Thème B', position: 1 },
  ],
  initiatives: [
    {
      id: 100,
      laneId: 10,
      name: 'Initiative A',
      fuzzyPeriodStart: '2026-02-01',
      fuzzyPeriodEnd: '2026-02-28',
      temporalPrecision: 'QUARTER',
      revision: 0,
      horizon: 'NOW',
    },
  ],
};

interface ApiMock {
  getSharedRoadmap: ReturnType<typeof vi.fn>;
}

function createFixture(api: ApiMock): ComponentFixture<RoadmapPublicShareViewComponent> {
  TestBed.configureTestingModule({
    imports: [RoadmapPublicShareViewComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: RoadmapPublicShareApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token: TOKEN }) } } },
    ],
  });
  const fixture = TestBed.createComponent(RoadmapPublicShareViewComponent);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<RoadmapPublicShareViewComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('RoadmapPublicShareViewComponent', () => {
  it('AC — fetches the view by the route token param and renders project name, lanes and initiatives', () => {
    const api: ApiMock = { getSharedRoadmap: vi.fn(() => of(VIEW)) };
    const fixture = createFixture(api);

    expect(api.getSharedRoadmap).toHaveBeenCalledWith(TOKEN);
    expect(text(fixture)).toContain('Projet Alpha');
    const laneLabels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.rm-lane__label'),
    ).map(el => el.textContent?.trim());
    expect(laneLabels).toEqual(['Thème A', 'Thème B']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.rm-bar--readonly')).toHaveLength(1);
  });

  it('AC — shows an explicit read-only notice', () => {
    const api: ApiMock = { getSharedRoadmap: vi.fn(() => of(VIEW)) };
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('roadmap.publicShare.readonlyNotice');
  });

  it('shows a loading state before the response resolves', () => {
    const pending = new Subject<RoadmapShareViewResponse>();
    const api: ApiMock = { getSharedRoadmap: vi.fn(() => pending.asObservable()) };
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('roadmap.publicShare.loading');

    pending.next(VIEW);
    fixture.detectChanges();
    expect(text(fixture)).not.toContain('roadmap.publicShare.loading');
  });

  it('Security AC — structurally non-editable: no form, no input/select, no [role="button"] on any bar, no tabindex', () => {
    const api: ApiMock = { getSharedRoadmap: vi.fn(() => of(VIEW)) };
    const fixture = createFixture(api);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('form')).toHaveLength(0);
    expect(root.querySelectorAll('input, select')).toHaveLength(0);
    expect(root.querySelectorAll('[role="button"]')).toHaveLength(0);

    const bar = root.querySelector('.rm-bar--readonly') as HTMLElement;
    expect(bar.getAttribute('tabindex')).toBeNull();
    expect(bar.getAttribute('role')).toBe('group');
    // `TranslocoTestingModule`'s stub doesn't interpolate params for a missing key — it renders
    // `${activeLang}.${key}` (see `roadmap-board.component.spec.ts`'s own established
    // convention) — the untranslated key is what's asserted, not the interpolated name/period.
    expect(bar.getAttribute('aria-label')).toContain('roadmap.publicShare.bar.ariaLabel');
  });

  it.each([404, 500])(
    'Error AC — a %d failure renders one single generic error and never a partial roadmap',
    status => {
      const api: ApiMock = { getSharedRoadmap: vi.fn(() => throwError(() => new HttpErrorResponse({ status }))) };
      const fixture = createFixture(api);

      expect(text(fixture)).toContain('roadmap.publicShare.errors.INVALID');
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('.rm-lane__label')).toHaveLength(0);
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('.rm-bar--readonly')).toHaveLength(0);
    },
  );

  it('Security AC — never distinguishes unknown/revoked/expired outcomes: identical message regardless of status', () => {
    const api1: ApiMock = { getSharedRoadmap: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) };
    const fixture1 = createFixture(api1);
    const message1 = text(fixture1);

    // A single spec file may only `configureTestingModule` once per test — reset explicitly to
    // build a second, independent fixture within this same test.
    TestBed.resetTestingModule();

    const api2: ApiMock = {
      getSharedRoadmap: vi.fn(() =>
        throwError(() => new HttpErrorResponse({ status: 404, error: { code: 'SHARE_LINK_INVALID' } })),
      ),
    };
    const fixture2 = createFixture(api2);
    const message2 = text(fixture2);

    expect(message1).toContain('roadmap.publicShare.errors.INVALID');
    expect(message2).toContain('roadmap.publicShare.errors.INVALID');
  });

  it('shows the no-lanes message when the shared roadmap has no lanes yet', () => {
    const api: ApiMock = { getSharedRoadmap: vi.fn(() => of({ ...VIEW, lanes: [], initiatives: [] })) };
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('roadmap.publicShare.noLanes');
  });

  it('wires the export button to the rendered read-only timeline container', () => {
    const api: ApiMock = { getSharedRoadmap: vi.fn(() => of(VIEW)) };
    const fixture = createFixture(api);

    expect((fixture.nativeElement as HTMLElement).querySelector('app-roadmap-export-button')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.rm-board__timeline')).not.toBeNull();
  });
});
