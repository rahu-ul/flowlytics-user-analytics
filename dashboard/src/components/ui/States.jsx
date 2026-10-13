import Icon from './Icon.jsx';

/** Placeholder shapes shown while data loads. `rows` draws table-like lines, `block` a media area. */
export function LoadingState({ variant = 'rows', rows = 6, label = 'Loading' }) {
  if (variant === 'block') return <div className="skeleton skeleton-block" role="status" aria-label={label} />;
  return (
    <div role="status" aria-label={label} className="skeleton-rows">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton skeleton-line" style={{ width: `${88 - ((i * 13) % 34)}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="state">
      <span className="state-icon" aria-hidden="true"><Icon name="inbox" size={22} /></span>
      <p className="state-title">{title}</p>
      {children && <p className="state-body">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Could not load this data', message, onRetry, action }) {
  return (
    <div className="state state-error" role="alert">
      <span className="state-icon" aria-hidden="true"><Icon name="alert" size={22} /></span>
      <div className="state-error-text">
        <p className="state-title">{title}</p>
        {message && <p className="state-body">{message}</p>}
        <div className="state-actions">
          {onRetry && <button type="button" className="btn" onClick={onRetry}><Icon name="refresh" size={16} /> Try again</button>}
          {action}
        </div>
      </div>
    </div>
  );
}
