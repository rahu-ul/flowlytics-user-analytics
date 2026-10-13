'use strict';

const express = require('express');
const { normalizePagePath } = require('../validation');

const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_SESSION_EVENTS = 5000;
const MAX_HEATMAP_POINTS = 10000;

const intParam = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

function analyticsRouter({ repo }) {
  const router = express.Router();

  // GET /api/sessions?page=1&limit=20
  router.get('/sessions', async (req, res, next) => {
    try {
      const limit = intParam(req.query.limit, 20, 1, 100);
      const page = intParam(req.query.page, 1, 1, 100000);
      const { items, total } = await repo.listSessions({ limit, skip: (page - 1) * limit });
      res.json({ sessions: items, total, page, limit });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/sessions/:sessionId/events — ordered user journey
  router.get('/sessions/:sessionId/events', async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      if (!SESSION_ID_RE.test(sessionId)) return res.status(400).json({ error: 'invalid sessionId' });
      const events = await repo.getSessionEvents(sessionId, { limit: MAX_SESSION_EVENTS + 1 });
      if (events.length === 0) return res.status(404).json({ error: 'session not found' });
      const truncated = events.length > MAX_SESSION_EVENTS;
      res.json({ sessionId, events: events.slice(0, MAX_SESSION_EVENTS), truncated });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/pages — pages that have tracked data (feeds the heatmap page selector)
  router.get('/pages', async (_req, res, next) => {
    try {
      res.json({ pages: await repo.listPages() });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/heatmap?url=<page url> — click coordinates for one page
  router.get('/heatmap', async (req, res, next) => {
    try {
      const pagePath = normalizePagePath(req.query.url);
      if (!pagePath) return res.status(400).json({ error: 'url query parameter must be an absolute http(s) URL' });
      const { total, clicks } = await repo.getClicks(pagePath, { limit: MAX_HEATMAP_POINTS });
      res.json({ pagePath, total, truncated: total > clicks.length, clicks });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { analyticsRouter };
