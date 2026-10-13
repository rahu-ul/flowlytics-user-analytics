'use strict';

const express = require('express');
const { parseBatch } = require('../validation');

function ingestRouter({ repo }) {
  const router = express.Router();

  // POST /api/events — body: a single event or { events: [...] } (max 50)
  router.post('/', async (req, res, next) => {
    try {
      const parsed = parseBatch(req.body, { userAgent: req.get('user-agent') });
      if (parsed.fatal) return res.status(400).json({ error: parsed.fatal });
      if (parsed.valid.length === 0) {
        return res.status(400).json({ error: 'no valid events', rejected: parsed.rejected });
      }
      const accepted = await repo.insertEvents(parsed.valid);
      return res.status(202).json({ accepted, rejected: parsed.rejected });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { ingestRouter };
