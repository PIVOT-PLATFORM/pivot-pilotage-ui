import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { TranslocoHttpLoader } from './core/i18n/transloco.loader';

/**
 * Bootstrap config de pivot-pilotage-ui.
 *
 * Jusqu'à US22.3.1 (roadmap rapide), ce fichier était volontairement minimal — ni HttpClient,
 * ni i18n Transloco, ni intercepteur auth : squelette bootstrap-only, aucune feature réelle.
 * US22.3.1 est la première feature réelle de ce repo (mirroring `pivot-agilite-ui`/
 * `pivot-collaboratif-ui`'s propre premier câblage à leur première feature) : `HttpClient` et
 * Transloco sont donc désormais câblés ici.
 *
 * **Toujours pas d'intercepteur auth ici** — une fois l'intégration réelle faite, ce repo sera
 * lazy-loadé depuis le shell `pivot-ui`, qui fournit son propre `AuthInterceptor` via
 * `@pivot/ui-core` (non publié à ce jour, gap `TODO-SETUP.md` §5). Aucun intercepteur local ne
 * doit être ajouté ici (interdiction absolue — voir CLAUDE.md, réimplémentation OIDC/token).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: ['fr', 'en'],
        defaultLang: 'fr',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};
