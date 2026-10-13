import { useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar.jsx';

export default function AppShell({ section, routeKey, children }) {
  const [open, setOpen] = useState(false);
  const mainRef = useRef(null);
  const first = useRef(true);

  useEffect(() => { setOpen(false); }, [routeKey]);

  // Move focus to the content when switching sections so keyboard and screen-reader users land on the new page.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [section]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
      <Sidebar section={section} open={open} onToggle={() => setOpen((v) => !v)} />
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <main id="main" className="main" tabIndex={-1} ref={mainRef}>
        <div className="route" key={section}>{children}</div>
      </main>
    </div>
  );
}
