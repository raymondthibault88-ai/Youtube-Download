# Mises à jour et vérification — YouTube Downloader 4.0.8

Travail local effectué le 12 octobre 2026 après les correctifs de l’audit. Les artefacts 4.0.7 restent dans `release/audit-fixed/`. Les nouveaux paquets 4.0.8 sont dans `release/updated-4.0.8/`. Aucun commit, push ou publication n’a été effectué.

## Bibliothèques

| Dépendance | Avant | Après |
|---|---|---|
| Electron | 44.0.0 | 44.7.0 |
| Vite | 8.2.2 | 8.3.4 |
| React / React DOM | 19.2.8 | 19.3.0 |
| ESLint | 10.9.1 | 10.12.0 |
| typescript-eslint | 8.68.0 | 8.71.1 |
| @electron/notarize | 3.1.1 | 3.1.2 |
| @types/node | 24.13.3 | 24.19.2 |
| @types/react | 19.2.18 | 19.3.0 |
| @types/react-dom | 19.2.5 | 19.3.0 |
| @vitejs/plugin-react | 6.1.1 | 6.1.2 |
| globals | 17.11.0 | 17.13.0 |
| wait-on | 9.1.0 | 9.5.1 |
| FFmpeg Windows | 6.1.1 | 9.0.2 |

TypeScript reste en 5.9.3 ; le passage à 7 demande une migration dédiée. Les types Node restent sur la branche 24, correspondant au Node 24.21.0 d’Electron 44.7 et à la CI. electron-builder reste en 26.17.0, explicitement demandé dans package.json ; le tag npm `latest` pointe vers 26.15.3 tandis que `v26` pointe vers 26.17.0. Les trois entrées restantes dans npm outdated reflètent ces choix, sans mise à jour manquante dans les plages retenues. FFmpeg macOS 9.0.2 et yt-dlp 2026.08.19 sont conservés.

FFmpeg Windows utilise maintenant le build statique essentials de [Gyan Doshi](https://www.gyan.dev/ffmpeg/builds/), fournisseur référencé par [FFmpeg](https://ffmpeg.org/download.html). L’archive 9.0.2 a été vérifiée contre l’empreinte publiée avant extraction. Le binaire PE AMD64, sa licence et les informations de construction originales sont embarqués. Il inclut libx264, AAC et les encodeurs matériels NVENC/QSV/AMF ; sa configuration ne contient pas --enable-nonfree. Le minimum cible est Windows 10 x64. Les DLL importées sont des composants système Windows/UCRT ; aucune DLL tierce supplémentaire n’est requise par la table d’imports.

- SHA-256 archive : `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`
- SHA-256 ffmpeg.exe : `3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec`

La provenance est dans `build/ffmpeg/win32-x64/manifest.json` et `SOURCES.md`. `BUILD_INFORMATION.txt` et `LICENSE.txt` viennent de l’archive originale. Les notices de redistribution ont été mises à jour ; les obligations de fourniture des sources correspondantes restent applicables.

## Skills installés

Installation via le script officiel skill-installer depuis openai/skills, dans le dossier personnel Codex :

- `security-best-practices` : `/Users/thibault/.codex/skills/security-best-practices/`
- `gh-fix-ci` : `/Users/thibault/.codex/skills/gh-fix-ci/`
- `playwright` : `/Users/thibault/.codex/skills/playwright/`

Les trois SKILL.md sont présents ; leurs empreintes sont dans `evidence-mises-a-jour-2026-10-12/skills.json`. Les skills sont disponibles au prochain tour de conversation.

## Résultats vérifiés

| Contrôle | Résultat | Preuve |
|---|---|---|
| Lint, TypeScript, smoke, build Vite | Réussite ; lint relancé après l’adaptation du test natif | verify.log, lint-final.log |
| Tests Node, dont annulation/processus et fichiers | 41/41 | verify.log |
| Parcours Chromium | 5/5 | e2e.log |
| Audit npm complet | 0 vulnérabilité signalée | npm-audit.json |
| Arbre npm | Cohérent, sans dépendance invalide | npm-ls.txt |
| FFmpeg des trois plateformes | Empreintes et licences vérifiées | manifestes et package-content.json |
| Electron réel depuis les sources | Conversion 641×361, décodage, sandbox/preload/IPC, refus de source non sélectionnée, fermeture/réouverture pendant conversion | electron.log |
| YouTube réel depuis les sources | Analyse, téléchargement, fusion et décodage du fichier obtenu | electron.log |
| Paquet Mac Apple Silicon | Même validation native, conversion et téléchargement YouTube réels | packaged-arm64.log |
| Paquet Mac Intel sous Rosetta | Conversion et téléchargement YouTube réels, décodage, sandbox/preload/IPC, refus de source non sélectionnée et fermeture/réouverture pendant conversion réussis | packaged-x64-live.log |
| Builds Mac Apple Silicon et Intel | DMG et ZIP construits | build-mac.log |
| Signatures locales des deux .app | codesign --verify --deep --strict réussit | contrôle local |
| Images disque Mac | hdiutil verify réussit pour les deux DMG | dmg-arm64.log, dmg-x64.log |
| Windows x64 | Installateur NSIS et portable construits | build-win.log |
| Contenu des trois paquets | 27 fichiers comparés aux sources pour chaque cible, version 4.0.8 et FFmpeg valide, aucun module npm de développement embarqué | package-content.json |

Le téléchargement réel utilise la vidéo YouTube publique `jNQXAC9IVRw`. Les tests natifs automatisés utilisent des vidéos synthétiques, des profils temporaires et des dossiers temporaires. Les données utilisateur ne servent pas de fixtures.

## Limites de validation

Le premier lancement du paquet Mac Intel sous Rosetta a dépassé le délai de 60 secondes. Après initialisation, l’interface démarre et les premiers essais atteignent l’analyse/la conversion, mais les assertions d’interface expirent après 5 secondes alors que les opérations sont encore en cours. Le script de test natif utilise maintenant 30 secondes pour les assertions d’interface et 60 secondes pour la fin d’une conversion, avec l’état du job et une capture en cas d’échec. Le contrôle complet de conversion réussit avec ces délais ; les échecs initiaux sont conservés pour traçabilité. Le contrôle complet réussit également avec analyse YouTube, téléchargement, fusion et décodage réels (`packaged-x64-live.log`). Un Mac Intel physique n’a pas été utilisé ; la validation Intel locale passe par Rosetta.

Aucun environnement Windows natif n’est accessible ici. Le nouveau FFmpeg Windows et les exécutables sont vérifiés statiquement et empaquetés, mais leur exécution, l’installation/désinstallation et l’accélération GPU doivent encore être validées sous Windows. La CI existante prévoit les tests natifs et le lancement du paquet Windows ; elle n’a pas été déclenchée à distance pendant ce travail local.

Les paquets Mac ont une signature ad hoc locale, sans notarisation Apple ; les exécutables Windows ne sont pas signés par un certificat éditeur.

## Artefacts

- `release/updated-4.0.8/YouTube Downloader-Portable-4.0.8-x64.exe`
- `release/updated-4.0.8/YouTube Downloader-Setup-4.0.8-x64.exe`
- `release/updated-4.0.8/YouTube Downloader-4.0.8-arm64.dmg`
- `release/updated-4.0.8/YouTube Downloader-4.0.8-x64.dmg`
- ZIP Mac arm64 et x64 dans le même dossier.
- `SHA256SUMS.txt` contient les empreintes des six artefacts.

Les logs, captures et résultats structurés sont conservés dans `docs/audits/evidence-mises-a-jour-2026-10-12/`.
