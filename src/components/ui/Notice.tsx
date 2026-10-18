import { AlertCircle, X } from 'lucide-react';
import { describeError } from '../../utils/errors';

export default function Notice({ error, onDismiss }: { error: string; onDismiss?: () => void }) {
  if (!error) return null;
  const description = describeError(error);
  return (
    <div className="notice" role="alert">
      <AlertCircle size={19} aria-hidden="true" />
      <div>
        <p>{description.message}</p>
        {description.details && (
          <details>
            <summary>Détails techniques</summary>
            <pre>{description.details}</pre>
          </details>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="icon-button"
          onClick={onDismiss}
          aria-label="Fermer le message"
        >
          <X size={17} />
        </button>
      )}
    </div>
  );
}
