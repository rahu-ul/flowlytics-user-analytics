import { buildHref } from '../../router.js';
import Icon from './Icon.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export const NAV = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'sessions', label: 'Sessions', icon: 'sessions' },
  { id: 'heatmaps', label: 'Heatmaps', icon: 'heatmap' },
];

// Host the dashboard is talking to (same origin by default, or VITE_API_URL when set at build time).
const apiHost = (() => {
  const base = import.meta.env.VITE_API_URL;
  try { return base ? new URL(base).host : window.location.host; } catch { return window.location.host; }
})();

/** Brand mark: a rounded tile in the accent gradient with a funnel glyph. */
function LogoMark() {
  return (
    <svg className="brand-mark" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cf-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6a08c" />
          <stop offset="0.55" stopColor="#f4c15f" />
          <stop offset="1" stopColor="#8de264" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="11" fill="url(#cf-mark)" />
      <path d="M10 11.5h16l-6 7.6v6.4l-4-2v-4.4z" fill="#171a1f" />
    </svg>
  );
}

export default function Sidebar({ section, open, onToggle }) {
  return (
    <aside className="sidebar" data-open={open}>
      <div className="sidebar-inner">
        <div className="sidebar-bar">
          <a className="brand" href={buildHref(['overview'])}>
            <LogoMark />
            <span className="brand-text">
              <span className="brand-name">Flowlytics</span>
              <span className="brand-sub">User analytics</span>
            </span>
          </a>
          <button type="button" className="btn-icon menu-button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="primary-nav" onClick={onToggle}>
            <Icon name={open ? 'close' : 'menu'} size={20} />
          </button>
        </div>
        <div className="sidebar-body" id="primary-nav">
          <nav aria-label="Primary">
            <ul className="nav-list">
              {NAV.map((n) => (
                <li key={n.id}>
                  <a className="nav-link" href={buildHref([n.id])} aria-current={section === n.id ? 'page' : undefined}>
                    <Icon name={n.icon} size={19} /> {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sidebar-foot">
            <ThemeToggle />
            <p className="env" title="API host this dashboard reads from">
              <span className="env-label">{import.meta.env.DEV ? 'API host · development' : 'API host'}</span>
              <span className="mono">{apiHost}</span>
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
