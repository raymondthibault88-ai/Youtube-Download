import type { VideoFormat } from '../../types';
import { getCodecLabel } from '../../utils/codecs';

export default function FormatsTable({
  formats,
  selected,
  onSelect,
  disabled
}: {
  formats: VideoFormat[];
  selected: string | null;
  onSelect: (format: VideoFormat) => void;
  disabled: boolean;
}) {
  return (
    <div className="formats-scroll" role="region" aria-label="Tous les formats source" tabIndex={0}>
      <table className="formats-table">
        <caption>Formats source. Export en MP4 compatible.</caption>
        <thead>
          <tr>
            <th scope="col">Définition</th>
            <th scope="col">Codec vidéo</th>
            <th scope="col">Taille source</th>
            <th scope="col">Traitement</th>
          </tr>
        </thead>
        <tbody>
          {formats.map((format) => (
            <tr
              key={format.id}
              className={selected === format.id ? 'is-selected' : ''}
              data-disabled={disabled ? '' : undefined}
              onClick={() => {
                if (!disabled) onSelect(format);
              }}
            >
              <td>
                <div className="format-definition">
                  <input
                    type="radio"
                    name="advanced-format"
                    checked={selected === format.id}
                    disabled={disabled}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onSelect(format)}
                    aria-label={`Choisir ${format.resolution}, ${format.ext}, ${getCodecLabel(format.videoCodec)}, ${format.fps || '?'} images par seconde, format ${format.id}`}
                  />
                  <div>
                    <strong>{format.resolution}</strong>
                    {format.fps && <span className="format-detail">{format.fps} i/s</span>}
                  </div>
                </div>
              </td>
              <td>
                {getCodecLabel(format.videoCodec) || '—'}
                {format.ext && <span className="format-detail">{format.ext.toUpperCase()}</span>}
              </td>
              <td>{format.fileSizeText || 'Non connue'}</td>
              <td>
                {format.quickTimeCompatible ? 'Assemblage compatible' : 'Conversion MP4'}
                <span className="format-detail">
                  {format.hasAudio ? 'Image et son' : 'Image seule'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
