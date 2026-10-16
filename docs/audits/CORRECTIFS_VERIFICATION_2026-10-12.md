# Correctifs et validation de YouTube Downloader 4.0.7

> État historique avant les mises à jour de bibliothèques. La version suivante est documentée dans [MISES_A_JOUR_2026-10-12.md](MISES_A_JOUR_2026-10-12.md).

Les défauts logiciels relevés dans l’audit du 12 octobre 2026 ont été corrigés dans la version 4.0.7. Les parcours de téléchargement et de conversion ont été vérifiés avec les moteurs réels et dans le paquet macOS Apple Silicon. Les exécutables Windows et les paquets Mac des deux architectures sont construits en local dans `release/audit-fixed/`.

## Corrections appliquées

| Point de l’audit | Correction | Vérification |
| --- | --- | --- |
| Titres identiques | Dossier temporaire par tâche, identité vidéo vérifiée et publication exclusive avec suffixe numérique | Deux contenus différents de même titre avec yt-dlp réel ; fichier initial conservé et nouvelle vidéo correcte |
| URL modifiée | Résultats et sélection associés à l’URL analysée ; anciens formats masqués ; identité et format contrôlés à nouveau côté IPC | Changement avant et pendant une analyse, puis vérification de l’URL et de l’identité téléchargées |
| FFmpeg macOS nonfree | FFmpeg 9.0.2 GPL sans nonfree, pour arm64 et x64 ; licences et manifestes embarqués ; suppression de ffmpeg-static des dépendances distribuées | Empreintes, licence, encodage réel et vérification des ressources des paquets |
| Reprise CPU | Nouvelle tentative libx264 après une erreur matérielle appropriée, sans reprise après annulation ou erreur de fichier | Échec matériel simulé puis succès CPU ; annulation sans seconde tentative |
| Annulation des descendants | Groupes de processus POSIX et taskkill /T sous Windows ; arrêt des moteurs à la fermeture de l’application | Descendant ignorant SIGTERM arrêté ; annulation pendant une vraie fusion FFmpeg et une vraie conversion, sans fichiers partiels ni modification des sources ; shutdown testé |
| Réouverture de fenêtre | Événements diffusés aux fenêtres autorisées actives ; snapshot protégé contre les réponses obsolètes | Fermeture puis réouverture pendant une conversion dans Electron réel et dans le paquet Apple Silicon |
| Dimensions impaires | Ajout de pixels en bordure vers des dimensions paires, sans rogner la vidéo | Source 641×361 convertie et décodée en 642×362, original intact |
| Rotation portrait | Dimensions affichées tenant compte de la matrice de rotation ; autorotation FFmpeg conservée | Vidéo 640×360 tournée à 90 degrés, puis sortie portrait 270×480 |
| Analyse bloquée | Analyse intégrée au gestionnaire avec annulation ; délai global de 60 secondes incluant la préparation ; extraction limitée à 45 secondes au total | Annulation, garde contre la concurrence et expiration pendant la préparation |
| Configuration yt-dlp externe | --ignore-config et --no-plugin-dirs systématiques | Arguments contrôlés et commandes réelles vérifiées |
| Progression du dossier | Surveillance limitée au dossier privé de la tâche | Écriture d’un fichier voisin sans influence sur le pourcentage |
| Dépendances npm | Mise à jour compatible et remplacement ciblé de @electron/get dans electron-builder | Audit npm complet sans vulnérabilité ; constructions Mac et Windows réussies |
| Accessibilité | États aria-pressed pour modes, résolutions et profils ; annonces des erreurs ; erreur détaillée dans la barre de tâche | Assertions de parcours Chromium et inspection native |
| Couverture et distribution | Tests de régression, tests de parcours, test Electron natif et workflow de construction/démarrage des paquets | Contrôles locaux ci-dessous ; workflow CI ajouté pour Linux, Mac et Windows |

L’initialisation a aussi été rendue plus robuste après un premier démarrage sous Rosetta : probes limités à 30 secondes, nouvelle tentative après un délai temporaire, requêtes partagées entre les appelants et cache propre à la version de l’application.

La signature macOS modifie les métadonnées de signature du FFmpeg embarqué. Son empreinte brute est conservée pour le binaire téléchargé ; une empreinte supplémentaire vérifie tout le code et les données exécutables indépendamment de ces seules métadonnées. Les changements de code restent rejetés. Ce cas est couvert par un test et par l’exécution du paquet signé.

## Résultats de validation

- `npm run verify` réussi : lint, TypeScript strict, **41 tests sur 41**, smoke test et build Vite.
- `npm run test:e2e` réussi : **5 parcours sur 5**, avec API de fixture pour isoler les cas d’URL, d’annulation, d’initialisation et de sélection.
- `npm run test:electron` réussi : véritables boutons de conversion, preload, validation IPC, moteur FFmpeg, protection des fichiers non sélectionnés, sandbox et réouverture.
- Paquet Apple Silicon exécuté avec un profil temporaire : conversion, analyse YouTube, téléchargement, fusion, décodage complet et suivi après réouverture réussis.
- Paquet Intel ouvert sous Rosetta : sélection native et conversion du fichier 641×361 réussies. Le pilote automatisé n’a pas réussi à s’attacher à cette exécution sous Rosetta ; le test complet automatique de cette architecture n’est donc pas annoncé comme réussi.
- Téléchargement réel d’une vidéo publique de 19 secondes réussi, en H.264/AAC. Le fichier complet a été décodé par FFmpeg.
- Téléchargement hors réseau d’un WebM VP9/Opus, réencodage H.264/AAC et collision avec un MP4 existant réussis.
- `npm run verify:ffmpeg` réussi pour les trois binaires fournis.
- `npm audit` : **0 vulnérabilité signalée**. Ce résultat porte sur les dépendances npm ; il ne certifie pas à lui seul tous les composants binaires.
- Signatures macOS locales contrôlées avec `codesign --verify --deep --strict` ; images DMG contrôlées avec `hdiutil verify`.
- Sources des services et notices des trois paquets comparées aux fichiers corrigés, sans différence. FFmpeg distribué vérifié ; aucun module ffmpeg-static inclus dans les paquets de production.

Les preuves, captures et journaux se trouvent dans `evidence-correctifs-2026-10-12/`. La vidéo portrait de test utilise `-display_rotation`, qui écrit une vraie matrice de rotation ; l’ancien paramètre de métadonnée ne produisait plus cette matrice avec FFmpeg 9.

## Paquets produits

| Plateforme | Fichier |
| --- | --- |
| Windows autonome x64 | [YouTube Downloader Portable 4.0.7](</Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/release/audit-fixed/YouTube Downloader-Portable-4.0.7-x64.exe>) |
| Windows installateur x64 | [YouTube Downloader Setup 4.0.7](</Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/release/audit-fixed/YouTube Downloader-Setup-4.0.7-x64.exe>) |
| Mac Apple Silicon | [DMG arm64](</Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/release/audit-fixed/YouTube Downloader-4.0.7-arm64.dmg>) |
| Mac Intel | [DMG x64](</Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/release/audit-fixed/YouTube Downloader-4.0.7-x64.dmg>) |

Les ZIP Mac et les empreintes SHA256 de tous les paquets sont également disponibles dans ce dossier. Les artefacts précédents sont conservés séparément.

## Limites de validation

L’exécution, l’installation et la désinstallation sur une vraie machine Windows restent à effectuer. Le workflow CI est configuré pour démarrer le paquet Windows, mais aucune exécution distante de ce workflow n’a été déclenchée dans cette intervention. La conversion Intel sous Rosetta ne remplace pas une validation sur du matériel Intel.

Les paquets Mac portent une signature locale ad hoc ; ils ne sont pas notarisés sans identité Developer ID et identifiants Apple. Les EXE Windows sont construits sans certificat de signature fourni. La diffusion publique signée et notarisée reste une opération de publication distincte. Les notices et manifestes précisent les obligations et la provenance des sources FFmpeg ; la fourniture du code source correspondant reste à respecter lors de toute redistribution.

La lecture dans Dartfish et QuickTime, les longs matchs et les sources HDR n’ont pas été certifiés par les essais courts. Les contrôles établissent le bon fonctionnement des cas reproduits et des parcours exercés, sans garantir toutes les vidéos et tous les ordinateurs.

![Conversion réussie dans le paquet Apple Silicon](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/docs/audits/evidence-correctifs-2026-10-12/native-arm64-conversion.png)
