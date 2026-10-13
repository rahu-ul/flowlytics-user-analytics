'use strict';
// Minimal in-memory stand-in for a MongoDB collection. Queries and aggregation pipelines are executed
// by `mingo`, which implements MongoDB semantics, so the real pipelines in repository.js are exercised.
// It does NOT validate driver behaviour, indexes, or server-side limits.
const { Query, aggregate } = require('mingo');

function createFakeCollection() {
  const docs = [];
  let seq = 0;
  return {
    docs,
    async insertMany(arr) {
      for (const d of arr) docs.push({ _id: ++seq, ...structuredClone(d) });
      return { insertedCount: arr.length };
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
