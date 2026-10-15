'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createShutdown } = require('../src/shutdown');

const quiet = () => { const l = { out: [], err: [], log: (m) => l.out.push(m), error: (...a) => l.err.push(a.join(' ')) }; return l; };

test('runs steps in order (http+socket.io before mongodb) and exits 0', async () => {
  const order = [], codes = [];
  const shutdown = createShutdown({ steps: [['http', async () => { await null; order.push('http'); }], ['mongo', async () => order.push('mongo')]], logger: quiet(), exit: (c) => codes.push(c) });
  await shutdown('SIGTERM');
  assert.deepEqual(order, ['http', 'mongo']);
  assert.deepEqual(codes, [0]);
});

test('a failing step is logged, later steps still run, and the exit code is 1', async () => {
  const logger = quiet(), ran = [], codes = [];
  const shutdown = createShutdown({ steps: [['http', async () => { throw new Error('stuck'); }], ['mongo', async () => ran.push('mongo')]], logger, exit: (c) => codes.push(c) });
  await shutdown('SIGINT');
  assert.deepEqual(ran, ['mongo']);
  assert.deepEqual(codes, [1]);
  assert.match(logger.err[0], /http.*stuck/);
});

test('a second signal while shutting down is ignored', async () => {
  let runs = 0; const codes = [];
  const shutdown = createShutdown({ steps: [['x', async () => { runs += 1; }]], logger: quiet(), exit: (c) => codes.push(c) });
  await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
  assert.equal(runs, 1);
  assert.deepEqual(codes, [0]);
});

test('a step that never finishes is cut off by the timeout with exit code 1', async () => {
  const codes = [];
  const shutdown = createShutdown({ steps: [['hang', () => new Promise(() => {})]], logger: quiet(), exit: (c) => codes.push(c), timeoutMs: 20 });
  shutdown('SIGTERM');
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(codes, [1]);
});
