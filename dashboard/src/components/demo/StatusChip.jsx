/** Compact status indicator. The dot adds colour; the words carry the meaning. */
export default function StatusChip({ status }) {
  return (
    <span className="chip status-chip" data-tone={status.tone} title={status.detail}>
      <span className="status-dot" aria-hidden="true" />
      {status.label}
    </span>
  );
}
