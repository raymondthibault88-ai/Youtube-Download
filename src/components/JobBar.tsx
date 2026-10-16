import type { JobSnapshot } from "../types/job";
import Icon from "./ui/Icon";

interface JobBarProps {
  job: JobSnapshot;
  onCancel: () => void;
  onDismiss: () => void;
  onReview?: () => void;
}

export default function JobBar({ job, onCancel, onDismiss, onReview }: JobBarProps) {
  const percent = Math.max(0, Math.min(100, Math.round(job.percent || 0)));
  const active = job.state === "running" || job.state === "cancelling";
  const starting = active && percent === 0;
  const baseTitle = job.type === "analysis" ? "Analyse" : job.type === "download" ? "Téléchargement" : "Conversion";
  const title = job.state === "failed" ? `${baseTitle} ${job.type === "download" ? "échoué" : "échouée"}` : job.state === "cancelled" ? `${baseTitle} ${job.type === "download" ? "annulé" : "annulée"}` : baseTitle;
  const details = active ? [job.speed, job.eta ? `reste ${job.eta}` : null].filter(Boolean).join(" · ") : "";

  return <section className={`job-bar job-${job.state}`} role={job.state === "failed" ? "alert" : "status"} aria-live={job.state === "failed" ? "assertive" : "polite"}>
    <div className="job-main">
      <span className="job-icon"><Icon name={job.state === "failed" ? "alert" : job.state === "cancelled" ? "close" : job.type === "download" ? "download" : "convert"} /></span>
      <div className="job-copy">
        <div className="job-title-row"><strong>{title}</strong>{active && <span>{starting ? "Démarrage…" : `${percent}%`}</span>}</div>
        <p>{job.state === "cancelled" ? "Tu peux lancer une nouvelle opération." : job.error || job.raw}{details ? ` · ${details}` : ""}</p>
      </div>
    </div>
    {active && <div className={`job-progress ${starting ? "is-indeterminate" : ""}`} role="progressbar" aria-label={`Progression ${baseTitle.toLowerCase()}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={starting ? undefined : percent}><span style={{ width: `${percent}%` }} /></div>}
    <div className="job-actions">
      {active ? <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={job.state === "cancelling"}>{job.state === "cancelling" ? "Annulation…" : "Annuler"}</button> : <>
        {onReview && <button type="button" className="btn btn-ghost" onClick={onReview}>Revoir les réglages</button>}
        <button type="button" className="icon-button" aria-label="Fermer le message de tâche" onClick={onDismiss}><Icon name="close" /></button>
      </>}
    </div>
  </section>;
}
