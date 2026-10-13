'use strict';

const { MongoClient } = require('mongodb');

async function ensureIndexes(events) {
  await Promise.all([
    // Session journey: all events of one session in order.
    events.createIndex({ sessionId: 1, timestamp: 1 }),
    // Heatmap / page list: clicks for a page.
    events.createIndex({ type: 1, pagePath: 1, timestamp: -1 }),
  ]);
}

async function connect(config) {
  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(config.dbName);
  const events = db.collection('events');
  await ensureIndexes(events);
  return { client, events, ping: () => db.command({ ping: 1 }) };
}

module.exports = { connect, ensureIndexes };
