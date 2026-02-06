interface ProgressBlockProps {
  progressLabel: string;
  progressPercent: number;
  progressMarker: number;
  progressDetails: string;
}

export default function ProgressBlock({
  progressLabel,
  progressPercent,
  progressMarker,
  progressDetails
}: ProgressBlockProps) {
  return (
    <div className="progress-block" aria-live="polite">
      <div className="progress-head">
        <span>{progressLabel}</span>
        <strong>{progressPercent}%</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        <span className="progress-marker" style={{ left: `${progressMarker}%` }} />
      </div>
      {progressDetails && <p className="progress-details">{progressDetails}</p>}
    </div>
  );
}
