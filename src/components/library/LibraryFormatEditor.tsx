import { X } from 'lucide-react';
import type useLibraryFormats from '../../hooks/useLibraryFormats';
import VideoPanel from '../VideoPanel';

interface Props {
  formats: ReturnType<typeof useLibraryFormats>;
  targetHeight: number | null;
  disabled: boolean;
}

export default function LibraryFormatEditor({ formats, targetHeight, disabled }: Props) {
  const editor = formats.editor;
  if (!editor) return null;
  return (
    <section className="library-format-editor" aria-label={`Qualité de ${editor.video.title}`}>
      <div className="library-editor-heading">
        <h3>{editor.video.title}</h3>
        <button
          type="button"
          className="icon-button"
          onClick={formats.close}
          aria-label={formats.loading ? 'Annuler l’analyse des qualités' : 'Fermer les qualités'}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      {!formats.formats[editor.video.id] && !formats.loading && (
        <p className="library-editor-default library-help">
          Réglage du lot :{' '}
          {targetHeight === null ? 'recommandé' : targetHeight === 2160 ? '4K' : `${targetHeight}p`}
        </p>
      )}
      {formats.loading ? (
        <p className="library-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          Analyse des qualités…
        </p>
      ) : (
        <VideoPanel
          idPrefix="library"
          formats={editor.info?.formats || []}
          selected={formats.selected}
          onSelect={formats.choose}
          disabled={disabled}
        />
      )}
    </section>
  );
}
