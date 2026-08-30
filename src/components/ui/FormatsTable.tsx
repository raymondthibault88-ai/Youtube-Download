import { memo } from "react";
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
  return (
    <div className="formats-box">
      <div className="formats-head">
        <h3>Formats disponibles</h3>
        <span>
          {formats.length} résultat{formats.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="table-wrap">
        <table className="formats-table">
          <thead>
            <tr>
              <th>Résolution</th>
              <th>Format</th>
              <th>Traitement</th>
              <th>FPS</th>
              <th>Taille</th>
            </tr>
          </thead>
          <tbody>
            {formats.map((format) => (
              <FormatRow
                key={format.id}
                format={format}
                isSelected={selectedFormatId === format.id}
                onSelect={onSelectFormat}
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
