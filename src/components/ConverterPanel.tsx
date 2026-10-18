import { useState } from "react";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { ArrowRight, Check, FileVideo, ShieldCheck } from "lucide-react";
import { formatBytes, formatDuration } from "../../shared/formatters.js";
import { selectVideoFile, startConversion } from "../services/desktopApi";
import type { SelectedVideoFile } from "../types";
import type { RunMediaJob } from "../hooks/useMediaJob";
import { getErrorMessage, isCancellationError } from "../utils/errors";
import OutputCard from "./OutputCard";
import Disclosure from "./ui/Disclosure";

interface ConverterPanelProps {
  outputDir: string;
  onPickFolder: () => void;
  busy: boolean;
  run: RunMediaJob;
  onError: (message: string) => void;
  onSourceChange: () => void;
}
const profiles = [
  { id: "fast", title: "Rapide", description: "Traitement rapide." },
  { id: "balanced", title: "Équilibré", description: "Taille et rapidité." },
  { id: "compact", title: "Plus léger", description: "Compression renforcée." }
] as const;

export default function ConverterPanel({ outputDir, onPickFolder, busy, run, onError, onSourceChange }: ConverterPanelProps) {
  const [file, setFile] = useState<SelectedVideoFile | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<"fast" | "balanced" | "compact">("fast");
  const [converting, setConverting] = useState(false);
  const select = async () => {
    if (busy || selecting) return;
    setSelecting(true); onError("");
    try {
      const selected = await selectVideoFile();
      if (selected) { setFile(selected); setTargetHeight(null); setProfileId("fast"); onSourceChange(); }
    } catch (error) { onError(getErrorMessage(error, "Impossible de lire ce fichier vidéo.")); }
    finally { setSelecting(false); }
  };
  const convert = async () => {
    if (!file || busy || selecting) return;
    setConverting(true); onError("");
    try { await run("conversion", () => startConversion({ inputPath: file.path, outputDir, targetHeight, profileId })); }
    catch (error) { if (!isCancellationError(error)) onError(getErrorMessage(error, "La conversion n’a pas pu aboutir.")); }
    finally { setConverting(false); }
  };
  const estimatedSize = file?.outputOptions.find((option) => option.height === targetHeight)?.estimates[profileId];
  const profile = profiles.find((entry) => entry.id === profileId);
  const quality = targetHeight ? `${targetHeight}p` : file ? `${file.height}p` : undefined;
  return <div className="workspace">
    <section className="source-card" aria-label="Vidéo à convertir">
      <div className={file ? "sr-only" : "section-heading"}><h2>Fichier source</h2></div>
      {file ? <>
        <div className="local-file"><span className="local-file-icon"><FileVideo size={27} aria-hidden="true" /></span><div><h3>{file.name}</h3><p>{formatBytes(file.size)} · {formatDuration(file.duration)} · {file.width} × {file.height}</p></div><button type="button" className="text-button" onClick={select} disabled={busy || selecting}>{selecting ? "Lecture…" : "Changer"}</button></div>
        <div className="conversion-options"><h3 id="resolution-label">Qualité</h3><RadioGroup className="quality-options conversion-qualities" value={targetHeight === null ? "source" : String(targetHeight)} onValueChange={(value) => setTargetHeight(value === "source" ? null : Number(value))} disabled={busy || selecting} aria-labelledby="resolution-label">{file.outputOptions.map((option) => <Radio.Root key={option.height ?? "source"} className="quality-option" value={option.height === null ? "source" : String(option.height)} aria-label={option.height === null ? `Conserver la définition, ${file.height}p` : `${option.height}p`}><span className="quality-option-top"><span>{option.height === null ? "Conserver" : `${option.height}p`}</span><span className="radio-indicator"><Check size={12} aria-hidden="true" /></span></span><span className="quality-description">{option.height === null ? `${file.height}p` : option.estimates[profileId] ? `≈ ${formatBytes(option.estimates[profileId])}` : "Taille non connue"}</span></Radio.Root>)}</RadioGroup></div>
        <Disclosure title="Personnaliser la conversion"><h3 id="profile-label" className="sr-only">Profil</h3><RadioGroup className="profile-options" value={profileId} onValueChange={(value) => setProfileId(value)} disabled={busy || selecting} aria-labelledby="profile-label">{profiles.map((entry) => <Radio.Root className="profile-option" value={entry.id} key={entry.id}><span className="radio-indicator"><Check size={12} aria-hidden="true" /></span><span><strong>{entry.title}</strong><span>{entry.description}</span></span></Radio.Root>)}</RadioGroup></Disclosure>
      </> : <div className="file-picker"><span className="file-picker-icon" aria-hidden="true"><FileVideo size={24} strokeWidth={1.5} /></span><div className="file-picker-content"><button type="button" className="button button-secondary" onClick={select} disabled={busy || selecting}>{selecting && <span className="spinner" aria-hidden="true" />}{selecting ? "Lecture…" : "Choisir une vidéo"}<ArrowRight size={16} aria-hidden="true" /></button><span className="supported-formats">MP4, MOV, MKV, AVI, WebM, MTS…</span></div></div>}
      <div className="source-note"><ShieldCheck size={17} aria-hidden="true" /><span>Original conservé</span></div>
    </section>
    <OutputCard ready={Boolean(file)} quality={quality} detail={profile?.title} estimatedSize={estimatedSize ? `≈ ${formatBytes(estimatedSize)}` : null} outputDir={outputDir} onPickFolder={onPickFolder} onStart={() => void convert()} disabled={!file || busy || selecting} busy={busy} action={converting ? "Conversion en cours…" : "Créer mon MP4"} />
  </div>;
}
