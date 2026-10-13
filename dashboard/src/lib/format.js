const nf = new Intl.NumberFormat();

export const fmtNumber = (n) => nf.format(n ?? 0);
export const plural = (n, word) => `${fmtNumber(n)} ${word}${n === 1 ? '' : 's'}`;

/** "Oct 13, 10:01" (adds the year when it is not the current year, seconds on request). */
export function fmtDateTime(value, { seconds = false } = {}) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '–';
  const opts = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  if (seconds) opts.second = '2-digit';
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleString(undefined, opts);
}

/** 0 -> "0s", 4200 -> "4.2s", 125000 -> "2m 05s", 4_320_000 -> "1h 12m" */
export function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '–';
  const s = ms / 1000;
  if (s < 1) return ms === 0 ? '0s' : '<1s';
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const totalMin = Math.floor(s / 60);
  if (totalMin < 60) return `${totalMin}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
  return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, '0')}m`;
}

export const fmtOffset = (ms) => `+${fmtDuration(ms)}`;

/** Splits a URL into host and path+query+hash; returns the raw string as path if it cannot be parsed. */
export function hostPath(url) {
  try {
    const u = new URL(url);
    return { host: u.host, path: u.pathname + u.search + u.hash };
  } catch {
    return { host: '', path: String(url) };
  }
}

/** "3f9a1c2e-…-b7d4" style shortening that keeps both ends recognisable. */
export function truncateId(id, head = 8, tail = 4) {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}
