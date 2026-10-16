import { memo, useState } from "react";
import type { VideoFormat } from "../../types/video";
import FormatRow from "./FormatRow";

interface FormatsTableProps {
  formats: VideoFormat[];
  selectedFormatId: string | null;
  onSelectFormat: (format: VideoFormat) => void;
  selectedFormatSummary: string | null;
  onDownload: () => void;
  downloading: boolean;
  mediaBusy: boolean;
}

const FormatsTable = memo(function FormatsTable({
  formats,
  selectedFormatId,
  onSelectFormat,
  selectedFormatSummary,
  onDownload,
  downloading,
  mediaBusy
}: FormatsTableProps) {
  const [showDetails, setShowDetails] = useState(false);
  const locked = downloading || mediaBusy;
  return (
    <div className="formats-box">
      <div className="formats-head">
        <h3>Choisir la qualité</h3>
        <label className="technical-toggle"><input type="checkbox" checked={showDetails} onChange={event => setShowDetails(event.target.checked)} />Détails techniques</label>
        <span className="sr-only">
          {formats.length} résultat{formats.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="table-wrap">
        <table className={`formats-table ${showDetails ? "has-details" : ""}`}>
          <thead>
            <tr>
              <th>Qualité</th>
              <th>Fichier obtenu</th>
              <th>Préparation</th>
              <th>Poids source</th>
              {showDetails && <><th>Source</th><th>Images/s</th></>}
            </tr>
          </thead>
          <tbody>
            {formats.map((format) => (
              <FormatRow
                key={format.id}
                format={format}
                isSelected={selectedFormatId === format.id}
                disabled={locked || !format.hasVideo}
                showDetails={showDetails}
                onSelect={onSelectFormat}
              />
            ))}
          </tbody>
        </table>
        {!formats.length && <p className="formats-empty" role="status">Aucune qualité vidéo disponible. Essaie un autre lien ou relance l’analyse.</p>}
      </div>
      <p className="formats-help">Le poids indiqué est celui du flux source. La taille du MP4 final peut varier après ajout du son ou conversion.</p>

      <div className="formats-actions">
        {selectedFormatSummary && (
          <p className="format-summary">{selectedFormatSummary}</p>
        )}
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading || mediaBusy || !selectedFormatId}
          className="btn btn-primary"
        >
          {downloading ? "Téléchargement…" : mediaBusy ? "Une tâche est en cours" : "Télécharger"}
        </button>
      </div>
    </div>
  );
});

export default FormatsTable;
