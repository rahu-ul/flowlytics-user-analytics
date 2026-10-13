import { fmtNumber, hostPath } from '../lib/format.js';

export default function PageSelector({ pages, value, onChange, disabled }) {
  return (
    <div className="field">
      <label htmlFor="page-select">Page</label>
      <select id="page-select" className="select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {pages.map((p) => {
          const { host, path } = hostPath(p.pagePath);
          return <option key={p.pagePath} value={p.pagePath}>{host}{path} ({fmtNumber(p.clicks)} {p.clicks === 1 ? 'click' : 'clicks'})</option>;
        })}
      </select>
    </div>
  );
}
