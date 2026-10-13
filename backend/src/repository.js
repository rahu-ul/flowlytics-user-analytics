'use strict';

/**
 * All MongoDB access lives here. `events` is a MongoDB collection (or a compatible fake in tests).
 *
 * Document shape (collection `events`):
 *   { sessionId, type: 'page_view'|'click', url, pagePath, timestamp: Date, receivedAt: Date,
 *     x?, y?, docWidth?, docHeight?, viewportWidth?, viewportHeight?, referrer?, title?, userAgent? }
 */
function createRepository(events, { ping = async () => {} } = {}) {
  const countIf = (type) => ({ $sum: { $cond: [{ $eq: ['$type', type] }, 1, 0] } });

  return {
    ping,

    async insertEvents(docs) {
      if (docs.length === 0) return 0;
      const result = await events.insertMany(docs, { ordered: true });
      return result.insertedCount;
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
