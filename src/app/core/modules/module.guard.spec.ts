import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { moduleGuard } from './module.guard';
import { PIVOT_CORE_API_URL } from '../config/tokens';
import { ToastService } from '../toast/toast.service';

const API = 'http://api.test';
const STATUS_URL = `${API}/modules/pilotage/status`;

/** Mirrors `boardAccessGuard.spec.ts`'s stub, but resolves the real AC2 wording for assertions. */
function mockTransloco(): Pick<TranslocoService, 'translate'> {
  return {
    translate: ((key: string) =>
      key === 'pilotage.guard.moduleDisabled' ? 'Module non disponible' : key) as TranslocoService['translate'],
  };
}

describe('moduleGuard (unit) — EN18.2', () => {
  let httpMock: HttpTestingController;
  let router: Router;
  let toastService: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PIVOT_CORE_API_URL, useValue: API },
        { provide: TranslocoService, useValue: mockTransloco() },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    toastService = TestBed.inject(ToastService);
  });

  afterEach(() => httpMock.verify());

  function run(): Observable<boolean | UrlTree> {
    const guard = moduleGuard('pilotage');
    return TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Observable<boolean | UrlTree>;
  }

  it('AC1 — allows navigation when the tenant has the pilotage module enabled', () => {
    let result: boolean | UrlTree | undefined;
    run().subscribe(v => (result = v));

    httpMock.expectOne(STATUS_URL).flush({ enabled: true });

    expect(result).toBe(true);
  });

  it('AC2 — denies navigation, redirects to /home and shows the "Module non disponible" toast when disabled', () => {
    const toastSpy = vi.spyOn(toastService, 'show');
    let result: boolean | UrlTree | undefined;
    run().subscribe(v => (result = v));

    httpMock.expectOne(STATUS_URL).flush({ enabled: false });

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/home');
    expect(toastSpy).toHaveBeenCalledWith('Module non disponible', 'warning');
  });

  it('AC5 — Vitest suite covers enabled=true then enabled=false explicitly (same guard instance behavior)', () => {
    let firstResult: boolean | UrlTree | undefined;
    run().subscribe(v => (firstResult = v));
    httpMock.expectOne(STATUS_URL).flush({ enabled: true });
    expect(firstResult).toBe(true);

    let secondResult: boolean | UrlTree | undefined;
    run().subscribe(v => (secondResult = v));
    httpMock.expectOne(STATUS_URL).flush({ enabled: false });
    expect(router.serializeUrl(secondResult as UrlTree)).toBe('/home');
  });

  it('Error case — fails closed identically on 404 (unknown module id)', () => {
    let result: boolean | UrlTree | undefined;
    run().subscribe(v => (result = v));

    httpMock
      .expectOne(STATUS_URL)
      .flush('Not Found', { status: 404, statusText: 'Not Found' });

    expect(router.serializeUrl(result as UrlTree)).toBe('/home');
  });

  it('Error case — fails closed identically on 401 (unauthenticated)', () => {
    let result: boolean | UrlTree | undefined;
    run().subscribe(v => (result = v));

    httpMock
      .expectOne(STATUS_URL)
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(router.serializeUrl(result as UrlTree)).toBe('/home');
  });

  it('Error case — fails closed identically on network error / timeout', () => {
    let result: boolean | UrlTree | undefined;
    run().subscribe(v => (result = v));

    httpMock.expectOne(STATUS_URL).error(new ProgressEvent('error'));

    expect(router.serializeUrl(result as UrlTree)).toBe('/home');
  });

  it('Security — requests the status with Cache-Control: no-store (no cached activation state)', () => {
    run().subscribe();

    const req = httpMock.expectOne(STATUS_URL);
    expect(req.request.headers.get('Cache-Control')).toBe('no-store');
    req.flush({ enabled: true });
  });

  it('Security — never sends a tenantId/userId of its own (backend resolves tenant from the bearer token only)', () => {
    run().subscribe();

    const req = httpMock.expectOne(STATUS_URL);
    expect(req.request.params.keys().length).toBe(0);
    expect(req.request.headers.has('X-Tenant-Id')).toBe(false);
    expect(req.request.headers.has('tenantId')).toBe(false);
    req.flush({ enabled: true });
  });

  it('Security — cross-tenant: each evaluation re-queries the backend independently and follows only the current response', () => {
    // First evaluation — e.g. tenant A, module enabled.
    let resultA: boolean | UrlTree | undefined;
    run().subscribe(v => (resultA = v));
    httpMock.expectOne(STATUS_URL).flush({ enabled: true });
    expect(resultA).toBe(true);

    // Second, independent evaluation — e.g. a different user/tenant B session where the module
    // is disabled. Must issue its own fresh, no-store request and deny — no memoized/shared
    // state from the first evaluation leaks across this second, distinct decision.
    let resultB: boolean | UrlTree | undefined;
    run().subscribe(v => (resultB = v));
    const secondReq = httpMock.expectOne(STATUS_URL);
    expect(secondReq.request.headers.get('Cache-Control')).toBe('no-store');
    secondReq.flush({ enabled: false });

    expect(router.serializeUrl(resultB as UrlTree)).toBe('/home');
  });

  it('A11y — passes a plain translated string (no raw HTML) and a semantic "warning" type to the toast', () => {
    const toastSpy = vi.spyOn(toastService, 'show');
    run().subscribe();

    httpMock.expectOne(STATUS_URL).flush({ enabled: false });

    const [message, type] = toastSpy.mock.calls[0] as [string, string];
    // No markup in the message — safe to project as text content into a future aria-live
    // region (EN17.2 real Toast component) without any innerHTML/sanitization concern.
    expect(message).not.toMatch(/[<>]/);
    expect(type).toBe('warning');
  });
});

@Component({ selector: 'app-dummy-guarded', template: '<p>dummy</p>' })
class DummyGuardedComponent {}

describe('moduleGuard — route wiring (AC1, AC3, AC4) — EN18.2', () => {
  let httpMock: HttpTestingController;
  let loadSpy: Mock<() => Promise<typeof DummyGuardedComponent>>;

  beforeEach(() => {
    loadSpy = vi.fn<() => Promise<typeof DummyGuardedComponent>>(() =>
      Promise.resolve(DummyGuardedComponent),
    );

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          // Stands in for the shell's (`pivot-ui`) real `/home` route so the guard's denial
          // redirect (`router.createUrlTree(['/home'])`) resolves to a valid route in this
          // isolated test config — see `module.guard.ts` TSDoc on why `/home` only exists once
          // truly integrated in the shell.
          { path: 'home', component: DummyGuardedComponent },
          {
            path: '',
            // AC4: a single guard declared once at the root — every child inherits it via
            // canActivateChild, structurally, with no per-route repetition to forget.
            canActivateChild: [moduleGuard('pilotage')],
            children: [
              { path: 'e22', loadComponent: () => loadSpy() },
              { path: 'e23', loadComponent: () => loadSpy() },
            ],
          },
        ]),
        { provide: PIVOT_CORE_API_URL, useValue: API },
        { provide: TranslocoService, useValue: mockTransloco() },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /**
   * `RouterTestingHarness#navigateByUrl` resolves the guard's HTTP call across several
   * internal microtask hops of the Router's own RxJS pipeline — flushing synchronously right
   * after calling it (as the direct guard-unit tests above do) races ahead of the request
   * actually being issued. Poll microtasks until the mock backend has recorded it, then flush.
   */
  async function flushStatusRequest(response: { enabled: boolean }): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const pending = httpMock.match(STATUS_URL);
      if (pending.length > 0) {
        pending[0].flush(response);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error(`moduleGuard never issued its status request to ${STATUS_URL}`);
  }

  it('AC1 — allows navigation to a guarded sub-route and instantiates its component when enabled', async () => {
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/e22');

    await flushStatusRequest({ enabled: true });
    await navigation;

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('AC3 — denies navigation and never requests the lazy chunk (loadComponent factory) when disabled', async () => {
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/e23');

    await flushStatusRequest({ enabled: false });
    await navigation;

    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('AC4 — a second, distinct sub-route independently inherits the same guard (no bypass route)', async () => {
    const harness = await RouterTestingHarness.create();

    const firstNavigation = harness.navigateByUrl('/e22');
    await flushStatusRequest({ enabled: false });
    await firstNavigation;
    expect(loadSpy).not.toHaveBeenCalled();

    // Same harness, second sub-route: re-navigating triggers a brand-new evaluation of the
    // inherited guard — it is not bypassed just because a sibling route was already denied.
    const secondNavigation = harness.navigateByUrl('/e23');
    await flushStatusRequest({ enabled: true });
    await secondNavigation;
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });
});
