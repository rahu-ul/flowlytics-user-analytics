import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStatus, eventKey, pilotPercent, feedReducer, pagePathOf, resolveRecord, selectResendable, summarizeFeed } from './demo.js';

const SID = 'sess-demo-0001';
const view = (t = 1000) => ({ sessionId: SID, type: 'page_view', url: 'https://x.test/demo/index.html?a=1#b', timestamp: t });
const click = (t = 2000, x = 10, y = 20) => ({ sessionId: SID, type: 'click', url: 'https://x.test/demo/index.html', timestamp: t, x, y });
const queue = (entries, id, event, origin) => feedReducer(entries, { type: 'queued', id, event, origin });

test('pagePathOf mirrors the API grouping (origin + pathname) and rejects non-http URLs', () => {
  assert.equal(pagePathOf('https://x.test/demo/index.html?a=1#b'), 'https://x.test/demo/index.html');
  assert.equal(pagePathOf('javascript:alert(1)'), null);
  assert.equal(pagePathOf('nope'), null);
});

test('new events start pending and are never shown as accepted by the reducer alone', () => {
  const entries = queue([], 1, view());
  assert.equal(entries[0].status, 'pending');
  assert.equal(entries[0].pagePath, 'https://x.test/demo/index.html');
  assert.equal(entries[0].x, undefined);
  const c = queue(entries, 2, click(), 'scripted');
  assert.deepEqual([c[0].x, c[0].y, c[0].origin], [10, 20, 'scripted']);
  assert.equal(c.length, 2);
});

test('accepted batch with partial rejection marks only the rejected index as failed', () => {
  let entries = queue(queue([], 1, view()), 2, click());
  const results = resolveRecord([1, 2], { phase: 'accepted', status: 202, accepted: 1, rejected: [{ index: 1, error: 'bad coordinates' }] });
  entries = feedReducer(entries, { type: 'resolve', results });
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  assert.equal(byId[1].status, 'accepted');
  assert.equal(byId[2].status, 'failed');
  assert.equal(byId[2].retryable, false);
  assert.match(byId[2].note, /bad coordinates/);
});

test('an accepted count that does not match the batch is treated as unconfirmed, not accepted', () => {
  const r = resolveRecord([1, 2], { phase: 'accepted', status: 202, accepted: 1, rejected: [] });
  assert.deepEqual(r.map((x) => [x.status, x.awaiting]), [['pending', true], ['pending', true]]);
});

test('network failure with a retry scheduled stays pending; final failure is failed and retryable', () => {
  const retrying = resolveRecord([1], { phase: 'failed', error: 'Failed to fetch', willRetry: true, attempt: 2 });
  assert.equal(retrying[0].status, 'pending');
  assert.match(retrying[0].note, /Retry 2 of 3/);
  const final = resolveRecord([1], { phase: 'failed', error: 'Failed to fetch', willRetry: false });
  assert.deepEqual([final[0].status, final[0].retryable], ['failed', true]);
});

test('HTTP errors: 5xx and 429 are retryable, other 4xx are not', () => {
  const r = (status) => resolveRecord([1], { phase: 'failed', status, error: `HTTP ${status}`, willRetry: false })[0];
  assert.equal(r(500).retryable, true);
  assert.equal(r(429).retryable, true);
  assert.equal(r(400).retryable, false);
  assert.equal(r(413).retryable, false);
});

test('beacon and unreadable replies are pending and awaiting confirmation', () => {
  for (const phase of ['beacon', 'sent']) {
    const [x] = resolveRecord([1], { phase });
    assert.deepEqual([x.status, x.awaiting], ['pending', true]);
  }
});

test('verification against stored events confirms matches only, for the same session', () => {
  let entries = queue(queue(queue([], 1, view(1000)), 2, click(2000, 5, 6)), 3, click(3000, 7, 8));
  entries = feedReducer(entries, { type: 'resolve', results: resolveRecord([1, 2, 3], { phase: 'beacon' }) });
  const stored = [
    { type: 'page_view', timestamp: new Date(1000).toISOString() },
    { type: 'click', timestamp: new Date(2000).toISOString(), x: 5, y: 6 },
  ];
  const wrongSession = feedReducer(entries, { type: 'verified', sessionId: 'other-session', stored });
  assert.equal(wrongSession.every((e) => e.status === 'pending'), true);
  const verified = feedReducer(entries, { type: 'verified', sessionId: SID, stored });
  const by = Object.fromEntries(verified.map((e) => [e.id, e.status]));
  assert.deepEqual(by, { 1: 'accepted', 2: 'accepted', 3: 'pending' }); // click at 3000 is not stored (yet)
});

test('duplicate identical events are matched one-to-one', () => {
  let entries = queue(queue([], 1, click(5000, 1, 1)), 2, click(5000, 1, 1));
  const stored = [{ type: 'click', timestamp: new Date(5000).toISOString(), x: 1, y: 1 }];
  entries = feedReducer(entries, { type: 'verified', sessionId: SID, stored });
  assert.equal(entries.filter((e) => e.status === 'accepted').length, 1);
});

test('selectResendable skips failed events that actually reached MongoDB (no duplicates) and non-retryable ones', () => {
  let entries = queue(queue(queue([], 1, view(1000)), 2, click(2000, 1, 2)), 3, click(3000, 3, 4));
  entries = feedReducer(entries, { type: 'resolve', results: [
    { id: 1, status: 'failed', note: 'x', retryable: true },
    { id: 2, status: 'failed', note: 'x', retryable: true },
    { id: 3, status: 'failed', note: 'rejected', retryable: false },
  ] });
  const stored = [{ type: 'page_view', timestamp: new Date(1000).toISOString() }];
  assert.deepEqual(selectResendable(entries, SID, stored).map((e) => e.id), [2]);
});

test('reset empties the feed and the feed is capped', () => {
  let entries = [];
  for (let i = 0; i < 230; i += 1) entries = queue(entries, i, click(i, 1, 1));
  assert.equal(entries.length, 200);
  assert.equal(entries[0].id, 229); // newest first
  assert.deepEqual(feedReducer(entries, { type: 'reset' }), []);
});

test('summarizeFeed counts by type and delivery status', () => {
  let entries = queue(queue(queue([], 1, view()), 2, click()), 3, click(2500));
  entries = feedReducer(entries, { type: 'resolve', results: [{ id: 1, status: 'accepted' }, { id: 3, status: 'failed' }] });
  assert.deepEqual(summarizeFeed(entries), { total: 3, pageViews: 1, clicks: 2, pending: 1, accepted: 1, failed: 1, awaiting: 0 });
});

test('eventKey is stable across ISO strings and epoch numbers', () => {
  assert.equal(eventKey({ type: 'click', timestamp: 2000, x: 1.4, y: 2 }), eventKey({ type: 'click', timestamp: new Date(2000).toISOString(), x: 1, y: 2 }));
});

test('deriveStatus covers every state and never claims simulation', () => {
  assert.equal(deriveStatus({ api: 'checking' }).label, 'Checking API');
  assert.equal(deriveStatus({ api: 'down', started: false }).tone, 'error');
  assert.equal(deriveStatus({ api: 'up', started: false }).label, 'Ready, not started');
  assert.equal(deriveStatus({ api: 'up', started: true, frame: 'loading' }).label, 'Loading store');
  assert.equal(deriveStatus({ api: 'up', started: true, frame: 'no-tracker' }).label, 'Tracking inactive');
  assert.equal(deriveStatus({ api: 'up', started: true, frame: 'load-failed' }).label, 'Store did not load');
  assert.equal(deriveStatus({ api: 'up', started: true, frame: 'load-failed' }).tone, 'error');
  assert.equal(deriveStatus({ api: 'up', started: true, frame: 'ready', lastDelivery: 'failed' }).label, 'Delivery failing');
  assert.equal(deriveStatus({ api: 'up', started: true, frame: 'ready', lastDelivery: 'ok' }).label, 'Live tracking');
  for (const s of [{ api: 'up', started: true, frame: 'ready' }, { api: 'down', started: true, frame: 'ready' }]) {
    assert.doesNotMatch(JSON.stringify(deriveStatus(s)), /simulat/i);
  }
});

test('pilotPercent reports honest progress for the scripted visitor', () => {
  assert.equal(pilotPercent(null), 0);
  assert.equal(pilotPercent({ state: 'idle', index: 0, total: 10 }), 0);
  assert.equal(pilotPercent({ state: 'running', index: 0, total: 10 }), 0);
  assert.equal(pilotPercent({ state: 'running', index: 5, total: 10 }), 50);
  assert.equal(pilotPercent({ state: 'paused', index: 3, total: 10 }), 30);
  assert.equal(pilotPercent({ state: 'done', index: 9, total: 10 }), 100);
  assert.equal(pilotPercent({ state: 'stopped', index: 4, total: 10 }), 0);
  assert.equal(pilotPercent({ state: 'running', index: 99, total: 10 }), 100);
});
