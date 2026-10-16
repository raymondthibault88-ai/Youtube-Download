import type { CompletedActivity } from "../utils/results";
import { fileName } from "../utils/results";
import { revealPath } from "../services/desktopApi";
import { getErrorMessage } from "../utils/errors";
import Icon from "./ui/Icon";

export default function ResultCard({ result, onError, onDismiss }: { result: CompletedActivity; onError: (message: string) => void; onDismiss: () => void }) {
  const directory = result.outputPath.replace(/[\\/][^\\/]+$/, "");
  const reveal = async () => {
    try {
      const response = await revealPath(result.outputPath);
      if (!response.ok) throw new Error(response.error || "Impossible d’afficher le fichier.");
    } catch (error) { onError(getErrorMessage(error, "Impossible d’afficher le fichier.")); }
  };
  return <section className="success-box" role="status" aria-live="polite">
    <span className="result-icon"><Icon name="check" /></span>
    <div className="result-copy">
      <span className="meta-label">{result.type === "download" ? "Dernier téléchargement" : "Dernière conversion"}</span>
      <strong>{result.type === "download" ? "Téléchargement terminé" : "Vidéo prête"}</strong>
      <p className="result-filename">{fileName(result.outputPath)}</p>
      <p>{result.description}</p>
      {result.sizeSummary && <p>{result.sizeSummary}</p>}
      <details className="result-directory"><summary>Dossier du fichier</summary><p>{directory}</p></details>
    </div>
    <div className="result-actions">
      <button type="button" className="btn btn-ghost" onClick={() => void reveal()}><Icon name="folder" />Afficher le fichier</button>
      <button type="button" className="icon-button" aria-label="Fermer le résultat" onClick={onDismiss}><Icon name="close" /></button>
    </div>
  </section>;
}
