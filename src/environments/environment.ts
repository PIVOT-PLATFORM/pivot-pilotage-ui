// US22.3.1 (roadmap rapide) — première feature réelle de ce repo : `apiUrl` pointe désormais
// vers pivot-pilotage-core (port 8081, context-path `/api/pilotage` — voir
// `pivot-pilotage-core/src/main/resources/application.yml` et
// `pivot-docs/docs/architecture/platform-overview.md`), jamais pivot-core (:8080, consommé
// séparément via `PIVOT_CORE_API_URL` pour `moduleGuard`, cf. `core/config/tokens.ts`).
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8081/api/pilotage',
};
