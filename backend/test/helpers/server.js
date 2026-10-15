'use strict';
const { createServer } = require('../../src/createServer');
const { loadConfig } = require('../../src/config');
const { createRepository } = require('../../src/repository');
const { createFakeCollection } = require('./fakeCollection');

// Builds the same service server.js builds (Express + Socket.IO on one HTTP server) around an in-memory collection.
async function startTestServer(overrides = {}) {
  const collection = createFakeCollection();
  const repo = createRepository(collection, { ping: overrides.ping });
  const config = { ...loadConfig({}), ...overrides.config };
  const quiet = { error() {}, log() {} };
  const service = createServer({ repo, config, logger: quiet });
  await service.listen(0);
  const base = `http://127.0.0.1:${service.server.address().port}`;
  return { base, collection, service, io: service.io, close: () => service.close() };
}

const ev = (over = {}) => ({
  sessionId: 'sess-aaaa-1111',
  type: 'page_view',
  url: 'https://shop.example.com/products?utm=1#top',
  timestamp: Date.now(),
  ...over,
});

module.exports = { startTestServer, ev };
