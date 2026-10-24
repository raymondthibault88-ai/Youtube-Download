import type { VideoFormat } from '../../types';
import { getCodecLabel } from '../../utils/codecs';

export default function FormatsTable({
  formats,
  selected,
  onSelect,
  disabled,
  groupName = 'advanced-format'
}: {
  formats: VideoFormat[];
  selected: string | null;
  onSelect: (format: VideoFormat) => void;
  disabled: boolean;
  groupName?: string;
}) {
  return (
    <div className="formats-scroll" role="region" aria-label="Tous les formats source" tabIndex={0}>
      <table className="formats-table">
        <caption>Formats source · le fichier final est préparé en MP4 compatible.</caption>
        <thead>
          <tr>
            <th scope="col">Choix</th>
            <th scope="col">Définition</th>
            <th scope="col">Source</th>
            <th scope="col">Conteneur</th>
            <th scope="col">Codec vidéo</th>
            <th scope="col">Traitement</th>
            <th scope="col">Images/s</th>
            <th scope="col">Taille source</th>
          </tr>
        </thead>
        <tbody>
          {formats.map((format) => (
            <tr
              key={format.id}
              className={selected === format.id ? 'is-selected' : ''}
              onClick={() => {
                if (!disabled) onSelect(format);
              }}
            >
              <td>
                <input
                  type="radio"
                  name={groupName}
                  checked={selected === format.id}
                  disabled={disabled}
                  onChange={() => onSelect(format)}
                  aria-label={`Choisir ${format.resolution}, ${format.ext}, ${getCodecLabel(format.videoCodec)}, ${format.fps || '?'} images par seconde, format ${format.id}`}
                />
              </td>
              <td>{format.resolution}</td>
              <td>{format.hasAudio ? 'Image et son' : 'Image, son ajouté si disponible'}</td>
              <td>{format.ext?.toUpperCase()}</td>
              <td>{getCodecLabel(format.videoCodec) || '—'}</td>
              <td>{format.quickTimeCompatible ? 'Assemblage compatible' : 'Conversion MP4'}</td>
              <td>{format.fps || '—'}</td>
              <td>{format.fileSizeText || 'Non connue'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
