import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { PILOTAGE_API_URL } from './tokens';

export interface PilotageUiConfig {
  /** Base URL of the `pivot-pilotage-core` API (see {@link PILOTAGE_API_URL}). */
  apiUrl: string;
}

/**
 * Configures `@pivot-platform/pilotage-ui`. Call this in the consuming app's providers array
 * (the `pivot-ui` shell, or this repo's own standalone dev harness `app.config.ts`).
 *
 * No bearer-token accessor is needed here (unlike `provideCollaboratifUi`): the pilotage module
 * has no real-time STOMP transport — its data-access is plain `HttpClient`, and the shell's
 * `AuthInterceptor` attaches the bearer transparently once this module is lazy-loaded there.
 */
export function providePilotageUi(config: PilotageUiConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: PILOTAGE_API_URL, useValue: config.apiUrl }]);
}
