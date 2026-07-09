# CLAUDE.md — PIVOT-PILOTAGE-UI

## Projet

**PIVOT-PILOTAGE-UI** — frontend Angular du domaine **Pilotage** (roadmap, Gantt, portefeuille
de projets) de la suite collaborative PIVOT.

**Ce repo n'est PAS un portail standalone.** Il produit un **feature module lazy-loadé à
l'intérieur du shell `pivot-ui`** (voir `pivot-docs/docs/architecture/platform-overview.md` —
table des services : *« Frontend pilotage (lazy-loaded dans pivot-ui) »*). Concrètement :

- Header, footer, routing inter-modules, client OIDC PKCE : vivent dans **pivot-ui**, jamais ici.
- Ce repo expose uniquement des **routes/composants feature** consommés par `pivot-ui` via
  lazy-loading (`loadChildren`/`loadComponent`), plus les services/guards propres au domaine
  Pilotage.
- Backend associé : **pivot-pilotage-core** (roadmap, survey, quiz — schéma PostgreSQL
  `pilotage`, FK → `public.teams`).

**État actuel — bootstrap uniquement.** Ce repo vient d'être créé et ne contient encore
**aucune feature métier**. Le "shell minimal" présent aujourd'hui (une route placeholder
`HomeComponent` affichant "Pivot Pilotage — module en construction") est un **squelette
standalone temporaire**, utile uniquement pour que le workspace build/boot et que la CI ait
quelque chose à valider (lint, tests, build, E2E, Lighthouse). **Ce n'est pas le modèle
d'intégration final** — personne ne doit confondre cette route placeholder avec la vraie
architecture lazy-loadée décrite ci-dessus. Elle sera remplacée dès la première US réelle.

**Consomme** `@pivot/ui-core` (auth, tenant, shell, guards de module) et `@pivot/design-system`
(composants UI, Angular CDK + SCSS BEM) — **aucun des deux n'est aujourd'hui une dépendance npm
réelle** (gap de publication vérifié : voir `TODO-SETUP.md` pour le détail, pas dupliqué ici).

**Vision :** interface roadmap/Gantt/portefeuille réactive, accessible (WCAG 2.1 AA), activable
comme n'importe quel module PIVOT — sans lock-in SaaS.

---

## Communication

Concise et directe. Techniquement précise. Pas de récapitulatifs inutiles.

**Exceptions (réponses complètes et structurées) :**
- Rédaction ou revue d'US / Epics
- Décisions d'architecture (routing, state management, contrat de module)
- Avis cybersécurité ou actions irréversibles — **confirmation obligatoire**
- Backlog et critères d'acceptation

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Framework | Angular 22 · TypeScript strict |
| Styles | SCSS · BEM · tokens CSS (migrera vers `@pivot/design-system`) |
| HTTP | Angular HttpClient · RxJS |
| State | Signals Angular · NgRx si complexité croissante |
| Auth | Consommée depuis `@pivot/ui-core` — **pas de client OIDC propre ici** (voir section dédiée) |
| Tests unitaires | Vitest |
| Tests E2E | Playwright (Chromium) |
| i18n | Transloco — tous libellés externalisés, jamais de chaîne littérale dans les templates (dépendance présente, pas encore câblée tant qu'il n'y a pas de libellé réel à traduire) |
| Build | Angular CLI · esbuild |
| CI/CD | GitHub Actions · SonarCloud · Semantic Release · Plumber |
| Déploiement | Docker (nginx) |
| Backend | → **pivot-pilotage-core** (Java · Spring Boot, schéma `pilotage`) |

---

## Structure du dépôt

```
pivot-pilotage-ui/
├── src/
│   ├── app/
│   │   ├── features/
│   │   │   └── home/          # Placeholder bootstrap-only — sera remplacé
│   │   └── app.*.ts
│   ├── environments/
│   └── styles.scss
├── e2e/
├── .github/
│   └── workflows/
├── .plumber.yaml
└── Dockerfile                 # nginx production (build standalone du squelette)
```

**Structure cible (une fois les premières features développées) :** feature modules
lazy-loadés par sous-domaine (`roadmap/`, `gantt/`, `portfolio/`), guards d'activation de
module, services HTTP vers `pivot-pilotage-core`. Pas de header/footer/OIDC/shell — tout ça
reste dans `pivot-ui`.

---

## Équipe experte

Toute contribution mobilise les experts concernés — les mentionner explicitement dans la réponse.

| Expert | Domaine |
|--------|---------|
| **Architecte Angular** | Architecture Angular, feature modules lazy-loadés, RxJS, Signals, OnPush |
| **Expert UX/UI** | Design system SCSS, accessibilité WCAG 2.1 AA, tokens CSS, ergonomie roadmap/Gantt |
| **Expert DevSecOps** | CI/CD GitHub Actions, SonarCloud, Semgrep, Gitleaks, Plumber, SBOM |
| **Expert Red Team** | XSS, exposition de données projet, contournement de guard de module |
| **Expert Blue Team** | CSP, SRI, headers sécurité nginx, réponse aux rapports Red Team |
| **Expert QA** | Stratégie Vitest/Playwright, coverage ≥ 85 %, A11y tests |
| **Expert RGPD** | Conformité RGPD/CNIL, données projet/planning, consentement |
| **Product Owner** | Backlog GitHub org, Epics, US, critères d'acceptation, priorisation |
| **Scrum Master** | Coordination, sprints, impediments, backlog consistency |
| **Architecte Modules** | Lazy-loading Angular, contrat d'intégration avec le shell pivot-ui, guards d'activation |
| **Expert PR Review** | Relecture croisée neutre : cohérence architecture Angular, lisibilité, dette technique, respect des standards PIVOT |
| **Experts pivot-ui / pivot-core** | → repos respectifs (shell, auth, contrat de module) |

### Faire appel aux experts

| Type de tâche | Expert(s) |
|---------------|-----------|
| Composant Angular, SCSS, routing | **Architecte Angular** + **Expert UX/UI** |
| Lazy-loading, contrat d'intégration pivot-ui | **Architecte Angular** + **Architecte Modules** |
| Design system, tokens CSS, A11y | **Expert UX/UI** |
| Consommation guards/state auth depuis `@pivot/ui-core` | **Architecte Modules** + **Expert Blue Team** |
| Tests Vitest, Playwright, coverage | **Expert QA** |
| CI/CD, GitHub Actions, Plumber | **Expert DevSecOps** |
| Vulnérabilité sécurité frontend | **Expert Red Team** → **Expert Blue Team** |
| RGPD, données projet, stockage navigateur | **Expert RGPD** |
| Backlog, US, acceptance criteria | **Product Owner** |
| Bug inexpliqué | **Architecte Angular** en premier, puis **Expert Red Team** si suspicion sécurité |
| API REST, backend Java | → **pivot-pilotage-core** |
| Shell, header/footer, OIDC | → **pivot-ui** |

**Règles :**
- Mentionner l'expert explicitement quand son domaine est engagé.
- Toute faille Red Team = correction Blue Team **avant** tout merge.
- Changement du contrat de module ou de l'intégration avec `pivot-ui` = coordination obligatoire.

---

## Backlog — fichiers markdown

> **Sources de vérité :**
> - Hiérarchie backlog + conventions : `pivot-docs/docs/backlog/README.md`
> - Sprints, assignation US, état avancement : **`pivot-docs/docs/backlog/sprints/`** (un fichier par sprint, index dans `sprints/README.md`)
> - **Backlog opérationnel :** fichiers markdown dans `pivot-docs/docs/backlog/` — un fichier par US/Enabler avec frontmatter (`Stage`, `Priority`, `Phase`).

### Hiérarchie
`EPIC → FEATURE (valeur) / ENABLER (technique) → US` · clé `E01 → F01.1 / EN01.1 → US01.1.1`.

### Champs du Project

| Champ | Valeurs |
|-------|---------|
| Item Type | Epic / Feature / Enabler / US |
| Parent | clé du parent (ex. `E01`, `F01.1`) |
| Stage | ⬜ (pas encore terminé) / ✅ (Done — recette mainteneur). États intermédiaires internes, non persistés → pivot-docs/docs/backlog/README.md §2/§5 |
| Priority | Critical / High / Medium / Low |
| Module | roadmap / gantt / portfolio (extensible) |
| Phase | Socle / v1-enterprise / phase-3 |
| Sprint | Sprint 1…N |
| Size | XS / S / M / L / XL |

### Template US, Definition of Ready, vagues → `pivot-docs/docs/backlog/README.md`.

---

## Breaking Points

### Step 0 — Challenge PO avant implémentation

Avant tout code, le **PO Agent** challenge les ACs de l'US :

1. Vérifier DoR — story complète, ACs Given/When/Then, AC erreur + sécurité
2. Calculer Gate 1 : **= 100** → procéder · **< 100** → PO Agent réécrit ACs → recalculer
3. AC ambigus à l'implémentation → PO Agent clarifie, jamais d'interprétation unilatérale

Pas de blocage humain — Claude autonome de A à Z sur la validation des ACs.

### Breaking Point 2 : Gate 4 MERGE < 60 ou hard block

Tout PR avec :
- Label `security` ou `breaking-change`
- Gitleaks secret détecté
- Modification du contrat d'intégration avec `pivot-ui` sans coordination
- Modification de la gestion de l'état d'auth consommé depuis `@pivot/ui-core`

→ Label `needs-human-review` + score breakdown + attendre le mainteneur.

---

## Workflow — Organisation par sprint

Travail organisé par sprint. Référence : **`pivot-docs/docs/backlog/sprints/`** (un fichier par sprint).

**Principes :**
- **Une branche par US / Enabler** — `feat/{us-id}-{slug}` (ex. `feat/us05-1-1-roadmap-vue-liste`)
- **Agents en parallèle** — un agent par item du sprint, branches séparées
- **Backlog pivot-docs** — mises à jour `sprints/sprint-{N}.md`, committés sur la branche de l'US. Le frontmatter `Stage` de l'US n'est touché qu'à la création (`⬜`) et au passage en Done (`✅` — recette mainteneur) ; les états intermédiaires (Ready, In progress, Review) restent internes à la session, jamais persistés
- **Issue GitHub liée** — avant de démarrer un item, vérifier qu'une issue existe dans **ce repo** pour cet US/Enabler (recherche par id/titre). Absente → la créer (titre `{id} — {titre US}`, corps = lien vers le fichier backlog pivot-docs + AC). **Déjà assignée** (humain ou agent en cours) → item déjà pris, ne pas démarrer, passer au suivant. Sinon → se l'auto-assigner immédiatement (`gh issue edit {N} --add-assignee @me`) avant le premier commit — verrouille l'item, empêche qu'un autre agent ou une autre personne ne le reprenne en parallèle. Référencer l'issue dans la PR (`Closes #N`) — fermeture automatique à la fusion, jamais de fermeture manuelle en double.

## Workflow — Merge séquentiel autonome (plusieurs PR)

Quand plusieurs PR sont ouvertes/en attente sur ce repo (ex. plusieurs items d'un même sprint),
Claude détermine seul l'ordre de fusion et l'exécute de bout en bout, sans confirmation par PR :

1. **Ordre** — dépendances fonctionnelles entre items d'abord, puis fichiers partagés
   (i18n `en.json`/`fr.json`, config CI commune) pour minimiser les rebases en cascade.
2. **Par PR, dans cet ordre :**
   - Rebase sur `main` à jour (jamais de merge commit)
   - Conflit → résolution manuelle réelle (jamais `--theirs`/`--ours` aveugle) : lire les deux
     côtés, comprendre l'intention de chacun, fusionner le contenu
   - Rebase sans conflit mais fichier partagé (ex. `en.json`) → vérifier quand même qu'aucune
     clé n'a été silencieusement écrasée par l'auto-merge git
   - `npx tsc --noEmit` + `npm run lint` + `npm run test:ci` + build prod locaux avant push
   - Push, attendre la CI réelle en boucle synchrone (jamais d'attente passive d'une notification)
   - Gate 4 selon les seuils déjà définis ci-dessous → squash-merge dès convergence
3. **Dernier item du sprint courant** (vérifier `pivot-docs/docs/backlog/sprints/sprint-{N}.md`)
   → le commit de squash-merge porte le marqueur de release (voir *Workflow — Release*
   ci-dessous), tous les autres non.
4. Incident CI rencontré en cours de route → diagnostiquer et corriger avant de continuer la
   séquence, pas de contournement silencieux.

## Workflow — Release

Le déclenchement d'une release (`release.yml` : version, publish npm/Docker, tag, changelog)
n'a lieu **qu'en fin de sprint**, jamais à chaque merge — un merge ordinaire ne doit ni bumper de
version ni publier quoi que ce soit.

- **Déclencheur** : le commit du squash-merge du **dernier item d'un sprint** porte le trailer
  `Release-Trigger: true` **sur sa propre ligne, seul, rien d'autre** (`grep -qxE` — match exact
  de ligne entière, jamais une simple sous-chaîne — cf. incident réel documenté sur
  `pivot-core/CLAUDE.md` et `pivot-ui/CLAUDE.md`, section Workflow — Release).
- **Pourquoi** : sans cette règle, chaque merge déclenche `release.yml` — plusieurs merges
  rapprochés calculeraient tous la même "prochaine version" (aucun tag encore créé entre eux) et
  le second à publier échouerait en conflit sur GitHub Packages.
- **Effet** : la release qui finit par se déclencher regroupe automatiquement, dans une seule
  entrée de changelog, tous les commits accumulés depuis le dernier tag — comportement natif de
  semantic-release, pas une fonctionnalité à coder.
- **Ajout du trailer** : `gh pr merge --squash --body "...

Release-Trigger: true"` — trailer sur sa propre ligne finale, précédée d'une ligne vide, jamais
  intégré dans une phrase. Uniquement sur le merge identifié comme dernier item du sprint courant.

## Workflow — Autoloop PR

Après toute modification sur une branche de travail — US/Enabler (`feat/{us-id}-{slug}`) ou
hors sprint (`fix/`, `refactor/`, `chore/`, `docs/`) — **sans exception** :

1. Ouvrir une PR (draft) vers `main`
2. **Autoloop** (20 itérations max) :
   - **En parallèle :**
     - **Review neutre** — Expert PR Review : architecture, AC, sécurité, dette, a11y, i18n
     - **CI** — `npx tsc --noEmit` + `npm run lint` + `npm run test:ci` + build prod = 0 erreur/warning
   - **Corrections** — tous les findings résolus, commit `fix({scope}): ...`
   - **Convergence** — Gate 4 ≥ 85 ET CI verte → sortir
3. Gate 4 = 100/100 (ou convergence confirmée sans finding restant) :
   - Sortir la PR du mode draft (`gh pr ready`)
   - État interne Review (Stage frontmatter reste `⬜`) + mise à jour `sprints/sprint-{N}.md` (branche/PR dédiée `pivot-docs`)
   - **Gate 5** — générer/mettre à jour la spec fonctionnelle et technique figée `pivot-docs/docs/specs/{EPIC}/{us-id}-{slug}.md` (branche/PR `pivot-docs` dédiée — jamais de commit cross-repo, voir `pivot-docs/docs/workflow/README.md`)
   - Signal mainteneur
4. Blocage 20 boucles → Breaking Point 2

## Workflow — Ordre d'exécution par US (dans un sprint)

| Étape | Contenu |
|-------|---------|
| **1. Code** | Composants Angular + TSDoc · Services · Guards |
| **2. Tests** | Vitest TU composants + services — **dans le même commit** |
| **3. Qualité** | ESLint · TypeScript strict verts |
| **4. UI / i18n / A11y** | Composants Angular, styles, tokens, ARIA |
| **5. Gate 2** | Coverage check : ≥ 85 % → continuer · 70–84 % → compléter · < 70 % → stop |
| **6. Backlog** | Mise à jour `sprints/sprint-{N}.md` + statut US **obligatoire avant commit** |
| **7. E2E** | Spec Playwright (happy path + 1 erreur critique) |
| **8. Commit** | `git add` fichier par fichier · commits atomiques sur branche `feat/{us-id}-{slug}` |

> **E2E différable** si environnement indisponible. Étapes 6 et 8 non différables.

### Approche tests

Écrire le code d'abord, puis les tests couvrant toutes les branches et conditions limites. TDD strict non utilisé.

**Exception :** quand le contrat d'un service ou d'un guard est flou — écrire les tests en premier pour forcer la clarification.

---

## Workflow — Vérifications avant push autonome

**Condition absolue avant tout push autonome : 0 erreur, 0 warning.**

Claude exécute ces commandes **sans attendre d'instruction** :

```bash
npx tsc --noEmit                              # TypeScript strict (0 erreur)
npm run lint                                  # ESLint (0 warning)
npm run test:ci                               # Vitest coverage
npm run build -- --configuration production   # Build prod (doit réussir)
```

Rapporter ✅ ou stderr complet. Toute erreur ou warning non justifié = **stop, corriger avant push**.

---

## Workflow — Branches

| Préfixe | Usage | Exemple |
|---------|-------|---------|
| `feat/{us-id}-{slug}` | Implémentation d'une US | `feat/us05-1-2-gantt-drag-drop` |
| `feat/{en-id}-{slug}` | Implémentation d'un Enabler | `feat/en05-1-portfolio-api-client` |
| `fix/{id}-{slug}` | Correction bug hors sprint | `fix/12-roadmap-tri-dates` |
| `refactor/{id}-{slug}` | Refactoring hors sprint | `refactor/15-gantt-signals-migration` |
| `chore/{slug}` | CI, deps, config | `chore/eslint-config` |
| `docs/{slug}` | Documentation hors sprint | `docs/adr-gantt-lib` |

**Règles :**
- Jamais de travail direct sur `main`
- **Une branche = un item de sprint** (US ou Enabler)
- **Backlog pivot-docs committé sur la branche de l'US**
- Rebase avant merge → squash WIP
- `git push --force-with-lease` uniquement sur branches de travail

**Création de branche US — procédure obligatoire :**
```bash
git checkout main
git pull origin main
git checkout -b feat/{us-id}-{slug}
```
Branche existante → `git checkout feat/{us-id}-{slug}` directement.

---

## Workflow — Commits

Format **Conventional Commits** (`type(scope): message`) — alimente Semantic Release pour le versioning automatique.

| Commit | Contenu typique |
|--------|----------------|
| `feat(roadmap):` | composant/service roadmap |
| `fix(roadmap):` | correction bug roadmap |
| `feat(gantt):` | composant/service Gantt |
| `fix(gantt):` | correction bug Gantt |
| `feat(portfolio):` | composant/service portefeuille de projets |
| `fix(portfolio):` | correction bug portefeuille |
| `test:` | ajout ou correction de tests (Vitest, Playwright) sans changement de code prod |
| `feat(a11y):` | accessibilité WCAG, attributs ARIA |
| `style(ui):` | SCSS, tokens CSS, design system |
| `ci:` | GitHub Actions workflows, Plumber |
| `docs:` | README, CLAUDE.md, ADR |
| `security:` | correctif sécurité — **hard block Gate 4, review humaine** |

Co-author sur chaque commit : `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

---

## Gates ACDD — Confidence Gates

Score 0–100, jamais booléen. Scores/décisions consignés en **commentaire de PR** (plus de
dossier `gates/`). Le statut vit dans le champ **Stage** du frontmatter US (pivot-docs).

| Gate | Moment | Seuils |
|------|--------|--------|
| **1 — READINESS** | Avant implémentation | PO Agent self-challenge · = 100 → état interne Ready → procéder (Stage frontmatter reste `⬜`) · < 100 → PO Agent réécrit ACs |
| **2 — COVERAGE** | Par commit | ≥ 85 → continuer · 70–84 → compléter tests · < 70 → stop |
| **3 — QUALITY** | Après CI verte | Hard blocks : secret Gitleaks, label `security`/`breaking-change`, modif contrat d'intégration pivot-ui |
| **4 — MERGE CONFIDENCE** | Avant merge | ≥ 85 → merge autonome · 60–84 → merge documenté · < 60 → Breaking Point 2 |

**Checks Gate 1 :** AC testables (40) · dépendances résolues (20) · impact contrat de module (15) · AC sécurité + A11y ≥ 1 chacun (15) · pas de cycle (10)

**Checks Gate 2 :** AC couverts (50) · pas de code non testé (30) · tests non triviaux (20)

**Checks Gate 3 :** SonarCloud ≥ 80 % (25) · zéro finding critique/high (25) · linters clean (20) · Gitleaks clean (20) · build Docker (10)

**Format du commentaire de PR (gate)** : `gate` (READINESS | COVERAGE | QUALITY | MERGE_CONFIDENCE), `score`, `decision`, `breakdown`, `notes`.

---

## Agents IA — Rôles et cycle ACDD

### Philosophie

**ACDD (Acceptance Criteria Driven Development)** — gates de confiance continues.

- Gates → score (0–100), jamais booléen pass/fail
- Chaque gate → consigné en **commentaire de PR** (pas de fichier committé)
- Breaking Points = seuls moments d'intervention humaine obligatoire

### Rôles

| Agent | Responsabilité |
|-------|---------------|
| **PO Agent** | Génère Epics et US, rédige AC, clarifie AC ambigus |
| **Architect Agent** | Valide AC techniques Angular, identifie impact contrat d'intégration pivot-ui |
| **Security Agent** | Challenge AC (XSS, exposition données projet), valide fixes CSP/SRI |
| **Dev Agent** | Implémente sur branche dédiée, s'auto-évalue via gates |
| **QA Agent** | Rédige specs Playwright, valide coverage Vitest, challenge A11y |
| **PR Review Agent** | Exécute Gate 3 + Gate 4, merge ou escalade selon score |

### Format des AC

```markdown
- [ ] Given [contexte], when [action], then [résultat observable]
- [ ] Error case: given [input invalide], system retourne [erreur / status code]
- [ ] Security: [propriété de sécurité qui doit tenir]
```

Chaque AC mappe à au moins un test. AC sans test = non implémenté, peu importe le code présent.
AC ambigu à l'implémentation → **stopper et demander au PO Agent** — jamais d'interprétation unilatérale.

### Labels PR

| Label | Signification |
|-------|--------------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `security` | Impact sécurité — hard block Gate 4, review humaine |
| `breaking-change` | Changement de contrat — hard block Gate 4, review humaine |
| `module-contract` | Changement contrat d'intégration pivot-ui — hard block Gate 4 |
| `needs-human-review` | Gate 4 < 60 ou hard block — décision humaine requise |
| `auto-approved` | Gate 4 ≥ 85 — mergé automatiquement |
| `chore` | Maintenance, CI, dépendances |
| `docs` | Documentation uniquement |

### Post-merge

```bash
# 1. Mainteneur : passe Stage: ⬜ → ✅ dans le frontmatter US (recette humaine — jamais Claude)
# 2. Débloquer les US dépendantes
# 3. Nettoyer la branche
git push origin --delete feat/{us-id}-{slug}
```

---

## Standards de code

### Angular (frontend)

- TypeScript strict — pas de `any`
- OnPush change detection par défaut (`ChangeDetectionStrategy.OnPush`)
- Signals Angular pour le state local — `signal()`, `computed()`, `effect()`
- RxJS pour l'asynchrone HTTP — pas de Promise sauf interop
- SCSS BEM + tokens centralisés — pas de styles inline
- WCAG 2.1 AA sur tous les éléments interactifs (ARIA, focus, contraste)
- Pas de logique métier dans les composants — déléguer aux services
- `inject()` plutôt que constructeur pour les dépendances (Angular 14+)
- Routes lazy-loaded par feature module — jamais de barrel d'import massif
- TSDoc sur tous les services, guards et pipes publics
- i18n : **Transloco** — tous les libellés externalisés, jamais de chaîne littérale dans les templates ou services
- Garde fonctionnels (`CanActivateFn`) — jamais de classe `CanActivate` (deprecated Angular 15+)

### Général

- Pas de secrets dans le code — variables d'environnement
- **`// NOSONAR` : zéro, jamais.** Tout faux positif Sonar se marque côté SonarCloud (UI "Won't fix" / "False positive", ou exclusion centralisée) — aucune exception.
- **`// nosemgrep` : interdit par défaut**, autorisé **uniquement avec la validation explicite du mainteneur**. Sans validation, exclusion côté config Semgrep (`.semgrepignore` / `--exclude-rule`), jamais en commentaire inline.

---

## Système de modules (côté Angular)

- Ce repo produit un feature module lazy-loadé (`loadChildren`/`loadComponent`), consommé
  depuis `pivot-ui` — **pas de logique de bootstrap standalone finale ici**, le squelette
  actuel n'est qu'un support temporaire de CI (voir Projet).
- Module désactivé = route inaccessible (guard vérifie état via API) + aucun bundle chargé
- Guard d'activation : appel API `/api/modules/{id}/status` (résolu côté pivot-core) → 403 si désactivé
- Aucune logique inter-module directe — communication via services core partagés exposés par `@pivot/ui-core`
- Changement du contrat d'intégration avec `pivot-ui` = **hard block Gate 4 + coordination obligatoire**

---

## Auth OIDC (côté Angular)

Ce repo **n'implémente pas** son propre client OIDC — c'est la responsabilité exclusive de
**pivot-ui** (PKCE S256, gestion des tokens, intercepteur). Une fois `@pivot/ui-core` publié
(voir `TODO-SETUP.md`), ce repo se contente de **consommer** ce qu'il expose :

| Élément consommé depuis `@pivot/ui-core` | Usage ici |
|-------------------------------------------|-----------|
| `AuthGuard` / état d'authentification | Protéger les routes du domaine Pilotage sans réimplémenter de logique de session |
| Intercepteur HTTP (token bearer) | Hérité automatiquement des providers du shell — pas de second intercepteur ici |
| `TenantService` / contexte tenant | Lecture seule — **jamais** de `tenantId` géré ou transmis manuellement côté Angular |

**Interdit :** toute réimplémentation locale de flux OIDC, de stockage de token, ou de logique
de session dans ce repo — ce serait une duplication dangereuse de ce que fait déjà `pivot-ui`.

---

## Audits

Dans **pivot-docs** — un fichier par catégorie, mis à jour en place. **Jamais de fichiers datés.**

---

## Règles absolues

| Interdit | Raison |
|----------|--------|
| `--no-verify` | Contourne les hooks qualité |
| `git push origin main` (push direct, hors bootstrap initial) | Jamais — tout code passe par PR + review |
| `git push --force` sur `main` | Jamais — le mainteneur uniquement si nécessaire |
| `git add .` en bloc | Risque d'inclure `.env`, clés, tokens |
| Merger avec label `security` sans revue humaine | Hard block Gate 4 |
| Réimplémenter un client OIDC ou un stockage de token ici | C'est le rôle exclusif de `pivot-ui` — duplication dangereuse |
| `any` TypeScript | Désactive la sécurité du typage |
| Logique métier dans les composants | Viole la séparation des couches |
| Module désactivé avec routes accessibles | Contournement restriction admin |
| Implémenter sans US tracée dans les fichiers markdown backlog | Perte de traçabilité |
| JWT (HS*/RS*) côté Angular | Opaque tokens uniquement (géré par pivot-ui) — jamais stocker ni parser un JWT côté client |
| `userId` passé dans le body d'une requête Angular | Mass assignment / IDOR — identité extraite du token porteur par le backend |
| Commiter `.env`, tokens, secrets, certificats | Exposition définitive |
| `tenantId` passé en query param ou header custom côté Angular | IDOR — tenantId toujours résolu depuis le token par le backend |
| Logique de filtrage tenant côté Angular (côté client) | Non-fiable — le backend est la seule autorité d'isolation |

---

## Règle transversale sécurité — Isolation tenant (côté Angular)

- Ne jamais passer de `tenantId` ou `userId` en query param, header custom ou body côté Angular
- L'isolation tenant est **exclusivement gérée côté backend** (TenantContext du token porteur, résolu par `pivot-core`/`pivot-pilotage-core`)
- Si un endpoint retourne 403 ou 404, ne pas retry avec un autre tenantId — traiter comme une erreur finale
- Contenu affiché : utiliser **Angular interpolation `{{ val }}`** — jamais `innerHTML` avec données utilisateur

---

## Boucles de problèmes — règle d'escalade

### Limite 10 commandes en échec successif

Si **10 commandes consécutives échouent** (toute combinaison : build, test, lint, push, CI) sur une tâche :
1. **Stopper la tâche courante** — ne pas impacter les agents parallèles sur d'autres US
2. **Poster un commentaire de gate** avec `decision: ESCALATED`, liste des 10 échecs, contexte
3. **Label `needs-human-review`** + signal mainteneur
4. **Proposer une alternative** (approche différente, découpage)

Le compteur se remet à zéro dès qu'une commande réussit.

### Limite 20 push — autoloop PR Review

Voir section **Workflow — Autoloop PR** — au-delà de 20 push correctifs → Breaking Point 2 automatique.

### Règle 2 tentatives (stratégie identique)

Après **2 tentatives** (même stratégie ou variantes proches) :
1. **Stopper** — ne pas continuer à boucler
2. **Poster un commentaire de gate sur la PR** avec `decision: ESCALATED`, contexte complet, tentatives effectuées — **jamais committer un fichier de gate**
3. **Signaler** au mainteneur : blocage, tentatives, raison de l'échec — label `needs-human-review`
4. **Proposer** une alternative : approche différente, outil différent, contournement

Ne jamais enchaîner plus de 2 tentatives sans informer le mainteneur.

---

## Template Review PR uniforme

Toutes les reviews de PR (Gate 4) postées en commentaire GitHub suivent ce template exact.
Charger `skill-pr-reviewer` avant d'écrire le commentaire (une fois le skill créé — voir
section Skills).

```markdown
## PR Review — Gate 4

**US :** {us-id} — {titre}
**Score : {score}/100**
**Décision : MERGE_AUTONOMOUS | MERGE_DOCUMENTED | NEEDS_HUMAN_REVIEW**

### Breakdown
| Dimension | Score | Détail |
|-----------|-------|--------|
| Architecture (OnPush, inject(), signals, zéro any, lazy-loading) | /25 | |
| Traçabilité AC (AC → test Vitest + spec Playwright) | /25 | |
| Sécurité & A11y (pas de réimpl. OIDC, pas d'innerHTML, WCAG 2.1 AA) | /25 | |
| Qualité & i18n (ESLint verts, clés i18n complètes) | /25 | |

### Traçabilité AC
| AC | Implémentation | Test | Statut |
|----|----------------|------|--------|
| AC-{id}-01 | ... | ... | ✅/⬜ |

### Gate 3 — hard blocks
- [ ] Gitleaks clean
- [ ] CI 0 erreur / 0 warning
- [ ] Pas de secret committé
- [ ] Pas de `breaking-change` non documenté
- [ ] Pas de modification du contrat d'intégration pivot-ui sans coordination

### Findings
| # | Sévérité | Fichier | Description | Correction |
|---|----------|---------|--------------|------------|

### Notes
{notes libres}
```

**Règles d'application :**
- Posté uniquement en **commentaire PR** — jamais de fichier committé
- Score calculé dimension par dimension (0–25 chacune)
- Findings classés : 🔴 Bloquant · 🟡 Mineur · 🔵 Cohérent
- Un finding 🔴 = itération obligatoire, même si score ≥ 85

---

## Skills — Knowledge Cards

Aucun skill spécifique au domaine Pilotage n'existe encore dans `.project/skills/` — index à
créer dès les premières US réelles (mêmes conventions que `pivot-ui/.project/skills/` :
`skill-angular-architecture`, `skill-testing-strategy`, `skill-devops-cicd`,
`skill-accessibility`, `skill-ac-traceability`, `skill-pr-reviewer`, etc.). Ne pas fabriquer de
fichiers de skill vides en attendant — les créer au moment où ils deviennent réellement
nécessaires.

---

## Parallélisation

Lancer un maximum d'actions en parallèle dans chaque message :

| Actions parallélisables | Exemples |
|------------------------|---------|
| Lectures indépendantes | Plusieurs `Read` / `Grep` / `Glob` |
| Linters | ESLint + TypeScript lancés simultanément |
| Créations de fichiers indépendants | Composant + service + spec Vitest |
| Recherches codebase | Plusieurs `Grep` sur cibles différentes |

Ne séquencer que ce qui dépend du résultat d'une étape précédente.
