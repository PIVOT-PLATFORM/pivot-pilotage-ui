# TODO-SETUP.md — pivot-pilotage-ui

Ce dépôt vient d'être bootstrappé (squelette Angular + CI/CD + sécurité), à l'identique de la
structure `pivot-ui`. Une classic branch protection minimale et une ruleset basique
(`protect-main`) sont déjà actives sur `main` — voir
`gh api repos/PIVOT-PLATFORM/pivot-pilotage-ui/branches/main/protection`. La ruleset stricte
`protect-main`-complète (13 status checks requis, comme sur `pivot-ui`) n'est **volontairement
pas** activée — elle rendrait `main` définitivement non-mergeable tant que les points ci-dessous
ne sont pas traités.

## 1. Créer le projet SonarCloud

- Organisation SonarCloud : `pivot-platform`
- Project key attendu (déjà câblé dans `.github/workflows/ci.yml`, job `sonar`) :
  `PIVOT-PLATFORM_pivot-pilotage-ui`
- **Important** : le secret `SONAR_TOKEN` est **déjà disponible** — c'est un secret
  d'organisation GitHub (`PIVOT-PLATFORM`), hérité automatiquement par tous les repos de l'org,
  vérifié via `gh api repos/PIVOT-PLATFORM/pivot-pilotage-ui/actions/organization-secrets`
  (`SONAR_TOKEN`, `GITLEAKS_LICENCE_KEY`, `PLUMBER_TOKEN`, `SEMANTIC_RELEASE_TOKEN` y figurent
  tous). Ce n'est donc **pas le token qui manque** — c'est le **projet SonarCloud lui-même**.
  Sans lui, le job `SonarCloud Analysis` échoue ("project not found"), même avec un token valide.
- Une fois le projet créé et une première analyse réussie sur `main` : ajouter `SonarCloud
  Analysis` (et `SonarCloud Code Analysis` si un second job Sonar existe) à la liste des status
  checks requis.

## 2. Secrets optionnels (non bloquants, fallback déjà en place)

- `SEMGREP_APP_TOKEN`, `PLUMBER_METADATA_TOKEN` : absents des secrets d'organisation actuels.
  Non bloquants — mêmes fallbacks que pivot-core/pivot-ui (Semgrep tourne avec les rulesets
  publics `p/*` ; Plumber saute juste la vérification de version des actions tierces).
- `PIVOT_PROD_URL` : absent — utilisé uniquement par `dast-baseline.yml`/`dast-full.yml`
  (scans ZAP planifiés, non bloquants pour les PR). À ajouter quand une URL de prod existera.

## 3. Étendre la liste des status checks requis (une fois SonarCloud opérationnel)

Actuellement requis (classic branch protection) — tous self-contained, ne dépendent d'aucun
secret externe manquant :
`Code Quality - Angular`, `Tests (Vitest)`, `Build Angular (production)`,
`SCA - Dependency Audit`, `Gitleaks - Secret Scan`, `CodeQL - SAST`, `Semgrep - SAST`,
`Plumber - CI/CD Compliance`.

Volontairement **exclus** pour l'instant (raison) :
- `SonarCloud Analysis` / `SonarCloud Code Analysis` — projet SonarCloud inexistant (§1).
- `Docker preview image (PR)` — pousse vers GHCR ; fonctionnel dès aujourd'hui via
  `GITHUB_TOKEN`, mais délibérément laissé hors du gate initial le temps d'observer le premier
  run (création du package).
- `Lighthouse — Accessibilité` — voir §4 (dépendance non triviale).

**Mise à jour US22.3.1 (roadmap rapide)** — `E2E - Playwright` tourne déjà (déclencheurs
`push`/`pull_request` inconditionnels sur `.github/workflows/e2e.yml`, jamais retiré du
workflow lui-même) : la ligne ci-dessus l'excluant de la liste requise a été retirée car ce
squelette n'est plus "bootstrap-only" — `e2e/roadmap-board.e2e.spec.ts` exerce une vraie feature
(création de lane/initiative, déplacement clavier, cas d'erreur 403) contre le build Angular
statique, stubbée réseau via `page.route` (même mitigation que `pivot-agilite-ui/e2e.yml`, pas de
`pivot-pilotage-core` réel démarré ici — aucune image GHCR publiée pour ce backend à ce jour).
**Reste à faire (hors scope de cette US, action admin distincte)** : ajouter `E2E - Playwright`
à la liste des status checks requis via `gh api .../branches/main/protection` — non fait ici
volontairement, cette PR ne modifie pas la configuration de branch protection.

## 4. GAP CONNU — Lighthouse et pages authentifiées

Le job `Lighthouse — Accessibilité` de pivot-ui audite des pages **authentifiées** contre un
véritable backend `pivot-core` (image GHCR + Postgres + Redis). Ce bootstrap n'a **aucune page
d'authentification réelle** (shell minimal, pas de dev feature) : la passe authentifiée
(`.lighthouserc.json`, identifiants `LH_USER_EMAIL`/`LH_USER_PASSWORD`) n'a donc pas de cible
valide pour l'instant et a été laissée en `TODO` dans le workflow (commentaire explicite) — seule
la passe publique (`.lighthouserc.noauth.json`) tourne contre la page d'accueil du shell. À
réactiver dès qu'une vraie page authentifiée existe dans ce module.

## 5. GAP CONNU — `@pivot/ui-core` et `@pivot/design-system` non consommés

Ce repo **ne déclare pas** de dépendance npm vers `@pivot/ui-core` ni `@pivot/design-system`
dans son `package.json`. Vérifications faites :
- `@pivot/design-system` : le repo `pivot-design-system` n'existe pas encore (confirmé dans
  `pivot-ui/CLAUDE.md` — différé, cf. `ADR-007`, suivi `EN17.2`).
- `@pivot/ui-core` : en lisant `pivot-ui/.github/workflows/release.yml`, **aucun step
  `npm publish` n'existe** — seule une image Docker (`ghcr.io/pivot-platform/pivot-ui`) est
  publiée. `pivot-ui/CLAUDE.md` décrit l'intention (« publie `@pivot/ui-core` ») mais ce n'est
  pas implémenté : il n'y a pas de package npm consommable aujourd'hui.

**Ne pas ajouter de dépendance fictive.** Dès que l'un de ces packages est réellement publié
(GitHub Packages npm), l'ajouter ici avec la vraie version.

## 6. `deploy.yml` — stub à brancher

Le job "Deploy to production" est un `TODO` (`echo "TODO — ..."`), identique à pivot-core et
pivot-ui à ce stade. Nécessite un environnement GitHub `production` (approvals, secrets
d'environnement) avant de brancher un déploiement réel.
