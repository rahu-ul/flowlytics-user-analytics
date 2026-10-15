'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');

test('existing configuration defaults and PORT handling are unchanged', () => {
  const c = loadConfig({});
  assert.deepEqual([c.port, c.dbName, c.dashboardOrigins, c.ingestRateLimitPerMin, c.trustProxy], [4000, 'causalfunnel_analytics', ['http://localhost:5173'], 600, false]);
  assert.equal(loadConfig({ PORT: '10000' }).port, 10000); // Render injects PORT
  assert.deepEqual(loadConfig({ DASHBOARD_ORIGINS: ' https://a.com , https://b.com ' }).dashboardOrigins, ['https://a.com', 'https://b.com']);
});

test('REALTIME_MAX_CLIENTS is optional, defaults to 200 and ignores invalid values', () => {
  assert.equal(loadConfig({}).realtimeMaxClients, 200);
  assert.equal(loadConfig({ REALTIME_MAX_CLIENTS: '25' }).realtimeMaxClients, 25);
  for (const bad of ['0', '-3', 'abc']) assert.equal(loadConfig({ REALTIME_MAX_CLIENTS: bad }).realtimeMaxClients, 200);
});
