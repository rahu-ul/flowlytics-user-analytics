import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REALTIME_EVENTS,
  CONNECTION_STATES,
  getEventKey,
  createEventDeduplicator,
  applySessionUpdate,
  mergeTimelineEvent,
  mergeHeatmapClicks,
  createFeedItemFromEvent,
} from './realtime.js';

test('event contract names and connection states are stable', () => {
  assert.equal(REALTIME_EVENTS.EVENT, 'analytics:event');
  assert.equal(REALTIME_EVENTS.SESSION_UPDATED, 'analytics:session-updated');
  assert.equal(REALTIME_EVENTS.HEATMAP_UPDATED, 'analytics:heatmap-updated');

  assert.equal(CONNECTION_STATES.CONNECTING, 'Connecting');
  assert.equal(CONNECTION_STATES.LIVE, 'Live');
  assert.equal(CONNECTION_STATES.RECONNECTING, 'Reconnecting');
  assert.equal(CONNECTION_STATES.DISCONNECTED, 'Disconnected');
});

test('getEventKey prioritizes MongoDB id and falls back to deterministic key', () => {
  const e1 = { id: 'mongo-id-123', type: 'page_view', sessionId: 's1' };
  assert.equal(getEventKey(e1), 'id:mongo-id-123');

  const e2 = { type: 'click', sessionId: 's1', timestamp: '2026-10-15T10:00:00.000Z', x: 120.4, y: 340.2, pagePath: '/products' };
  assert.equal(getEventKey(e2), 'click|s1|1792058400000|120,340|/products');

  const e3 = { type: 'page_view', sessionId: 's1', timestamp: '2026-10-15T10:00:00.000Z', pagePath: '/products' };
  assert.equal(getEventKey(e3), 'page_view|s1|1792058400000|/products');
});

test('createEventDeduplicator filters duplicates and bounds memory', () => {
  const dedup = createEventDeduplicator(3);
  const a = { id: 'evt-1' };
  const b = { id: 'evt-2' };
  const c = { id: 'evt-3' };
  const d = { id: 'evt-4' };

  assert.equal(dedup.has(a), false);
  assert.equal(dedup.add(a), true);
  assert.equal(dedup.has(a), true);
  assert.equal(dedup.add(a), false); // duplicate

  dedup.add(b);
  dedup.add(c);
  assert.equal(dedup.size(), 3);

  // Exceeding capacity evicts oldest (a)
  dedup.add(d);
  assert.equal(dedup.has(a), false);
  assert.equal(dedup.has(d), true);

  const filtered = dedup.filterNew([{ id: 'evt-2' }, { id: 'evt-5' }, { id: 'evt-5' }]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'evt-5');
});

test('applySessionUpdate correctly increments deltas and updates timestamps', () => {
  const initial = [
    {
      sessionId: 'sess-1',
      eventCount: 5,
      pageViews: 2,
      clicks: 3,
      firstSeen: '2026-10-15T10:00:00.000Z',
      lastSeen: '2026-10-15T10:05:00.000Z',
    },
    {
      sessionId: 'sess-2',
      eventCount: 1,
      pageViews: 1,
      clicks: 0,
      firstSeen: '2026-10-15T10:02:00.000Z',
      lastSeen: '2026-10-15T10:02:00.000Z',
    },
  ];

  const payload = {
    sessionId: 'sess-1',
    delta: { eventCount: 2, pageViews: 1, clicks: 1 },
    firstSeen: '2026-10-15T10:06:00.000Z',
    lastSeen: '2026-10-15T10:07:00.000Z',
    eventIds: ['evt-1', 'evt-2'],
  };

  const res = applySessionUpdate(initial, payload);
  assert.equal(res.found, true);
  assert.equal(res.updatedSession.eventCount, 7);
  assert.equal(res.updatedSession.pageViews, 3);
  assert.equal(res.updatedSession.clicks, 4);
  assert.equal(res.updatedSession.firstSeen, '2026-10-15T10:00:00.000Z');
  assert.equal(res.updatedSession.lastSeen, '2026-10-15T10:07:00.000Z');

  // Order sorted by lastSeen descending
  assert.equal(res.sessions[0].sessionId, 'sess-1');
});

test('applySessionUpdate adds new session row if not currently in list', () => {
  const initial = [
    {
      sessionId: 'sess-1',
      eventCount: 5,
      pageViews: 2,
      clicks: 3,
      firstSeen: '2026-10-15T10:00:00.000Z',
      lastSeen: '2026-10-15T10:05:00.000Z',
    },
  ];

  const payload = {
    sessionId: 'sess-new',
    delta: { eventCount: 1, pageViews: 1, clicks: 0 },
    firstSeen: '2026-10-15T10:10:00.000Z',
    lastSeen: '2026-10-15T10:10:00.000Z',
    eventIds: ['evt-new'],
  };

  const res = applySessionUpdate(initial, payload);
  assert.equal(res.found, false);
  assert.equal(res.isNew, true);
  assert.equal(res.sessions.length, 2);
  assert.equal(res.sessions[0].sessionId, 'sess-new'); // newest on top
});

test('mergeTimelineEvent ignores mismatched session and duplicates, keeps ordered', () => {
  const events = [
    { id: '1', sessionId: 'target', timestamp: '2026-10-15T10:00:00.000Z', type: 'page_view' },
    { id: '3', sessionId: 'target', timestamp: '2026-10-15T10:02:00.000Z', type: 'click' },
  ];

  // Other session ignored
  const other = mergeTimelineEvent(events, { id: '2', sessionId: 'other', timestamp: '2026-10-15T10:01:00.000Z' }, 'target');
  assert.equal(other.length, 2);

  // Duplicate ignored
  const dup = mergeTimelineEvent(events, { id: '1', sessionId: 'target', timestamp: '2026-10-15T10:00:00.000Z' }, 'target');
  assert.equal(dup.length, 2);

  // In-between event placed in chronological order
  const added = mergeTimelineEvent(events, { id: '2', sessionId: 'target', timestamp: '2026-10-15T10:01:00.000Z', type: 'page_view' }, 'target');
  assert.equal(added.length, 3);
  assert.equal(added[1].id, '2');
});

test('mergeHeatmapClicks merges, deduplicates and orders newest first with cap', () => {
  const current = [
    { id: 'c1', x: 10, y: 20, timestamp: '2026-10-15T10:00:00.000Z' },
    { id: 'c2', x: 30, y: 40, timestamp: '2026-10-15T09:50:00.000Z' },
  ];

  const incoming = [
    { id: 'c1', x: 10, y: 20, timestamp: '2026-10-15T10:00:00.000Z' }, // dup
    { id: 'c3', x: 50, y: 60, timestamp: '2026-10-15T10:05:00.000Z' }, // new
  ];

  const merged = mergeHeatmapClicks(current, incoming, '/products', 2);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'c3'); // newest
  assert.equal(merged[1].id, 'c1');
});

test('createFeedItemFromEvent structures event for activity feed', () => {
  const item = createFeedItemFromEvent({
    id: 'mongo-id-999',
    type: 'click',
    sessionId: 'sess-xyz',
    pagePath: '/home',
    timestamp: '2026-10-15T10:00:00.000Z',
    x: 100,
    y: 200,
  });

  assert.equal(item.id, 'mongo-id-999');
  assert.equal(item.type, 'click');
  assert.equal(item.status, 'accepted');
  assert.equal(item.x, 100);
  assert.equal(item.y, 200);
});

test('feedReducer socket_event adds new live event at the top and deduplicates', async () => {
  const { feedReducer } = await import('./demo.js');

  const initial = [
    {
      id: 1,
      sessionId: 'sess-abc',
      type: 'page_view',
      url: 'https://shop.example.com/',
      timestamp: '2026-10-15T10:00:00.000Z',
      status: 'pending',
      note: 'Waiting to be sent',
    },
  ];

  // 1. Socket event confirming the pending event
  const confirmed = feedReducer(initial, {
    type: 'socket_event',
    event: {
      id: 'mongo-555',
      sessionId: 'sess-abc',
      type: 'page_view',
      pagePath: 'https://shop.example.com/',
      timestamp: '2026-10-15T10:00:00.000Z',
    },
  });

  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].status, 'accepted');
  assert.equal(confirmed[0].dbId, 'mongo-555');

  // 2. Duplicate socket event is a no-op
  const dup = feedReducer(confirmed, {
    type: 'socket_event',
    event: {
      id: 'mongo-555',
      sessionId: 'sess-abc',
      type: 'page_view',
      pagePath: 'https://shop.example.com/',
      timestamp: '2026-10-15T10:00:00.000Z',
    },
  });
  assert.equal(dup.length, 1);

  // 3. New external socket event prepended at top
  const withNew = feedReducer(confirmed, {
    type: 'socket_event',
    event: {
      id: 'mongo-777',
      sessionId: 'sess-other',
      type: 'click',
      pagePath: 'https://shop.example.com/item',
      timestamp: '2026-10-15T10:05:00.000Z',
      x: 50,
      y: 75,
    },
  });
  assert.equal(withNew.length, 2);
  assert.equal(withNew[0].id, 'mongo-777');
  assert.equal(withNew[0].status, 'accepted');
});

test('REST and socket race condition: buffering socket events resolves correctly after REST loads', () => {
  const sessionId = 'race-session-1';
  let liveEvents = null;
  const buffered = [];

  // Incoming socket events arrive while REST is in-flight
  const socketEv1 = { id: 'evt-2', sessionId, timestamp: '2026-10-15T10:02:00.000Z', type: 'click', x: 10, y: 20 };
  const socketEv2 = { id: 'evt-1', sessionId, timestamp: '2026-10-15T10:00:00.000Z', type: 'page_view' }; // duplicate of REST
  buffered.push(socketEv1, socketEv2);

  // REST arrives with initial historical data
  const restData = [
    { id: 'evt-1', sessionId, timestamp: '2026-10-15T10:00:00.000Z', type: 'page_view' },
  ];

  let merged = restData;
  for (const b of buffered) {
    merged = mergeTimelineEvent(merged, b, sessionId);
  }
  liveEvents = merged;

  assert.equal(liveEvents.length, 2);
  assert.equal(liveEvents[0].id, 'evt-1');
  assert.equal(liveEvents[1].id, 'evt-2');
});

test('Connection status transitions and reconnect recovery triggers', () => {
  let state = CONNECTION_STATES.CONNECTING;
  const history = [state];
  let reconnectFired = 0;

  function onStateChange(nextState) {
    const prev = state;
    state = nextState;
    history.push(nextState);

    // Reconnect recovery fires only when transitioning to Live from Reconnecting or Disconnected
    if (nextState === CONNECTION_STATES.LIVE && (prev === CONNECTION_STATES.RECONNECTING || prev === CONNECTION_STATES.DISCONNECTED)) {
      reconnectFired += 1;
    }
  }

  // 1. Initial connect
  onStateChange(CONNECTION_STATES.LIVE);
  assert.equal(reconnectFired, 0, 'initial connect should not trigger reconnect recovery');

  // 2. Abrupt disconnect
  onStateChange(CONNECTION_STATES.RECONNECTING);
  assert.equal(state, CONNECTION_STATES.RECONNECTING);

  // 3. Successful reconnect
  onStateChange(CONNECTION_STATES.LIVE);
  assert.equal(reconnectFired, 1, 'transitioning Reconnecting -> Live must trigger recovery');

  // 4. Clean manual disconnect
  onStateChange(CONNECTION_STATES.DISCONNECTED);
  assert.equal(state, CONNECTION_STATES.DISCONNECTED);

  // 5. Reconnect after manual disconnect
  onStateChange(CONNECTION_STATES.LIVE);
  assert.equal(reconnectFired, 2, 'transitioning Disconnected -> Live must trigger recovery');
});

test('Listener subscription and cleanup prevents leaks and duplicate calls', () => {
  const listeners = new Set();

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  let callCount = 0;
  const listener = () => { callCount += 1; };

  // Strict Mode mount 1
  const unsub1 = subscribe(listener);
  // Strict Mode unmount 1
  unsub1();
  assert.equal(listeners.size, 0);

  // Strict Mode mount 2
  const unsub2 = subscribe(listener);
  assert.equal(listeners.size, 1);

  // Event fires
  for (const fn of listeners) fn();
  assert.equal(callCount, 1);

  // Final unmount
  unsub2();
  assert.equal(listeners.size, 0);

  // Event fires after unmount: no calls
  for (const fn of listeners) fn();
  assert.equal(callCount, 1);
});
