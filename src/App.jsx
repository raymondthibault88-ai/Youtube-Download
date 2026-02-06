import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import downloadConfig from '../shared/download-config.json';
import { formatDuration, formatSize } from '../shared/formatters.js';
import logo from './assets/logo.png';

const FormatRow = memo(function FormatRow({ format, isSelected, onSelect }) {
  const mediaType = format.hasVideo && format.hasAudio
    ? 'Vidéo + Audio'
    : format.hasVideo
      ? 'Vidéo seule'
      : 'Audio seul';

  return (
    <tr className={isSelected ? 'is-active' : ''}>
      <td>
        <input
          type="radio"
          name="format"
          checked={isSelected}
          onChange={() => onSelect(format)}
        />
      </td>
      <td>{format.resolution}</td>
      <td>{mediaType}</td>
      <td className="uppercase">{format.ext}</td>
      <td>{format.fps || '-'}</td>
      <td>{formatSize(format.fileSizeText)}</td>
    </tr>
  );
});

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
  const lastAnalyzeRef = useRef({ url: '', data: null });
  const hasOpenedFolderRef = useRef(false);
  const urlInputRef = useRef(null);

  const handleSelectFormat = useCallback((format) => {
    setSelectedFormat(format);
  }, []);

  useEffect(() => {
    const savedOutput = window.localStorage.getItem('outputDir');
    if (savedOutput) {
      setOutputDir(savedOutput);
    }
  }, []);

  useEffect(() => {
    if (!window.desktopAPI) {
      setError('Le bridge Electron (preload) est indisponible.');
      return undefined;
    }

    const unsubscribe = window.desktopAPI.onDownloadProgress((payload) => {
      setProgress((previous) => ({ ...previous, ...payload }));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!window.desktopAPI) {
      return undefined;
    }

    let cancelled = false;
    let idleId = null;
    let timeoutId = null;

    async function init() {
      try {
        const deps = await window.desktopAPI.checkDependencies();
        if (cancelled) return;
        setDependencyInfo(deps);
        setOutputDir((current) => current || deps.downloadsPath || '');
      } catch (initError) {
        if (cancelled) return;
        setError(initError.message || 'Impossible d\'initialiser les dépendances.');
      }
    }

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(init, { timeout: 2000 });
    } else {
      timeoutId = setTimeout(init, 300);
    }

    return () => {
      cancelled = true;
      if (idleId !== null) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const availableFormats = useMemo(() => {
    const formats = video?.formats || [];
    return formats.filter((format) => format.hasVideo);
  }, [video]);

  async function handleAnalyze(event) {
    event.preventDefault();
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError('Colle une URL YouTube valide.');
      return;
    }

    setLoadingVideo(true);
    setError('');
    setVideo(null);
    setSelectedFormat(null);

    try {
      if (lastAnalyzeRef.current.url === normalizedUrl && lastAnalyzeRef.current.data) {
        const cachedData = lastAnalyzeRef.current.data;
        setVideo(cachedData);
        const cachedBest = cachedData?.formats?.[0];
        if (cachedBest) {
          setSelectedFormat(cachedBest);
        }
        setLoadingVideo(false);
        return;
      }

      const data = await window.desktopAPI.analyzeVideo(normalizedUrl);
      lastAnalyzeRef.current = { url: normalizedUrl, data };
      setVideo(data);
      const bestFormat = data?.formats?.[0];
      if (bestFormat) {
        setSelectedFormat(bestFormat);
      }
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
        window.localStorage.setItem('outputDir', folder);
      }
    } catch (folderError) {
      setError(folderError.message || 'Impossible de sélectionner le dossier de sortie.');
    }
  }

  async function handlePasteUrl() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        urlInputRef.current?.focus();
      }
    } catch (pasteError) {
      setError(pasteError.message || 'Impossible de lire le presse-papier.');
    }
  }

  async function resolveTargetDirectory(forceAskOutput) {
    if (forceAskOutput) {
      const pickedFolder = await window.desktopAPI.selectOutputDir();
      if (!pickedFolder) {
        throw new Error('Téléchargement annulé: aucun dossier sélectionné.');
      }

      setOutputDir(pickedFolder);
      window.localStorage.setItem('outputDir', pickedFolder);
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
    window.localStorage.setItem('outputDir', pickedFolder);
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
      hasOpenedFolderRef.current = false;
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

  const progressPercent = useMemo(
    () => Math.max(0, Math.min(progress.percent || 0, 100)),
    [progress.percent]
  );
  const progressLabel = useMemo(
    () => progress.raw || 'Aucun téléchargement en cours',
    [progress.raw]
  );
  const progressDetails = useMemo(
    () => [
      progress.speed ? `Vitesse: ${progress.speed}` : null,
      progress.eta ? `ETA: ${progress.eta}` : null
    ].filter(Boolean).join(' · '),
    [progress.speed, progress.eta]
  );

  const appStatus = downloading
    ? 'Téléchargement en cours'
    : loadingVideo
      ? 'Analyse en cours'
      : 'Prêt';

  const selectedFormatSummary = useMemo(() => {
    if (!selectedFormat) return null;
    const mediaType = selectedFormat.hasVideo && selectedFormat.hasAudio
      ? 'Vidéo + Audio'
      : selectedFormat.hasVideo
        ? 'Vidéo seule'
        : 'Audio seul';
    const details = [
      selectedFormat.resolution,
      mediaType,
      selectedFormat.ext?.toUpperCase()
    ].filter(Boolean);
    const size = formatSize(selectedFormat.fileSizeText);
    return `${details.join(' · ')}${size ? ` · ${size}` : ''}`;
  }, [selectedFormat]);

  useEffect(() => {
    if (!progress?.raw || hasOpenedFolderRef.current) return;
    if (progress.percent >= 100) {
      const targetDir = outputDir || dependencyInfo?.downloadsPath;
      if (targetDir) {
        hasOpenedFolderRef.current = true;
        window.desktopAPI.openPath(targetDir);
      }
    }
  }, [progress, outputDir, dependencyInfo]);

  const actionLabel = loadingVideo ? 'Analyse...' : 'Analyser les formats';
  const progressMarker = Math.max(6, Math.min(progressPercent, 100));

  return (
    <main className="app-shell">
      <div className="app-glow" aria-hidden="true" />

      <div className="layout">
        <section className="panel hero-panel reveal-up">
          <div className="hero-header">
            <div className="brand-block">
              <img src={logo} alt="Logo YouTube Downloader" className="brand-logo" />
              <div>
                <h1>YouTube Downloader</h1>
                <p>Interface desktop simple pour Windows et macOS</p>
              </div>
            </div>
            <span className="status-chip">{appStatus}</span>
          </div>

          <form className="tool-form" onSubmit={handleAnalyze}>
            <label className="field-label" htmlFor="url-input">URL vidéo</label>
            <div className="control-row">
              <div className="input-stack">
                <input
                  id="url-input"
                  type="url"
                  required
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="url-input"
                  value={url}
                  ref={urlInputRef}
                  onChange={(event) => setUrl(event.target.value)}
                />
                <div className="action-row">
                  <button
                    type="submit"
                    disabled={loadingVideo || downloading || !url.trim()}
                    className={`btn btn-strong ${loadingVideo ? 'is-loading' : ''}`}
                  >
                    {loadingVideo && <span className="btn-spinner" aria-hidden="true" />}
                    {actionLabel}
                  </button>

                  <button
                    type="button"
                    onClick={handlePasteUrl}
                    className="btn btn-subtle"
                  >
                    Coller
                  </button>

                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="btn btn-subtle"
                  >
                    Choisir dossier
                  </button>
                </div>
              </div>

              <div className="path-box compact" title={outputDir || 'Aucun dossier sélectionné'}>
                <span className="meta-label">Destination</span>
                <span className="path-value">{outputDir || 'Aucun dossier sélectionné'}</span>
                <button type="button" className="link-btn" onClick={handlePickFolder}>
                  Modifier
                </button>
              </div>
            </div>
          </form>

          <div className="meta-row">
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
              <span className="progress-marker" style={{ left: `${progressMarker}%` }} />
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
                    loading="lazy"
                    decoding="async"
                    width={320}
                    height={180}
                  />
                )}
                <h2>
                  {video.title}
                  {selectedFormatSummary && (
                    <span className="badge">{selectedFormatSummary}</span>
                  )}
                </h2>
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
                      {availableFormats.map((format) => (
                        <FormatRow
                          key={format.id}
                          format={format}
                          isSelected={selectedFormat?.id === format.id}
                          onSelect={handleSelectFormat}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="formats-actions">
                  {selectedFormatSummary && (
                    <p className="format-summary">{selectedFormatSummary}</p>
                  )}
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

        {!video && (
          <section className="panel reveal-up delay-1 empty-panel">
            <div className="empty-state">
              <h3>Prêt à analyser une vidéo</h3>
              <p>Colle une URL YouTube, lance l'analyse et choisis le format idéal.</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
