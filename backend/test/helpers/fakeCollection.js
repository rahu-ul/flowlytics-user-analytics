'use strict';
// Minimal in-memory stand-in for a MongoDB collection. Queries and aggregation pipelines are executed
// by `mingo`, which implements MongoDB semantics, so the real pipelines in repository.js are exercised.
// It does NOT validate driver behaviour, indexes, or server-side limits.
const { Query, aggregate } = require('mingo');

function createFakeCollection() {
  const docs = [];
  let seq = 0;
  let plan = null;
  return {
    docs,
    // Failure injection for tests (one-shot). Mirrors the real driver's ordered insertMany:
    //   failNext(error)                    nothing is stored, `error` is thrown (e.g. a network error)
    //   failNext(error, { storeFirst: n }) the first n documents are stored, then a MongoBulkWriteError-shaped
    //                                      error is thrown. Like the real driver it lists the ids of ALL attempted
    //                                      documents in result.insertedIds, including the ones that failed, so
    //                                      code must rely on insertedCount rather than on that list.
    failNext(error, { storeFirst } = {}) {
      plan = { error, storeFirst };
    },
    async insertMany(arr) {
      const p = plan;
      plan = null;
      if (p && p.storeFirst === undefined) throw p.error;
      const storeCount = p ? p.storeFirst : arr.length;
      const insertedIds = {};
      arr.forEach((d, i) => {
        const id = i < storeCount ? ++seq : `unstored-${i}`;
        if (i < storeCount) docs.push({ _id: id, ...structuredClone(d) });
        if (d._id === undefined) d._id = id; // the driver writes _id onto documents that lack one
        insertedIds[i] = d._id;
      });
      if (p) {
        const err = new Error(p.error?.message || 'simulated bulk write failure');
        err.name = 'MongoBulkWriteError';
        err.writeErrors = [{ index: storeCount, errmsg: err.message }];
        err.result = { insertedCount: storeCount, insertedIds };
        throw err;
      }
      return { insertedCount: arr.length, insertedIds };
    },
    aggregate(pipeline) {
      return { toArray: async () => aggregate(docs, pipeline) };
    },
    find(filter, { projection } = {}) {
      let cursor = new Query(filter).find(docs, projection);
      const api = {
        sort(spec) { cursor = cursor.sort(spec); return api; },
        limit(n) { cursor = cursor.limit(n); return api; },
        toArray: async () => cursor.all(),
      };
      return api;
    },
    async countDocuments(filter) {
      return new Query(filter).find(docs).all().length;
    },
  };
}

module.exports = { createFakeCollection };
