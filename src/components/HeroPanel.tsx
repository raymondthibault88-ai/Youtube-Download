import type { FormEvent, RefObject } from 'react';
import { Clipboard, Link, Search, X } from 'lucide-react';
import { formatDuration } from '../../shared/formatters.js';
import type { VideoInfo } from '../types';

interface HeroPanelProps {
  url: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onUrlChange: (url: string) => void;
  onAnalyze: (event: FormEvent) => void;
  onPaste: () => void;
  onCancelAnalyze: () => void;
  loading: boolean;
  busy: boolean;
  video: VideoInfo | null;
}

export default function HeroPanel({
  url,
  inputRef,
  onUrlChange,
  onAnalyze,
  onPaste,
  onCancelAnalyze,
  loading,
  busy,
  video
}: HeroPanelProps) {
  return (
    <>
      <div className="section-heading">
        <h2>
          <label htmlFor="url-input">Lien YouTube</label>
        </h2>
      </div>
      <form className="source-form" onSubmit={onAnalyze}>
        <div className="source-entry">
          <div className="url-control">
            <Link size={18} aria-hidden="true" />
            <input
              id="url-input"
              ref={inputRef}
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="paste-button" onClick={onPaste} disabled={busy}>
              <Clipboard size={15} aria-hidden="true" />
              Coller
            </button>
          </div>
          <button
            type={loading ? 'button' : 'submit'}
            className="button button-secondary analyze-button"
            onClick={loading ? onCancelAnalyze : undefined}
            disabled={busy || (!loading && !url.trim())}
          >
            {loading ? (
              <>
                <X size={16} aria-hidden="true" />
                Annuler l’analyse
              </>
            ) : (
              <>
                <Search size={16} aria-hidden="true" />
                {video ? 'Actualiser' : 'Analyser'}
              </>
            )}
          </button>
        </div>
      </form>
      {loading ? (
        <div className="analysis-state" role="status">
          <span className="spinner" aria-hidden="true" />
          <strong>Analyse en cours…</strong>
        </div>
      ) : video ? (
        <div className="source-video">
          <div className="source-thumbnail">
            {video.thumbnail ? (
              <img
                src={video.thumbnail}
                alt=""
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            ) : (
              <span aria-hidden="true">▶</span>
            )}
          </div>
          <div>
            <h3>{video.title || 'Vidéo YouTube'}</h3>
            <p>
              {video.uploader || 'Vidéo YouTube'}
              <span aria-hidden="true"> · </span>
              {formatDuration(video.duration)}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
