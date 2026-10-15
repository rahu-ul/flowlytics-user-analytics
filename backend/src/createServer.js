'use strict';

const http = require('node:http');
const { createApp } = require('./app');
const { createPublisher } = require('./publisher');
const { createSocketServer } = require('./realtime');

/**
 * Wires the single HTTP server: Express app + Socket.IO on the same server, plus the publisher that connects
 * the ingest route to the sockets. server.js and the tests both build the service through this function.
 */
function createServer({ repo, config, logger = console, forceCloseAfterMs = 5000 }) {
  const publisher = createPublisher({ logger });
  const app = createApp({ repo, config, logger, publisher });
  const server = http.createServer(app);
  const io = createSocketServer(server, { config, logger });
  publisher.bind(io);

  function listen(port = config.port) {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, () => {
        server.off('error', reject);
        resolve(server);
      });
    });
  }

  let closing = null;
  /**
   * Stops accepting connections, disconnects sockets, and waits for in-flight HTTP requests to finish.
   * Safe to call more than once. Does NOT close MongoDB (the caller owns that connection).
   */
  function close() {
    if (closing) return closing;
    closing = new Promise((resolve) => {
      // io.close() disconnects every socket, closes the engine, then closes the underlying HTTP server.
      const done = (err) => {
        clearTimeout(force);
        if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') logger.error('server close error:', err.message);
        resolve();
      };
      // Keep-alive connections would otherwise hold close() open; after a grace period they are cut.
      const force = setTimeout(() => server.closeAllConnections?.(), forceCloseAfterMs);
      force.unref();
      setImmediate(() => server.closeIdleConnections?.());
      const pending = io.close(done);
      if (pending && typeof pending.catch === 'function') pending.catch(done);
    });
    return closing;
  }

  return { app, server, io, publisher, listen, close };
}

module.exports = { createServer };
