'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, ev } = require('./helpers/server');

const post = (base, body, headers = { 'content-type': 'application/json' }) =>
  fetch(`${base}/api/events`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

async function seed(base) {
  const t = Date.now() - 60_000;
  const A = 'session-A-0001', B = 'session-B-0002';
  const url = 'https://shop.example.com/products';
  const res = await post(base, {
    events: [
      ev({ sessionId: A, timestamp: t, url: url + '?ref=1' }),
      ev({ sessionId: A, type: 'click', x: 100, y: 200, docWidth: 1000, docHeight: 2000, timestamp: t + 1000, url }),
      ev({ sessionId: A, type: 'click', x: 300, y: 400, docWidth: 1000, docHeight: 2000, timestamp: t + 1000, url }),
      ev({ sessionId: B, timestamp: t + 5000, url: 'https://shop.example.com/cart' }),
    ],
  });
  assert.equal(res.status, 202);
  return { A, B, url };
}

test('POST /api/events stores events and reports rejects', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const res = await post(s.base, { events: [ev(), ev({ type: 'bogus' })] });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.accepted, 1);
  assert.equal(body.rejected[0].index, 1);
  assert.equal(s.collection.docs.length, 1);
  assert.equal(s.collection.docs[0].pagePath, 'https://shop.example.com/products');
});

test('POST accepts text/plain (sendBeacon style) and allows any origin via CORS', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const res = await post(s.base, JSON.stringify({ events: [ev()] }), { 'content-type': 'text/plain;charset=UTF-8', origin: 'https://random-site.com' });
  assert.equal(res.status, 202);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const pre = await fetch(`${s.base}/api/events`, { method: 'OPTIONS', headers: { origin: 'https://x.com', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.ok(pre.status === 204 || pre.status === 200);
});

test('POST validation errors: 400 for all-invalid, malformed JSON, oversize batch', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  assert.equal((await post(s.base, { events: [ev({ type: 'bogus' })] })).status, 400);
  assert.equal((await post(s.base, '{not json')).status, 400);
  assert.equal((await post(s.base, { events: Array(51).fill(ev()) })).status, 400);
  assert.equal(s.collection.docs.length, 0);
});

test('GET /api/sessions returns per-session counts, newest first, with pagination', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const { A, B } = await seed(s.base);
  const body = await (await fetch(`${s.base}/api/sessions`)).json();
  assert.equal(body.total, 2);
  assert.deepEqual(body.sessions.map((x) => x.sessionId), [B, A]); // B has the latest event
  const a = body.sessions.find((x) => x.sessionId === A);
  assert.deepEqual([a.eventCount, a.pageViews, a.clicks], [3, 1, 2]);
  const page2 = await (await fetch(`${s.base}/api/sessions?limit=1&page=2`)).json();
  assert.equal(page2.sessions.length, 1);
  assert.equal(page2.sessions[0].sessionId, A);
  assert.equal(page2.total, 2);
});

test('GET /api/sessions/:id/events returns an ordered journey; 404/400 handled', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const { A } = await seed(s.base);
  const body = await (await fetch(`${s.base}/api/sessions/${A}/events`)).json();
  assert.deepEqual(body.events.map((e) => e.type), ['page_view', 'click', 'click']);
  assert.deepEqual([body.events[1].x, body.events[2].x], [100, 300]); // same-ms events keep insert order
  assert.equal((await fetch(`${s.base}/api/sessions/nonexistent-1234/events`)).status, 404);
  assert.equal((await fetch(`${s.base}/api/sessions/bad!id/events`)).status, 400);
});

test('GET /api/sessions/:id/events only marks results truncated when an event is omitted', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const sessionId = 'session-limit-1';
  const timestamp = Date.now() - 60_000;
  s.collection.docs.push(...Array.from({ length: 5000 }, (_, i) => ({
    _id: i + 1,
    sessionId,
    type: 'page_view',
    url: 'https://shop.example.com/products',
    pagePath: 'https://shop.example.com/products',
    timestamp: new Date(timestamp + i),
  })));

  const exact = await (await fetch(`${s.base}/api/sessions/${sessionId}/events`)).json();
  assert.equal(exact.events.length, 5000);
  assert.equal(exact.truncated, false);

  s.collection.docs.push({
    _id: 5001,
    sessionId,
    type: 'page_view',
    url: 'https://shop.example.com/products',
    pagePath: 'https://shop.example.com/products',
    timestamp: new Date(timestamp + 5000),
  });
  const over = await (await fetch(`${s.base}/api/sessions/${sessionId}/events`)).json();
  assert.equal(over.events.length, 5000);
  assert.equal(over.truncated, true);
});

test('GET /api/pages and /api/heatmap aggregate by page (query/hash ignored)', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const { url } = await seed(s.base);
  const pages = (await (await fetch(`${s.base}/api/pages`)).json()).pages;
  assert.equal(pages[0].pagePath, url);
  assert.equal(pages[0].clicks, 2);
  const hm = await (await fetch(`${s.base}/api/heatmap?url=${encodeURIComponent(url + '?anything#x')}`)).json();
  assert.equal(hm.total, 2);
  assert.equal(hm.truncated, false);
  assert.deepEqual(hm.clicks.map((c) => [c.x, c.y]).sort(), [[100, 200], [300, 400]]);
  assert.equal(hm.clicks[0].sessionId, undefined);
  assert.equal((await fetch(`${s.base}/api/heatmap`)).status, 400);
  const empty = await (await fetch(`${s.base}/api/heatmap?url=https://nope.com/`)).json();
  assert.deepEqual([empty.total, empty.clicks.length], [0, 0]);
});

test('health reflects database availability; unknown API routes 404', async (ctx) => {
  const ok = await startTestServer(); ctx.after(ok.close);
  assert.equal((await fetch(`${ok.base}/api/health`)).status, 200);
  const down = await startTestServer({ ping: async () => { throw new Error('db down'); } }); ctx.after(down.close);
  assert.equal((await fetch(`${down.base}/api/health`)).status, 503);
  assert.equal((await fetch(`${ok.base}/api/nope`)).status, 404);
});

test('serves tracker.js cross-origin', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  const res = await fetch(`${s.base}/tracker.js`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.notEqual(res.headers.get('cross-origin-resource-policy'), 'same-origin');
});
