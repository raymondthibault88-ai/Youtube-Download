# Audit global de YouTube Downloader

Audit du 12 octobre 2026 sur la version 4.0.6, commit `1b1184f4fc4ef3ca27af4b0e76f373a2be9d094b`.

Les constats ci-dessous décrivent la version 4.0.6. Les correctifs de la version 4.0.7 et leurs résultats sont détaillés dans le [bilan de correction](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/docs/audits/CORRECTIFS_VERIFICATION_2026-10-12.md).

Le logiciel fonctionne sur les parcours courants testés et dispose de bonnes protections Electron. Trois points doivent cependant être traités en priorité : les collisions entre titres de vidéos, le téléchargement depuis une URL différente de celle analysée et le binaire FFmpeg macOS qui se déclare non redistribuable. Les tests actuels passent, mais couvrent surtout des fonctions auxiliaires et la configuration.

Le code de l’application et les dépendances sont restés inchangés. Seuls ce rapport et ses preuves ont été ajoutés. Les essais de fichiers ont utilisé des fixtures temporaires ; aucun fichier vidéo personnel n’a été modifié.

## Vérifications et résultats

| Vérification | Résultat | Portée |
| --- | --- | --- |
| `npm run verify` | Réussi | Lint, TypeScript, 21 tests, smoke test et build Vite |
| `npm run verify:ffmpeg-win` | Réussi | SHA256 du FFmpeg Windows embarqué |
| Analyse YouTube réelle | Réussie en environ 10 secondes | Une vidéo publique de 19 secondes |
| Téléchargement YouTube réel | Réussi | MP4 320×240, H.264/AAC, fusion audio et décodage FFmpeg complet |
| Conversion locale | Réussie avec les trois profils | Source synthétique 640×360 avec audio |
| Source 641×361 | Échec reproduit | Profil Plus léger à la résolution originale |
| Échec matériel après un probe réussi | Échec sans nouvelle tentative CPU | Encodeur simulé, service de conversion réel |
| Collision entre titres | Mauvais contenu et suppression du chemin initial reproduits | yt-dlp réel hors réseau et deux vidéos synthétiques différentes |
| Annulation avec un processus enfant | Descendant toujours vivant | Processus Node synthétiques sur macOS, nettoyés après le test |
| Interface | Parcours et incohérence d’URL observés | Aperçu Vite avec API de démonstration, à 1280×720 |
| `npm audit` | 19 dépendances signalées | 8 modérées, 9 élevées, 2 critiques dans l’outillage de développement |
| `npm audit --omit=dev` | Aucune alerte | Dépendances npm de production déclarées |

Les trois services responsables des téléchargements, conversions et processus dans `release/win-unpacked/resources/app.asar` sont identiques aux sources auditées et le paquet annonce la version 4.0.6. Cette comparaison ne constitue pas un test d’exécution du logiciel sous Windows.

Les résultats machine sont conservés dans `evidence-2026-10-12`. Les tests de conversion ne certifient pas la lecture dans Dartfish ou QuickTime, ni la qualité visuelle des vidéos longues, HDR ou entrelacées. L’audit npm ne couvre pas à lui seul les vulnérabilités des binaires Electron, FFmpeg et yt-dlp.

## Problèmes prioritaires

### P1 Collisions entre titres de vidéos

Le nom de sortie repose uniquement sur `%(title).180B.%(ext)s`. Deux vidéos différentes de même titre et même extension peuvent donc viser le même fichier. yt-dlp peut considérer le fichier présent comme déjà téléchargé ; l’application traite ensuite ce fichier et annonce un succès pour la nouvelle demande. Pour un format sans fusion, `remux` supprime le chemin d’origine après création du fichier compatible.

Le test hors réseau a demandé une vidéo rouge d’une seconde alors qu’un fichier `Match.mp4` de deux secondes existait déjà. La sortie contenait toujours l’ancienne vidéo de deux secondes, `ok` valait `true` et `Match.mp4` avait disparu. Son contenu avait été conservé sous `Match - compatible.mp4` : la preuve établit un mauvais résultat et la disparition du chemin initial, pas une perte définitive de tous les octets.

Utiliser un dossier de travail unique par tâche, vérifier l’identité de la vidéo et réserver un nom final disponible, avec suffixe numérique si nécessaire. Ne supprimer que les fichiers créés par la tâche courante. Cela permet de conserver des noms lisibles sans imposer un identifiant technique dans le nom final.

Sources : [nommage](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/shared/download-config.json:3), [téléchargement](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/youtube.cjs:170), [suppression après remux](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/media.cjs:214). Preuve : `collision-result.json`. Le comportement d’écrasement et de réutilisation dépend des [options officielles yt-dlp](https://github.com/yt-dlp/yt-dlp#filesystem-options).

### P1 URL téléchargée différente de la vidéo affichée

Après analyse de l’URL A, modifier le champ vers B conserve le titre, les formats et la sélection de A, ainsi que le bouton Télécharger actif. Le téléchargement utilise pourtant l’URL courante B. Il peut télécharger la mauvaise vidéo avec un format de A, ou échouer si ce format n’existe pas sur B. Le même décalage peut survenir si l’utilisateur modifie le champ pendant une analyse en cours.

Associer chaque résultat à son URL analysée, invalider la sélection dès que cette URL change et ignorer les réponses devenues obsolètes. Désactiver le téléchargement pendant l’analyse et tant que le champ ne correspond pas au résultat.

Sources : [changement du champ](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/App.tsx:72), [résultat d’analyse](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/hooks/useVideoAnalyze.ts:49), [URL utilisée au téléchargement](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/hooks/useDownloadFlow.ts:98). La capture ci-dessous provient de l’aperçu de démonstration ; le lien entre URL courante et commande est établi par les sources.

![Formats conservés après remplacement de videoA par videoB](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/docs/audits/evidence-2026-10-12/url-mismatch-preview.png)

### P1 FFmpeg macOS non redistribuable

Le FFmpeg macOS installé via `ffmpeg-static`, ainsi que celui extrait du ZIP macOS 4.0.5 présent dans `release`, répondent à `-L` qu’ils contiennent des composants nonfree et ne sont pas légalement redistribuables. Le binaire local affiche également `--enable-nonfree` dans sa configuration. Les notices du projet évoquent la GPL et x264, mais ne résolvent pas ce problème de binaire.

Remplacer le binaire macOS par une compilation redistribuable, documenter précisément sa provenance, sa licence et les sources correspondantes, puis contrôler `-L` pendant la construction des paquets. Ce constat porte sur macOS ; il ne permet pas de qualifier le binaire Windows de nonfree.

Sources : [dépendance de distribution](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/package.json:27), [résolution FFmpeg](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/dependencies.cjs:5), [notices](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/THIRD_PARTY_NOTICES.md:5). FFmpeg indique explicitement que certaines combinaisons activées par `--enable-nonfree` rendent le binaire [non redistribuable](https://ffmpeg.org/doxygen/trunk/md_LICENSE.html).

## Fiabilité et sécurité à corriger

### P2 Absence de reprise CPU après un échec matériel

La détection teste un petit clip puis mémorise l’encodeur disponible. Si la conversion réelle échoue ensuite avec cet encodeur, le service supprime le fichier temporaire et remonte l’erreur. Il ne retente pas la conversion avec libx264. Le README promet pourtant ce comportement.

Un encodeur simulé a réussi la détection et échoué à la conversion : aucune invocation de libx264 n’a suivi. Retenter une seule fois avec le CPU pour les erreurs matérielles appropriées, en respectant l’annulation et sans masquer les erreurs de fichier ou d’espace disque.

Sources : [détection](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/media.cjs:101), [traitement de l’échec](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/media.cjs:196), [promesse du README](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/README.md:49). Preuve : `service-results.json`.

### P2 Annulation incomplète des processus sur macOS

Sous Windows, le service utilise `taskkill /T`. Sous macOS, il ne termine que le processus immédiat. Un descendant lancé par yt-dlp, notamment un FFmpeg de fusion, peut donc continuer après l’annulation. Le test avec un parent Node et son enfant a reproduit un `AbortError` alors que l’enfant restait vivant.

Gérer les groupes de processus sur les plateformes POSIX et attendre l’arrêt de leurs descendants avant de libérer la tâche. Ajouter aussi une politique explicite d’arrêt des processus quand l’application quitte ; aucun nettoyage de ce type n’est enregistré dans le main actuel. La survie d’un vrai FFmpeg après fermeture de l’application n’a pas été testée.

Sources : [terminaison](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/process-runner.cjs:15), [cycle de vie](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/main.cjs:49). Preuve : `service-results.json`.

### P2 Perte du suivi après réouverture de la fenêtre macOS

La tâche conserve le `webContents` qui l’a démarrée. Sur macOS, fermer la fenêtre laisse l’application active ; une nouvelle fenêtre peut récupérer un snapshot, mais les événements suivants restent adressés à l’ancienne fenêtre détruite. La nouvelle interface peut conserver un état En cours malgré la fin de la tâche.

Diffuser les événements aux fenêtres autorisées actives ou réassocier le destinataire lors de la réouverture. Le test du gestionnaire confirme le destinataire fixe ; le parcours natif complet fermeture puis réouverture reste à valider.

Sources : [émission](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/job-manager.cjs:18), [snapshot IPC](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/ipc/register-handlers.cjs:48), [réouverture](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/main.cjs:53). Preuve : `reopen-result.json`.

### P2 Conversion de sources aux dimensions impaires

Une source MKV valide en 641×361 est acceptée à la sélection, puis échoue avec libx264 dans le profil Plus léger, à résolution originale. La conversion impose `yuv420p` sans ajuster les dimensions lorsque la résolution n’est pas réduite. FFmpeg remonte `width not divisible by 2`.

Normaliser largeur et hauteur vers des dimensions paires, en préservant le ratio d’image et en évitant une coupe implicite. Vérifier aussi les sources orientées verticalement et les métadonnées de rotation.

Source : [filtres et encodage](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/media.cjs:142). Preuve : `service-results.json`.

### P2 Analyse sans annulation exposée ni limite globale

Le service accepte un signal, mais le handler IPC d’analyse ne lui en fournit pas. L’analyse ne passe pas par le gestionnaire de tâches ; le bouton Annuler ne peut donc pas l’arrêter. `runProcess` n’impose aucune durée maximale. Un moteur bloqué peut maintenir le formulaire en Analyse sans moyen de reprise dans l’interface.

Exposer l’annulation de l’analyse, fixer une limite globale adaptée et invalider les réponses des anciennes requêtes. L’analyse réelle a réussi ; aucun blocage réseau permanent n’a été provoqué.

Sources : [handler d’analyse](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/ipc/register-handlers.cjs:51), [exécution](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/process-runner.cjs:31).

### P2 Configurations externes yt-dlp non isolées

Les commandes d’analyse et de téléchargement n’utilisent ni `--ignore-config` ni `--no-plugin-dirs`. Les configurations et plugins déjà installés pour yt-dlp peuvent ainsi modifier les traitements, les sorties imprimées ou exécuter des actions configurées par ailleurs. La validation de l’URL et du format n’isole pas ce comportement. Aucune exécution malveillante n’a été démontrée.

Isoler les commandes de l’application des configurations et plugins externes, puis exposer explicitement les options utilisateur réellement prises en charge.

Sources : [arguments d’analyse](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/youtube.cjs:56), [arguments de téléchargement](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/youtube.cjs:69), [configuration officielle yt-dlp](https://github.com/yt-dlp/yt-dlp#configuration).

### P2 Progression influencée par les fichiers voisins

Le suivi de secours additionne la croissance de tous les fichiers du dossier de sortie. Un téléchargement externe ou une copie dans le même dossier influence donc le pourcentage, la vitesse et le temps restant. Un simple fichier voisin de 1 000 octets a fait afficher 97 % alors qu’aucun octet de la tâche n’avait été écrit. Le service conserve ensuite le pourcentage maximal.

Suivre uniquement les fichiers de la tâche, idéalement dans son dossier temporaire. Cette isolation réduit aussi les lectures répétées de tous les fichiers du dossier Téléchargements toutes les 750 ms. Aucune mesure de performance sur un grand dossier n’a été réalisée.

Sources : [comptage global](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/download-progress.cjs:91), [pourcentage monotone](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/electron/services/youtube.cjs:132). Preuve : `progress-result.json`.

### P2 Dépendances vulnérables dans les outils de développement

Le registre npm signale 19 dépendances : 8 modérées, 9 élevées et 2 critiques. Les deux entrées critiques, `shell-quote` et `concurrently`, appartiennent à la même chaîne de dépendances ; elles ne représentent pas deux exploits indépendants démontrés. `shell-quote` 1.9.0 est concerné par une [injection de commandes documentée](https://github.com/advisories/GHSA-pqg4-j6r4-53mv).

Le contrôle avec `--omit=dev` ne remonte aucune alerte. Il faut donc traiter ces résultats comme un risque d’outillage de développement et de construction, sans affirmer une exploitation par une URL dans l’application distribuée. Mettre à jour les dépendances et le lockfile avec vérification des constructions, sans appliquer aveuglément les changements de versions suggérés par `npm audit fix --force`.

Preuves : `npm-audit-full.json` et `npm-audit-prod.json`.

## Interface et maintenabilité

Les parcours sont lisibles et la séparation Télécharger puis Convertir est claire. Les options de résolution, de profil et de mode signalent néanmoins leur sélection uniquement par une classe CSS : leur état actif n’apparaît pas comme sélectionné dans l’arbre d’accessibilité. Ajouter `aria-pressed` ou des groupes radio appropriés. Les messages d’erreur des panneaux devraient aussi être annoncés explicitement. Cette observation ne constitue pas une certification complète d’accessibilité.

Sources : [modes](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/components/AppHeader.tsx:24), [résolutions](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/components/ConverterPanel.tsx:95), [profils](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/src/components/ConverterPanel.tsx:110).

La structure en composants React, hooks, bridge IPC et services est cohérente. Le TypeScript strict protège l’interface ; les services CommonJS ne sont pas contrôlés par TypeScript. Les tests existants vérifient surtout les arguments, parsers et configurations. La CI lance ces contrôles sous Linux, macOS et Windows, mais ne démarre pas Electron et ne construit pas les distributions. Ajouter des tests de comportement autour des problèmes reproduits, puis un test du paquet installé sur chaque plateforme.

Le moteur yt-dlp est figé à `2026.08.19`, avec vérification SHA256. Cette approche protège son intégrité, mais chaque mise à jour nécessite une nouvelle version de l’application. Prévoir une procédure régulière de mise à jour et de validation YouTube, sans déduire de cette version figée qu’un téléchargement actuel échoue.

Les artefacts locaux mêlent Windows 4.0.6 et macOS 4.0.5. La signature macOS par défaut est ad hoc et aucune signature Windows n’est configurée explicitement dans le manifeste du projet. La validation finale de distribution doit porter sur les paquets exacts livrés, leurs signatures, l’installation et la désinstallation ; leurs résultats ne sont pas établis par cet audit.

## Protections déjà présentes

- Isolation de contexte, sandbox, intégration Node désactivée dans le renderer et politique CSP.
- Fenêtres externes et navigations bloquées ; permissions refusées par défaut.
- Validation de l’émetteur IPC, des URLs HTTPS YouTube et des identifiants de format.
- Exécution des moteurs par arguments séparés, sans shell pour les opérations média.
- Source de conversion limitée aux fichiers sélectionnés par le dialogue natif.
- Vérification SHA256 de yt-dlp, contrôle des hôtes de téléchargement, limites de taille et de redirections.
- Garde centrale contre deux conversions ou téléchargements simultanés.
- Conversion locale vers un fichier temporaire, nettoyage sur erreur et conservation du fichier source.

Ces protections sont cohérentes avec les [recommandations de sécurité Electron](https://www.electronjs.org/docs/latest/tutorial/security). Elles réduisent la surface d’attaque, sans constituer une preuve d’absence de toute vulnérabilité.

## Ordre de correction recommandé

1. Isoler les fichiers de chaque téléchargement et corriger les collisions ; ajouter un test avec deux vidéos de même titre.
2. Lier les formats à l’URL analysée et neutraliser les réponses obsolètes.
3. Remplacer le FFmpeg macOS nonfree et vérifier la redistribution avant de produire un nouveau paquet.
4. Fiabiliser la reprise CPU, l’annulation des descendants et le suivi après réouverture.
5. Traiter les dimensions impaires, l’annulation de l’analyse et l’isolation yt-dlp.
6. Actualiser les dépendances de développement, améliorer l’accessibilité et compléter les tests des paquets Windows et macOS.

La validation après correction doit inclure les scénarios reproduits ici, un téléchargement avec fusion, un téléchargement avec réencodage, une annulation pendant fusion et conversion, puis l’exécution des paquets sur des machines Windows et macOS. Le réencodage après téléchargement et les longs matchs n’ont pas été validés par le téléchargement réel court de cet audit.
