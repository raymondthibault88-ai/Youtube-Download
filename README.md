# Video Downloader & Converter V4

Application Electron 44 + React pour télécharger une vidéo YouTube ou convertir un fichier local en MP4 H.264/AAC compatible QuickTime et Dartfish.

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

La commande `npm run verify` exécute le lint, TypeScript, les tests unitaires, le smoke test et le build Vite.

## Distribution

```bash
npm run dist:mac
npm run dist:win
```

Les artefacts sont générés dans `release/`. Le paquet macOS ne conserve que les langues française et anglaise afin de réduire sa taille.

### Signature et notarisation macOS

Le build local utilise une signature ad hoc vérifiable, afin de ne pas sélectionner par erreur un certificat `Apple Development` non distribuable. Pour une distribution publique, fournis explicitement ton identité `Developer ID Application` avec `--config.mac.identity`, puis définis :

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Sans ces identifiants, un DMG local non notarisé est tout de même produit.

## Dépendances binaires

- yt-dlp 2026.08.19 est téléchargé au premier lancement, limité à des hôtes GitHub HTTPS et vérifié par SHA256.
- FFmpeg est fourni par `ffmpeg-static`. Les paquets Windows x64 embarquent explicitement le binaire PE vérifié par SHA256 afin de permettre un build croisé fiable depuis macOS. L’application teste l’encodeur matériel avant la conversion et repasse automatiquement sur libx264 si nécessaire.

`npm run dist:win` génère l’installateur NSIS x64. La variante autonome reste disponible avec `npx electron-builder --win portable --x64`.

## Légal

Respecte les conditions d’utilisation des plateformes et les droits d’auteur applicables. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) pour les composants distribués avec l’application.
