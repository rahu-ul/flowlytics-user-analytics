'use strict';
// Exercises the ingest handler (the logic behind POST /api/events) with a real repository over the fake collection
// and a recording publisher. No HTTP server, so it also runs where only the pure modules are available.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createIngestHandler } = require('../src/ingestHandler');
const { createRepository } = require('../src/repository');
const { createFakeCollection } = require('./helpers/fakeCollection');

const ev = (over = {}) => ({ sessionId: 'sess-aaaa-1111', type: 'page_view', url: 'https://shop.example.com/products?utm=1#top', timestamp: Date.now(), ...over });
const click = (over = {}) => ev({ type: 'click', x: 5, y: 6, docWidth: 1000, docHeight: 2000, ...over });

function setup() {
  const collection = createFakeCollection();
  const published = [];
  const publisher = { publishPersisted: (entries) => published.push(entries) };
  const handler = createIngestHandler({ repo: createRepository(collection), publisher, logger: { error() {}, log() {} } });
  // Note: on success the handler publishes right after res.json(), in the same synchronous run, so `published`
  // is already filled when this promise's continuation runs.
  const post = (body) => new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; resolve({ res: this }); return this; } };
    handler({ body, get: () => 'test-agent' }, res, (err) => resolve({ res, err }));
  });
  const ids = () => published.flat().map((e) => e.id);
  return { collection, published, post, ids };
}

test('a persisted page_view is published once, with the id of its stored document', async () => {
  const s = setup();
  const { res } = await s.post({ events: [ev()] });
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { accepted: 1, rejected: [] });
  assert.equal(s.published.length, 1);
  assert.deepEqual(s.ids(), s.collection.docs.map((d) => String(d._id)));
  assert.equal(s.published[0][0].doc.type, 'page_view');
});

test('a persisted click is published with its coordinates', async () => {
  const s = setup();
  await s.post(click());
  assert.deepEqual([s.published[0][0].doc.x, s.published[0][0].doc.y], [5, 6]);
});

test('rejected events are never published: all-invalid batch gives 400 and no publish, no write', async () => {
  const s = setup();
  const { res } = await s.post({ events: [ev({ type: 'bogus' }), ev({ sessionId: 'x' })] });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'no valid events');
  assert.equal(s.published.length, 0);
  assert.equal(s.collection.docs.length, 0);
});

test('fatal payload errors are unchanged and never published', async () => {
  const s = setup();
  assert.equal((await s.post(null)).res.statusCode, 400);
  assert.equal((await s.post({ events: [] })).res.statusCode, 400);
  assert.equal((await s.post({ events: Array(51).fill(ev()) })).res.statusCode, 400);
  assert.equal(s.published.length, 0);
});

test('mixed batch: only the valid, persisted events are published; rejects are reported as before', async () => {
  const s = setup();
  const { res } = await s.post({ events: [ev(), ev({ type: 'bogus' }), click(), ev({ url: 'ftp://nope' })] });
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.accepted, 2);
  assert.deepEqual(res.body.rejected.map((r) => r.index), [1, 3]);
  assert.deepEqual(s.published.flat().map((e) => e.doc.type), ['page_view', 'click']);
  assert.deepEqual(s.ids(), s.collection.docs.map((d) => String(d._id)));
});

test('total MongoDB write failure: the error goes to the error handler and nothing is published', async () => {
  const s = setup();
  s.collection.failNext(new Error('connection reset'));
  const { res, err } = await s.post({ events: [ev(), click()] });
  assert.equal(err.message, 'connection reset');
  assert.equal(res.body, undefined, 'no success response was sent');
  assert.equal(s.published.length, 0);
  assert.equal(s.collection.docs.length, 0);
});

test('partial MongoDB failure: HTTP outcome is still an error, only the events that were stored are published', async () => {
  const s = setup();
  s.collection.failNext(new Error('write failed'), { storeFirst: 2 });
  const { res, err } = await s.post({ events: [ev(), click(), click({ x: 9 }), ev()] });
  assert.ok(err);
  assert.equal(res.body, undefined);
  assert.equal(s.collection.docs.length, 2);
  assert.deepEqual(s.ids(), s.collection.docs.map((d) => String(d._id)));
  assert.equal(s.ids().length, 2);
});

test('one persisted event produces exactly one publish entry, and ids are unique across requests', async () => {
  const s = setup();
  await s.post({ events: [ev(), ev()] });
  await s.post({ events: [ev()] });
  assert.equal(s.ids().length, 3);
  assert.equal(new Set(s.ids()).size, 3);
});

test('a throwing publisher cannot change the HTTP response', async () => {
  const collection = createFakeCollection();
  const handler = createIngestHandler({ repo: createRepository(collection), publisher: { publishPersisted() { throw new Error('boom'); } }, logger: { error() {} } });
  const out = await new Promise((resolve) => {
    const res = { status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    handler({ body: ev(), get: () => 'ua' }, res, (err) => resolve({ err }));
    setImmediate(() => resolve({ res }));
  });
  assert.equal(out.err, undefined);
  assert.equal(out.res.statusCode, 202);
  assert.equal(collection.docs.length, 1);
});
