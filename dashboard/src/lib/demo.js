/**
 * Pure logic behind the Demo page. No React, no DOM, no network, so it is unit-tested like the other lib files.
 *
 * The Demo page watches the real tracker (backend/public/tracker.js) running inside the sample store and shows
 * what it reports. Nothing here invents events: every entry comes from a tracker record, and an entry only
 * becomes "accepted" when the API said so (or a later read of the stored session proves it).
 */

export const FEED_LIMIT = 200;
export const TRACKER_MAX_RETRIES = 3; // mirrors MAX_RETRIES in tracker.js (only used for the "attempt n of 3" wording)

/** origin + pathname: the page identity the API groups heatmaps by (same rule as backend normalizePagePath). */
export function pagePathOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin + u.pathname : null;
  } catch {
    return null;
  }
}

/** Key used to match a captured event with the same event read back from the API. */
export function eventKey(e) {
  const t = new Date(e.timestamp).getTime();
  return e.type === 'click' ? `click|${t}|${Math.round(e.x)},${Math.round(e.y)}` : `${e.type}|${t}`;
}

export function makeEntry(id, event, origin = 'visitor') {
  return {
    id,
    sessionId: event.sessionId,
    type: event.type,
    url: event.url,
    pagePath: pagePathOf(event.url),
    timestamp: event.timestamp,
    x: event.type === 'click' ? event.x : undefined,
    y: event.type === 'click' ? event.y : undefined,
    origin, // 'visitor' (a person) or 'scripted' (the sample-activity script)
    status: 'pending', // 'pending' | 'accepted' | 'failed'
    note: 'Waiting to be sent',
    awaiting: false, // sent but unconfirmed (page closing, or unreadable reply)
    retryable: false, // failed because of the network or a server error, so resending can help
  };
}

/**
 * Turns one tracker delivery record into per-event results.
 * `ids` are the feed ids of rec.events, in the same order (the API's reject indexes refer to that order).
 */
export function resolveRecord(ids, rec) {
  const rejected = new Map((rec.rejected || []).map((r) => [r.index, r.error]));
  const rejectedResult = (id, i) => ({ id, status: 'failed', note: `Rejected by the API: ${rejected.get(i)}`, retryable: false, awaiting: false });

  if (rec.phase === 'accepted') {
    const expected = ids.length - rejected.size;
    return ids.map((id, i) => {
      if (rejected.has(i)) return rejectedResult(id, i);
      if (typeof rec.accepted === 'number' && rec.accepted !== expected) {
        return { id, status: 'pending', note: 'The API reply did not match this batch. Checking what was stored.', awaiting: true, retryable: false };
      }
      return { id, status: 'accepted', note: `Accepted by the API (HTTP ${rec.status || 202})`, awaiting: false, retryable: false };
    });
  }

  if (rec.phase === 'failed') {
    return ids.map((id, i) => {
      if (rejected.has(i)) return rejectedResult(id, i);
      if (rec.willRetry) {
        return { id, status: 'pending', note: `Network error: ${rec.error}. Retry ${rec.attempt} of ${TRACKER_MAX_RETRIES} is scheduled.`, awaiting: false, retryable: false };
      }
      const client = rec.status >= 400 && rec.status < 500 && rec.status !== 429;
      return { id, status: 'failed', note: rec.error || 'Delivery failed', retryable: !client, awaiting: false };
    });
  }

  if (rec.phase === 'beacon') {
    return ids.map((id) => ({ id, status: 'pending', note: 'Sent as the page unloaded. Waiting for confirmation.', awaiting: true, retryable: false }));
  }
  if (rec.phase === 'sent') {
    return ids.map((id) => ({ id, status: 'pending', note: 'Sent, but the API reply could not be read. Storage is unconfirmed.', awaiting: true, retryable: false }));
  }
  return [];
}

function patchEntries(entries, results) {
  const byId = new Map(results.map((r) => [r.id, r]));
  return entries.map((e) => (byId.has(e.id) ? { ...e, ...byId.get(e.id) } : e));
}

/** Entries are kept newest first. */
export function feedReducer(entries, action) {
  switch (action.type) {
    case 'queued': {
      if (entries.some((e) => e.id === action.id)) {
        return patchEntries(entries, [{ id: action.id, status: 'pending', note: 'Queued to be sent again', awaiting: false, retryable: false }]);
      }
      return [makeEntry(action.id, action.event, action.origin), ...entries].slice(0, FEED_LIMIT);
    }
    case 'resolve':
      return patchEntries(entries, action.results);
    case 'verified': {
      // Matches unconfirmed (or retry-eligible) entries of this session against events read back from the API.
      const stored = new Map();
      for (const s of action.stored) stored.set(eventKey(s), (stored.get(eventKey(s)) || 0) + 1);
      const results = [];
      // Oldest first, so duplicates of the same key are matched in the order they happened.
      for (const e of [...entries].reverse()) {
        if (e.sessionId !== action.sessionId) continue;
        const eligible = e.status === 'pending' || (e.status === 'failed' && e.retryable);
        if (!eligible) continue;
        const key = eventKey(e);
        if (stored.get(key) > 0) {
          stored.set(key, stored.get(key) - 1);
          results.push({ id: e.id, status: 'accepted', note: 'Confirmed in MongoDB', awaiting: false, retryable: false });
        }
      }
      return results.length ? patchEntries(entries, results) : entries;
    }
    case 'socket_event': {
      const socketEvent = action.event;
      if (!socketEvent) return entries;
      const sKey = eventKey(socketEvent);

      const matchIdx = entries.findIndex((e) => {
        if (socketEvent.id && (e.id === socketEvent.id || e.dbId === socketEvent.id)) return true;
        return eventKey(e) === sKey;
      });

      if (matchIdx >= 0) {
        const existing = entries[matchIdx];
        if (existing.status !== 'accepted' || !existing.dbId) {
          const updated = {
            ...existing,
            dbId: socketEvent.id,
            status: 'accepted',
            note: 'Confirmed in MongoDB (realtime)',
            awaiting: false,
            retryable: false,
          };
          return entries.map((e, i) => (i === matchIdx ? updated : e));
        }
        return entries;
      }

      const newEntry = {
        id: socketEvent.id || `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dbId: socketEvent.id,
        sessionId: socketEvent.sessionId,
        type: socketEvent.type,
        url: socketEvent.pagePath || '',
        pagePath: socketEvent.pagePath || null,
        timestamp: socketEvent.timestamp,
        x: socketEvent.type === 'click' ? socketEvent.x : undefined,
        y: socketEvent.type === 'click' ? socketEvent.y : undefined,
        title: socketEvent.title,
        origin: 'visitor',
        status: 'accepted',
        note: 'Confirmed in MongoDB (realtime)',
        awaiting: false,
        retryable: false,
      };
      return [newEntry, ...entries].slice(0, FEED_LIMIT);
    }
    case 'reset':
      return [];
    default:
      return entries;
  }
}

/** Failed entries that are not found among the stored events (resending those would otherwise create duplicates). */
export function selectResendable(entries, sessionId, stored) {
  const seen = new Map();
  for (const s of stored) seen.set(eventKey(s), (seen.get(eventKey(s)) || 0) + 1);
  const out = [];
  for (const e of [...entries].reverse()) {
    if (e.status !== 'failed' || !e.retryable) continue;
    if (e.sessionId === sessionId && seen.get(eventKey(e)) > 0) { seen.set(eventKey(e), seen.get(eventKey(e)) - 1); continue; }
    out.push(e);
  }
  return out;
}

export function summarizeFeed(entries) {
  const s = { total: entries.length, pageViews: 0, clicks: 0, pending: 0, accepted: 0, failed: 0, awaiting: 0 };
  for (const e of entries) {
    if (e.type === 'page_view') s.pageViews += 1;
    else if (e.type === 'click') s.clicks += 1;
    s[e.status] += 1;
    if (e.awaiting && e.status === 'pending') s.awaiting += 1;
  }
  return s;
}

/**
 * The header status indicator. `api` is 'checking' | 'up' | 'down'; `frame` is 'idle' | 'loading' | 'ready' | 'no-tracker' | 'load-failed';
 * `lastDelivery` is the outcome of the most recent delivery attempt ('ok' | 'failed' | null).
 * There is no simulation mode, so none of these states can mean "simulated".
 */
export function deriveStatus({ api, started, frame, lastDelivery }) {
  if (api === 'checking') return { tone: 'idle', label: 'Checking API', detail: 'Contacting /api/health' };
  if (api === 'down' && !started) return { tone: 'error', label: 'API unavailable', detail: 'Events cannot be stored until the API responds' };
  if (!started) return { tone: 'idle', label: 'Ready, not started', detail: 'The API is reachable. Nothing is tracked until you start the demo.' };
  if (frame === 'loading') return { tone: 'warning', label: 'Loading store', detail: 'Starting the sample store' };
  if (frame === 'load-failed') return { tone: 'error', label: 'Store did not load', detail: 'The sample store did not finish loading, so nothing is being tracked' };
  if (frame === 'no-tracker') return { tone: 'warning', label: 'Tracking inactive', detail: 'The tracker did not start in the sample store' };
  if (lastDelivery === 'failed' || api === 'down') return { tone: 'error', label: 'Delivery failing', detail: 'The latest events could not be delivered' };
  return { tone: 'live', label: 'Live tracking', detail: 'Events are sent to the API and stored in MongoDB' };
}

/** How far through the scripted visitor is, as a whole percentage. `pilot` is the autopilot's progress object. */
export function pilotPercent(pilot) {
  if (!pilot || !pilot.total) return 0;
  if (pilot.state === 'done') return 100;
  if (pilot.state !== 'running' && pilot.state !== 'paused') return 0;
  return Math.max(0, Math.min(100, Math.round((pilot.index / pilot.total) * 100)));
}

/** Time of day for the feed, e.g. "14:03:27". */
export function fmtClock(ms) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleTimeString(undefined, { hour12: false });
}
