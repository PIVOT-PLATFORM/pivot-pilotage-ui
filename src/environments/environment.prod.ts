// Utilisé en build `production` via fileReplacements (angular.json). apiUrl relatif `/api`
// (reverse-proxy nginx, cf. nginx.conf) — cohérent avec le modèle pivot-ui, pas encore
// consommé par ce squelette (aucune feature réelle, voir CLAUDE.md).
export const environment = {
  production: true,
  apiUrl: '/api',
};
