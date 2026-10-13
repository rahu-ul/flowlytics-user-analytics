import { fmtNumber } from '../../lib/format.js';
import Icon from './Icon.jsx';

/** A row of metric cards. Values are real API totals; `value === undefined` shows a skeleton, `null` a dash. */
export default function MetricStrip({ items }) {
  return (
    <dl className="metrics">
      {items.map((m) => (
        <div className="metric card" key={m.label}>
          <div className="metric-top">
            <dt>{m.label}</dt>
            {m.icon && <span className={`metric-icon tint-${m.tint || 'sky'}`} aria-hidden="true"><Icon name={m.icon} size={17} /></span>}
          </div>
          <dd className="metric-value">{m.value === undefined ? <span className="skeleton skeleton-metric" aria-label="Loading" /> : m.value === null ? <span aria-label="Unavailable">–</span> : fmtNumber(m.value)}</dd>
          {m.hint && <dd className="metric-hint">{m.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
