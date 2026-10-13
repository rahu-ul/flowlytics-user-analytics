'use strict';
const { createApp } = require('../../src/app');
const { loadConfig } = require('../../src/config');
const { createRepository } = require('../../src/repository');
const { createFakeCollection } = require('./fakeCollection');

async function startTestServer(overrides = {}) {
  const collection = createFakeCollection();
  const repo = createRepository(collection, { ping: overrides.ping });
  const config = { ...loadConfig({}), ...overrides.config };
  const quiet = { error() {}, log() {} };
  const app = createApp({ repo, config, logger: quiet });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, collection, close: () => new Promise((r) => server.close(r)) };
}

const ev = (over = {}) => ({
  sessionId: 'sess-aaaa-1111',
  type: 'page_view',
  url: 'https://shop.example.com/products?utm=1#top',
  timestamp: Date.now(),
  ...over,
});

module.exports = { startTestServer, ev };
