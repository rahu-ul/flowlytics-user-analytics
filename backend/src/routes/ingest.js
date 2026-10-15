'use strict';

const express = require('express');
const { createIngestHandler } = require('../ingestHandler');

function ingestRouter({ repo, publisher, logger }) {
  const router = express.Router();

  // POST /api/events — body: a single event or { events: [...] } (max 50)
  router.post('/', createIngestHandler({ repo, publisher, logger }));

  return router;
}

module.exports = { ingestRouter };
