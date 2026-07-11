import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

/**
 * Transloco loader fetching `assets/i18n/{lang}.json` via `HttpClient`.
 *
 * First real consumer of Transloco in this repo (US22.3.1 — roadmap rapide): the bootstrap
 * `app.config.ts` previously wired no loader at all (see `module.guard.ts` TSDoc, EN18.2 — that
 * guard calls `TranslocoService.translate()` but is not yet attached to any live route, so the
 * missing provider never surfaced). This is the identical loader shape already established in
 * `pivot-agilite-ui`/`pivot-collaboratif-ui`'s `core/i18n/transloco.loader.ts`.
 */
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(langPath: string) {
    return this.http.get<Translation>(`assets/i18n/${langPath}.json`);
  }
}
