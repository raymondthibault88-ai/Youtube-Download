# Audit de maintenance — 18 octobre 2026

Base inspectée : commit `9a61640` sur `main`, application 5.1.0. Audit du dépôt, de React, des hooks, des services Electron, des tests et des workflows. Les corrections ci-dessous sont intégrées à la version 5.1.1 ; la release GitHub 5.1.0 est conservée.

## Constats et corrections

| Sujet              | Constat                                                                                                                                                                        | Correction                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lisibilité         | JSX, CSS et scripts très condensés, jusqu’à 1 112 caractères sur une ligne dans `App.tsx`.                                                                                     | Formatage Prettier uniforme, version exacte verrouillée, contrôle ajouté à `verify` et donc à la CI.                                                                                       |
| Typage             | TypeScript non strict, résultats de tâches convertis par assertion en `Partial<ConversionResult>`.                                                                             | Mode strict, recherche des variables/paramètres inutilisés, résultats distingués par type de tâche, suppression de l’assertion.                                                            |
| Configuration      | `tsconfig.json` référençait `vite.config.js`, alors que le fichier est `.mjs`.                                                                                                 | Chemin corrigé, utilitaires de formatage partagés inclus et vérifiés avec JSDoc.                                                                                                           |
| Responsabilités    | Moteurs réunissant formats, arguments, cache, inspection et progression.                                                                                                       | Sous-modules `electron/services/youtube/` et `electron/services/media/`, points d’entrée publics conservés.                                                                                |
| React              | Opérations de conversion dans le composant et téléchargement dans `App`.                                                                                                       | Hooks `useConversion` et `useDownload`, composant `ConversionSettings`, orchestration de l’application allégée.                                                                            |
| Asynchronisme      | Une erreur tardive de lecture initiale pouvait afficher une fausse erreur de mise à jour après une notification valide.                                                        | Les notifications reçues priment aussi sur les erreurs initiales ; cas couvert par un test UI.                                                                                             |
| Asynchronisme      | Le premier téléchargement pouvait utiliser une ancienne valeur des outils après leur préparation et ouvrir inutilement le choix de dossier.                                    | Le hook renvoie les informations effectivement préparées ; le téléchargement les utilise immédiatement. Test UI avec préparation différée.                                                 |
| Doublons de règles | Hôtes YouTube, durée du cache, résolutions et profils recopiés à plusieurs endroits.                                                                                           | Configuration YouTube partagée ; validation IPC des conversions fondée sur la configuration utilisée par le moteur.                                                                        |
| Code mort          | Anciens utilitaires, wrappers de progression inutilisés dans React, propriété `children` inutilisée, configuration de progression obsolète et sélecteurs CSS sans utilisateur. | Suppression après recherche des références. Les canaux du preload restent compatibles.                                                                                                     |
| CSS                | Un seul fichier global condensé de 20 Ko.                                                                                                                                      | Séparation en fondations, structure, contrôles, téléchargement, conversion, retours d’état, dialogue et adaptation des fenêtres, avec ordre de chargement conservé.                        |
| Hygiène Git        | 20 fichiers de cache `graphify-out/` encore suivis malgré le `.gitignore`.                                                                                                     | Retirés de l’index, conservés sur le disque et ignorés. Aucune réécriture de l’historique.                                                                                                 |
| Conventions        | Pas de formatage partagé ni de hooks du projet ; `.nvmrc` différent de la version majeure de CI.                                                                               | `.editorconfig`, `.gitattributes`, configuration Prettier, Node 24 pour le développement, guide de contribution.                                                                           |
| Hooks Git          | Absence de contrôles locaux partagés.                                                                                                                                          | `pre-commit` : espaces, formatage, lint et types. `commit-msg` : Conventional Commits. Installation locale explicite, sans écraser une autre configuration de hooks. Activés sur ce poste. |
| Contrat IPC        | Le smoke test vérifiait seulement la présence des chaînes des canaux dans le preload.                                                                                          | Tests exécutant le véritable preload dans un contexte isolé : chaque méthode, son canal, ses arguments et la désinscription de chaque événement.                                           |

## Structure après nettoyage

- `src/components/` : affichage et interactions Base UI.
- `src/hooks/` : état et opérations asynchrones de l’interface.
- `src/services/` : accès au bridge et au dossier de sortie.
- `src/styles/` : styles globaux par responsabilité ; le module CSS du dock conserve son périmètre.
- `electron/ipc/` : validation et orchestration des appels.
- `electron/services/media/` : profils, inspection et choix du parcours d’encodage.
- `electron/services/youtube/` : formats, arguments yt-dlp, cache et progression.
- `shared/` : contrats et paramètres communs.
- `scripts/`, `tests/` : outils et vérifications, séparés du code distribué.

Le plus grand fichier de fonctionnement est maintenant `electron/services/media.cjs` avec 337 lignes formatées ; `youtube.cjs` en compte 275. `App.tsx` compte 224 lignes, `ConverterPanel.tsx` 152 et `ConversionSettings.tsx` 110. Ces tailles reflètent du code aéré, sans masquer la complexité dans des lignes uniques.

Les plus longs scripts de benchmark restent entre 422 et 516 lignes. Ils ne sont pas distribués dans l’application et regroupent leurs scénarios de mesure. Extraire leurs prochains scénarios si leur nombre augmente ; éviter de coupler deux benchmarks dont les protocoles de mesure diffèrent.

## Doublons conservés volontairement

Le même logo PNG sert au renderer, au favicon et à la fenêtre native ; l’ICO sert à la fenêtre et à l’installateur. Ces fichiers ont des destinations de build différentes. Les textes de licences répétés assurent également la distribution des notices nécessaires. Ils restent en place.

Le preload sandboxé ne peut pas charger directement le fichier local du contrat IPC. Ses chaînes restent donc déclarées sur place, avec vérification de toutes les correspondances par les tests. Les anciens événements de progression restent exposés pour préserver le contrat ; React utilise le suivi unifié des tâches.

La recherche de fonctions de service identiques de plus de 200 caractères, après normalisation du formatage, ne détecte pas de copie significative. Elle complète la recherche de références et la lecture manuelle ; elle ne prétend pas identifier toutes les ressemblances entre algorithmes.

## Vérification

- `npm run verify` : formatage, ESLint sans avertissement, TypeScript strict, tests unitaires, smoke test, build et 17 tests UI réussis.
- 61 tests unitaires réussis, dont les nouveaux contrôles de convention des commits et de contrat preload.
- Deux nouveaux parcours UI vérifient les réponses tardives et la préparation initiale des outils.
- Test desktop réel réussi dans un profil isolé : chargement des styles sous `file:`, police, presse-papiers, IPC, noms accentués yt-dlp hors réseau, conversion rapide et compression 480p avec FFmpeg, décodage intégral, fichier d’origine et premier export conservés.
- Graphe de 61 fichiers JavaScript/TypeScript : aucun import local non résolu ni cycle détecté.
- Comparaison normalisée avec le commit de départ : les 23 fonctions/classes extraites des moteurs sont identiques, y compris l’orchestration des reprises. Les paramètres de conversion JSON sont également identiques.
- `npm ls --depth=0` : dépendances directes installées sans incohérence signalée.
- `npm audit` : aucune vulnérabilité connue signalée dans les dépendances installées au moment de cet audit.
- Hooks Git vérifiés avec un message valide, un message invalide et l’exécution réelle du contrôle avant commit.

Les rapports techniques et captures de cette session sont dans `test-results/maintenance/`, ignoré par Git.

## Limites et entretien

La validation de cette session a été exécutée sur Windows. Les workflows Linux/macOS restent configurés, mais doivent être rejoués sur les prochains commits avant une distribution. Les benchmarks réseau 1080p/4K n’ont pas été relancés pour ce déplacement de code ; les tests de sélection des formats, audio, annulation et reprises passent, et les implémentations des moteurs ont été comparées à l’identique.

Les services Electron restent en CommonJS. Leur migration complète vers TypeScript serait un chantier distinct ; les types stricts du renderer ne couvrent pas automatiquement tout le backend. Le résultat npm concerne les avis connus, sans constituer un audit de sécurité exhaustif.

La CI exécute la même commande `verify` que le poste local. Les hooks restent à activer sur chaque clone avec `npm run setup:hooks`. Les conventions de contribution et les commandes sont documentées dans [CONTRIBUTING.md](../CONTRIBUTING.md). La procédure de publication protège les releases déjà publiées ; la version 5.1.1 ne remplace ni le tag ni les exécutables 5.1.0.

Les conventions de formatage suivent [Prettier](https://prettier.io/docs/install), les hooks utilisent les [mécanismes Git](https://git-scm.com/docs/githooks) et les titres de commits suivent [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
