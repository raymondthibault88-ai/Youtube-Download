# Third-party notices

Cette application utilise Electron, React, yt-dlp et FFmpeg. Le code du projet est sous licence MIT, mais ces composants conservent leurs licences respectives.

FFmpeg est exécuté comme un programme séparé. Les paquets macOS embarquent FFmpeg 9.0.2 GPL version 3 ou ultérieure, compilé sans `--enable-nonfree` par [Martin Riedl](https://ffmpeg.martin-riedl.de/). Windows embarque FFmpeg 9.0.2 GPL version 3 ou ultérieure, compilé sans `--enable-nonfree` par [Gyan Doshi](https://www.gyan.dev/ffmpeg/builds/), avec les informations de construction et de sources du fournisseur. Les binaires contiennent notamment x264 et restent soumis à leurs licences propres.

Les textes de licence et les manifestes de provenance se trouvent dans `resources/ffmpeg/` dans les paquets. Les dossiers `build/ffmpeg/` du dépôt contiennent les mêmes informations. Les manifestes précisent les empreintes, les archives utilisées et les liens vers les informations de construction et les sources. Toute redistribution doit respecter les obligations de fourniture du code source correspondant pour FFmpeg et les bibliothèques incluses. Consulte les [informations FFmpeg](https://ffmpeg.org/legal.html) ; ces notices ne remplacent pas la fourniture de ces sources.

yt-dlp est distribué sous licence Unlicense. Electron, React et les autres dépendances npm conservent les licences déclarées dans leurs paquets.
