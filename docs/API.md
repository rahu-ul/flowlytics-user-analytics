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

## Real-time (Socket.IO)

Added in Part 1 of the real-time work. The REST endpoints above are unchanged and remain the authoritative source for historical records and full aggregates. Socket.IO is a **read-only notification channel** that announces events *after* MongoDB has confirmed they were stored.

- Endpoint: same host and port as the REST API, path `/socket.io` (Socket.IO v4, default path). Locally `http://localhost:4000`, in production the Render URL. One HTTP server serves both.
- The server does not serve the Socket.IO client script (`serveClient: false`); the dashboard bundles `socket.io-client`.
- Clients connect and are placed in one server-defined room. There is nothing to subscribe to and no client-to-server events: anything a client emits is ignored.
- Allowed origins: the entries of `DASHBOARD_ORIGINS` (the same list the read API's CORS uses), plus the host that served the request (single-service deployment). Other browser origins get HTTP 403 on the handshake. Requests without an `Origin` header (non-browser clients, same-origin polling) are accepted. See "Security" below.
- At most `REALTIME_MAX_CLIENTS` (default 200) sockets at once; further connections fail with `connect_error` ("too many dashboard connections").

### How an event reaches a dashboard

```
POST /api/events -> validate -> insertMany (ordered) -> repository reports which documents MongoDB confirmed
                 -> HTTP reply (unchanged: 202 { accepted, rejected[] }, or the existing 4xx/5xx)
                 -> only the confirmed documents are emitted to the dashboard room
```

- Rejected (invalid) events are never emitted. A batch with accepted and rejected items emits only the accepted, stored ones.
- If MongoDB fails, nothing is emitted for events that were not stored. If an ordered batch insert stored the first *N* documents and then failed, those *N* are emitted (they are in MongoDB and visible through the REST API) while the HTTP reply remains the existing `500`. If the driver cannot prove which documents were stored (network error, timeout, write-concern error), nothing is emitted: a missing live event is preferred to a false one.
- Emission happens after the HTTP reply on success and never changes it: a socket problem cannot fail an ingest request.
- Each persisted event is emitted exactly once per connected dashboard. A single emitted event has one stable `id` (see below).

### `analytics:event`

One message per persisted event. Fields not listed here (full `url` with query string, `userAgent`, `receivedAt`, viewport, `referrer`, internal fields) are never sent.

```json
{ "id": "6710e0c2a1b2c3d4e5f60718", "type": "page_view", "sessionId": "sess-aaaa-1111",
  "pagePath": "https://shop.example.com/products", "timestamp": "2026-10-15T10:00:00.000Z", "title": "Home" }
{ "id": "6710e0c2a1b2c3d4e5f60719", "type": "click", "sessionId": "sess-aaaa-1111",
  "pagePath": "https://shop.example.com/products", "timestamp": "2026-10-15T10:00:01.000Z", "x": 120, "y": 340 }
```

| Field | Notes |
|---|---|
| `id` | The MongoDB `_id` as a string. Stable, unique per stored document, usable to deduplicate. No schema change: `_id` already exists on every document. |
| `type` | `page_view` or `click` |
| `sessionId` | As stored |
| `pagePath` | Normalized `origin + pathname` (same value as `/api/pages` and `/api/heatmap`) |
| `timestamp` | ISO-8601, the event's own timestamp (not arrival time) |
| `title` | Page views only, when present |
| `x`, `y` | Clicks only, page coordinates |

### `analytics:session-updated`

At most one message per affected session per ingest request. It carries **deltas for the events newly stored by that request, not totals**; unique visitors and session totals are not sent because they cannot be derived reliably from one request. Apply it to a row you already loaded from `GET /api/sessions`.

```json
{ "sessionId": "sess-aaaa-1111",
  "delta": { "eventCount": 2, "pageViews": 1, "clicks": 1 },
  "firstSeen": "2026-10-15T10:00:00.000Z", "lastSeen": "2026-10-15T10:00:01.000Z",
  "eventIds": ["6710e0c2a1b2c3d4e5f60718", "6710e0c2a1b2c3d4e5f60719"] }
```

`firstSeen`/`lastSeen` are the min/max event timestamps of this request's events: take `min(existing.firstSeen, firstSeen)` and `max(existing.lastSeen, lastSeen)`, as the REST aggregation does. `eventIds` lets a client skip events it has already counted.

### `analytics:heatmap-updated`

Only sent when a request stored at least one click. Newly stored clicks, grouped by normalized page path (one message per page).

```json
{ "pagePath": "https://shop.example.com/products",
  "clicks": [ { "id": "6710e0c2a1b2c3d4e5f60719", "x": 120, "y": 340, "timestamp": "2026-10-15T10:00:01.000Z", "docWidth": 1280, "docHeight": 2000 } ] }
```

`docWidth`/`docHeight` are included when the click has them (the heatmap scales by them). The heatmap REST response caps at 10,000 clicks and orders newest first; a live client should apply the same cap.

`analytics:event` is the per-event feed (timelines, live activity). `analytics:session-updated` and `analytics:heatmap-updated` are coalesced per request so list and heatmap views do not have to process every event individually or refetch.

### Delivery semantics and client guidance

- **Best effort.** Socket.IO does not guarantee that a disconnected client receives events emitted while it was away, and this server does not buffer or replay them (connection-state recovery is off). After every `connect` that follows a disconnect, refetch the REST data you display.
- **Dedupe by `id` when available.** An event can be both in a REST response you fetched and in a live message that was emitted around the same time. Live messages carry `id`; **REST responses currently do not** (`_id` is excluded from their projections to preserve their contracts), so the dashboard uses deterministic event keys and REST reconciliation for this race. Adding an additive `id` field to those REST responses would make universal ID-based deduplication possible.
- **Duplicates caused by retries.** The tracker has no client-generated event ID. If a request is stored but its reply is lost (network failure), the tracker's retry stores a second document with a new `id`. This pre-existing ambiguity is unchanged and is visible in REST too; live events mirror what MongoDB holds.
- Messages are emitted with default (non-volatile) delivery. A stalled client's per-connection buffer is bounded in time by Socket.IO's ping timeout, after which the client is disconnected.

### Security

- The dashboard and read API have **no authentication**, and neither does the socket. Anyone who can reach the server and passes the origin check can receive every live event (session IDs, page paths, click coordinates, titles) for **all** sessions. The payloads are minimized, but the channel is public to anyone who can connect.
- The origin check is **not** authentication or authorization. Browsers enforce CORS; non-browser clients can send any `Origin` header or none. The check stops other websites from opening the socket from a visitor's browser; it does not stop a determined caller.
- Clients cannot choose rooms, subscribe to a session, or send commands; no database operation is reachable through the socket.
- Before real use put the dashboard, REST read API and socket behind authentication or a private network. A token check could be added in Socket.IO `io.use` middleware (`src/realtime.js`), alongside authentication for the REST API.
- The default Helmet CSP (`connect-src 'self'`) permits same-origin WebSocket connections in current browsers; very old Safari versions may need `ws:`/`wss:` added explicitly.

### Scaling

Broadcasting is in-memory in one process. That matches the current single-instance Render deployment. If a second backend instance is ever added, a dashboard connected to instance A will not receive events ingested by instance B until a Socket.IO adapter (for example Redis) is configured, and sticky sessions or WebSocket-only transport is required for long-polling clients. No adapter is included today. The publisher does no database reads, so cost per ingest request is a few in-memory emits regardless of the number of connected dashboards.

## Data model (`events` collection)
```
{ sessionId, type, url, pagePath, timestamp: Date, receivedAt: Date,
  x?, y?, docWidth?, docHeight?, viewportWidth?, viewportHeight?, title?, referrer?, userAgent? }
```
Indexes: `{ sessionId: 1, timestamp: 1 }`, `{ type: 1, pagePath: 1, timestamp: -1 }` (created at startup).
