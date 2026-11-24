# Third-party notices

Le code propre à YouTube Downloader est sous licence MIT, reproduite dans `LICENSE`. Les composants suivants conservent leurs licences et notices d’origine.

| Composant | Licence / informations |
| --- | --- |
| Electron | MIT ; Chromium et les autres composants du runtime ont leurs propres notices, livrées avec Electron. |
| electron-updater et ses dépendances | MIT et licences des paquets concernés ; vérification et installation des mises à jour GitHub. |
| React et React DOM | MIT. |
| Base UI et ses dépendances | MIT et licences des paquets concernés. |
| Lucide | ISC, avec les avis MIT de Feather inclus par le projet. |
| Manrope | SIL Open Font License 1.1. La police est fournie localement. |
| FFmpeg | Les exécutables FFmpeg 9.0.2 proviennent du build Portable FFmpeg `ffmpeg-9.0.2-1`. Ils sont distribués sous GPL v3 ou ultérieure avec les avis associés. |
| yt-dlp | Le code du projet est sous Unlicense. Les exécutables autonomes Windows et macOS téléchargés par l’application incluent des composants tiers ; l’ensemble PyInstaller est sous GPLv3+, selon les notices de yt-dlp. |

`licenses/THIRD_PARTY_PACKAGES.json` répertorie les versions, licences déclarées, dépôts sources et chemins des textes de licence des paquets installés. Ces textes sont copiés sans modification dans `licenses/npm/` avant chaque build. Le dossier `ffmpeg` des ressources contient la licence, la provenance et les références du code source de FFmpeg. Les avis tiers complets sont fournis dans l’archive gzip `THIRD_PARTY_NOTICES.txt.gz`.

## Sources et informations des binaires

- [FFmpeg 9.0.2, archives binaires et sources correspondantes](https://github.com/mrkbac/portable-ffmpeg/releases/tag/ffmpeg-9.0.2-1) et [informations de licence FFmpeg](https://ffmpeg.org/legal.html).
- [Sources de yt-dlp 2026.11.23](https://github.com/yt-dlp/yt-dlp/tree/2026.11.23), [licences des exécutables](https://github.com/yt-dlp/yt-dlp/blob/2026.11.23/README.md#licensing) et [notices tierces de cette version](https://github.com/yt-dlp/yt-dlp/blob/2026.11.23/THIRD_PARTY_LICENSES.txt).

FFmpeg et yt-dlp sont appelés comme programmes distincts. Leurs licences ne sont pas remplacées par la licence du code de l’interface. Toute redistribution publique de binaires GPL doit conserver les avis applicables et fournir le code source correspondant, y compris celui des composants liés, selon les conditions de leurs licences. Les liens et l’inventaire ci-dessus documentent la provenance ; ils ne constituent pas à eux seuls une archive complète des sources correspondantes.
