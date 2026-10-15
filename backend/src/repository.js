'use strict';

/**
 * All MongoDB access lives here. `events` is a MongoDB collection (or a compatible fake in tests).
 *
 * Document shape (collection `events`):
 *   { sessionId, type: 'page_view'|'click', url, pagePath, timestamp: Date, receivedAt: Date,
 *     x?, y?, docWidth?, docHeight?, viewportWidth?, viewportHeight?, referrer?, title?, userAgent? }
 */

/** Returns i -> inserted _id for the shapes the driver may report (`{0: id}` object or `[{index, _id}]`). */
function idLookup(ids) {
  if (Array.isArray(ids)) {
    const byIndex = new Map();
    ids.forEach((entry, k) => {
      if (entry && typeof entry === 'object' && 'index' in entry) byIndex.set(entry.index, entry._id);
      else byIndex.set(k, entry);
    });
    return (i) => byIndex.get(i);
  }
  if (ids && typeof ids === 'object') return (i) => ids[i];
  return () => undefined;
}

/** Pairs the first `count` documents with their stored ids. Documents whose id cannot be determined are skipped. */
function confirmed(docs, count, ids) {
  const lookup = idLookup(ids);
  const out = [];
  for (let i = 0; i < Math.min(count, docs.length); i++) {
    const raw = lookup(i) ?? docs[i]._id; // the driver also writes _id onto documents that lack one
    if (raw === undefined || raw === null) continue;
    out.push({ id: String(raw), doc: docs[i] });
  }
  return out;
}

/**
 * How many documents of an ORDERED insertMany are known to be stored after it threw.
 * Only a bulk-write error carries that knowledge; for any other failure (network error, timeout, server selection)
 * the outcome is unknown and we answer 0, i.e. "nothing confirmed". A write-concern error is also treated as
 * unconfirmed: the primary applied the write but it was not acknowledged as durable.
 */
function confirmedCountAfterError(err) {
  const isBulk = err && (err.name === 'MongoBulkWriteError' || Array.isArray(err.writeErrors));
  if (!isBulk) return 0;
  if (err.writeConcernError || err.result?.getWriteConcernError?.()) return 0;
  const inserted = err.result?.insertedCount ?? err.insertedCount;
  if (!Number.isInteger(inserted) || inserted <= 0) return 0;
  // An ordered insert stops at its first failure, so the stored documents are exactly the ones before it.
  const failedAt = (Array.isArray(err.writeErrors) ? err.writeErrors : [])
    .map((w) => (typeof w?.index === 'number' ? w.index : Infinity));
  return Math.min(inserted, ...failedAt);
}

function createRepository(events, { ping = async () => {} } = {}) {
  const countIf = (type) => ({ $sum: { $cond: [{ $eq: ['$type', type] }, 1, 0] } });

  return {
    ping,

    async insertEvents(docs) {
      if (docs.length === 0) return 0;
      const result = await events.insertMany(docs, { ordered: true });
      return result.insertedCount;
    },

    /**
     * Same write as insertEvents, but reports exactly which documents MongoDB confirmed.
     * Never throws: a failure is returned as `error` together with whatever was confirmed before it.
     * @returns {Promise<{insertedCount: number, persisted: Array<{id: string, doc: object}>, error: Error|null}>}
     */
    async insertEventsConfirmed(docs) {
      if (docs.length === 0) return { insertedCount: 0, persisted: [], error: null };
      try {
        const result = await events.insertMany(docs, { ordered: true });
        const persisted = confirmed(docs, result.insertedCount, result.insertedIds);
        return { insertedCount: result.insertedCount, persisted, error: null };
      } catch (error) {
        const persisted = confirmed(docs, confirmedCountAfterError(error), error?.result?.insertedIds ?? error?.insertedIds);
        return { insertedCount: persisted.length, persisted, error };
      }
    },

    async listSessions({ limit, skip }) {
      const [result] = await events
        .aggregate([
          {
            $group: {
              _id: '$sessionId',
              eventCount: { $sum: 1 },
              pageViews: countIf('page_view'),
              clicks: countIf('click'),
              firstSeen: { $min: '$timestamp' },
              lastSeen: { $max: '$timestamp' },
            },
          },
          { $sort: { lastSeen: -1, _id: 1 } },
          {
            $facet: {
              items: [{ $skip: skip }, { $limit: limit }],
              total: [{ $count: 'n' }],
            },
          },
        ])
        .toArray();

      const items = (result?.items ?? []).map(({ _id, ...rest }) => ({ sessionId: _id, ...rest }));
      return { items, total: result?.total?.[0]?.n ?? 0 };
    },

    async getSessionEvents(sessionId, { limit }) {
      const items = await events
        .find({ sessionId }, { projection: { _id: 0, sessionId: 1, type: 1, url: 1, pagePath: 1, timestamp: 1, x: 1, y: 1, title: 1, referrer: 1 } })
        .sort({ timestamp: 1, _id: 1 })
        .limit(limit)
        .toArray();
      return items;
    },

    async listPages() {
      const rows = await events
        .aggregate([
          {
            $group: {
              _id: '$pagePath',
              pageViews: countIf('page_view'),
              clicks: countIf('click'),
              lastSeen: { $max: '$timestamp' },
            },
          },
          { $sort: { clicks: -1, _id: 1 } },
          { $limit: 200 },
        ])
        .toArray();
      return rows.map(({ _id, ...rest }) => ({ pagePath: _id, ...rest }));
    },

    async getClicks(pagePath, { limit }) {
      const filter = { type: 'click', pagePath };
      const [total, clicks] = await Promise.all([
        events.countDocuments(filter),
        events
          .find(filter, { projection: { _id: 0, x: 1, y: 1, docWidth: 1, docHeight: 1, timestamp: 1 } })
          .sort({ timestamp: -1 })
          .limit(limit)
          .toArray(),
      ]);
      return { total, clicks };
    },
  };
}

module.exports = { createRepository };
