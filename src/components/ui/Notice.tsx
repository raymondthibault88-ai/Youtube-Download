import Icon from "./Icon";

export default function Notice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div className="notice notice-error" role="alert">
    <Icon name="alert" /><p>{message}</p>
    <button type="button" className="icon-button" aria-label="Fermer le message d’erreur" onClick={onDismiss}><Icon name="close" /></button>
  </div>;
}
