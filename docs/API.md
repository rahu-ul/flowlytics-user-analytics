# API reference

Base URLs:

- Production: `https://flowlytics-user-analytics.onrender.com`
- Local backend: `http://localhost:4000`

All responses are JSON. Errors: `{ "error": "message" }`.

## POST /api/events
Ingest events. CORS: any origin. Content types: `application/json` or `text/plain` (JSON text). Rate limit: `INGEST_RATE_LIMIT_PER_MIN` per IP (default 600), returns 429.

Body: one event object, or `{ "events": [ ... ] }` with 1 to 50 events.

| Field | Required | Rules |
|---|---|---|
| `sessionId` | yes | 8-64 chars `[A-Za-z0-9_-]` |
| `type` | yes | `page_view` or `click` |
| `url` | yes | absolute http(s) URL, max 2048 chars |
| `timestamp` | yes | epoch ms or ISO-8601; at most 7 days old, at most 5 min in the future |
| `x`, `y` | clicks | numbers 0..1,000,000 (page coordinates) |
| `docWidth`, `docHeight` | no | positive numbers, clicks only |
| `viewportWidth`, `viewportHeight` | no | numbers |
| `title`, `referrer` | no | page views only, truncated to 300 / 2048 |

Unknown fields are ignored. Valid events in a batch are stored even if others are rejected.

- `202` `{ "accepted": 2, "rejected": [ { "index": 1, "error": "..." } ] }`
- `400` if the body is malformed, the batch is empty or over 50, or no event is valid
- `413` body over 100 KB, `429` rate limited

## GET /api/sessions?page=1&limit=20
`limit` 1-100 (default 20). Sorted by most recent activity.
```json
{ "sessions": [ { "sessionId": "...", "eventCount": 3, "pageViews": 1, "clicks": 2,
                  "firstSeen": "2026-10-13T10:00:00.000Z", "lastSeen": "2026-10-13T10:01:00.000Z" } ],
  "total": 42, "page": 1, "limit": 20 }
```

## GET /api/sessions/:sessionId/events
Events ordered by timestamp (insertion order breaks ties). Max 5000 (`truncated: true` if hit).
`404` unknown session, `400` malformed id.
```json
{ "sessionId": "...", "events": [ { "type": "click", "url": "...", "pagePath": "...", "timestamp": "...", "x": 100, "y": 200 } ], "truncated": false }
```

## GET /api/pages
Pages with tracked data, most clicks first (max 200).
```json
{ "pages": [ { "pagePath": "https://site.com/pricing", "pageViews": 10, "clicks": 25, "lastSeen": "..." } ] }
```

## GET /api/heatmap?url=<page url>
`url` is normalised to origin + pathname (query/hash ignored). Returns the most recent clicks, max 10,000.
```json
{ "pagePath": "https://site.com/pricing", "total": 25, "truncated": false,
  "clicks": [ { "x": 100, "y": 200, "docWidth": 1280, "docHeight": 900, "timestamp": "..." } ] }
```
`400` if `url` is missing or not an absolute http(s) URL.

## GET /api/health
`200 { "status": "ok" }` when MongoDB answers a ping, otherwise `503`.

## Data model (`events` collection)
```
{ sessionId, type, url, pagePath, timestamp: Date, receivedAt: Date,
  x?, y?, docWidth?, docHeight?, viewportWidth?, viewportHeight?, title?, referrer?, userAgent? }
```
Indexes: `{ sessionId: 1, timestamp: 1 }`, `{ type: 1, pagePath: 1, timestamp: -1 }` (created at startup).
