import { useSocketStatus } from '../../hooks.js';
import { CONNECTION_STATES } from '../../lib/realtime.js';

export default function ConnectionStatus() {
  const status = useSocketStatus();

  let statusClass = 'is-connecting';
  if (status === CONNECTION_STATES.LIVE) statusClass = 'is-live';
  else if (status === CONNECTION_STATES.RECONNECTING) statusClass = 'is-reconnecting';
  else if (status === CONNECTION_STATES.DISCONNECTED) statusClass = 'is-disconnected';

  return (
    <div className={`conn-status ${statusClass}`} role="status" aria-live="polite" title={`Real-time socket status: ${status}`}>
      <span className="conn-dot" aria-hidden="true" />
      <span className="conn-label">Realtime</span>
      <span className="conn-state">{status}</span>
    </div>
  );
}
