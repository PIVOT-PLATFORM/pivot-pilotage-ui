import { InjectionToken } from '@angular/core';

/**
 * Base URL of the `pivot-pilotage-core` backend API (roadmap / Gantt / calendars / portfolio
 * domain data — port 8081, context-path `/api/pilotage`, distinct from pivot-core's :8080).
 *
 * Provided by the consuming app — `providePilotageUi()` when this module is lazy-loaded from the
 * `pivot-ui` shell, or the standalone dev harness's `app.config.ts` (from `environment.apiUrl`)
 * when this repo runs on its own. The library code itself MUST NOT import `environment` — every
 * data-access service reads this token via `inject(PILOTAGE_API_URL)` instead, so the package
 * stays consumable as-is once published (EN18 lib-extraction, mirroring
 * `@pivot-platform/collaboratif-ui`'s `COLLABORATIF_API_URL`).
 */
export const PILOTAGE_API_URL = new InjectionToken<string>('PILOTAGE_API_URL');
