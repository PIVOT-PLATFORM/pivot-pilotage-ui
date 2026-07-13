// Config
export { PILOTAGE_API_URL } from './lib/core/config/tokens';
export { providePilotageUi } from './lib/core/config/provide-pilotage-ui';
export type { PilotageUiConfig } from './lib/core/config/provide-pilotage-ui';

// Routes — mounted by the consuming shell under a guarded path (e.g. moduleGuard('pilotage')),
// see pivot-docs EN18. The standalone dev harness imports these directly from source.
export { PILOTAGE_ROUTES } from './lib/pilotage.routes';
