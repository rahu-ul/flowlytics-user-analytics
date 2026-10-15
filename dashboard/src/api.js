// Same-origin by default (Vite proxy in dev, Express static in production).
// Set VITE_API_URL at build time to point at a separately hosted API.
const BASE = import.meta.env.VITE_API_URL || '';

async function get(path, signal) {
  const res = await fetch(BASE + path, { signal });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try { message = (await res.json()).error || message; } catch { /* non-JSON error body */ }
    const err = new Error(message);
    err.status = res.status; // lets callers tell "not found" from a real failure
    throw err;
  }
  return res.json();
}

export const api = {
  health: (signal) => get('/api/health', signal),
  sessions: (page, limit, signal) => get(`/api/sessions?page=${page}&limit=${limit}`, signal),
  sessionEvents: (id, signal) => get(`/api/sessions/${encodeURIComponent(id)}/events`, signal),
  pages: (signal) => get('/api/pages', signal),
  heatmap: (url, signal) => get(`/api/heatmap?url=${encodeURIComponent(url)}`, signal),
};
