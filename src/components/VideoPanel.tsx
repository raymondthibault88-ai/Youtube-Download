import type { VideoFormat, VideoInfo } from "../types/video";
import { formatDuration } from "../../shared/formatters.js";
import FormatsTable from "./ui/FormatsTable";

interface VideoPanelProps {
  video: VideoInfo;
  selectedFormatSummary: string | null;
  availableFormats: VideoFormat[];
  selectedFormatId: string | null;
  onSelectFormat: (format: VideoFormat) => void;
  onDownload: () => void;
  downloading: boolean;
}

export default function VideoPanel({
  video,
  selectedFormatSummary,
  availableFormats,
  selectedFormatId,
  onSelectFormat,
  onDownload,
  downloading
}: VideoPanelProps) {
  return (
    <section className="panel reveal-up delay-1">
      <div className="video-grid">
        <aside className="video-summary">
          {video.thumbnail && (
            <img
              src={video.thumbnail}
              alt={video.title || "Miniature YouTube"}
              className="video-thumb"
              loading="lazy"
              decoding="async"
              width={320}
              height={180}
            />
          )}
          <h2>
            {video.title}
            {selectedFormatSummary && (
              <span className="badge">{selectedFormatSummary}</span>
            )}
          </h2>
          <p>{video.uploader || "Chaîne inconnue"} · {formatDuration(video.duration)}</p>
        </aside>

        <FormatsTable
          formats={availableFormats}
          selectedFormatId={selectedFormatId}
          onSelectFormat={onSelectFormat}
          selectedFormatSummary={selectedFormatSummary}
          onDownload={onDownload}
          downloading={downloading}
        />
      </div>
    </section>
  );
}
