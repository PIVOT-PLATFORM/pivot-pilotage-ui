// Utilisé en build `production` via fileReplacements (angular.json). apiUrl relatif
// `/api/pilotage` (reverse-proxy nginx vers pivot-pilotage-core — NE PAS mettre d'URL absolue
// ici, casserait le déploiement derrière reverse-proxy). Voir environment.ts pour le détail du
// port/context-path en dev.
export const environment = {
  production: true,
  apiUrl: '/api/pilotage',
};
