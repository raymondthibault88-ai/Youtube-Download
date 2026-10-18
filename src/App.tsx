import { useCallback, useEffect, useRef, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { ArrowDownToLine, FileVideo } from "lucide-react";
import { version } from "../package.json";
import AboutDialog from "./components/AboutDialog";
import ConverterPanel from "./components/ConverterPanel";
import HeroPanel from "./components/HeroPanel";
import JobStatus from "./components/JobStatus";
import OutputCard from "./components/OutputCard";
import VideoPanel from "./components/VideoPanel";
import BrandMark from "./components/ui/BrandMark";
import Notice from "./components/ui/Notice";
import useDependencyInfo from "./hooks/useDependencyInfo";
import useMediaJob from "./hooks/useMediaJob";
import useSplash from "./hooks/useSplash";
import useStartupInfo from "./hooks/useStartupInfo";
import useVideoAnalyze from "./hooks/useVideoAnalyze";
import { readClipboard, revealPath, startDownload } from "./services/desktopApi";
import { getStoredOutputDir, pickOutputDir } from "./services/outputDirectory";
import { getErrorMessage, isCancellationError } from "./utils/errors";
import { qualityLabel } from "./utils/media";

export default function App() {
  const [mode, setMode] = useState("download");
  const [outputDir, setOutputDir] = useState(getStoredOutputDir);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { job, pendingType, busy, run, clear, cancel } = useMediaJob();
  const analysis = useVideoAnalyze({ setError });
  const changeUrl = analysis.setUrl;
  useSplash();
  useStartupInfo({ setOutputDir, setError });
  const { dependencyInfo, requestDependencyInfo, isChecking } = useDependencyInfo({ setOutputDir, setError });
  useEffect(() => { void requestDependencyInfo(); }, [requestDependencyInfo]);

  const onPickFolder = useCallback(async () => {
    if (busy) return;
    try { const folder = await pickOutputDir(); if (folder) setOutputDir(folder); }
    catch (caught) { setError(getErrorMessage(caught, "Impossible de sélectionner ce dossier.")); }
  }, [busy]);
  const onPaste = useCallback(async () => {
    if (busy) return;
    try { const text = await readClipboard(); if (text) { changeUrl(text); clear(); inputRef.current?.focus(); } }
    catch (caught) { setError(getErrorMessage(caught, "Impossible de coller ce lien. Vous pouvez le saisir dans le champ.")); }
  }, [changeUrl, busy, clear]);
  const onReveal = useCallback(async (filePath: string) => {
    try {
      const result = await revealPath(filePath);
      if (!result.ok) throw new Error(result.error || "Impossible d’afficher le fichier.");
    } catch (caught) { setError(getErrorMessage(caught, "Le fichier est enregistré, mais son dossier n’a pas pu être ouvert.")); }
  }, []);
  const download = async () => {
    const format = analysis.selectedFormat;
    if (!analysis.video || !format || busy || analysis.loadingVideo) return;
    const sourceUrl = analysis.url.trim();
    setError(""); setDownloading(true);
    try {
      const result = await run("download", async () => {
        await requestDependencyInfo();
        const targetDir = outputDir || dependencyInfo?.downloadsPath || await pickOutputDir();
        if (!targetDir) { const cancelled = new Error("Opération annulée."); cancelled.name = "AbortError"; throw cancelled; }
        setOutputDir(targetDir);
        return startDownload({ url: sourceUrl, outputDir: targetDir, formatId: format.id, mergeAudioIfNeeded: format.hasVideo && !format.hasAudio, hasVideo: format.hasVideo, hasAudio: format.hasAudio, shouldRecodeToMp4: format.ext?.toLowerCase() !== "mp4" || !format.quickTimeCompatible });
      });
      await onReveal(result.outputPath);
    } catch (caught) { if (!isCancellationError(caught)) setError(getErrorMessage(caught, "Le téléchargement n’a pas pu aboutir.")); }
    finally { setDownloading(false); }
  };
  return <div className="app-shell">
    <a href="#workspace" className="skip-link">Aller à l’espace de travail</a>
    <header className="app-header">
      <div className="brand"><BrandMark className="brand-mark" /><h1 className="brand-name">YouTube Downloader</h1><span className="version-tag">V{version.split(".").slice(0, 2).join(".")}</span></div>
      <div className="header-actions">
        {isChecking && !dependencyInfo && <span className="app-status is-working" role="status"><span />Préparation des outils…</span>}
        <AboutDialog info={dependencyInfo} checking={isChecking} onCheck={() => void requestDependencyInfo(true)} busy={busy || analysis.loadingVideo} />
      </div>
    </header>
    <main className="main-content">
      <Tabs.Root value={mode} onValueChange={(value) => { if (value === "convert" && analysis.loadingVideo) analysis.cancelAnalysis(); setMode(String(value)); setError(""); }} className="workflow-tabs">
        <div className="workspace-toolbar"><Tabs.List activateOnFocus className="mode-tabs" aria-label="Que souhaitez-vous faire ?"><Tabs.Tab value="download" className="mode-tab"><ArrowDownToLine size={17} aria-hidden="true" />Télécharger</Tabs.Tab><Tabs.Tab value="convert" className="mode-tab"><FileVideo size={17} aria-hidden="true" />Convertir / compresser</Tabs.Tab></Tabs.List></div>
        <div id="workspace">
          <Tabs.Panel value="download" keepMounted className="workflow-panel"><div className="workspace"><section className="source-card" aria-label="Vidéo à télécharger"><HeroPanel url={analysis.url} inputRef={inputRef} onUrlChange={(url) => { analysis.setUrl(url); clear(); }} onAnalyze={(event) => { if (!busy) void analysis.analyze(event); else event.preventDefault(); }} onPaste={() => void onPaste()} onCancelAnalyze={analysis.cancelAnalysis} loading={analysis.loadingVideo} busy={busy} video={analysis.video} />{analysis.video && <VideoPanel formats={analysis.video.formats || []} selected={analysis.selectedFormat} onSelect={analysis.setSelectedFormat} disabled={busy} />}</section><OutputCard ready={Boolean(analysis.video && analysis.selectedFormat)} quality={qualityLabel(analysis.selectedFormat?.resolution)} outputDir={outputDir} onPickFolder={() => void onPickFolder()} onStart={() => void download()} disabled={!analysis.video || !analysis.selectedFormat || busy || analysis.loadingVideo} busy={busy} action={downloading ? "Téléchargement en cours…" : "Télécharger la vidéo"} /></div></Tabs.Panel>
          <Tabs.Panel value="convert" keepMounted className="workflow-panel"><ConverterPanel outputDir={outputDir} onPickFolder={() => void onPickFolder()} busy={busy || analysis.loadingVideo} run={run} onError={setError} onSourceChange={clear} /></Tabs.Panel>
        </div>
      </Tabs.Root>
      <Notice error={error || (job?.state === "failed" ? job.error || "Le traitement n’a pas pu aboutir." : "")} onDismiss={() => { setError(""); if (job?.state === "failed") clear(); }} />
      <JobStatus job={job} pendingType={pendingType} onCancel={() => { void cancel().catch((caught) => setError(getErrorMessage(caught, "Impossible d’annuler le traitement."))); }} onReveal={(filePath) => void onReveal(filePath)} onDismiss={clear} />
    </main>
  </div>;
}
