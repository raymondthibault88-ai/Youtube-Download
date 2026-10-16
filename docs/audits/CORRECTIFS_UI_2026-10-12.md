# Correctifs UI et graphisme — YouTube Downloader 4.0.9

Travail local réalisé le 12 octobre 2026 à la suite de l’autorisation de corriger l’[audit UI de la version 4.0.8](AUDIT_UI_GRAPHISME_2026-10-12.md). Les neuf constats sont traités. La structure générale, les deux modes et le logo existant sont conservés.

## Corrections

| Constat | Comportement corrigé | Vérification |
|---|---|---|
| UI-01 — Erreur de dossier masquée en conversion | Zone commune de messages, visible dans les deux modes, texte complet et fermeture accessible | Scénario Chromium « folder error » |
| UI-02 — Contrastes insuffisants | Couleurs des textes secondaires, sélections, badges et placeholder assombries ; boutons primaires contrastés | Mesures de couleurs calculées et ratios ci-dessous |
| UI-03 — Petits textes et zoom absent | Textes secondaires au moins 12 px ; contrôles principaux 14–16 px ; menus natifs français et raccourcis de zoom ; mise en page adaptée au zoom | Captures 1200×820, 1024×652 et 600×394 ; Electron à 200 % |
| UI-04 — Fin de téléchargement sans confirmation | Résultat persistant avec fichier obtenu, qualité, taille réelle lorsque disponible, dossier et « Afficher le fichier » | Scénario Chromium de téléchargement, changement de mode et ouverture du chemin du résultat |
| UI-05 — Qualité modifiable pendant une tâche | Radios, lignes de qualité, URL et destination verrouillées pendant le téléchargement ; garde dans le gestionnaire de sélection | Scénario Chromium avec téléchargement différé |
| UI-06 — États terminaux ambigus | Annulation neutre ; échec explicite, texte complet, fermeture et nouvelle tentative ; pourcentage/progression seulement pendant la tâche | Scénarios d’annulation, échec, fermeture et nouvelle tentative |
| UI-07 — Format source et résultat confondus | Qualité en « 1080p », fichier final MP4 compatible, disponibilité du son distincte, préparation expliquée ; poids du flux source identifié ; codecs source et images/s dans « Détails techniques » | Captures des tableaux standard et détaillé |
| UI-08 — Résultat de conversion ambigu | Résultat distinct de la prochaine sortie prévue, avec source et réglages figés au lancement ; annonce role=status ; résultat également reconstruit après réouverture | Scénarios Chromium et test natif de fermeture/réouverture |
| UI-09 — Identité et pictogrammes disparates | Nom YouTube Downloader harmonisé ; icônes SVG communes ; versions des moteurs dans un dialogue « À propos » accessible | Capture du dialogue et test Échap/restauration du focus |

Le résultat reste disponible jusqu’à sa fermeture ou au démarrage d’une nouvelle opération. Il n’ouvre plus automatiquement le Finder. Les informations de conversion mémorisent la résolution et le profil demandés ; l’utilisation effective d’un encodeur matériel peut toujours basculer vers libx264 selon les capacités de la machine.

## Correctif découvert pendant la validation réelle

Deux essais du paquet Apple Silicon ont rencontré « Requested format is not available ». L’analyse rapide utilisait les clients `web_embedded,web_safari`, puis le téléchargement repartait avec les clients par défaut de yt-dlp. La même identité de format ne pouvait donc pas être considérée disponible dans les deux requêtes.

Le service mémorise maintenant la stratégie d’extraction de l’analyse et la reprend pour télécharger la qualité sélectionnée. Le format choisi reste inchangé. Deux tests de régression couvrent le client rapide et le repli vers les clients par défaut. Le téléchargement réel depuis les sources réussit avec ce correctif, puis les paquets sont régénérés. Les deux logs initiaux sont conservés sous `packaged-arm64-first-live-attempt.log` et `packaged-arm64-second-live-attempt.log`.

## Lisibilité mesurée

| Texte | Ratio corrigé |
|---|---:|
| Placeholder sur blanc | 5,002:1 |
| Option sélectionnée | 5,811:1 |
| Badge assemblage | 5,925:1 |
| Texte secondaire sur fond clair | 6,054:1 |
| Texte secondaire sur sélection | 5,695:1 |
| Texte du bouton primaire, sur la partie la plus claire du dégradé | 5,523:1 |
| Badge conversion | 4,933:1 |

Les ratios sont calculés à partir des couleurs sRGB des éléments corrigés, pour les états actifs. Ils dépassent 4,5:1 pour les paires contrôlées ; cela ne constitue pas une certification complète de l’accessibilité. Les contrôles désactivés conservent un aspect atténué.

Les douze captures de démonstration vérifient les noms et chemins longs, les cinq résolutions de conversion, les résultats, les erreurs et les annulations. La largeur du document reste égale à celle de la fenêtre aux trois dimensions contrôlées ; le tableau technique utilise son propre défilement. Le zoom demande un défilement vertical normal.

## Contrôles terminés

- `npm run verify` : lint, TypeScript, 43 tests Node, smoke et build Vite réussis.
- `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/ytd-playwright-browsers npm run test:e2e` : 10/10 scénarios Chromium réussis. Le navigateur était déjà installé dans ce cache temporaire.
- `npm run verify:ffmpeg` : empreintes des trois plateformes valides.
- Electron depuis les sources : conversion d’une vidéo synthétique 641×361 et décodage du MP4, sandbox/preload/IPC, refus d’une source non sélectionnée, fermeture/réouverture pendant conversion et reconstruction du résultat réussis.
- Electron depuis les sources : analyse de la vidéo publique YouTube `jNQXAC9IVRw`, téléchargement, fusion et décodage réels réussis.
- Raccourcis de zoom natifs vérifiés avec `webContents.sendInputEvent`, puis zoom à 200 % et contrôle de largeur. L’automatisation clavier Chromium contourne les événements natifs Electron ; elle n’est donc pas utilisée comme preuve du raccourci natif.

Les tests utilisent des fichiers synthétiques, des profils et dossiers temporaires. Les captures Chromium emploient un bridge de démonstration injecté uniquement pour le contrôle ; leurs données ne sont pas des résultats de traitement réels. Les captures natives sont identifiées séparément.

## Preuves

- Logs et mesures : `docs/audits/evidence-ui-correctifs-2026-10-12/`.
- Captures, script et données de démonstration : `output/playwright/ui-correctifs-2026-10-12/`.
- Capture native depuis les sources : `native-conversion.png`.

## Paquets et limites

Les six artefacts locaux 4.0.9 sont construits dans `release/ui-fixed-4.0.9/` : DMG et ZIP Mac Apple Silicon, DMG et ZIP Mac Intel, installateur NSIS et portable Windows x64. `SHA256SUMS.txt` contient leurs empreintes.

| Contrôle des paquets finaux | Résultat |
|---|---|
| Apple Silicon : conversion, décodage, zoom +/−/0, 200 %, fermeture/réouverture et résultat | Réussite, `packaged-arm64.log` |
| Apple Silicon : téléchargement YouTube et décodage réels | Réussite, première ligne de `packaged-arm64-reopen-timing.log` ; l’essai suivant a rencontré une indisponibilité de la vidéo externe, conservée dans `packaged-arm64-video-unavailable.log` |
| Signatures locales des deux applications Mac | `codesign --verify --deep --strict` réussit |
| Intégrité des deux DMG et des deux ZIP | `hdiutil verify` et `unzip -t` réussissent |
| Contenu des trois cibles | 27 fichiers comparés aux sources, version 4.0.9, FFmpeg 9.0.2 valide et notices présentes, aucun module npm de développement embarqué |
| Exécutables Windows | NSIS et portable construits ; pas de test d’exécution Windows |
| Lancement Intel sous Rosetta | Validation non aboutie : expiration à 60 puis 180 secondes ; ne pas considérer cette cible comme validée en exécution |

Les paquets Mac ont une signature ad hoc locale, sans notarisation Apple ; les exécutables Windows n’ont pas de certificat éditeur. Aucun commit, push ou publication n’a été effectué.

Le premier lancement Intel sous Rosetta a dépassé le délai initial de 60 secondes. Un essai de réouverture du paquet Apple Silicon a également terminé sa conversion avant le retour de la nouvelle fenêtre ; l’attente fixe de quatre secondes de la fixture est remplacée par une synchronisation explicite, puis la vraie conversion FFmpeg reprend. Les traces initiales sont conservées.

Le contrôle Intel utilise aussi un délai de lancement de 180 secondes (`YTD_TEST_LAUNCH_TIMEOUT_MS`), sans modifier le comportement de l’application, mais deux essais atteignent encore ce délai. Le lancement direct avec un profil temporaire ne donne pas non plus de fenêtre/debugger accessible pendant le contrôle. Le relevé de pile (`intel-startup-sample.txt`) situe l’attente dans le chargement des bibliothèques par dyld/Rosetta, avant la création de la fenêtre. La cause précise n’est pas établie : il faut valider ce paquet sur un Mac Intel physique ou résoudre le blocage Rosetta avant de le considérer prêt pour cette cible.

Le rendu et l’exécution Windows natifs, l’installation/désinstallation Windows et un lecteur d’écran ne sont pas vérifiés sur cette machine macOS.

## Aperçus de démonstration

![Conversion avec résultat et réglages suivants distincts](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/ui-correctifs-2026-10-12/09-resultat-immuable.png)

![Échec explicite et nouvelle tentative](/Users/thibault/Desktop/Developpement/GitHub/Youtube-Download/output/playwright/ui-correctifs-2026-10-12/08-erreur.png)
