/**
 * Flowlytics Real-Time Core Logic
 * Pure, tested logic for handling Socket.IO events, state transitions,
 * deduplication, session updates, and heatmap click merging.
 */

export const REALTIME_EVENTS = Object.freeze({
  EVENT: 'analytics:event',
  SESSION_UPDATED: 'analytics:session-updated',
  HEATMAP_UPDATED: 'analytics:heatmap-updated',
});

export const CONNECTION_STATES = Object.freeze({
  CONNECTING: 'Connecting',
  LIVE: 'Live',
  RECONNECTING: 'Reconnecting',
  DISCONNECTED: 'Disconnected',
});

/**
 * Generates a stable key for an event to prevent duplicates.
 * Prefers the MongoDB _id string (`id`), and falls back to a deterministic compound key.
 */
export function getEventKey(event) {
  if (!event) return '';
  if (event.id) return `id:${event.id}`;
  const t = event.timestamp ? new Date(event.timestamp).getTime() : 0;
  const path = event.pagePath || event.url || '';
  if (event.type === 'click') {
    return `click|${event.sessionId || ''}|${t}|${Math.round(event.x ?? 0)},${Math.round(event.y ?? 0)}|${path}`;
  }
  return `${event.type || 'event'}|${event.sessionId || ''}|${t}|${path}`;
}

/**
 * Creates an in-memory deduplicator with a bounded capacity.
 */
export function createEventDeduplicator(maxSize = 2000) {
  const seen = new Set();
  const queue = [];

  function has(event) {
    const key = getEventKey(event);
    return seen.has(key);
  }

  function add(event) {
    const key = getEventKey(event);
    if (seen.has(key)) return false;
    if (seen.size >= maxSize) {
      const oldest = queue.shift();
      if (oldest) seen.delete(oldest);
    }
    seen.add(key);
    queue.push(key);
    return true;
  }

  function filterNew(events) {
    if (!Array.isArray(events)) return [];
    return events.filter((e) => {
      const isNew = !has(e);
      if (isNew) add(e);
      return isNew;
    });
  }

  function clear() {
    seen.clear();
    queue.length = 0;
  }

  return { has, add, filterNew, clear, size: () => seen.size };
}

/**
 * Applies an analytics:session-updated payload to a sessions list.
 * Returns { sessions, found, updatedSession }.
 */
export function applySessionUpdate(currentSessions = [], payload) {
  if (!payload || !payload.sessionId) {
    return { sessions: currentSessions, found: false, updatedSession: null };
  }

  let found = false;
  let updatedSession = null;

  const nextSessions = currentSessions.map((s) => {
    if (s.sessionId !== payload.sessionId) return s;
    found = true;
    const delta = payload.delta || {};
    const existingFirst = s.firstSeen ? new Date(s.firstSeen).getTime() : Infinity;
    const payloadFirst = payload.firstSeen ? new Date(payload.firstSeen).getTime() : Infinity;
    const existingLast = s.lastSeen ? new Date(s.lastSeen).getTime() : 0;
    const payloadLast = payload.lastSeen ? new Date(payload.lastSeen).getTime() : 0;

    const firstSeen = new Date(Math.min(existingFirst, payloadFirst)).toISOString();
    const lastSeen = new Date(Math.max(existingLast, payloadLast)).toISOString();

    updatedSession = {
      ...s,
      eventCount: (s.eventCount || 0) + (delta.eventCount || 0),
      pageViews: (s.pageViews || 0) + (delta.pageViews || 0),
      clicks: (s.clicks || 0) + (delta.clicks || 0),
      firstSeen,
      lastSeen,
    };
    return updatedSession;
  });

  if (found) {
    // Keep sorted by lastSeen descending
    nextSessions.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
    return { sessions: nextSessions, found: true, updatedSession };
  }

  // If new session and delta is sufficient to construct initial session row
  if (payload.delta) {
    const newSession = {
      sessionId: payload.sessionId,
      eventCount: payload.delta.eventCount || 0,
      pageViews: payload.delta.pageViews || 0,
      clicks: payload.delta.clicks || 0,
      firstSeen: payload.firstSeen || new Date().toISOString(),
      lastSeen: payload.lastSeen || new Date().toISOString(),
    };
    const sessions = [newSession, ...currentSessions].sort(
      (a, b) => new Date(b.lastSeen) - new Date(a.lastSeen),
    );
    return { sessions, found: false, isNew: true, updatedSession: newSession };
  }

  return { sessions: currentSessions, found: false, updatedSession: null };
}

/**
 * Appends a live event to a session journey timeline.
 * Deduplicates and guarantees ascending timestamp order.
 */
export function mergeTimelineEvent(events = [], newEvent, targetSessionId) {
  if (!newEvent || newEvent.sessionId !== targetSessionId) {
    return events;
  }

  const key = getEventKey(newEvent);
  if (events.some((e) => getEventKey(e) === key)) {
    return events; // Duplicate ignored
  }

  const normalized = {
    ...newEvent,
    url: newEvent.url || newEvent.pagePath || '',
    pagePath: newEvent.pagePath || (newEvent.url ? new URL(newEvent.url).pathname : ''),
  };

  const next = [...events, normalized];
  next.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return next;
}

/**
 * Merges incoming heatmap clicks for a page.
 * Clicks are ordered newest first and capped at maxClicks (default 10,000).
 */
export function mergeHeatmapClicks(currentClicks = [], newClicks = [], targetPagePath, maxClicks = 10000) {
  if (!Array.isArray(newClicks) || newClicks.length === 0) return currentClicks;

  const seen = new Set(currentClicks.map(getEventKey));
  const additions = [];

  for (const c of newClicks) {
    const key = getEventKey(c);
    if (!seen.has(key)) {
      seen.add(key);
      additions.push(c);
    }
  }

  if (additions.length === 0) return currentClicks;

  // Newest first
  const combined = [...additions, ...currentClicks];
  combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return combined.slice(0, maxClicks);
}

/**
 * Creates an activity feed item from a real-time analytics:event.
 */
export function createFeedItemFromEvent(event) {
  return {
    id: event.id || `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sessionId: event.sessionId,
    type: event.type,
    url: event.url || event.pagePath || '',
    pagePath: event.pagePath || '',
    timestamp: event.timestamp || new Date().toISOString(),
    x: event.type === 'click' ? event.x : undefined,
    y: event.type === 'click' ? event.y : undefined,
    title: event.title,
    origin: 'visitor',
    status: 'accepted',
    note: 'Confirmed in MongoDB (realtime)',
    awaiting: false,
    retryable: false,
  };
}
