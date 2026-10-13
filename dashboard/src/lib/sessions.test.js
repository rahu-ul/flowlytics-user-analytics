import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEvents } from './sessions.js';

test('summarizes counts, pages and duration', () => {
  const s = summarizeEvents([
    { type: 'page_view', url: 'https://a.com/', pagePath: 'https://a.com/', timestamp: '2026-10-13T10:00:00.000Z' },
    { type: 'click', url: 'https://a.com/', pagePath: 'https://a.com/', timestamp: '2026-10-13T10:00:05.000Z', x: 1, y: 2 },
    { type: 'page_view', url: 'https://a.com/pricing', pagePath: 'https://a.com/pricing', timestamp: '2026-10-13T10:01:00.000Z' },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.pageViews, 2);
  assert.equal(s.clicks, 1);
  assert.equal(s.pagesVisited, 2);
  assert.equal(s.durationMs, 60000);
  assert.equal(new Date(s.first).toISOString(), '2026-10-13T10:00:00.000Z');
});

test('handles an empty list', () => {
  assert.deepEqual(summarizeEvents([]), { count: 0, pageViews: 0, clicks: 0, pagesVisited: 0, first: null, last: null, durationMs: 0 });
});
