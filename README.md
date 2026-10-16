# Video Downloader & Converter V4

Application Electron 44.7 + React 19.3 pour télécharger une vidéo YouTube ou convertir un fichier local en MP4 H.264/AAC compatible QuickTime et Dartfish.

## Fonctionnalités

- analyse des formats YouTube avec yt-dlp ;
- téléchargement et fusion audio/vidéo avec `faststart` intégré, sans seconde passe inutile ;
- réencodage automatique des codecs incompatibles en H.264/AAC ;
- conversion locale en 2160p, 1440p, 1080p, 720p ou 480p ;
- estimation de la taille avant conversion ;
- profils Rapide, Équilibré et Plus léger ;
- accélération VideoToolbox, NVENC, Quick Sync ou AMF lorsqu’elle est réellement disponible ;
- progression, vitesse, ETA, annulation et garde contre les tâches concurrentes.

## Développement

Prérequis : Node.js 22.12 ou supérieur et npm.

```bash
npm install
npm run dev
```

L’installation prépare automatiquement FFmpeg Windows 9.0.2 depuis l’archive officielle épinglée. L’archive puis le binaire extrait sont contrôlés par SHA-256. Le fichier `build/ffmpeg/win32-x64/ffmpeg.exe` est généré localement et ignoré par Git, car il dépasse la limite de 100 Mio par fichier. La CI effectue la même préparation avec `npm ci`. Si l’installation a utilisé `--ignore-scripts`, lance `npm run prepare:ffmpeg` avant les vérifications ou la distribution. Les licences, sources et manifestes restent versionnés ; les applications distribuées embarquent toujours FFmpeg pour fonctionner hors ligne.

La commande `npm run verify` exécute le lint, TypeScript, les tests unitaires, le smoke test et le build Vite.

Les régressions de fichiers, d’annulation et de conversion sont incluses dans `npm test`. Pour vérifier les parcours de l’interface et le bridge Electron réel :

```bash
npx playwright install chromium
npm run test:e2e
npm run test:electron
npm run verify:ffmpeg
npm audit
```

`test:electron` utilise des vidéos synthétiques et un profil temporaire. `YTD_TEST_EXECUTABLE` permet de tester également un exécutable déjà empaqueté. La CI exécute les tests sur Linux, macOS et Windows, puis construit et démarre les paquets macOS et Windows.

## Distribution

```bash
npm run dist:mac
npm run dist:win
```

Les artefacts sont générés dans `release/`. Le paquet macOS ne conserve que les langues française et anglaise afin de réduire sa taille. Pour produire les deux architectures Mac, utilise `npm run dist:mac -- --arm64 --x64`.

### Signature et notarisation macOS

Le build local utilise une signature ad hoc vérifiable, afin de ne pas sélectionner par erreur un certificat `Apple Development` non distribuable. Pour une distribution publique, fournis explicitement ton identité `Developer ID Application` avec `--config.mac.identity`, puis définis :

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Sans ces identifiants, un DMG local non notarisé est tout de même produit.

## Dépendances binaires

- yt-dlp 2026.08.19 est téléchargé au premier lancement, limité à des hôtes GitHub HTTPS et vérifié par SHA256.
- Les binaires FFmpeg sont explicitement embarqués depuis `build/ffmpeg/`, avec empreinte, licence et provenance. macOS utilise FFmpeg 9.0.2 GPL sans `nonfree`, pour Apple Silicon et Intel ; Windows utilise FFmpeg 9.0.2 GPL sans `nonfree`, issu du build statique essentials de Gyan Doshi (Windows 10 ou ultérieur). Le paquet distribué n’inclut pas la dépendance npm `ffmpeg-static`. L’application vérifie l’intégrité et la licence, teste l’encodeur matériel et retente sur libx264 en cas d’échec matériel. `ffmpeg-static` reste uniquement une dépendance de développement pour la CI Linux.

Les téléchargements s’effectuent dans un dossier temporaire par tâche. Les formats restent associés à l’URL et à l’identité de la vidéo analysée. Le fichier final est publié sans remplacement, avec un suffixe numérique en cas de titre identique. Les fichiers temporaires sont nettoyés en fin de tâche et les configurations/plugins yt-dlp externes sont ignorés.

### Mise à jour des moteurs

Avant chaque publication, compare la version yt-dlp épinglée dans `electron/ytDlp.cjs` à la dernière release officielle. Toute modification doit mettre à jour les empreintes officielles des plateformes, puis valider analyse, fusion, réencodage, collision de titres et annulation. Les nouveaux FFmpeg doivent être accompagnés de leur licence, de leur source et de leur manifeste ; `npm run verify:ffmpeg` refuse les fichiers modifiés et les configurations nonfree. Regénère les paquets de toutes les plateformes avec la même version de l’application.

`npm run dist:win` génère l’installateur NSIS x64. La variante autonome reste disponible avec `npx electron-builder --win portable --x64`.

## Interface et accessibilité

Les erreurs et le dernier résultat sont visibles dans les deux modes. Le résultat affiche le nom du fichier, les réglages effectivement utilisés et une action pour le retrouver. Les choix de qualité sont verrouillés pendant le téléchargement ; les annulations et échecs ont un état explicite et peuvent être fermés.

Le menu **Affichage** permet de zoomer. Les raccourcis Ctrl/⌘ + et − agrandissent ou réduisent l’interface ; Ctrl/⌘ 0 rétablit la taille normale. Le bouton **À propos** regroupe la version de l’application et les informations des moteurs. Le tableau des qualités propose les **Détails techniques** sur demande.

Le détail des corrections UI de la version 4.0.9 est dans [le rapport de vérification](docs/audits/CORRECTIFS_UI_2026-10-12.md).

## Légal

Respecte les conditions d’utilisation des plateformes et les droits d’auteur applicables. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) pour les composants distribués avec l’application.
