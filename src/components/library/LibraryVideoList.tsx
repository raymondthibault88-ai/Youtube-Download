import { Checkbox } from '@base-ui/react/checkbox';
import { Check, CircleAlert, CircleCheck, FileVideo, Minus, Search } from 'lucide-react';
import { formatDuration } from '../../../shared/formatters.js';
import type { VideoFormat } from '../../types';
import type { BatchItemResult, LibraryVideo } from '../../types/library';
import { qualityLabel } from '../../utils/media';
import { describeError } from '../../utils/errors';
import { maxBatchItems } from '../../../shared/library-config.json';

interface Props {
  videos: LibraryVideo[];
  selected: Set<string>;
  selectedCount: number;
  formats: Record<string, VideoFormat>;
  results: BatchItemResult[];
  query: string;
  onQuery: (query: string) => void;
  onToggle: (id: string, checked: boolean) => void;
  onToggleVisible: (checked: boolean) => void;
  onClearSelection: () => void;
  onQuality: (video: LibraryVideo) => void;
  onRetryFailures: () => void;
  disabled: boolean;
}

function safeThumbnail(value: string | null) {
  try {
    return value && new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export default function LibraryVideoList({
  videos,
  selected,
  selectedCount,
  formats,
  results,
  query,
  onQuery,
  onToggle,
  onToggleVisible,
  onClearSelection,
  onQuality,
  onRetryFailures,
  disabled
}: Props) {
  const selectable = videos.filter((video) => video.available);
  const checkedCount = selectable.filter((video) => selected.has(video.id)).length;
  const allChecked = selectable.length > 0 && checkedCount === selectable.length;
  const byUrl = new Map(results.map((result) => [result.url, result]));
  return (
    <>
      <div className="library-selection-toolbar">
        <label className="library-select-all">
          <Checkbox.Root
            className="library-checkbox"
            checked={allChecked}
            indeterminate={checkedCount > 0 && !allChecked}
            disabled={disabled || !selectable.length}
            onCheckedChange={onToggleVisible}
            aria-label="Sélectionner les vidéos affichées"
          >
            <Checkbox.Indicator keepMounted>
              {checkedCount > 0 && !allChecked ? <Minus size={12} /> : <Check size={12} />}
            </Checkbox.Indicator>
          </Checkbox.Root>
          <span>
            {selectedCount} sélectionnée{selectedCount > 1 ? 's' : ''}
          </span>
        </label>
        {selectedCount > 0 && (
          <button
            type="button"
            className="text-button"
            onClick={onClearSelection}
            disabled={disabled}
          >
            Effacer la sélection
          </button>
        )}
        <div className="library-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="Rechercher dans la bibliothèque"
            placeholder="Rechercher une vidéo"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        {results.some((result) => result.state === 'failed') && (
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={onRetryFailures}
          >
            Sélectionner les échecs
          </button>
        )}
      </div>
      {!videos.length && (
        <p className="library-empty">Aucune vidéo ne correspond à votre recherche.</p>
      )}
      {selectedCount >= maxBatchItems && (
        <p className="library-help library-limit" role="status">
          {maxBatchItems} vidéos au maximum par lot.
        </p>
      )}
      <ul className="library-video-list" aria-label="Vidéos de la bibliothèque">
        {videos.map((video) => {
          const thumbnail = safeThumbnail(video.thumbnail);
          const result = byUrl.get(video.url);
          return (
            <li
              className={`library-video-row ${!video.available ? 'is-unavailable' : ''}`}
              key={video.id}
            >
              <Checkbox.Root
                className="library-checkbox"
                checked={selected.has(video.id)}
                disabled={
                  disabled ||
                  !video.available ||
                  (selectedCount >= maxBatchItems && !selected.has(video.id))
                }
                onCheckedChange={(checked) => onToggle(video.id, checked)}
                aria-label={`Sélectionner ${video.title}`}
              >
                <Checkbox.Indicator keepMounted>
                  <Check size={12} />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <div className="library-thumbnail" aria-hidden="true">
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                ) : (
                  <FileVideo size={20} />
                )}
              </div>
              <div className="library-video-info">
                <h3>{video.title}</h3>
                <p>
                  {video.duration ? formatDuration(Math.floor(video.duration)) : 'Durée non connue'}
                  {!video.available && ` · ${video.reason || 'Vidéo indisponible'}`}
                  {result && (
                    <span className={`library-item-result is-${result.state}`}>
                      {result.state === 'completed' ? (
                        <>
                          <CircleCheck size={12} aria-hidden="true" />
                          Enregistrée
                        </>
                      ) : result.state === 'failed' ? (
                        <>
                          <CircleAlert size={12} aria-hidden="true" />
                          Échec
                        </>
                      ) : (
                        'Annulée'
                      )}
                    </span>
                  )}
                </p>
                {result?.state === 'failed' && result.error && (
                  <p className="library-item-error">{describeError(result.error).message}</p>
                )}
              </div>
              {video.available && (
                <button
                  type="button"
                  className="text-button library-row-quality"
                  disabled={disabled}
                  onClick={() => onQuality(video)}
                  aria-label={`Choisir la qualité de ${video.title}`}
                >
                  {formats[video.id]
                    ? qualityLabel(formats[video.id].resolution)
                    : 'Choisir la qualité'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
