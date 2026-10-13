import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';

const KEY = 'cf-theme';
const ThemeContext = createContext({ theme: 'light', toggle: () => {} });

function current() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** The initial value is set before first paint by public/theme-init.js; this only mirrors and changes it. */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(current);

  const toggle = useCallback(() => {
    const next = current() === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    // Brief class so colours ease between themes without animating on first load.
    root.classList.add('theme-changing');
    root.setAttribute('data-theme', next);
    root.style.colorScheme = next;
    window.setTimeout(() => root.classList.remove('theme-changing'), 250);
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked: preference lasts for this tab only */ }
    setTheme(next);
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return createElement(ThemeContext.Provider, { value }, children);
}

export const useTheme = () => useContext(ThemeContext);
