import { useEffect, useMemo, useState } from 'react';
import downloadConfig from '../shared/download-config.json';
import { formatDuration, formatSize } from './utils/formatters';

export default function App() {
  const [url, setUrl] = useState('');
  const [video, setVideo] = useState(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [outputDir, setOutputDir] = useState('');
  const [progress, setProgress] = useState({ ...downloadConfig.initialProgress });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [dependencyInfo, setDependencyInfo] = useState(null);
  const [showVideoOnly, setShowVideoOnly] = useState(true);

  useEffect(() => {
    const unsubscribe = window.desktopAPI.onDownloadProgress((payload) => {
      setProgress((previous) => ({ ...previous, ...payload }));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const deps = await window.desktopAPI.checkDependencies();
        setDependencyInfo(deps);
        setOutputDir((current) => current || deps.downloadsPath || '');
      } catch (initError) {
        setError(initError.message || 'Impossible d\'initialiser les dépendances.');
      }
    }

    init();
  }, []);

  const availableFormats = useMemo(() => {
    const formats = video?.formats || [];

    if (!showVideoOnly) {
      return formats;
    }

    return formats.filter((format) => format.hasVideo);
  }, [video, showVideoOnly]);

  async function handleAnalyze(event) {
    event.preventDefault();
    setLoadingVideo(true);
    setError('');
    setVideo(null);
    setSelectedFormat(null);

    try {
      const data = await window.desktopAPI.analyzeVideo(url.trim());
      setVideo(data);
    } catch (analyzeError) {
      setError(analyzeError.message || 'Erreur pendant l\'analyse de la vidéo.');
    } finally {
      setLoadingVideo(false);
    }
  }

  async function handlePickFolder() {
    try {
      const folder = await window.desktopAPI.selectOutputDir();
      if (folder) {
        setOutputDir(folder);
      }
    } catch (folderError) {
      setError(folderError.message || 'Impossible de sélectionner le dossier de sortie.');
    }
  }

  async function resolveTargetDirectory(forceAskOutput) {
    if (forceAskOutput) {
      const pickedFolder = await window.desktopAPI.selectOutputDir();
      if (!pickedFolder) {
        throw new Error('Téléchargement annulé: aucun dossier sélectionné.');
      }

      setOutputDir(pickedFolder);
      return pickedFolder;
    }

    const current = outputDir || dependencyInfo?.downloadsPath;
    if (current) {
      return current;
    }

    const pickedFolder = await window.desktopAPI.selectOutputDir();
    if (!pickedFolder) {
      throw new Error('Sélectionne un dossier de sortie.');
    }

    setOutputDir(pickedFolder);
    return pickedFolder;
  }

  async function runDownload(formatId, mergeAudioIfNeeded, forceAskOutput = false, hasVideo = true) {
    if (!url.trim()) {
      setError('Colle une URL YouTube valide.');
      return;
    }

    setError('');
    setDownloading(true);
    setProgress({ ...downloadConfig.initialProgress });

    try {
      const targetDir = await resolveTargetDirectory(forceAskOutput);

      await window.desktopAPI.startDownload({
        url: url.trim(),
        outputDir: targetDir,
        formatId,
        mergeAudioIfNeeded,
        hasVideo
      });

      setProgress((previous) => ({ ...previous, percent: 100, raw: 'Téléchargement terminé.' }));
    } catch (downloadError) {
      setError(downloadError.message || 'Le téléchargement a échoué.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleQuickDownload() {
    await runDownload(downloadConfig.quickDownloadFormatSelector, false, false, true);
  }

  async function handleManualDownload() {
    if (!selectedFormat) {
      setError('Sélectionne un format.');
      return;
    }

    if (!selectedFormat.hasVideo) {
      setError('Mode MP4 uniquement: sélectionne un format vidéo.');
      return;
    }

    await runDownload(selectedFormat.id, selectedFormat.hasVideo && !selectedFormat.hasAudio, true, selectedFormat.hasVideo);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0f172a_0%,#020617_55%,#000_100%)] px-6 py-8 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-2xl border border-cyan-500/20 bg-slate-900/60 p-6 shadow-[0_0_80px_-45px_rgba(34,211,238,0.85)] backdrop-blur-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/favicon.png" alt="Logo YouTube Downloader" className="h-10 w-10 rounded-full object-cover" />
              <h1 className="text-3xl font-black tracking-tight text-cyan-300">YouTube Downloader</h1>
            </div>
            <p className="text-xs text-slate-400">Desktop portable pour Windows et macOS</p>
          </div>

          <form className="grid gap-3" onSubmit={handleAnalyze}>
            <input
              type="url"
              required
              placeholder="Colle l'URL YouTube ici"
              className="w-full rounded-xl border border-cyan-500/25 bg-slate-950/80 px-4 py-3 text-sm outline-none transition focus:border-cyan-300"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleQuickDownload}
                disabled={downloading || !url.trim()}
                className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading ? 'Téléchargement...' : 'Téléchargement direct'}
              </button>

              <button
                type="submit"
                disabled={loadingVideo || downloading || !url.trim()}
                className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingVideo ? 'Analyse...' : 'Analyser les formats'}
              </button>

              <button
                type="button"
                onClick={handlePickFolder}
                className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
              >
                Choisir dossier
              </button>

              <span className="text-xs text-slate-400">{outputDir || 'Aucun dossier sélectionné'}</span>
            </div>
          </form>

          {dependencyInfo && (
            <p className="mt-3 text-xs text-slate-400">
              yt-dlp {dependencyInfo.ytDlpVersion} | {dependencyInfo.ffmpegVersion}
            </p>
          )}

          <div className="mt-4">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-cyan-400 transition-all"
                style={{ width: `${Math.max(0, Math.min(progress.percent || 0, 100))}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {progress.raw || 'Aucun téléchargement en cours'}
              {progress.speed ? ` | Vitesse: ${progress.speed}` : ''}
              {progress.eta ? ` | ETA: ${progress.eta}` : ''}
            </p>
          </div>

          {error && <p className="mt-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        </section>

        {video && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              {video.thumbnail && (
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="h-40 w-full max-w-sm rounded-xl object-cover md:h-36"
                />
              )}
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white">{video.title}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {video.uploader || 'Chaîne inconnue'} | Durée: {formatDuration(video.duration)}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={showVideoOnly}
                      onChange={(event) => setShowVideoOnly(event.target.checked)}
                    />
                    Formats vidéo uniquement
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Choix</th>
                      <th className="px-3 py-2">Résolution</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Conteneur</th>
                      <th className="px-3 py-2">FPS</th>
                      <th className="px-3 py-2">Taille</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableFormats.map((format) => {
                      const mediaType = format.hasVideo && format.hasAudio
                        ? 'Vidéo + Audio'
                        : format.hasVideo
                          ? 'Vidéo seule (audio fusionné au téléchargement)'
                          : 'Audio seul';

                      return (
                        <tr key={format.id} className="border-t border-slate-800/70 text-slate-200">
                          <td className="px-3 py-2">
                            <input
                              type="radio"
                              name="format"
                              checked={selectedFormat?.id === format.id}
                              onChange={() => setSelectedFormat(format)}
                            />
                          </td>
                          <td className="px-3 py-2">{format.resolution}</td>
                          <td className="px-3 py-2 text-xs text-slate-300">{mediaType}</td>
                          <td className="px-3 py-2 uppercase">{format.ext}</td>
                          <td className="px-3 py-2">{format.fps || '-'}</td>
                          <td className="px-3 py-2">{formatSize(format.fileSizeText)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleManualDownload}
                disabled={downloading || !selectedFormat}
                className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading ? 'Téléchargement...' : 'Télécharger ce format'}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
