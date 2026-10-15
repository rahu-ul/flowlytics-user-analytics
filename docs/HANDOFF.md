# Flowlytics Handoff

This document records the current implementation state of the Flowlytics user analytics assignment. The root [README](../README.md) is the primary setup and architecture guide; [API.md](API.md) is the authoritative REST and Socket.IO contract.

## Current implementation

- `backend/public/tracker.js` records page views, SPA navigations, and pointer clicks. It identifies anonymous sessions with `localStorage`, expires an idle session after 30 minutes, batches events, uses `sendBeacon` while a page is closing, and retries network failures up to three times.
- The Express backend accepts `POST /api/events`, validates individual events, stores valid events in MongoDB's `events` collection, and reports partial batch rejection without discarding valid events.
- MongoDB indexes support session timelines and page/click queries. Session summaries are computed with an aggregation rather than a separate sessions collection.
- The React/Vite dashboard provides Overview, Sessions, Session Detail, Heatmaps, and Demo views. It uses REST for initial and historical data and Socket.IO for incremental updates.
- The Demo view embeds the same-origin storefront at `/demo/index.html`. Manual and scripted storefront activity uses the real tracker and real ingest API; there is no simulation mode.

## Real-time pipeline

Express and Socket.IO share the HTTP server created by `backend/src/createServer.js`. A successful ingest validates and persists events first. The publisher then broadcasts only documents whose persistence was confirmed:

- `analytics:event`: one whitelisted payload per persisted event.
- `analytics:session-updated`: one delta payload per affected session and ingest request.
- `analytics:heatmap-updated`: newly persisted clicks grouped by normalized page path.

The successful HTTP response is sent before the non-blocking publisher call. Publisher or socket failures are logged and cannot change the ingest response. For an ordered partial MongoDB write failure, the confirmed prefix can still be published while the HTTP request remains a server error. Events that cannot be confirmed are not broadcast.

The dashboard owns one `socket.io-client` connection and applies updates through `dashboard/src/lib/realtime.js`. It deduplicates live events, bounds event caches, updates sessions and heatmaps incrementally, and refetches REST data after reconnect because the server has no replay buffer. REST event and heatmap responses currently omit MongoDB `_id`, so a REST/live race uses deterministic event keys and reconciliation rather than universal ID-based deduplication.

## Configuration and deployment

Copy `backend/.env.example` to `backend/.env` for local development. The implementation supports `PORT`, `MONGODB_URI`, `MONGODB_DB`, `DASHBOARD_ORIGINS`, `INGEST_RATE_LIMIT_PER_MIN`, `TRUST_PROXY`, `REALTIME_MAX_CLIENTS`, and the optional `MONGODB_DNS_SERVERS` resolver override. Never commit `backend/.env` or credentials.

There is no committed Render configuration file. The documented single-service deployment is configured manually with:

```text
Build command: npm run install:all && npm run build
Start command: npm start
Required: MONGODB_URI
```

The service serves the built dashboard, tracker, demo storefront, REST API, and Socket.IO endpoint. A single instance is assumed because Socket.IO broadcasting is in memory and no adapter is configured.

## Verification

The current local verification completed with:

```text
npm test       93 backend tests + 46 dashboard tests passed
npm run build  Vite production build passed
```

The automated API tests use the repository's in-memory `mingo` fake collection, so they do not replace a smoke test against a real MongoDB server. The live Render deployment, MongoDB Atlas credentials, browser compatibility outside the tested environment, sustained load, and production event ingestion remain deployment/operator checks.

## Known limitations

- The dashboard, read API, ingest endpoint, and socket have no user authentication. Socket origin checks are not authorization.
- Socket.IO delivery is best effort. Disconnected clients miss broadcasts and recover through REST refetches.
- Event documents are append-only and have no retention policy or TTL index.
- Heatmaps normalize URLs to origin plus pathname, ignore query strings and hashes, and scale page coordinates approximately across responsive layouts.
- Aggregation-based session lists and capped result sets are suitable for the assignment's scale but would need pre-aggregation and retention controls at higher volume.
- The tracker does not implement consent management, Do Not Track, or IP anonymization.
- Render, Atlas, real-browser production behavior, and multi-instance Socket.IO scaling require manual verification when configured.