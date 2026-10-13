'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEvent, parseBatch, normalizePagePath } = require('../src/validation');

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const good = (o = {}) => ({ sessionId: 'abcd1234-ef', type: 'page_view', url: 'https://a.com/x?y=1#z', timestamp: NOW, ...o });

test('normalizePagePath strips query and hash, rejects non-http(s)', () => {
  assert.equal(normalizePagePath('https://a.com/x?y=1#z'), 'https://a.com/x');
  assert.equal(normalizePagePath('http://a.com'), 'http://a.com/');
  assert.equal(normalizePagePath('javascript:alert(1)'), null);
  assert.equal(normalizePagePath('/relative'), null);
  assert.equal(normalizePagePath(42), null);
});

test('parseEvent accepts a page_view and derives pagePath', () => {
  const { value, error } = parseEvent(good(), { now: NOW, userAgent: 'UA' });
  assert.equal(error, undefined);
  assert.equal(value.pagePath, 'https://a.com/x');
  assert.equal(value.url, 'https://a.com/x?y=1#z');
  assert.ok(value.timestamp instanceof Date);
  assert.equal(value.userAgent, 'UA');
});

test('click requires numeric x/y; extra fields are dropped', () => {
  assert.match(parseEvent(good({ type: 'click' }), { now: NOW }).error, /x and y/);
  assert.match(parseEvent(good({ type: 'click', x: -1, y: 5 }), { now: NOW }).error, /x and y/);
  const { value } = parseEvent(good({ type: 'click', x: 10.5, y: 20, docWidth: 1000, docHeight: 3000, evil: '$where' }), { now: NOW });
  assert.deepEqual([value.x, value.y, value.docWidth, value.docHeight], [10.5, 20, 1000, 3000]);
  assert.equal(value.evil, undefined);
});

test('rejects bad session ids, types, urls and timestamps', () => {
  assert.ok(parseEvent(good({ sessionId: 'short' }), { now: NOW }).error);
  assert.ok(parseEvent(good({ sessionId: { $ne: 1 } }), { now: NOW }).error);
  assert.ok(parseEvent(good({ type: 'scroll' }), { now: NOW }).error);
  assert.ok(parseEvent(good({ url: 'ftp://a.com' }), { now: NOW }).error);
  assert.ok(parseEvent(good({ timestamp: 'nope' }), { now: NOW }).error);
  assert.ok(parseEvent(good({ timestamp: NOW - 8 * 86400000 }), { now: NOW }).error);
  assert.ok(parseEvent(good({ timestamp: NOW + 3600000 }), { now: NOW }).error);
  assert.ok(parseEvent(null).error);
});

test('parseBatch handles single, batch, partial, and oversize input', () => {
  assert.equal(parseBatch(good(), { now: NOW }).valid.length, 1);
  const mixed = parseBatch({ events: [good(), good({ type: 'x' })] }, { now: NOW });
  assert.equal(mixed.valid.length, 1);
  assert.deepEqual(mixed.rejected.map((r) => r.index), [1]);
  assert.ok(parseBatch({ events: [] }).fatal);
  assert.ok(parseBatch({ events: Array(51).fill(good()) }).fatal);
  assert.ok(parseBatch('str').fatal);
});
