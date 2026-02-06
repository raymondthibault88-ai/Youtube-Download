# YouTube Downloader (Windows + macOS)

Application desktop (Electron) avec interface React + Tailwind pour:
- coller une URL YouTube et lancer un téléchargement direct (meilleure qualité)
- analyser une URL YouTube
- afficher les formats/résolutions disponibles
- télécharger le format choisi
- fusionner automatiquement l'audio pour les formats vidéo-only

## Prérequis
- Node.js 20+
- npm

## Installation
```bash
npm install
```

## Développement
```bash
npm run dev
```

## Build frontend
```bash
npm run build
```

## Packaging desktop
```bash
npm run dist
```

Sorties:
- Windows: `release/` (cible `portable` + `nsis`)
- macOS: `release/` (`dmg` + `zip`)

## Notes techniques
- `yt-dlp` est téléchargé automatiquement au premier lancement dans le dossier utilisateur de l'application.
- `ffmpeg` est embarqué via `ffmpeg-static`.

## Remarques légales
Tu dois respecter les CGU de YouTube et les droits d'auteur applicables dans ton pays.
