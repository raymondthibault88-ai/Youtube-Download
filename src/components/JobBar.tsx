import type { JobSnapshot } from "../types/job";

interface JobBarProps {
  job: JobSnapshot;
  onCancel: () => void;
}

export default function JobBar({ job, onCancel }: JobBarProps) {
  const percent = Math.max(0, Math.min(100, Math.round(job.percent || 0)));
  const isActive = job.state === "running" || job.state === "cancelling";
  const isStarting = job.state === "running" && percent === 0;
  const title = job.type === "download" ? "Téléchargement" : "Conversion";
  const details = [job.speed, job.eta ? `reste ${job.eta}` : null].filter(Boolean).join(" · ");

  return (
    <section className={`job-bar job-${job.state}`} aria-live="polite">
      <div className="job-main">
        <span className="job-icon" aria-hidden="true">{job.type === "download" ? "↓" : "↻"}</span>
        <div className="job-copy">
          <div className="job-title-row">
            <strong>{title}</strong>
            <span>{isStarting ? "Démarrage…" : `${percent}%`}</span>
          </div>
          <p>{job.raw}{details ? ` · ${details}` : ""}</p>
        </div>
      </div>
      <div className={`job-progress ${isStarting ? "is-indeterminate" : ""}`} role="progressbar" aria-label={`Progression ${title.toLowerCase()}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={isStarting ? undefined : percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
      {isActive && (
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={job.state === "cancelling"}>
          {job.state === "cancelling" ? "Annulation…" : "Annuler"}
        </button>
      )}
    </section>
  );
}
