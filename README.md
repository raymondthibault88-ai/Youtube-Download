# YouTube Downloader V5.1

Application Electron 44 + React 19 pour télécharger une vidéo YouTube ou convertir un fichier local en MP4 H.264/AAC compatible QuickTime et Dartfish.

## Interface V5.1

L’interface s’adresse au grand public : deux espaces « Télécharger » et « Convertir / compresser », une action principale visible, les réglages essentiels au premier plan et les détails techniques accessibles à la demande. Les primitives Base UI gèrent les onglets, les choix, les accordéons, les dialogues et la progression. L’identité visuelle utilise Manrope en local, une palette rouge YouTube/blanc/anthracite et des icônes Lucide. Le logo d’origine est conservé dans l’interface, le favicon et les icônes natives. Le rouge des boutons est assombri pour le contraste du texte ; le vert est réservé aux confirmations de réussite. L’interface conserve uniquement les libellés et les informations utiles, sans slogans.

Les formats, les profils, les règles d’export, le choix du dossier et le moteur yt-dlp/FFmpeg sont conservés. Les annulations ont un état dédié ; une seule tâche peut être lancée à la fois. La navigation clavier, le focus, les annonces de statut, le contraste et la préférence de réduction des animations font partie de l’interface.

Un panneau unique regroupe la source et les réglages. Le dossier, le résumé MP4 et l’action sont réunis dans une barre d’export fixée en bas de la fenêtre ; la progression et l’annulation restent visibles au-dessus pendant le défilement. Les profils se présentent sur une ligne sur ordinateur. La fenêtre démarre en 1040 × 720 et la mise en page s’adapte aux fenêtres plus petites.

Les fichiers exportés gardent le titre de la vidéo ou le nom du fichier source, avec l’extension `.mp4`. Aucun identifiant YouTube ni suffixe technique n’est ajouté. Si le nom existe déjà, un numéro est ajouté, par exemple `Mes vacances (2).mp4`, pour conserver les fichiers présents et l’original.

La conversion présente deux objectifs : « Convertir en MP4 » utilise le profil `fast` existant ; « Compresser » propose les profils `balanced` (modérée) et `compact` (forte). Un sélecteur compact et des choix en ligne regroupent les réglages dans un seul panneau, comme les qualités de téléchargement. Le défaut reste `fast` à définition constante. La comparaison Avant / Après estimé montre le poids prévu et son écart avec l’original, y compris si le résultat estimé est plus volumineux. Le choix de définition reste indépendant de la compression : « Originale » conserve les dimensions, sans promettre un encodage sans perte. Ces libellés ne changent ni le moteur, ni les débits, ni les formats transmis aux IPC.

## Fonctionnalités

- analyse des formats YouTube avec yt-dlp ;
- téléchargement et fusion audio/vidéo avec `faststart` ;
- réencodage automatique des codecs incompatibles en H.264/AAC ;
- conversion locale à la résolution d’origine ou en 2160p, 1440p, 1080p, 720p ou 480p ;
- estimation de la taille avant conversion ;
- profils Rapide, Équilibré et Plus léger ;
- accélération VideoToolbox, NVENC, Quick Sync ou AMF après vérification, avec reprise sur libx264 en cas d’échec matériel ;
- décodage Quick Sync des sources H.264/HEVC SDR 8 bits compatibles à résolution constante, avec conservation des images sur le GPU ; le redimensionnement conserve le parcours CPU d’origine ;
- progression, vitesse, temps restant, annulation et accès au fichier terminé ;
- protection du fichier original et arrêt des processus au départ de l’application.

## Développement

Prérequis : Node.js 22.12 ou supérieur et npm.

```bash
npm ci
npm run setup:desktop
npm run dev
```

`setup:desktop` installe le runtime d’Electron 44. FFmpeg est installé par `npm ci` ; ne pas désactiver les scripts d’installation pour une application exécutable.

## Vérification

```bash
npx playwright install chromium
npm run verify
npm run test:desktop
```

`verify` exécute ESLint, TypeScript, les tests unitaires, le contrôle du contrat preload/IPC, le build et les parcours UI Playwright. Ceux-ci utilisent un bridge de test et des médias synthétiques ; ils vérifient les paramètres transmis, les changements de lien pendant l’analyse, l’annulation, les erreurs, le clavier, les différentes tailles de fenêtre et l’accessibilité avec axe. Un test lance aussi Vite pour vérifier les styles, les polices et la connexion de rechargement en développement sous CSP. Les balises injectées par Vite reçoivent un nonce aléatoire au démarrage du serveur ; les exécutables conservent leur politique stricte, sans autorisation des styles en ligne.

`test:desktop` lance la véritable application Electron et génère une petite vidéo de test. Il vérifie les styles, les IPC sous `file:`, le presse-papiers, les noms accentués émis par le véritable yt-dlp hors réseau, les conversions FFmpeg en 480p avec la compression forte et la conversion rapide, le décodage intégral des résultats et la conservation de l’original et du premier export. Le bouton d’accès au fichier passe par le véritable IPC ; seul l’appel final à l’Explorateur est intercepté pour éviter d’ouvrir des fenêtres pendant le test. Les résultats sont écrits dans `test-results/desktop/`. Fermer une autre instance de l’application avant ce test, ou définir `V5_TEST_USER_DATA_DIR` avec un dossier de profil isolé. `V5_EXECUTABLE` permet de cibler l’exécutable empaqueté et `V5_ARTIFACT_DIR` de choisir le dossier des résultats.

### Conversion : performances et qualité

Les profils, les débits, les préréglages des encodeurs, l’AAC à 160 kbit/s et le MP4 H.264 restent identiques. Pour Quick Sync, les sources H.264/HEVC SDR 8 bits en 4:2:0 peuvent être décodées par le GPU à résolution constante : les images restent en mémoire graphique jusqu’à l’encodage. En réduction de résolution, le décodage et le filtre `scale` CPU d’origine sont conservés : un filtre GPU différent peut changer la netteté et les détails, et un aller-retour GPU/CPU a ralenti les essais 4K vers 1080p. Le profil Plus léger conserve libx264. Les sources HDR, 10 bits, entrelacées, avec rotation ou d’un autre format suivent le parcours existant.

Si le nouveau parcours échoue, la conversion réessaie avec le décodage CPU et le même encodeur matériel ; si celui-ci échoue aussi, elle utilise libx264. L’annulation ne déclenche aucune reprise. Les fichiers temporaires sont nettoyés et la progression ne recule pas.

`npm run test:conversion` compare le moteur courant avec une copie du moteur avant modification. Définir `V5_BENCHMARK_BASELINE` avec le chemin absolu de cette copie de `electron/services/media.cjs`, en conservant son `process-runner.cjs` voisin et son fichier `shared/conversion-config.json` à la même position relative. `V5_BENCHMARK_DIR` choisit le dossier des sources, exports et rapports ; le défaut est `test-results/conversion/`.

Le benchmark crée des sources synthétiques animées avec audio, de 30 secondes à 30 images/s en 1920×1080 et 3840×2160, ainsi qu’une source HEVC 4K de 8 secondes. Il compare les trois profils, la conservation de résolution et la réduction 4K vers 1080p. Les cas Rapide H.264 sont répétés trois fois avec ordre avant/après alterné ; la médiane inclut l’encodage, l’écriture et `faststart`, mais sépare la détection initiale de l’encodeur. `V5_BENCHMARK_SECONDS` et `V5_BENCHMARK_REPETITIONS` permettent d’adapter la durée et les répétitions. `node scripts/benchmark-conversion.cjs prepare` génère seulement les sources.

Chaque sortie est entièrement décodée. Le benchmark vérifie le nombre d’images, la résolution, le codec, les originaux, les noms simples, la progression et l’identité de l’audio décodé. Il compare également les empreintes de toutes les images avant encodage entre les décodages CPU et Quick Sync. Si les images finales décodées sont strictement identiques, cette comparaison exacte établit l’absence de changement de qualité. Sinon, les métriques VMAF, SSIM et PSNR portent sur toutes les images, avec le modèle VMAF 4K pour les sorties 4K. Le seuil de non-régression tolère uniquement de faibles variations des encodages avec contrôle de débit : au maximum 0,05 point VMAF sur 100 et 0,0001 SSIM. `V5_BENCHMARK_CASES` permet de sélectionner des cas par identifiant, séparés par des virgules. Les résultats synthétiques ne garantissent pas la même accélération sur tous les médias ou tous les ordinateurs.

Pour rejouer les conversions 1080p et 4K dans la véritable interface Electron, définir `V5_LARGE_FIXTURES_DIR` avec le dossier `sources/` du benchmark avant `npm run test:desktop`. Le même test peut cibler l’application Windows empaquetée avec `V5_EXECUTABLE`.

### Téléchargement : performances et qualité

Les informations complètes de yt-dlp restent dans le processus principal pendant dix minutes au maximum et sont réutilisées au téléchargement. La liste visible conserve ses clients d’analyse ; les métadonnées des clients de téléchargement d’origine sont préparées en parallèle pendant le choix du format et du dossier, sans retarder l’affichage de cette liste. Selon la vidéo, les clients ne proposent pas les mêmes pistes, notamment pour le son stéréo ou 5.1. Le format vidéo choisi et le sélecteur audio restent identiques. Si cette préparation est encore en cours au clic, le téléchargement l’attend ; l’annulation l’interrompt. Si les métadonnées manquent, si le format n’y figure pas, si les liens expirent ou pour un direct, le téléchargement reprend l’extraction habituelle. Les métadonnées temporaires sont supprimées avec les fichiers de travail. Une erreur de lien périmé peut déclencher une reprise ; l’annulation ne déclenche aucune relance et la progression reste continue.

Les transferts fragmentés DASH/HLS utilisent huit fragments simultanés, après comparaison avec quatre en 1080p et 4K. Cette option ne parallélise pas un flux HTTPS ordinaire. Les liens de transport peuvent être repris du client d’analyse uniquement pour un même identifiant de format, les mêmes codecs, dimensions, cadence, langue et canaux audio ; l’inventaire et le classement audio du moteur précédent sont conservés. Les cas qui nécessitent une nouvelle session YouTube reprennent l’extraction habituelle.

Une vidéo déjà en H.264 SDR 8 bits 4:2:0 avec son AAC peut être placée dans un MP4 par copie des flux, même si son conteneur initial diffère. Les codecs incompatibles conservent la conversion précédente et ses réglages. Un échec de cette copie reprend la conversion normale ; une annulation reste une annulation.

`npm run test:download` compare le moteur actuel à une copie du moteur précédent, avec le véritable yt-dlp et FFmpeg. Définir `V5_DOWNLOAD_BASELINE` avec le chemin de la copie de `electron/services/youtube.cjs`, accompagnée de `media.cjs`, `process-runner.cjs` et des fichiers `shared/` à la même position relative ; définir `V5_YTDLP_PATH` avec le chemin du binaire vérifié. `V5_DOWNLOAD_DIR` choisit les artefacts. `V5_DOWNLOAD_SOURCE_DIR` permet de réutiliser les vidéos 1080p/4K du benchmark de conversion ; sinon des sources animées avec audio sont créées.

Le banc local sert les mêmes médias fragmentés avec une latence et un débit par connexion contrôlés. Il compare trois fois le moteur précédent, le cache avec quatre fragments et le cache avec huit fragments, en alternant l’ordre. Il vérifie les empreintes de tous les paquets vidéo et audio, le décodage intégral des premières sorties, les dimensions, la durée, les originaux et l’annulation réelle. Les cas de conteneur compatible comparent séparément la conversion et la copie des flux. Les résultats locaux ne prédisent pas le débit de YouTube ; les essais réseau réels doivent préciser leur vidéo, leurs formats et distinguer l’analyse, le transfert et la conversion éventuelle.

Pour ajouter un téléchargement réseau 1080p au test de la véritable application Windows, définir `V5_YOUTUBE_SMOKE_URL` avec une vidéo YouTube publique disposant d’un format H.264 1080p, puis lancer `test:desktop`. Le test utilise les IPC et le moteur réels et enregistre les empreintes des paquets audio/vidéo ; il reste désactivé par défaut pour les vérifications hors réseau.

Sur une machine Linux de CI, installer les dépendances système avec `npx playwright install --with-deps chromium`. Les tests UI ne valident pas un téléchargement réseau réel : celui-ci dépend aussi des restrictions de YouTube et de la version de yt-dlp.

## Distribution

```bash
npm run dist:mac
npm run dist:win
```

Les artefacts sont générés dans `release/`. Windows produit un exécutable portable et un installateur `Setup` aux noms distincts. Le paquet conserve les langues française et anglaise. Les avis des paquets installés sont collectés avant chaque build dans `licenses/` et inclus dans l’application.

Les exécutables Windows locaux sont non signés en l’absence de certificat de distribution configuré. La publication publique et la signature nécessitent les identifiants du propriétaire du produit.

### Mises à jour depuis GitHub

L’application distribuée recherche une nouvelle version stable huit secondes après le démarrage. « À propos » permet aussi de vérifier à la demande. Une indication apparaît dans l’en-tête lorsqu’une version est disponible. Les erreurs réseau restent dans ce panneau et ne bloquent pas les téléchargements ou conversions.

Avec l’installateur Windows `Setup`, l’utilisateur télécharge la mise à jour puis choisit « Redémarrer et installer ». Les fichiers sont vérifiés par `electron-updater` ; l’installation est bloquée pendant un traitement et ne se déclenche pas à la fermeture ordinaire de l’application. La version portable et les builds macOS sans signature Developer ID proposent la nouvelle version sur la page GitHub. Les builds de développement ne recherchent pas de mise à jour.

Les Releases du dépôt `raymondthibault88-ai/Youtube-Download` doivent être accessibles publiquement. Aucun jeton GitHub n’est embarqué dans l’application. Le code hébergé sur GitHub ne suffit pas : chaque version doit inclure l’installateur et `latest.yml` sur Windows, le ZIP/DMG et `latest-mac.yml` sur macOS, ainsi que les fichiers `.blockmap` générés. La configuration `build.publish` produit ces métadonnées, même avec `--publish never`.

Pour préparer une version :

1. Mettre à jour `version` dans `package.json` et `package-lock.json` (`npm version patch --no-git-tag-version`, par exemple).
2. Commiter les changements puis pousser le commit et son tag, par exemple `v5.0.1` pour la version `5.0.1`.
3. Le workflow `Release` vérifie l’application et construit Windows x64 (Setup et portable) et macOS Intel x64 (DMG et ZIP). Il crée ensuite un **brouillon** de release contenant tous les artefacts. Une version déjà publiée ne peut pas être remplacée par ce workflow.
4. Vérifier les exécutables puis publier le brouillon dans GitHub Releases. Seules les versions stables publiées sont proposées aux utilisateurs.

Les anciens exécutables sans ce système doivent être remplacés une première fois par une version qui l’intègre. Les prochaines versions pourront ensuite être installées depuis l’application.

La construction locale (`dist`, `dist:win`, `dist:mac`) ne publie rien. Le workflow utilise uniquement le `GITHUB_TOKEN` fourni par GitHub Actions pour créer le brouillon. La signature Windows peut être configurée avec les secrets `WIN_CSC_LINK` et `WIN_CSC_KEY_PASSWORD`.

Pour activer aussi l’installation automatique sur macOS, configurer les secrets `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` et `APPLE_TEAM_ID`, ainsi que la variable `MAC_SIGNING_IDENTITY` contenant l’identité `Developer ID Application: …`. Sans certificat, le workflow conserve la signature ad hoc et le téléchargement manuel. Voir la [documentation electron-builder](https://www.electron.build/v26/docs/features/auto-update/).

### Signature et notarisation macOS

Le build local utilise une signature ad hoc vérifiable, afin de ne pas sélectionner par erreur un certificat `Apple Development` non distribuable. Pour une distribution publique, fournis explicitement ton identité `Developer ID Application` avec `--config.mac.identity`, puis définis :

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Sans ces identifiants, un DMG local non notarisé peut être produit sur macOS. Une génération et une vérification sur macOS restent nécessaires pour cette plateforme.

## Correctifs V5

- validation des IPC corrigée pour les chemins Windows, y compris les espaces et accents ;
- collage via le bridge Electron, sans autorisation générale du presse-papiers ;
- encodage UTF-8 explicite de yt-dlp pour retrouver les fichiers aux noms accentués sous Windows ;
- invalidation des formats et rejet des réponses périmées quand le lien change ;
- annulation de l’analyse et arrêt des tâches à la fermeture ;
- verrou de traitement commun aux deux espaces ;
- progression continue entre vidéo, audio, fusion et conversion ;
- reprise logicielle si l’encodage matériel échoue ;
- messages d’erreur compréhensibles, avec détails techniques repliés ;
- dépendances de développement corrigées et logo d’origine conservé.

## Dépendances binaires

- yt-dlp 2026.08.19 est téléchargé au premier lancement, limité à des hôtes GitHub HTTPS et vérifié par SHA256.
- FFmpeg est fourni par `ffmpeg-static`. L’application teste l’encodeur matériel avant la conversion et repasse automatiquement sur libx264 si nécessaire.

## Légal

Le code du projet est sous licence MIT. Les composants tiers conservent leurs licences, notamment les binaires GPL. Les avis, les sources référencées et les informations de compilation se trouvent dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) et `licenses/`. Pour une redistribution publique, conserver ces informations et rendre disponible le code source correspondant aux binaires GPL distribués.

Respecter les droits sur les médias et les conditions des plateformes utilisées.
