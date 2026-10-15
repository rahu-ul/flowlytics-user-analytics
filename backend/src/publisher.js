'use strict';

/**
 * Real-time event publisher: turns events that MongoDB has CONFIRMED as stored into Socket.IO messages.
 *
 * It never reads the database and never sees an event that was not persisted: the ingest handler passes
 * it only the entries the repository confirmed. It never throws into the caller, so a socket problem
 * can never change the HTTP response of POST /api/events.
 *
 * Contracts are documented in docs/API.md ("Real-time (Socket.IO)").
 */

const EVENTS = Object.freeze({
  EVENT: 'analytics:event',
  SESSION_UPDATED: 'analytics:session-updated',
  HEATMAP_UPDATED: 'analytics:heatmap-updated',
});

// Every dashboard socket is placed in this server-defined room on connect. Clients cannot choose rooms.
const DASHBOARD_ROOM = 'analytics:dashboard';

const toIso = (value) => (value instanceof Date ? value : new Date(value)).toISOString();

/** analytics:event — one persisted event. `id` is the MongoDB _id as a string. */
function toEventPayload({ id, doc }) {
  const payload = {
    id,
    type: doc.type,
    sessionId: doc.sessionId,
    pagePath: doc.pagePath,
    timestamp: toIso(doc.timestamp),
  };
  if (doc.type === 'click') {
    payload.x = doc.x;
    payload.y = doc.y;
  } else if (doc.title) {
    payload.title = doc.title;
  }
  return payload;
}

/**
 * analytics:session-updated — one message per affected session per ingest request.
 * `delta` counts only the events newly persisted by that request (never a total).
 */
function toSessionPayloads(entries) {
  const bySession = new Map();
  for (const { id, doc } of entries) {
    const ts = new Date(doc.timestamp).getTime();
    let s = bySession.get(doc.sessionId);
    if (!s) {
      s = { sessionId: doc.sessionId, delta: { eventCount: 0, pageViews: 0, clicks: 0 }, first: ts, last: ts, eventIds: [] };
      bySession.set(doc.sessionId, s);
    }
    s.delta.eventCount += 1;
    if (doc.type === 'page_view') s.delta.pageViews += 1;
    else if (doc.type === 'click') s.delta.clicks += 1;
    s.first = Math.min(s.first, ts);
    s.last = Math.max(s.last, ts);
    s.eventIds.push(id);
  }
  return [...bySession.values()].map((s) => ({
    sessionId: s.sessionId,
    delta: s.delta,
    firstSeen: toIso(s.first),
    lastSeen: toIso(s.last),
    eventIds: s.eventIds,
  }));
}

/** analytics:heatmap-updated — newly persisted clicks grouped by normalized page path. */
function toHeatmapPayloads(entries) {
  const byPage = new Map();
  for (const { id, doc } of entries) {
    if (doc.type !== 'click') continue;
    const click = { id, x: doc.x, y: doc.y, timestamp: toIso(doc.timestamp) };
    if (doc.docWidth !== undefined) click.docWidth = doc.docWidth;
    if (doc.docHeight !== undefined) click.docHeight = doc.docHeight;
    if (!byPage.has(doc.pagePath)) byPage.set(doc.pagePath, []);
    byPage.get(doc.pagePath).push(click);
  }
  return [...byPage.entries()].map(([pagePath, clicks]) => ({ pagePath, clicks }));
}

function createPublisher({ logger = console } = {}) {
  let io = null;
  return {
    /** Attach the Socket.IO server once it exists (it needs the HTTP server, which needs the app). */
    bind(server) {
      io = server;
    },

    /**
     * @param {Array<{id: string, doc: object}>} entries events confirmed as persisted
     * @returns {{events: number, sessions: number, heatmaps: number}} what was emitted
     */
    publishPersisted(entries) {
      const emitted = { events: 0, sessions: 0, heatmaps: 0 };
      if (!io || !Array.isArray(entries) || entries.length === 0) return emitted;
      try {
        const room = io.to(DASHBOARD_ROOM);
        for (const entry of entries) {
          room.emit(EVENTS.EVENT, toEventPayload(entry));
          emitted.events += 1;
        }
        for (const payload of toSessionPayloads(entries)) {
          room.emit(EVENTS.SESSION_UPDATED, payload);
          emitted.sessions += 1;
        }
        for (const payload of toHeatmapPayloads(entries)) {
          room.emit(EVENTS.HEATMAP_UPDATED, payload);
          emitted.heatmaps += 1;
        }
      } catch (err) {
        logger.error('realtime publish failed:', err && err.message);
      }
      return emitted;
    },
  };
}

const noopPublisher = Object.freeze({
  bind() {},
  publishPersisted: () => ({ events: 0, sessions: 0, heatmaps: 0 }),
});

module.exports = { EVENTS, DASHBOARD_ROOM, createPublisher, noopPublisher, toEventPayload, toSessionPayloads, toHeatmapPayloads };
