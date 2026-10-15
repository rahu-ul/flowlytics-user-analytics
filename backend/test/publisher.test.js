'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EVENTS, DASHBOARD_ROOM, createPublisher, noopPublisher, toEventPayload, toSessionPayloads, toHeatmapPayloads } = require('../src/publisher');

const T = Date.UTC(2026, 9, 15, 10, 0, 0);
const view = (id, over = {}) => ({ id, doc: { sessionId: 'sess-aaaa-1111', type: 'page_view', url: 'https://a.com/p?token=secret', pagePath: 'https://a.com/p', timestamp: new Date(T), receivedAt: new Date(T + 5), userAgent: 'UA', title: 'Home', ...over } });
const click = (id, over = {}) => ({ id, doc: { sessionId: 'sess-aaaa-1111', type: 'click', url: 'https://a.com/p?token=secret', pagePath: 'https://a.com/p', timestamp: new Date(T + 1000), x: 10, y: 20, docWidth: 1280, docHeight: 900, viewportWidth: 800, ...over } });

function fakeIo() {
  const sent = [];
  return { sent, to(room) { return { emit: (name, payload) => sent.push({ room, name, payload }) }; } };
}

test('event contract names are stable', () => {
  assert.deepEqual({ ...EVENTS }, { EVENT: 'analytics:event', SESSION_UPDATED: 'analytics:session-updated', HEATMAP_UPDATED: 'analytics:heatmap-updated' });
  assert.equal(DASHBOARD_ROOM, 'analytics:dashboard');
});

test('analytics:event carries only the whitelisted fields (no url/query string, no internals)', () => {
  assert.deepEqual(toEventPayload(view('a1')), { id: 'a1', type: 'page_view', sessionId: 'sess-aaaa-1111', pagePath: 'https://a.com/p', timestamp: '2026-10-15T10:00:00.000Z', title: 'Home' });
  assert.deepEqual(toEventPayload(click('a2')), { id: 'a2', type: 'click', sessionId: 'sess-aaaa-1111', pagePath: 'https://a.com/p', timestamp: '2026-10-15T10:00:01.000Z', x: 10, y: 20 });
  const json = JSON.stringify(toEventPayload(view('a1')));
  for (const leaked of ['token', 'UA', 'receivedAt', '_id', 'url']) assert.equal(json.includes(leaked), false, leaked);
});

test('analytics:session-updated: one message per session with batch deltas, not totals', () => {
  const out = toSessionPayloads([view('1'), click('2'), click('3', { timestamp: new Date(T + 5000) }), view('4', { sessionId: 'other-sess-22' })]);
  assert.equal(out.length, 2);
  const a = out.find((s) => s.sessionId === 'sess-aaaa-1111');
  assert.deepEqual(a.delta, { eventCount: 3, pageViews: 1, clicks: 2 });
  assert.equal(a.firstSeen, '2026-10-15T10:00:00.000Z');
  assert.equal(a.lastSeen, '2026-10-15T10:00:05.000Z');
  assert.deepEqual(a.eventIds, ['1', '2', '3']);
});

test('session lastSeen/firstSeen use event timestamps, not arrival order', () => {
  const [s] = toSessionPayloads([click('late', { timestamp: new Date(T + 9000) }), view('early', { timestamp: new Date(T - 4000) })]);
  assert.equal(s.firstSeen, new Date(T - 4000).toISOString());
  assert.equal(s.lastSeen, new Date(T + 9000).toISOString());
});

test('analytics:heatmap-updated groups clicks by normalized page path and skips page views', () => {
  assert.deepEqual(toHeatmapPayloads([view('1'), click('2'), click('3', { pagePath: 'https://a.com/other', x: 1, y: 2, docWidth: undefined, docHeight: undefined })]), [
    { pagePath: 'https://a.com/p', clicks: [{ id: '2', x: 10, y: 20, timestamp: '2026-10-15T10:00:01.000Z', docWidth: 1280, docHeight: 900 }] },
    { pagePath: 'https://a.com/other', clicks: [{ id: '3', x: 1, y: 2, timestamp: '2026-10-15T10:00:01.000Z' }] },
  ]);
  assert.deepEqual(toHeatmapPayloads([view('1')]), []);
});

test('publishPersisted emits exactly one analytics:event per persisted event, all to the dashboard room', () => {
  const io = fakeIo();
  const pub = createPublisher(); pub.bind(io);
  const out = pub.publishPersisted([view('1'), click('2'), click('3')]);
  assert.deepEqual(out, { events: 3, sessions: 1, heatmaps: 1 });
  assert.deepEqual(io.sent.filter((m) => m.name === EVENTS.EVENT).map((m) => m.payload.id), ['1', '2', '3']);
  assert.equal(io.sent.every((m) => m.room === DASHBOARD_ROOM), true);
  assert.equal(io.sent.filter((m) => m.name === EVENTS.SESSION_UPDATED).length, 1);
});

test('nothing is emitted for an empty list, or before a server is bound', () => {
  const io = fakeIo();
  const pub = createPublisher();
  assert.deepEqual(pub.publishPersisted([view('1')]), { events: 0, sessions: 0, heatmaps: 0 });
  pub.bind(io);
  pub.publishPersisted([]);
  assert.equal(io.sent.length, 0);
  assert.deepEqual(noopPublisher.publishPersisted([view('1')]), { events: 0, sessions: 0, heatmaps: 0 });
});

test('a failing socket server never throws into the caller', () => {
  const errors = [];
  const pub = createPublisher({ logger: { error: (...a) => errors.push(a.join(' ')) } });
  pub.bind({ to() { throw new Error('adapter down'); } });
  assert.doesNotThrow(() => pub.publishPersisted([view('1')]));
  assert.match(errors[0], /adapter down/);
});
