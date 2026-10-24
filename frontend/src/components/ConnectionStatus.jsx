import { Wifi, WifiOff, LoaderCircle } from 'lucide-react';

const statusLabels = {
  connected: 'Live',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting'
};

export default function ConnectionStatus({ status }) {
  const Icon = status === 'connected' ? Wifi : status === 'reconnecting' ? WifiOff : LoaderCircle;
  return (
    <span className={`connection-status status-${status}`} role="status" aria-live="polite">
      <Icon size={14} className={status === 'connecting' ? 'spin-icon' : ''} aria-hidden="true" />
      <span>{statusLabels[status] ?? 'Offline'}</span>
    </span>
  );
}