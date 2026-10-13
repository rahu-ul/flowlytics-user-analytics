import { useEffect, useMemo, useState } from 'react';

/**
 * Tiny hash router (no dependency). Hash routes need no server fallback, so the Express static
 * hosting keeps working. Routes: #/overview, #/sessions, #/sessions/:id, #/heatmaps?url=
 */
export function parseHash(hash) {
  const raw = hash.replace(/^#/, '') || '/overview';
  const [path, query = ''] = raw.split('?');
  const segs = path.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  return { segs, params: new URLSearchParams(query) };
}

export function buildHref(segs, params) {
  const path = '/' + segs.map(encodeURIComponent).join('/');
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, v); });
  const qs = q.toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function navigate(segs, params, { replace = false } = {}) {
  const href = buildHref(segs, params);
  if (replace) history.replaceState(null, '', href);
  else history.pushState(null, '', href);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return useMemo(() => parseHash(hash), [hash]);
}
