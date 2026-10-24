import { AlertCircle, X } from 'lucide-react';

export default function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div className="toast-message" role="alert">
      <AlertCircle size={17} aria-hidden="true" />
      <span>{toast.message}</span>
      <button className="icon-button toast-dismiss" aria-label="Dismiss notification" onClick={onDismiss}><X size={16} /></button>
    </div>
  );
}