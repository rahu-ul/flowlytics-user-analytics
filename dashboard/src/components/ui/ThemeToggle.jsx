import { useTheme } from '../../theme.js';
import Icon from './Icon.jsx';

/** Light/dark switch. The name stays "Dark theme" and aria-checked reports whether dark is on. */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <div className="theme-block">
      <p className="theme-label" aria-hidden="true">{dark ? 'Dark mode' : 'Light mode'}</p>
      <button type="button" className="theme-toggle" role="switch" aria-checked={dark} aria-label="Dark theme" onClick={toggle}>
        <span className="theme-thumb" aria-hidden="true" />
        <span className="theme-opt" data-on={!dark} aria-hidden="true"><Icon name="sun" size={18} /></span>
        <span className="theme-opt" data-on={dark} aria-hidden="true"><Icon name="moon" size={18} /></span>
      </button>
    </div>
  );
}
