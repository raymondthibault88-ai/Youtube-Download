import { useState } from "react";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { ArrowRight, Check, FileVideo, Minimize2, ShieldCheck } from "lucide-react";
import { formatBytes, formatDuration } from "../../shared/formatters.js";
import { selectVideoFile, startConversion } from "../services/desktopApi";
import type { SelectedVideoFile } from "../types";
import type { RunMediaJob } from "../hooks/useMediaJob";
import { getErrorMessage, isCancellationError } from "../utils/errors";
import OutputCard from "./OutputCard";

interface ConverterPanelProps {
  outputDir: string;
  onPickFolder: () => void;
  busy: boolean;
  run: RunMediaJob;
  onError: (message: string) => void;
  onSourceChange: () => void;
}
const profiles = [
  { id: "balanced", title: "Modérée" },
  { id: "compact", title: "Forte" }
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
  const compressing = profileId !== "fast";
  const profileLabel = compressing ? `Compression ${profileId === "compact" ? "forte" : "modérée"}` : "Conversion rapide";
  const sizeChange = file && file.size > 0 && estimatedSize ? Math.round((1 - estimatedSize / file.size) * 100) : null;
  const sizeChangeLabel = sizeChange === null ? null : sizeChange === 0 ? "Taille similaire" : `≈ ${Math.abs(sizeChange)} % ${sizeChange > 0 ? "de moins" : "de plus"}`;
  const quality = targetHeight ? `${targetHeight}p` : file ? `${file.height}p` : undefined;
  return <div className="workspace">
    <section className="source-card" aria-label="Vidéo à convertir">
      <div className={file ? "sr-only" : "section-heading"}><h2>Convertir ou compresser une vidéo</h2></div>
      {file ? <>
        <div className="local-file"><span className="local-file-icon"><FileVideo size={27} aria-hidden="true" /></span><div><h3>{file.name}</h3><p>{formatBytes(file.size)} · {formatDuration(file.duration)} · {file.width} × {file.height}</p></div><button type="button" className="text-button" onClick={select} disabled={busy || selecting}>{selecting ? "Lecture…" : "Changer"}</button></div>
        <div className="conversion-settings">
          <div className="setting-row">
            <h3 id="intent-label">Action</h3>
            <RadioGroup className="intent-options" value={compressing ? "compress" : "convert"} onValueChange={(value) => setProfileId(value === "convert" ? "fast" : profileId === "compact" ? "compact" : "balanced")} disabled={busy || selecting} aria-labelledby="intent-label">
              <Radio.Root className="intent-option" value="convert" aria-label="Convertir en MP4"><FileVideo size={16} aria-hidden="true" /><span>Convertir en MP4</span></Radio.Root>
              <Radio.Root className="intent-option" value="compress" aria-label="Compresser"><Minimize2 size={16} aria-hidden="true" /><span>Compresser</span></Radio.Root>
            </RadioGroup>
          </div>
          {compressing && <div className="setting-row">
            <h3 id="compression-label">Compression</h3>
            <RadioGroup className="inline-options" value={profileId} onValueChange={(value) => setProfileId(value)} disabled={busy || selecting} aria-labelledby="compression-label" aria-describedby="compression-help">{profiles.map((entry) => <Radio.Root className="inline-option" value={entry.id} key={entry.id}><span className="radio-indicator"><Check size={12} aria-hidden="true" /></span><span>{entry.title}</span></Radio.Root>)}</RadioGroup>
            <p id="compression-help" className="setting-help">Une compression plus forte peut réduire la qualité.</p>
          </div>}
          <div className="setting-row">
            <h3 id="resolution-label">Définition</h3>
            <RadioGroup className="inline-options" value={targetHeight === null ? "source" : String(targetHeight)} onValueChange={(value) => setTargetHeight(value === "source" ? null : Number(value))} disabled={busy || selecting} aria-labelledby="resolution-label">{file.outputOptions.map((option) => <Radio.Root key={option.height ?? "source"} className="inline-option" value={option.height === null ? "source" : String(option.height)} aria-label={option.height === null ? `Conserver la définition, ${file.height}p` : `${option.height}p`}><span className="radio-indicator"><Check size={12} aria-hidden="true" /></span><span>{option.height === null ? "Originale" : `${option.height}p`}</span>{option.height === null && <span className="option-meta">{file.height}p</span>}</Radio.Root>)}</RadioGroup>
          </div>
        </div>
        <div className="size-preview" role="group" aria-label="Comparaison du poids du fichier">
          <div><span>Avant</span><strong>{formatBytes(file.size) || "Non connu"}</strong></div><ArrowRight size={18} aria-hidden="true" /><div><span>Après estimé</span><strong>{estimatedSize ? `≈ ${formatBytes(estimatedSize)}` : "Non connu"}</strong></div>{sizeChangeLabel && <span className="size-change">{sizeChangeLabel}</span>}
        </div>
        {compressing && sizeChange !== null && sizeChange <= 0 && <p className="compression-no-gain">Pour un fichier plus petit, essayez une définition inférieure.</p>}
      </> : <div className="file-picker"><span className="file-picker-icon" aria-hidden="true"><FileVideo size={24} strokeWidth={1.5} /></span><div className="file-picker-content"><button type="button" className="button button-secondary" onClick={select} disabled={busy || selecting}>{selecting && <span className="spinner" aria-hidden="true" />}{selecting ? "Lecture…" : "Choisir une vidéo"}<ArrowRight size={16} aria-hidden="true" /></button><span className="supported-formats">MP4, MOV, MKV, AVI, WebM, MTS…</span></div></div>}
      <div className="source-note"><ShieldCheck size={17} aria-hidden="true" /><span>Original conservé</span></div>
    </section>
    <OutputCard ready={Boolean(file)} quality={quality} detail={profileLabel} estimatedSize={estimatedSize ? `≈ ${formatBytes(estimatedSize)}` : null} outputDir={outputDir} onPickFolder={onPickFolder} onStart={() => void convert()} disabled={!file || busy || selecting} busy={busy} action={converting ? "Traitement en cours…" : compressing ? "Compresser la vidéo" : "Convertir en MP4"} />
  </div>;
}
