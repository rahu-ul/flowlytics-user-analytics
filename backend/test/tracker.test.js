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
