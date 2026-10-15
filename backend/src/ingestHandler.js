'use strict';

const { parseBatch } = require('./validation');
const { noopPublisher } = require('./publisher');

/**
 * POST /api/events handler. HTTP behaviour is unchanged from the original route:
 *   400 fatal / no valid events, 202 { accepted, rejected } on success, errors go to the Express error handler (500).
 *
 * The only addition: after MongoDB has confirmed which events were stored, exactly those events are handed to
 * the publisher. Rejected events and events whose write failed are never published.
 */
function createIngestHandler({ repo, publisher = noopPublisher, logger = console }) {
  const safePublish = (persisted) => {
    if (!persisted || persisted.length === 0) return; // nothing confirmed, nothing to announce
    try {
      publisher.publishPersisted(persisted);
    } catch (err) {
      logger.error('realtime publish failed:', err && err.message); // never affects the HTTP outcome
    }
  };

  return async function ingest(req, res, next) {
    try {
      const parsed = parseBatch(req.body, { userAgent: req.get('user-agent') });
      if (parsed.fatal) return res.status(400).json({ error: parsed.fatal });
      if (parsed.valid.length === 0) {
        return res.status(400).json({ error: 'no valid events', rejected: parsed.rejected });
      }

      const { insertedCount, persisted, error } = await repo.insertEventsConfirmed(parsed.valid);

      if (error) {
        // The write failed (possibly after storing a prefix of the batch). Events that MongoDB confirmed are real
        // and visible through the REST API, so they are published; the HTTP reply stays the existing 500.
        safePublish(persisted);
        return next(error);
      }

      res.status(202).json({ accepted: insertedCount, rejected: parsed.rejected });
      safePublish(persisted);
      return undefined;
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { createIngestHandler };
