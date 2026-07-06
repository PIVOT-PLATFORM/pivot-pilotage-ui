import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

/**
 * Bootstrap config du squelette bootstrap-only de pivot-pilotage-ui.
 *
 * Volontairement minimal : ni HttpClient, ni i18n Transloco, ni intercepteur
 * auth ne sont câblés ici. Ce repo n'est PAS un portail standalone — une fois
 * l'intégration réelle faite, ses routes seront lazy-loaded depuis le shell
 * pivot-ui (qui fournit déjà HttpClient, l'intercepteur token et Transloco via
 * @pivot/ui-core). Voir CLAUDE.md.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
  ],
};
