'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'tracker.js'), 'utf8');

function boot(url = 'https://shop.example.com/products?x=1') {
  const dom = new JSDOM('<!doctype html><title>Products</title><body><button id="b">Buy</button></body>', { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const sent = [];
  window.CFAnalyticsConfig = { endpoint: 'https://api.test/api/events' };
  window.fetch = (u, opts) => { sent.push({ u, opts, body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true }); };
  window.eval(code);
  return { window, sent, events: () => sent.flatMap((s) => s.body.events) };
}

test('sends a page_view with session id, url, timestamp on flush', () => {
  const { window, events, sent } = boot();
  window.cfAnalytics.flush();
  assert.equal(sent[0].u, 'https://api.test/api/events');
  assert.equal(sent[0].opts.headers['Content-Type'].startsWith('text/plain'), true);
  const [e] = events();
  assert.equal(e.type, 'page_view');
  assert.equal(e.url, 'https://shop.example.com/products?x=1');
  assert.match(e.sessionId, /^[A-Za-z0-9_-]{8,64}$/);
  assert.ok(Math.abs(e.timestamp - Date.now()) < 5000);
  assert.equal(e.title, 'Products');
});

test('click events carry page x/y (viewport + scroll offset) and reuse the stored session', () => {
  const { window, events } = boot();
  window.pageXOffset = 10; window.pageYOffset = 500;
  window.document.getElementById('b').dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 40, clientY: 60, detail: 1 }));
  window.cfAnalytics.flush();
  const [pv, click] = events();
  assert.equal(click.type, 'click');
  assert.deepEqual([click.x, click.y], [50, 560]);
  assert.equal(click.sessionId, pv.sessionId);
  assert.equal(window.localStorage.getItem('cf_session') !== null, true);
});

test('keyboard/programmatic clicks (detail 0) are ignored', () => {
  const { window, events } = boot();
  window.document.getElementById('b').click();
  window.cfAnalytics.flush();
  assert.deepEqual(events().map((e) => e.type), ['page_view']);
});

test('SPA navigation via pushState emits another page_view; same URL does not', () => {
  const { window, events } = boot();
  window.history.pushState({}, '', '/cart');
  window.history.pushState({}, '', '/cart');
  window.cfAnalytics.flush();
  assert.deepEqual(events().map((e) => e.url), ['https://shop.example.com/products?x=1', 'https://shop.example.com/cart']);
});

test('a session expires after 30 minutes of inactivity', () => {
  const { window, events } = boot();
  const first = JSON.parse(window.localStorage.getItem('cf_session'));
  first.last -= 31 * 60 * 1000;
  window.localStorage.setItem('cf_session', JSON.stringify(first));
  window.document.getElementById('b').dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 1, clientY: 1, detail: 1 }));
  window.cfAnalytics.flush();
  const [pv, click] = events();
  assert.notEqual(click.sessionId, pv.sessionId);
});

// ---- observer API (used by the dashboard Demo page) --------------------------------------------

function bootWith(fetchImpl, { beacon } = {}) {
  const dom = new JSDOM('<!doctype html><title>Products</title><body><button id="b">Buy</button></body>', { url: 'https://shop.example.com/products', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const calls = [];
  window.CFAnalyticsConfig = { endpoint: 'https://api.test/api/events' };
  window.fetch = (u, opts) => { const body = JSON.parse(opts.body); calls.push(body.events); return fetchImpl(body.events, calls.length); };
  if (beacon) window.navigator.sendBeacon = beacon;
  window.eval(code);
  return { window, calls };
}

const jsonResponse = (status, payload) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(payload) });

test('subscribe replays earlier records, then reports the API confirmation (accepted)', async () => {
  const { window } = bootWith((batch) => jsonResponse(202, { accepted: batch.length, rejected: [] }));
  const seen = [];
  window.cfAnalytics.subscribe((r) => seen.push(r));
  assert.deepEqual(seen.map((r) => r.phase), ['queued']); // replayed from before the subscription
  assert.equal(seen[0].events[0].type, 'page_view');
  window.cfAnalytics.flush();
  await new Promise((r) => setTimeout(r, 10));
  const accepted = seen.find((r) => r.phase === 'accepted');
  assert.equal(accepted.status, 202);
  assert.equal(accepted.accepted, 1);
  assert.deepEqual(accepted.rejected, []);
  assert.strictEqual(accepted.events[0], seen[0].events[0]); // same object, so a host can match by identity
});

test('partial rejection from the API is reported per event index', async () => {
  const { window } = bootWith(() => jsonResponse(202, { accepted: 1, rejected: [{ index: 1, error: 'bad' }] }));
  const seen = [];
  window.cfAnalytics.subscribe((r) => seen.push(r));
  window.document.getElementById('b').dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5, detail: 1 }));
  window.cfAnalytics.flush();
  await new Promise((r) => setTimeout(r, 10));
  const accepted = seen.find((r) => r.phase === 'accepted');
  assert.equal(accepted.events.length, 2);
  assert.deepEqual(accepted.rejected, [{ index: 1, error: 'bad' }]);
});

test('a reply the tracker cannot read is "sent", never "accepted"', async () => {
  const { window } = bootWith(() => Promise.resolve({ ok: true }));
  const seen = [];
  window.cfAnalytics.subscribe((r) => seen.push(r));
  window.cfAnalytics.flush();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(seen.some((r) => r.phase === 'accepted'), false);
  assert.equal(seen.some((r) => r.phase === 'sent'), true);
});

test('HTTP errors are reported as failed and are not retried (behaviour unchanged)', async () => {
  const { window, calls } = bootWith(() => jsonResponse(500, { error: 'internal server error' }));
  const seen = [];
  window.cfAnalytics.subscribe((r) => seen.push(r));
  window.cfAnalytics.flush();
  await new Promise((r) => setTimeout(r, 10));
  const failed = seen.find((r) => r.phase === 'failed');
  assert.equal(failed.status, 500);
  assert.equal(failed.willRetry, false);
  assert.equal(failed.error, 'internal server error');
  assert.equal(calls.length, 1);
});

test('network failure reports a scheduled retry; requeue re-sends the same events', async () => {
  let n = 0;
  const { window, calls } = bootWith((batch) => (++n === 1 ? Promise.reject(new Error('Failed to fetch')) : jsonResponse(202, { accepted: batch.length, rejected: [] })));
  const seen = [];
  window.cfAnalytics.subscribe((r) => seen.push(r));
  window.cfAnalytics.flush();
  await new Promise((r) => setTimeout(r, 10));
  const failed = seen.find((r) => r.phase === 'failed');
  assert.equal(failed.willRetry, true);
  assert.equal(failed.attempt, 1);
  assert.equal(failed.error, 'Failed to fetch');
  window.cfAnalytics.requeue([failed.events[0]]);
  window.cfAnalytics.flush();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(seen.some((r) => r.phase === 'accepted'), true);
  assert.equal(calls[1][0].timestamp, calls[0][0].timestamp); // original payload, not a new event
});

test('sendBeacon on pagehide is reported as "beacon" (delivery cannot be observed)', () => {
  const beaconed = [];
  const { window } = bootWith(() => jsonResponse(202, {}), { beacon: (u, body) => { beaconed.push(body); return true; } });
  const seen = [];
  window.cfAnalytics.subscribe((r) => seen.push(r));
  window.dispatchEvent(new window.Event('pagehide'));
  assert.equal(beaconed.length, 1);
  assert.equal(seen.some((r) => r.phase === 'beacon'), true);
  assert.equal(seen.some((r) => r.phase === 'accepted'), false);
});

test('an observer that throws does not break tracking; unsubscribe stops notifications', () => {
  const { window, calls } = bootWith(() => jsonResponse(202, { accepted: 1, rejected: [] }));
  window.cfAnalytics.subscribe(() => { throw new Error('boom'); });
  const seen = [];
  const stop = window.cfAnalytics.subscribe((r) => seen.push(r.phase));
  stop();
  window.cfAnalytics.flush();
  assert.equal(calls.length, 1);
  assert.deepEqual(seen, ['queued']); // only the replay, nothing after unsubscribing
});

test('loading the tracker twice does not add listeners or a second page_view', () => {
  const { window, calls } = bootWith(() => jsonResponse(202, { accepted: 1, rejected: [] }));
  window.eval(code); // second load (e.g. the script tag included twice)
  window.document.getElementById('b').dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 1, clientY: 1, detail: 1 }));
  window.cfAnalytics.flush();
  assert.deepEqual(calls.flat().map((e) => e.type), ['page_view', 'click']);
});
