'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepository } = require('../src/repository');
const { createFakeCollection } = require('./helpers/fakeCollection');

const doc = (n) => ({ sessionId: 'sess-aaaa-1111', type: 'page_view', url: 'https://a.com/x', pagePath: 'https://a.com/x', timestamp: new Date(1_000 + n) });

test('insertEvents keeps its original contract (returns the inserted count)', async () => {
  const repo = createRepository(createFakeCollection());
  assert.equal(await repo.insertEvents([doc(1), doc(2)]), 2);
  assert.equal(await repo.insertEvents([]), 0);
});

test('insertEventsConfirmed returns every stored document with its stable id', async () => {
  const col = createFakeCollection();
  const repo = createRepository(col);
  const { insertedCount, persisted, error } = await repo.insertEventsConfirmed([doc(1), doc(2), doc(3)]);
  assert.equal(error, null);
  assert.equal(insertedCount, 3);
  assert.deepEqual(persisted.map((p) => p.id), col.docs.map((d) => String(d._id)));
  assert.equal(new Set(persisted.map((p) => p.id)).size, 3, 'ids are unique');
});

test('insertEventsConfirmed with an empty list does not touch the database', async () => {
  const col = createFakeCollection();
  col.insertMany = async () => { throw new Error('must not be called'); };
  assert.deepEqual(await createRepository(col).insertEventsConfirmed([]), { insertedCount: 0, persisted: [], error: null });
});

test('a total write failure confirms nothing and returns the error instead of throwing', async () => {
  const col = createFakeCollection();
  const boom = new Error('connection reset');
  col.failNext(boom);
  const out = await createRepository(col).insertEventsConfirmed([doc(1), doc(2)]);
  assert.equal(out.error, boom);
  assert.deepEqual([out.insertedCount, out.persisted], [0, []]);
  assert.equal(col.docs.length, 0);
});

test('a bulk failure after N stored documents confirms exactly the first N (not the ids of the failed ones)', async () => {
  const col = createFakeCollection();
  col.failNext(new Error('duplicate key'), { storeFirst: 2 }); // the fake lists ids of all 4 attempted docs, like the driver
  const out = await createRepository(col).insertEventsConfirmed([doc(1), doc(2), doc(3), doc(4)]);
  assert.ok(out.error);
  assert.equal(out.insertedCount, 2);
  assert.deepEqual(out.persisted.map((p) => p.id), col.docs.map((d) => String(d._id)));
  assert.equal(col.docs.length, 2);
});

test('a bulk failure that stored nothing, and write-concern or unknown errors, confirm nothing', async () => {
  const repoWith = (error) => {
    const col = createFakeCollection();
    col.insertMany = async () => { throw error; };
    return createRepository(col);
  };
  const bulk = Object.assign(new Error('bulk'), { name: 'MongoBulkWriteError', writeErrors: [{ index: 0 }], result: { insertedCount: 0, insertedIds: { 0: 'x' } } });
  assert.equal((await repoWith(bulk).insertEventsConfirmed([doc(1)])).persisted.length, 0);
  const wc = Object.assign(new Error('wc'), { name: 'MongoBulkWriteError', writeConcernError: { code: 64 }, result: { insertedCount: 2, insertedIds: { 0: 'a', 1: 'b' } } });
  assert.equal((await repoWith(wc).insertEventsConfirmed([doc(1), doc(2)])).persisted.length, 0, 'unacknowledged writes are not confirmed');
  const unknown = Object.assign(new Error('socket closed'), { name: 'MongoNetworkError' });
  assert.equal((await repoWith(unknown).insertEventsConfirmed([doc(1)])).persisted.length, 0, 'unknown outcome is never reported as stored');
});

test('writeErrors cap the confirmed prefix even if insertedCount is larger', async () => {
  const col = createFakeCollection();
  col.insertMany = async (arr) => {
    arr.forEach((d, i) => { d._id = `id-${i}`; });
    throw Object.assign(new Error('bulk'), { name: 'MongoBulkWriteError', writeErrors: [{ index: 1 }], result: { insertedCount: 3, insertedIds: { 0: 'id-0', 1: 'id-1', 2: 'id-2' } } });
  };
  const out = await createRepository(col).insertEventsConfirmed([doc(1), doc(2), doc(3)]);
  assert.deepEqual(out.persisted.map((p) => p.id), ['id-0']);
});

test('ids are read from insertedIds or, failing that, from the _id the driver wrote onto the document', async () => {
  const col = createFakeCollection();
  col.insertMany = async (arr) => ({ insertedCount: arr.length, insertedIds: [{ index: 0, _id: 'from-array' }, { index: 1, _id: 'from-array-2' }] });
  assert.deepEqual((await createRepository(col).insertEventsConfirmed([doc(1), doc(2)])).persisted.map((p) => p.id), ['from-array', 'from-array-2']);
  const col2 = createFakeCollection();
  col2.insertMany = async (arr) => { arr[0]._id = 'mutated'; return { insertedCount: 1 }; };
  assert.deepEqual((await createRepository(col2).insertEventsConfirmed([doc(1)])).persisted.map((p) => p.id), ['mutated']);
  const col3 = createFakeCollection();
  col3.insertMany = async () => ({ insertedCount: 1 });
  assert.deepEqual((await createRepository(col3).insertEventsConfirmed([doc(1)])).persisted, [], 'an event whose id is unknown is not broadcast');
});
