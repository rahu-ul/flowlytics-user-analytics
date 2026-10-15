'use strict';

const { Server } = require('socket.io');
const { createOriginPolicy } = require('./origin');
const { DASHBOARD_ROOM } = require('./publisher');

/**
 * Attaches Socket.IO to the EXISTING HTTP server (the one that serves Express). Read-only broadcast channel:
 *   - no client-to-server event handlers are registered, so nothing a client sends does anything;
 *   - every connection joins one server-defined room; clients cannot pick rooms or session IDs;
 *   - origins are checked against DASHBOARD_ORIGINS (+ same host), see origin.js;
 *   - the number of concurrent sockets is capped (REALTIME_MAX_CLIENTS).
 * There is no authentication: see "Security" in docs/API.md.
 */
function createSocketServer(httpServer, { config, logger = console }) {
  const policy = createOriginPolicy(config.dashboardOrigins);
  const maxClients = config.realtimeMaxClients ?? 200;

  const io = new Server(httpServer, {
    serveClient: false, // the dashboard bundles socket.io-client itself (Part 2)
    cors: { origin: policy.origins, methods: ['GET', 'POST'], credentials: false },
    // CORS headers only instruct browsers; this check actually refuses disallowed browser origins.
    allowRequest: (req, callback) => callback(null, policy.isAllowed(req.headers.origin, req.headers.host)),
    maxHttpBufferSize: 10_000, // clients never need to send anything sizeable
  });

  io.use((_socket, next) => {
    if (io.of('/').sockets.size >= maxClients) return next(new Error('too many dashboard connections'));
    return next();
  });

  io.on('connection', (socket) => {
    socket.join(DASHBOARD_ROOM);
    socket.on('error', (err) => logger.error('socket error:', err && err.message));
  });

  return io;
}

module.exports = { createSocketServer };
