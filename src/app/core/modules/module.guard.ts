import { inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { ToastService } from '../toast/toast.service';
import { PIVOT_CORE_API_URL } from '../config/tokens';

/** Shape of `GET /modules/{id}/status` — see pivot-core's `ModuleStatusDto`/JavaDoc. */
interface ModuleStatusDto {
  enabled: boolean;
}

/**
 * moduleGuard — EN18.2 (Guard Angular module pilotage).
 *
 * **Not** an import of `@pivot/ui-core`'s `moduleGuard` (EN03.2): that package is not yet
 * published as a consumable npm artifact (EN17.3 still blocked — verified via this repo's own
 * `TODO-SETUP.md` §5, `npm view @pivot/ui-core` → 404, and the identical documented gap in
 * `pivot-collaboratif-ui`/`pivot-agilite-ui`'s `CLAUDE.md`). This is a local, plain
 * `HttpClient`-based guard replicating the exact same contract — it does not touch
 * auth/OIDC/token handling (forbidden to reimplement in this repo), it only calls the
 * module-status endpoint exposed by pivot-core and reacts to its response, exactly like
 * `RetroApiService`/`WheelApiService` in `pivot-agilite-ui` already do for their own domain
 * calls while `@pivot/ui-core`'s `AuthInterceptor` isn't wired in yet (the bearer token will be
 * attached transparently once this module is truly lazy-loaded inside the `pivot-ui` shell —
 * nothing to change here when that happens).
 *
 * TODO(EN17.3): once `@pivot/ui-core` is actually publishable, consider replacing this file's
 * body with a re-export of the real `moduleGuard` from that package. Call sites —
 * `moduleGuard('pilotage')` — stay unchanged either way.
 *
 * Contract (EN18.2 AC):
 * - `GET {PIVOT_CORE_API_URL}/modules/{moduleId}/status`, header `Cache-Control: no-store`
 *   (stricter than EN03.2's current `no-cache` in `pivot-ui` — this Enabler's AC explicitly
 *   requires `no-store`: a tenant/activation change must never be served from any cached
 *   response, not even a revalidated one).
 * - `{ enabled: true }` → allow navigation (`true`).
 * - `{ enabled: false }` OR any HTTP error (404 unknown module, 401 unauthenticated, network
 *   failure, timeout) → identical fail-closed outcome: deny (`UrlTree` to `/home`), show the
 *   "Module non disponible" toast. The guard never branches on the HTTP status code itself —
 *   only on the resolved DTO vs. an error — keeping the 401-vs-404-vs-5xx distinction a
 *   backend/API-contract concern (mirrors EN03.2's own reasoning).
 * - Tenant isolation: this guard never sends a `tenantId`/`userId` of its own — the backend
 *   resolves the current tenant exclusively from the bearer token attached by the shell's
 *   interceptor. Each evaluation issues its own fresh, uncached request and follows only that
 *   response; there is no client-side memoization that could leak one tenant's activation
 *   state into another tenant's session (see this repo's absolute rule "Logique de filtrage
 *   tenant côté Angular = non-fiable").
 * - `/home`: this guard's redirect target is the shell-level dashboard route. It only resolves
 *   once this module is genuinely lazy-loaded inside `pivot-ui` (which does have a `/home`
 *   route) — this repo's own standalone bootstrap shell does not, by design (see
 *   `app.routes.ts`). Same accepted class of gap as `pivot-collaboratif-ui`'s
 *   `board-access.guard.ts` TSDoc documents for its own redirect target.
 * - i18n: the toast receives the **Transloco key** `'pilotage.guard.moduleDisabled'` — never a
 *   literal string — following the canonical `ToastService` contract (EN17.13): the message is
 *   translated at render time by the shell's global toast container, not here. No
 *   `fr.json`/`en.json` catalog entry exists in this repo yet (no Transloco loader is wired into
 *   this bootstrap-only `app.config.ts` — see `app.routes.ts` comment for why); the catalog entry
 *   (`"Module non disponible"` / `"Module unavailable"`) will be added once this module gets a
 *   real i18n asset pipeline or is integrated into the shell's catalog. Zero code change required
 *   here when that happens.
 *
 * @param moduleId technical module identifier, e.g. `"pilotage"`
 */
export function moduleGuard(moduleId: string): CanActivateFn {
  return (): Observable<boolean | UrlTree> => {
    const http = inject(HttpClient);
    const router = inject(Router);
    const toast = inject(ToastService);
    const apiUrl = inject(PIVOT_CORE_API_URL);

    const denyAndRedirect = (): UrlTree => {
      toast.show('pilotage.guard.moduleDisabled', 'warning');
      return router.createUrlTree(['/home']);
    };

    return http
      .get<ModuleStatusDto>(`${apiUrl}/modules/${moduleId}/status`, {
        headers: new HttpHeaders({ 'Cache-Control': 'no-store' }),
      })
      .pipe(
        map(status => (status.enabled ? true : denyAndRedirect())),
        catchError(() => of(denyAndRedirect())),
      );
  };
}
