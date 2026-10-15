'use strict';
// End-to-end tests: the real Express app + real Socket.IO on ONE http server, an in-memory collection, and real
// socket.io-client connections. Requires `npm install` (socket.io, socket.io-client).
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connectClient } = require('socket.io-client');
const { startTestServer, ev } = require('./helpers/server');
const { EVENTS } = require('../src/publisher');

const post = (base, body, headers = { 'content-type': 'application/json' }) =>
  fetch(`${base}/api/events`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

async function until(predicate, label, timeoutMs = 3000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Connects a dashboard-like client and records everything it receives. */
async function dashboard(ctx, base, options = {}) {
  const socket = connectClient(base, { transports: ['websocket'], reconnection: false, forceNew: true, ...options });
  const got = { event: [], session: [], heatmap: [] };
  socket.on(EVENTS.EVENT, (p) => got.event.push(p));
  socket.on(EVENTS.SESSION_UPDATED, (p) => got.session.push(p));
  socket.on(EVENTS.HEATMAP_UPDATED, (p) => got.heatmap.push(p));
  ctx.after(() => socket.close());
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return { socket, got };
}

/**
 * Proves that everything broadcast so far has arrived: a sentinel event is persisted and awaited. Socket.IO keeps
 * per-connection order, so anything emitted before the sentinel would already be in `got` when it shows up.
 */
async function settle(base, d) {
  const sessionId = `sentinel-${Math.random().toString(36).slice(2, 10)}`;
  assert.equal((await post(base, ev({ sessionId }))).status, 202);
  await until(() => d.got.event.some((e) => e.sessionId === sessionId), 'sentinel broadcast');
  d.got.event = d.got.event.filter((e) => e.sessionId !== sessionId);
  d.got.session = d.got.session.filter((s) => s.sessionId !== sessionId);
}

const click = (over = {}) => ev({ type: 'click', x: 120, y: 340, docWidth: 1280, docHeight: 2000, url: 'https://shop.example.com/products', ...over });

test('a dashboard can connect to /socket.io on the same server that serves the REST API', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const d = await dashboard(ctx, s.base);
  assert.equal(d.socket.connected, true);
  assert.equal((await fetch(`${s.base}/api/health`)).status, 200); // REST keeps working beside the socket
});

test('a persisted page_view is broadcast with the documented analytics:event payload', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const d = await dashboard(ctx, s.base);
  const timestamp = Date.now() - 1000;
  assert.equal((await post(s.base, ev({ timestamp, title: 'Home' }))).status, 202);
  await until(() => d.got.event.length === 1, 'page_view broadcast');
  const stored = s.collection.docs[0];
  assert.deepEqual(d.got.event[0], {
    id: String(stored._id), type: 'page_view', sessionId: 'sess-aaaa-1111',
    pagePath: 'https://shop.example.com/products', timestamp: new Date(timestamp).toISOString(), title: 'Home',
  });
  for (const leaked of ['url', 'userAgent', 'receivedAt', '_id', 'utm']) assert.equal(JSON.stringify(d.got.event[0]).includes(leaked), false, leaked);
  await until(() => d.got.session.length === 1, 'session update');
  assert.deepEqual(d.got.session[0].delta, { eventCount: 1, pageViews: 1, clicks: 0 });
  assert.equal(d.got.heatmap.length, 0, 'a page view does not touch the heatmap');
});

test('a persisted click is broadcast with coordinates, a session delta and a heatmap update', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const d = await dashboard(ctx, s.base);
  assert.equal((await post(s.base, click())).status, 202);
  await until(() => d.got.event.length === 1 && d.got.session.length === 1 && d.got.heatmap.length === 1, 'click broadcasts');
  assert.equal(d.got.event[0].type, 'click');
  assert.deepEqual([d.got.event[0].x, d.got.event[0].y], [120, 340]);
  assert.deepEqual(d.got.session[0].delta, { eventCount: 1, pageViews: 0, clicks: 1 });
  assert.deepEqual(d.got.session[0].eventIds, [d.got.event[0].id]);
  assert.deepEqual(d.got.heatmap[0], {
    pagePath: 'https://shop.example.com/products',
    clicks: [{ id: d.got.event[0].id, x: 120, y: 340, timestamp: d.got.event[0].timestamp, docWidth: 1280, docHeight: 2000 }],
  });
});

test('a rejected event is not broadcast and the HTTP response is the existing 400', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const d = await dashboard(ctx, s.base);
  const res = await post(s.base, { events: [ev({ type: 'bogus' })] });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'no valid events');
  await settle(s.base, d);
  assert.deepEqual([d.got.event.length, d.got.session.length, d.got.heatmap.length], [0, 0, 0]);
  assert.equal(s.collection.docs.length, 1, 'only the sentinel was stored');
});

test('invalid items in a mixed batch are not broadcast; valid ones are, and the reply keeps its shape', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const d = await dashboard(ctx, s.base);
  const res = await post(s.base, { events: [ev({ sessionId: 'good-session-1' }), ev({ type: 'bogus' }), click({ sessionId: 'good-session-1' }), ev({ url: 'javascript:alert(1)' })] });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['accepted', 'rejected']);
  assert.equal(body.accepted, 2);
  assert.deepEqual(body.rejected.map((r) => r.index), [1, 3]);
  await settle(s.base, d);
  assert.deepEqual(d.got.event.map((e) => e.type), ['page_view', 'click']);
  assert.deepEqual(d.got.event.map((e) => e.id), s.collection.docs.slice(0, 2).map((x) => String(x._id)));
});

test('a MongoDB write failure produces a 500, no broadcast and no stored data', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const d = await dashboard(ctx, s.base);
  s.collection.failNext(new Error('connection reset'));
  const res = await post(s.base, { events: [ev(), click()] });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'internal server error' });
  await settle(s.base, d);
  assert.equal(d.got.event.length, 0);
  assert.equal(d.got.heatmap.length, 0);
  assert.equal(s.collection.docs.length, 1, 'only the sentinel was stored');
});

test('a partial MongoDB failure broadcasts only the events MongoDB confirmed', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const d = await dashboard(ctx, s.base);
  s.collection.failNext(new Error('write failed'), { storeFirst: 2 });
  const res = await post(s.base, { events: [ev(), click(), click({ x: 7 }), ev()] });
  assert.equal(res.status, 500);
  await settle(s.base, d);
  assert.equal(s.collection.docs.length, 3, 'two stored before the failure, plus the sentinel');
  assert.deepEqual(d.got.event.map((e) => e.id), s.collection.docs.slice(0, 2).map((x) => String(x._id)));
});

test('one persisted event produces exactly one broadcast per connected dashboard', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const a = await dashboard(ctx, s.base);
  const b = await dashboard(ctx, s.base);
  await post(s.base, { events: [ev({ sessionId: 'sess-one-0001' }), click({ sessionId: 'sess-one-0001' })] });
  // Use one shared sentinel to avoid cross-client contamination: sentinel-A posted for client a
  // would otherwise leak into client b's event log, inflating the count.
  const sentinelId = `sentinel-${Math.random().toString(36).slice(2, 10)}`;
  assert.equal((await post(s.base, ev({ sessionId: sentinelId }))).status, 202);
  await Promise.all([a, b].map((d) => until(() => d.got.event.some((e) => e.sessionId === sentinelId), 'sentinel broadcast')));
  for (const d of [a, b]) {
    d.got.event = d.got.event.filter((e) => e.sessionId !== sentinelId);
    d.got.session = d.got.session.filter((s) => s.sessionId !== sentinelId);
  }
  for (const d of [a, b]) {
    assert.equal(d.got.event.length, 2);
    assert.equal(new Set(d.got.event.map((e) => e.id)).size, 2);
    assert.equal(d.got.session.length, 1, 'one coalesced session message per request');
    assert.equal(d.got.heatmap.length, 1);
  }
  assert.deepEqual(a.got.event.map((e) => e.id), s.collection.docs.slice(0, 2).map((x) => String(x._id)));
});

test('HTTP API responses are unchanged while sockets are connected, and after they disconnect', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const d = await dashboard(ctx, s.base);
  const res = await post(s.base, { events: [ev({ sessionId: 'compat-sess-01' }), click({ sessionId: 'compat-sess-01' })] });
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { accepted: 2, rejected: [] });
  d.socket.close();
  const sessions = await (await fetch(`${s.base}/api/sessions`)).json();
  assert.deepEqual(Object.keys(sessions).sort(), ['limit', 'page', 'sessions', 'total']);
  assert.deepEqual([sessions.sessions[0].eventCount, sessions.sessions[0].pageViews, sessions.sessions[0].clicks], [2, 1, 1]);
  const events = await (await fetch(`${s.base}/api/sessions/compat-sess-01/events`)).json();
  assert.equal(events.events[0]._id, undefined, 'REST responses do not expose _id');
  assert.equal((await post(s.base, ev({ sessionId: 'compat-sess-02' }))).status, 202, 'ingest works with no dashboard connected');
});

test('clients cannot inject broadcasts or pick rooms: their events are ignored', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const attacker = await dashboard(ctx, s.base);
  const victim = await dashboard(ctx, s.base);
  attacker.socket.emit(EVENTS.EVENT, { id: 'forged', type: 'click', sessionId: 'victim-session', x: 1, y: 1 });
  attacker.socket.emit('join', 'some-private-room');
  attacker.socket.emit('subscribe', { sessionId: 'victim-session' });
  await settle(s.base, victim);
  assert.equal(victim.got.event.length, 0);
  assert.equal(attacker.socket.connected, true, 'unknown client events are ignored without disconnecting anyone');
});

test('the Socket.IO handshake enforces origins: allowed origins and same host pass, others get 403', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const handshake = (origin) => fetch(`${s.base}/socket.io/?EIO=4&transport=polling`, { headers: origin ? { origin } : {} });
  const allowed = await handshake('http://localhost:5173');
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal((await handshake()).status, 200, 'no Origin header (non-browser / same-origin polling)');
  assert.equal((await handshake(s.base)).status, 200, 'the origin that served the page');
  for (const bad of ['https://evil.example', 'null', 'http://localhost:5174']) {
    const res = await handshake(bad);
    assert.equal(res.status, 403, bad);
    assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
  }
});

test('a client from a disallowed origin cannot connect (polling and websocket)', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  for (const transports of [['polling'], ['websocket']]) {
    const socket = connectClient(s.base, { transports, reconnection: false, forceNew: true, extraHeaders: { origin: 'https://evil.example' } });
    ctx.after(() => socket.close());
    await new Promise((resolve, reject) => {
      socket.once('connect', () => reject(new Error(`connected from a disallowed origin via ${transports}`)));
      socket.once('connect_error', resolve);
    });
    assert.equal(socket.connected, false);
  }
});

test('DASHBOARD_ORIGINS drives the socket origin list, and the client script is not served', async (ctx) => {
  const s = await startTestServer({ config: { dashboardOrigins: ['https://dash.example.com'] } }); ctx.after(s.close);
  const ok = await fetch(`${s.base}/socket.io/?EIO=4&transport=polling`, { headers: { origin: 'https://dash.example.com' } });
  assert.equal(ok.status, 200);
  assert.equal((await fetch(`${s.base}/socket.io/?EIO=4&transport=polling`, { headers: { origin: 'http://localhost:5173' } })).status, 403);
  assert.notEqual((await fetch(`${s.base}/socket.io/socket.io.js`)).status, 200);
});

test('the number of concurrent dashboard sockets is capped (REALTIME_MAX_CLIENTS)', async (ctx) => {
  const s = await startTestServer({ config: { realtimeMaxClients: 1 } }); ctx.after(s.close);
  await dashboard(ctx, s.base);
  await assert.rejects(dashboard(ctx, s.base), /too many dashboard connections/);
});

test('a socket that disconnects abruptly does not affect other dashboards or the REST API', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const stays = await dashboard(ctx, s.base);
  const leaves = await dashboard(ctx, s.base);
  leaves.socket.io.engine.close(); // drop the transport without a clean Socket.IO disconnect
  assert.equal((await post(s.base, ev({ sessionId: 'after-drop-001' }))).status, 202);
  await until(() => stays.got.event.length === 1, 'broadcast to the remaining dashboard');
  assert.equal((await fetch(`${s.base}/api/health`)).status, 200);
});

test('graceful shutdown disconnects sockets, stops listening, and can be called twice', async (ctx) => {
  const s = await startTestServer();
  const d = await dashboard(ctx, s.base);
  const closed = new Promise((resolve) => d.socket.once('disconnect', resolve));
  assert.equal((await fetch(`${s.base}/api/health`)).status, 200);
  await s.close();
  await closed;
  assert.equal(d.socket.connected, false);
  assert.equal(s.service.server.listening, false);
  await assert.rejects(fetch(`${s.base}/api/health`), 'new connections are refused');
  await s.close(); // idempotent
});

test('close() on a server that never started listening still resolves', async () => {
  const { createServer } = require('../src/createServer');
  const { createRepository } = require('../src/repository');
  const { loadConfig } = require('../src/config');
  const { createFakeCollection } = require('./helpers/fakeCollection');
  const service = createServer({ repo: createRepository(createFakeCollection()), config: loadConfig({}), logger: { error() {}, log() {} } });
  await service.close();
});
