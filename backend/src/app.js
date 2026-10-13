'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { ingestRouter } = require('./routes/ingest');
const { analyticsRouter } = require('./routes/analytics');

/**
 * Builds the Express app. Dependencies are injected so tests can use a fake repository.
 */
function createApp({ repo, config, logger = console }) {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  // CORP is disabled because tracker.js must be loadable from third-party origins.
  app.use(helmet({ crossOriginResourcePolicy: false }));

  // Tracker script and demo pages.
  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      maxAge: '5m',
      index: false,
      setHeaders: (res) => res.setHeader('Access-Control-Allow-Origin', '*'),
    }),
  );

  // text/plain is accepted because the tracker uses it to avoid CORS preflights (sendBeacon / keepalive).
  const jsonBody = express.json({ limit: '100kb', type: ['application/json', 'text/plain'] });

  app.use(
    '/api/events',
    cors({ origin: '*', methods: ['POST', 'OPTIONS'], maxAge: 86400 }),
    rateLimit({
      windowMs: 60_000,
      limit: config.ingestRateLimitPerMin,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'rate limit exceeded' },
    }),
    jsonBody,
    ingestRouter({ repo }),
  );

  app.use('/api', cors({ origin: config.dashboardOrigins, methods: ['GET'] }));

  app.get('/api/health', async (_req, res) => {
    try {
      await repo.ping();
      res.json({ status: 'ok' });
    } catch (err) {
      logger.error('health check failed:', err.message);
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api', analyticsRouter({ repo }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

  // Serve the built dashboard from the same origin when it exists (single-service deployment).
  const dist = path.join(__dirname, '..', '..', 'dashboard', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) app.use(express.static(dist));

  // Centralized error handler.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'malformed JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload too large' });
    logger.error('unhandled error:', err);
    return res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
