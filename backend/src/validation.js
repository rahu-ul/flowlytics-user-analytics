'use strict';

const EVENT_TYPES = new Set(['page_view', 'click']);
const MAX_BATCH = 50;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_URL_LENGTH = 2048;
const MAX_COORD = 1_000_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // accept events queued offline for up to 7 days
const MAX_FUTURE_MS = 5 * 60 * 1000; // tolerate modest client clock skew

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCoord = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_COORD;

/**
 * Page identity used for grouping heatmaps: origin + pathname.
 * Query string and hash are dropped so /p?utm=x and /p#top land on the same page.
 * Returns null if the value is not an absolute http(s) URL.
 */
function normalizePagePath(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) return null;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

function parseTimestamp(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const optionalString = (v, max) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined);

/**
 * Validates one raw event. Returns { value } (the document to store) or { error }.
 * Unknown fields are dropped; only a whitelist is persisted.
 */
function parseEvent(raw, { now = Date.now(), userAgent } = {}) {
  if (!isObject(raw)) return { error: 'event must be an object' };

  if (typeof raw.sessionId !== 'string' || !SESSION_ID_RE.test(raw.sessionId)) {
    return { error: 'sessionId must be 8-64 characters of [A-Za-z0-9_-]' };
  }
  if (!EVENT_TYPES.has(raw.type)) return { error: `type must be one of: ${[...EVENT_TYPES].join(', ')}` };

  const pagePath = normalizePagePath(raw.url);
  if (!pagePath) return { error: 'url must be an absolute http(s) URL up to 2048 characters' };

  const timestamp = parseTimestamp(raw.timestamp);
  if (!timestamp) return { error: 'timestamp must be epoch milliseconds or an ISO-8601 string' };
  const age = now - timestamp.getTime();
  if (age > MAX_AGE_MS || age < -MAX_FUTURE_MS) return { error: 'timestamp is outside the accepted window' };

  const doc = {
    sessionId: raw.sessionId,
    type: raw.type,
    url: raw.url,
    pagePath,
    timestamp,
    receivedAt: new Date(now),
  };

  if (raw.type === 'click') {
    if (!isCoord(raw.x) || !isCoord(raw.y)) return { error: 'click events require numeric x and y (page coordinates, >= 0)' };
    doc.x = raw.x;
    doc.y = raw.y;
    if (isCoord(raw.docWidth) && raw.docWidth > 0) doc.docWidth = raw.docWidth;
    if (isCoord(raw.docHeight) && raw.docHeight > 0) doc.docHeight = raw.docHeight;
  } else {
    const referrer = optionalString(raw.referrer, MAX_URL_LENGTH);
    const title = optionalString(raw.title, 300);
    if (referrer) doc.referrer = referrer;
    if (title) doc.title = title;
  }

  if (isCoord(raw.viewportWidth)) doc.viewportWidth = raw.viewportWidth;
  if (isCoord(raw.viewportHeight)) doc.viewportHeight = raw.viewportHeight;
  const ua = optionalString(userAgent, 300);
  if (ua) doc.userAgent = ua;

  return { value: doc };
}

/**
 * Accepts either a single event or { events: [...] }.
 * Valid events are kept; invalid ones are reported by index (partial acceptance).
 */
function parseBatch(body, opts) {
  let list;
  if (isObject(body) && Array.isArray(body.events)) list = body.events;
  else if (isObject(body)) list = [body];
  else return { fatal: 'body must be an event object or { "events": [...] }' };

  if (list.length === 0) return { fatal: 'events must not be empty' };
  if (list.length > MAX_BATCH) return { fatal: `a batch may contain at most ${MAX_BATCH} events` };

  const valid = [];
  const rejected = [];
  list.forEach((raw, index) => {
    const result = parseEvent(raw, opts);
    if (result.value) valid.push(result.value);
    else rejected.push({ index, error: result.error });
  });
  return { valid, rejected };
}

module.exports = { parseEvent, parseBatch, normalizePagePath, MAX_BATCH };
