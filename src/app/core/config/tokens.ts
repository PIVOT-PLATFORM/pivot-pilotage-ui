import { InjectionToken } from '@angular/core';

/**
 * Base URL of pivot-core's API.
 *
 * The module-activation-status endpoint consumed by `moduleGuard` (`GET
 * /modules/{id}/status`) lives on **pivot-core**, not on `pivot-pilotage-core` (roadmap /
 * Gantt / portfolio domain data — a distinct backend on a distinct port, see
 * `pivot-pilotage-core/src/main/resources/application.yml`: 8081, vs. pivot-core's 8080). See
 * this repo's `CLAUDE.md`, section "Système de modules (côté Angular)".
 *
 * No default value, and no provider is registered in this repo's own `app.config.ts` today:
 * `moduleGuard('pilotage')` is intentionally not wired onto any live route here yet — see the
 * comment above the placeholder route in `app.routes.ts` for why. The real consumer will be
 * the `pivot-ui` shell once this module is genuinely lazy-loaded (EN17.x packaging), which
 * will supply its own value for this token from its own environment configuration — mirroring
 * how `PIVOT_API_URL` is provided in `pivot-ui`'s `projects/ui-core/src/lib/config/tokens.ts`.
 */
export const PIVOT_CORE_API_URL = new InjectionToken<string>('PIVOT_CORE_API_URL');
