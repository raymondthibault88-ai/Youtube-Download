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
| FFmpeg / ffmpeg-static | Le binaire Windows installé pour cette V5 est FFmpeg 6.1.1, build Gyan essentials avec GPL v3 et x264. `ffmpeg-static` est sous GPL v3. |
| yt-dlp | Le code du projet est sous Unlicense. Les exécutables autonomes Windows et macOS téléchargés par l’application incluent des composants tiers ; l’ensemble PyInstaller est sous GPLv3+, selon les notices de yt-dlp. |

`licenses/THIRD_PARTY_PACKAGES.json` répertorie les versions, licences déclarées, dépôts sources et chemins des textes de licence des paquets installés. Ces textes sont copiés sans modification dans `licenses/npm/` avant chaque build. Les fichiers de licence FFmpeg ainsi que le README du fournisseur décrivant la compilation sont également inclus lorsqu’ils accompagnent le binaire installé. Une future mise à jour des paquets ou un build sur une autre plateforme doit régénérer cet inventaire.

## Sources et informations des binaires

- [FFmpeg : sources du build Windows 6.1.1](https://github.com/FFmpeg/FFmpeg/commit/e38092ef93) ; configuration et versions des bibliothèques dans `licenses/FFmpeg-win32-x64-BUILD.txt` pour le build Windows de cette V5.
- [ffmpeg-static : sources de l’empaquetage](https://github.com/eugeneware/ffmpeg-static) et [binaires b6.1.1](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1).
- [Gyan : fournisseur du build Windows](https://www.gyan.dev/ffmpeg/builds/) et [informations de licence FFmpeg](https://ffmpeg.org/legal.html).
- [yt-dlp 2026.08.19 : sources](https://github.com/yt-dlp/yt-dlp/tree/2026.08.19), [licences des exécutables](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/README.md#licensing) et [notices tierces de cette version](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/THIRD_PARTY_LICENSES.txt).

FFmpeg et yt-dlp sont appelés comme programmes distincts. Leurs licences ne sont pas remplacées par la licence du code de l’interface. Toute redistribution publique de binaires GPL doit conserver les avis applicables et fournir le code source correspondant, y compris celui des composants liés, selon les conditions de leurs licences. Les liens et l’inventaire ci-dessus documentent la provenance ; ils ne constituent pas à eux seuls une archive complète des sources correspondantes.
