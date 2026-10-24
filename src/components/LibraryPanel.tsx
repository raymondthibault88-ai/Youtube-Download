import { useCallback, useEffect } from 'react';
import { Clipboard, Link, ListVideo, X } from 'lucide-react';
import { readClipboard } from '../services/desktopApi';
import type { RunMediaJob } from '../hooks/useMediaJob';
import type { JobSnapshot } from '../types/job';
import type { LibraryVideo } from '../types/library';
import useLibraryAccount from '../hooks/useLibraryAccount';
import useLibraryBatch from '../hooks/useLibraryBatch';
import useLibraryCollection from '../hooks/useLibraryCollection';
import useLibraryFormats from '../hooks/useLibraryFormats';
import { getErrorMessage } from '../utils/errors';
import LibraryAccount from './library/LibraryAccount';
import LibraryQuality from './library/LibraryQuality';
import LibraryVideoList from './library/LibraryVideoList';
import OutputCard from './OutputCard';
import LibraryFormatEditor from './library/LibraryFormatEditor';

interface LibraryPanelProps {
  outputDir: string;
  onPickFolder: () => void;
  busy: boolean;
  run: RunMediaJob;
  onError: (message: string) => void;
  onSourceChange: () => void;
  job: JobSnapshot | null;
  onLoadingChange?: (loading: boolean) => void;
}

export default function LibraryPanel({
  outputDir,
  onPickFolder,
  busy,
  run,
  onError,
  onSourceChange,
  job,
  onLoadingChange
}: LibraryPanelProps) {
  const library = useLibraryCollection({ busy, onError, onSourceChange });
  const formats = useLibraryFormats(onError);
  const batch = useLibraryBatch(run, onError);
  const { clearAccountCollection } = library;
  const { reset: resetFormats } = formats;
  const { reset: resetBatch } = batch;
  const onSessionLost = useCallback(() => {
    if (clearAccountCollection()) {
      resetFormats();
      resetBatch();
    }
  }, [clearAccountCollection, resetFormats, resetBatch]);
  const connection = useLibraryAccount(onError, onSessionLost);
  const loading =
    library.loading ||
    formats.loading ||
    connection.working ||
    Boolean(connection.account?.connecting);
  const locked = busy || loading || batch.starting;
  useEffect(() => {
    onLoadingChange?.(loading);
    return () => onLoadingChange?.(false);
  }, [loading, onLoadingChange]);
  const importSource = async () => {
    formats.close();
    if (await library.importSource()) {
      formats.reset();
      batch.reset();
    }
  };
  const openPlaylist = async (id: string, title: string) => {
    formats.close();
    if (await library.loadAccountVideos(id, title)) {
      formats.reset();
      batch.reset();
    }
  };
  const paste = async () => {
    try {
      const text = await readClipboard();
      if (text) {
        formats.close();
        library.setSource(text);
      }
    } catch (error) {
      onError(getErrorMessage(error, 'Impossible de coller ce lien.'));
    }
  };
  const chooseQuality = (video: LibraryVideo) => {
    if (!locked) void formats.open(video);
  };
  const download = async () => {
    if (locked || !library.selectedItems.length) return;
    if (!outputDir) {
      onPickFolder();
      return;
    }
    await batch.start({
      items: library.selectedItems.map((video) => ({
        id: video.id,
        title: video.title,
        url: video.url,
        ...(formats.formats[video.id] ? { formatId: formats.formats[video.id].id } : {})
      })),
      outputDir,
      targetHeight: library.targetHeight
    });
  };
  const collection = library.collection;
  const count = library.selectedItems.length;
  const batchRunning =
    job?.type === 'batch' && (job.state === 'running' || job.state === 'cancelling');
  return (
    <div className="workspace library-workspace">
      <section className="source-card" aria-label="Bibliothèque YouTube">
        <div className="section-heading">
          <h2>
            <label htmlFor="library-source">Playlist ou chaîne YouTube</label>
          </h2>
        </div>
        <form
          className="source-form"
          onSubmit={(event) => {
            event.preventDefault();
            void importSource();
          }}
        >
          <div className="source-entry">
            <div className="url-control">
              <Link size={18} aria-hidden="true" />
              <input
                id="library-source"
                type="url"
                required
                placeholder="https://www.youtube.com/playlist?list=…"
                value={library.source}
                onChange={(event) => {
                  formats.close();
                  library.setSource(event.target.value);
                }}
                disabled={busy || connection.working}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                className="paste-button"
                onClick={() => void paste()}
                disabled={busy || connection.working}
              >
                <Clipboard size={15} aria-hidden="true" />
                Coller
              </button>
            </div>
            <button
              type={library.loading ? 'button' : 'submit'}
              className="button button-secondary analyze-button"
              disabled={
                busy ||
                formats.loading ||
                connection.working ||
                (!library.loading && !library.source.trim())
              }
              onClick={library.loading ? library.cancel : undefined}
            >
              {library.loading ? (
                <>
                  <X size={16} aria-hidden="true" />
                  Annuler l’import
                </>
              ) : (
                <>
                  <ListVideo size={16} aria-hidden="true" />
                  Importer
                </>
              )}
            </button>
          </div>
        </form>
        <LibraryAccount
          connection={connection}
          disabled={busy || library.loading || formats.loading}
          selectedPlaylist={collection?.id}
          onPlaylist={(id, title) => void openPlaylist(id, title)}
        />
        {library.loading && (
          <div className="library-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            Chargement des vidéos…
          </div>
        )}
        {collection && (
          <section className="library-collection" aria-labelledby="library-collection-title">
            <div className="library-collection-heading">
              <h2 id="library-collection-title">{collection.title}</h2>
              <span>
                {collection.items.length}
                {collection.total > collection.items.length ? ` / ${collection.total}` : ''} vidéos
              </span>
            </div>
            {collection.truncated && (
              <p className="library-help library-limit" role="status">
                Les {collection.items.length} premières vidéos sont affichées.
              </p>
            )}
            <LibraryQuality
              height={library.targetHeight}
              onChange={(height) => {
                library.setTargetHeight(height);
                formats.reset();
              }}
              disabled={locked}
            />
            <LibraryVideoList
              videos={library.visible}
              selected={library.selected}
              selectedCount={count}
              formats={formats.formats}
              results={batch.results}
              query={library.query}
              onQuery={library.setQuery}
              onToggle={library.toggle}
              onToggleVisible={library.toggleVisible}
              onClearSelection={() => library.setSelected(new Set())}
              onQuality={chooseQuality}
              onRetryFailures={() =>
                library.setSelected(
                  new Set(
                    batch.results
                      .filter((result) => result.state === 'failed')
                      .map((result) => result.id)
                  )
                )
              }
              disabled={locked}
            />
            {collection.nextPageToken && (
              <div className="library-pagination">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={locked}
                  onClick={() =>
                    void library.loadAccountVideos(collection.id, collection.title, true)
                  }
                >
                  Charger plus de vidéos
                </button>
              </div>
            )}
          </section>
        )}
        <LibraryFormatEditor
          formats={formats}
          targetHeight={library.targetHeight}
          disabled={busy}
        />
      </section>
      <OutputCard
        ready={count > 0}
        quality={
          library.targetHeight === null
            ? 'Recommandée'
            : library.targetHeight === 2160
              ? '4K'
              : `${library.targetHeight}p`
        }
        detail={`${count} vidéo${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''}`}
        outputDir={outputDir}
        onPickFolder={onPickFolder}
        onStart={() => void download()}
        disabled={locked || !count}
        busy={busy || batch.starting || loading}
        action={
          batchRunning || batch.starting
            ? 'Téléchargements en cours…'
            : count
              ? `Télécharger ${count} vidéo${count > 1 ? 's' : ''}`
              : 'Télécharger la sélection'
        }
      />
    </div>
  );
}
