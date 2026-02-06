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
    return formats.filter((format) => format.hasVideo);
  }, [video]);

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

  async function runDownload(formatId, mergeAudioIfNeeded, forceAskOutput = false, hasVideo = true, hasAudio = true) {
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
        hasVideo,
        hasAudio
      });

      setProgress((previous) => ({ ...previous, percent: 100, raw: 'Téléchargement terminé.' }));
    } catch (downloadError) {
      setError(downloadError.message || 'Le téléchargement a échoué.');
    } finally {
      setDownloading(false);
    }
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

    await runDownload(
      selectedFormat.id,
      selectedFormat.hasVideo && !selectedFormat.hasAudio,
      true,
      selectedFormat.hasVideo,
      selectedFormat.hasAudio
    );
  }

  const progressPercent = Math.max(0, Math.min(progress.percent || 0, 100));
  const progressLabel = progress.raw || 'Aucun téléchargement en cours';
  const progressDetails = [
    progress.speed ? `Vitesse: ${progress.speed}` : null,
    progress.eta ? `ETA: ${progress.eta}` : null
  ].filter(Boolean).join(' · ');

  const appStatus = downloading
    ? 'Téléchargement en cours'
    : loadingVideo
      ? 'Analyse en cours'
      : 'Prêt';

  return (
    <main className="app-shell">
      <div className="app-glow" aria-hidden="true" />

      <div className="layout">
        <section className="panel hero-panel reveal-up">
          <div className="hero-header">
            <div className="brand-block">
              <img src="/favicon.png" alt="Logo YouTube Downloader" className="brand-logo" />
              <div>
                <h1>YouTube Downloader</h1>
                <p>Interface desktop simple pour Windows et macOS</p>
              </div>
            </div>
            <span className="status-chip">{appStatus}</span>
          </div>

          <form className="tool-form" onSubmit={handleAnalyze}>
            <label className="field-label" htmlFor="url-input">URL vidéo</label>
            <input
              id="url-input"
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=..."
              className="url-input"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />

            <div className="action-row">
              <button
                type="submit"
                disabled={loadingVideo || downloading || !url.trim()}
                className="btn btn-strong"
              >
                {loadingVideo ? 'Analyse...' : 'Analyser les formats'}
              </button>

              <button
                type="button"
                onClick={handlePickFolder}
                className="btn btn-subtle"
              >
                Choisir dossier
              </button>
            </div>
          </form>

          <div className="meta-row">
            <div className="path-box" title={outputDir || 'Aucun dossier sélectionné'}>
              <span className="meta-label">Destination</span>
              <span className="path-value">{outputDir || 'Aucun dossier sélectionné'}</span>
            </div>

            {dependencyInfo && (
              <div className="dep-box">
                <span>yt-dlp {dependencyInfo.ytDlpVersion}</span>
                <span>ffmpeg {dependencyInfo.ffmpegVersion}</span>
              </div>
            )}
          </div>

          <div className="progress-block" aria-live="polite">
            <div className="progress-head">
              <span>{progressLabel}</span>
              <strong>{progressPercent}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            {progressDetails && <p className="progress-details">{progressDetails}</p>}
          </div>

          {error && <p className="error-box">{error}</p>}
        </section>

        {video && (
          <section className="panel reveal-up delay-1">
            <div className="video-grid">
              <aside className="video-summary">
                {video.thumbnail && (
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="video-thumb"
                  />
                )}
                <h2>{video.title}</h2>
                <p>{video.uploader || 'Chaîne inconnue'} · {formatDuration(video.duration)}</p>
              </aside>

              <div className="formats-box">
                <div className="formats-head">
                  <h3>Formats disponibles</h3>
                  <span>{availableFormats.length} résultat{availableFormats.length > 1 ? 's' : ''}</span>
                </div>

                <div className="table-wrap">
                  <table className="formats-table">
                    <thead>
                      <tr>
                        <th>Choix</th>
                        <th>Résolution</th>
                        <th>Type</th>
                        <th>Conteneur</th>
                        <th>FPS</th>
                        <th>Taille</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableFormats.map((format) => {
                        const mediaType = format.hasVideo && format.hasAudio
                          ? 'Vidéo + Audio'
                          : format.hasVideo
                            ? 'Vidéo seule'
                            : 'Audio seul';

                        const isSelected = selectedFormat?.id === format.id;

                        return (
                          <tr key={format.id} className={isSelected ? 'is-active' : ''}>
                            <td>
                              <input
                                type="radio"
                                name="format"
                                checked={isSelected}
                                onChange={() => setSelectedFormat(format)}
                              />
                            </td>
                            <td>{format.resolution}</td>
                            <td>{mediaType}</td>
                            <td className="uppercase">{format.ext}</td>
                            <td>{format.fps || '-'}</td>
                            <td>{formatSize(format.fileSizeText)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="formats-actions">
                  <button
                    type="button"
                    onClick={handleManualDownload}
                    disabled={downloading || !selectedFormat}
                    className="btn btn-strong"
                  >
                    {downloading ? 'Téléchargement...' : 'Télécharger ce format'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
