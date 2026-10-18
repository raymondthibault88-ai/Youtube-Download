# Contribuer

## Installation

Utiliser Node.js 24, comme la CI (`.nvmrc`), puis :

```sh
npm ci
npm run setup:desktop
npm run setup:hooks
npm run dev
```

`setup:hooks` active uniquement les hooks de ce dépôt. Il refuse de remplacer un autre `core.hooksPath` déjà configuré. Sur chaque nouveau clone, relancer cette commande pour activer les hooks.

## Conventions

- TypeScript strict pour React ; CommonJS pour Electron et les scripts Node. Le preload conserve CommonJS pour son exécution dans le sandbox Electron.
- Composants en `PascalCase.tsx`, hooks en `useNom.ts`, services Electron en `kebab-case.cjs`.
- Prettier fixe le format, avec deux espaces, guillemets simples et fins de ligne LF. `.editorconfig` et `.gitattributes` alignent les éditeurs et Git.
- Les composants affichent l’interface ; les hooks pilotent ses opérations. Les accès IPC passent par `src/services/desktopApi.ts`.
- Les traitements et accès système restent dans `electron/`. `shared/` contient les données et fonctions utilisées des deux côtés, sans dépendre de React ou d’Electron.
- Les règles de formats, résolutions, profils et hôtes YouTube proviennent de `shared/`. Éviter de recopier ces listes dans l’interface et les handlers.
- Extraire un module lorsqu’il réunit des responsabilités différentes. Le nombre de lignes seul ne justifie pas une abstraction.
- Conserver les paramètres d’encodage, la sélection audio, les noms de sortie et le comportement d’annulation lors d’un refactoring.

## Contrôles

```sh
npm run format
npm run verify
npm run test:desktop
```

`format` reformate les sources. `verify` contrôle le formatage, ESLint, les types, les tests unitaires, le contrat IPC, le build et les parcours UI. Installer Chromium si nécessaire avec `npx playwright install chromium` ; Chrome déjà installé est utilisé sous Windows en local.

Le hook `pre-commit` vérifie les espaces de l’index, puis le formatage, ESLint et TypeScript sur le projet, sans modifier ni ajouter de fichier à l’index. Les tests complets restent dans `verify` et la CI.

Le hook `commit-msg` applique [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), par exemple `refactor(ui): isoler les opérations de conversion`. Types acceptés : `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`. Les messages peuvent être en français. Les messages générés par Git pour les merges, reverts et autosquash sont acceptés. L’historique existant est conservé.

Pour un test desktop sans perturber l’application ouverte, définir `V5_TEST_USER_DATA_DIR` avec un dossier de profil de test distinct et `V5_ARTIFACT_DIR` avec le dossier des résultats. Les benchmarks et leurs variables sont décrits dans le README. Une référence de benchmark doit conserver tout `electron/services/` et `shared/`, car les moteurs chargent leurs sous-modules.

## Fichiers générés et distribution

Ne pas versionner `dist/`, `release/`, `test-results/`, `playwright-report/`, `node_modules/` ou `graphify-out/`. Les notices de licence et les icônes nécessaires aux distributions restent versionnées. Les copies du logo servent à Vite, au favicon et aux fenêtres/installateurs natifs ; les conserver cohérentes avec le logo d’origine.

La version stable publiée reste immuable. Une construction locale ne publie rien. La procédure de tag, de brouillon de release et de publication figure dans le README.
