'use strict';

/**
 * Origin policy for the Socket.IO endpoint. Pure (no socket.io import) so it is easy to unit test.
 *
 * An origin is accepted when it is
 *   - absent (non-browser clients, and same-origin polling requests, do not send Origin), or
 *   - listed in DASHBOARD_ORIGINS (the same list the read API's CORS uses), or
 *   - the same host that served the request (the single-service deployment, where the dashboard is
 *     served by this server and connects back to it).
 *
 * This is an origin check, NOT authentication: any non-browser client can send any Origin header.
 */
function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function createOriginPolicy(allowedOrigins = []) {
  const origins = [...new Set(allowedOrigins.map(normalizeOrigin).filter(Boolean))];
  const allowed = new Set(origins);

  function isAllowed(origin, host) {
    if (origin === undefined || origin === null || origin === '') return true;
    const normalized = normalizeOrigin(origin);
    if (!normalized) return false; // e.g. the literal "null" origin of sandboxed frames
    if (allowed.has(normalized)) return true;
    return typeof host === 'string' && host.length > 0 && new URL(normalized).host === host;
  }

  return { origins, isAllowed };
}

module.exports = { createOriginPolicy, normalizeOrigin };
