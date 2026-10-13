# Flowlytics User Analytics

Flowlytics is a full-stack user analytics application. Its JavaScript tracker records page views and clicks, groups events into visitor sessions, and sends them to a Node/Express API backed by MongoDB Atlas. The React dashboard displays session counts, ordered user journeys, and click heatmaps.

## Live demo

Flowlytics is deployed as a single Node.js web service on Render. The service hosts the React dashboard, API, tracker, and demo pages.

- **Dashboard:** https://flowlytics-user-analytics.onrender.com/
- **Demo tracker:** https://flowlytics-user-analytics.onrender.com/demo/index.html
- **API health:** https://flowlytics-user-analytics.onrender.com/api/health
- **GitHub:** https://github.com/rahu-ul/flowlytics-user-analytics

The dashboard, demo tracker, and health endpoint returned HTTP 200 during the latest deployment check. A free hosting instance may take a short time to wake after inactivity.

## Tech stack

| Layer | Choice |
|---|---|
| Tracker | Vanilla JS (no dependencies), served by the API at `/tracker.js` |
| Backend | Node.js `>=18`, Express `^4.22.3`, official `mongodb` driver `^7.7.0`, helmet, cors, express-rate-limit |
| Database | MongoDB (single `events` collection, 2 indexes) |
| Dashboard | React `^18.3.1` + Vite `^8.3.4`, plain CSS with design tokens (light/dark), hash routing, `<canvas>` heatmap |
| Tests | `node:test`, jsdom (tracker), mingo (in-memory MongoDB query/aggregation engine) |

## Quick start

Prerequisites: Node 18+ and a MongoDB instance (local, Docker `docker run -p 27017:27017 mongo:7`, or Atlas).

```bash
npm run install:all
cp backend/.env.example backend/.env      # set MONGODB_URI if not local
npm run build                              # builds the dashboard into dashboard/dist
npm start                                  # API + tracker + demo + dashboard on http://localhost:4000
```

- Backend-served dashboard: http://localhost:4000/ (Overview, Sessions, Heatmaps; light and dark theme)
- Demo store and tracker: http://localhost:4000/demo/index.html
- Optional sample data: `npm run seed` (posts 25 synthetic sessions through the public ingest API)

Dashboard development mode with hot reload: run `npm start` in one terminal and `npm --prefix dashboard run dev` in another. The Vite dashboard runs at http://localhost:5173 and proxies `/api` to the backend at http://localhost:4000.

### Atlas DNS resolution

If the machine's configured DNS resolver refuses Node's SRV query while `nslookup` works, set `MONGODB_DNS_SERVERS` in `backend/.env` before starting the API, for example:

```text
MONGODB_DNS_SERVERS=8.8.8.8,8.8.4.4
```

The setting is applied before the MongoDB driver is loaded. Public resolvers can improve local troubleshooting, but they move DNS metadata outside the local network, may be blocked by a corporate firewall or policy, and are not guaranteed to be reachable from every deployment. Prefer the deployment environment's approved resolver in production. Invalid DNS settings fail startup rather than being ignored.

Run tests: `npm test` (no MongoDB required, see "Testing" below).

## Dashboard

Routes (hash-based, so the Express static hosting needs no fallback rules): `#/overview`, `#/sessions` (`?page=`), `#/sessions/:id`, `#/heatmaps` (`?url=`).

- **Overview**: totals for sessions, events, page views and clicks, the most clicked pages and the most recent sessions. Every figure comes from `/api/sessions` and `/api/pages`; nothing is estimated or trended.
- **Sessions**: paginated table; selecting a row opens the session's ordered event timeline beside the list (or full width on small screens).
- **Heatmaps**: page selector, dots or grid view of real click coordinates on a proportional sheet, busiest regions, and plain notes about how positions are scaled.
- **Theme**: light and dark, saved in `localStorage` and applied before first paint. See [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

## Adding the tracker to a page

```html
<script src="https://YOUR_API_HOST/tracker.js" defer></script>
```

It derives the API URL from its own `src`; override with `data-endpoint="https://.../api/events"`.

What it records: `sessionId`, event `type`, page `url`, `timestamp` (epoch ms), and for clicks the page `x`/`y` plus document width/height. It also sends viewport size, and `title`/`referrer` on page views.

## API

See [docs/API.md](docs/API.md). Summary:

- `POST /api/events` ingest (single event or `{ "events": [...] }`, max 50)
- `GET /api/sessions?page=&limit=` sessions with event counts
- `GET /api/sessions/:sessionId/events` ordered events for a session
- `GET /api/pages` pages with click counts
- `GET /api/heatmap?url=` click coordinates for a page

## Design decisions and trade-offs

- **Sessions** are a client concept: a UUID in `localStorage`, renewed after 30 minutes of inactivity, with an in-memory fallback if storage is blocked.
- **Click coordinates are page coordinates** (viewport position plus scroll offset), with the document size stored alongside, so clicks below the fold plot correctly.
- **Heatmap grouping** uses `origin + pathname`; query string and hash are ignored. A page whose content depends on the query string (`/product?id=1` vs `?id=2`) is therefore merged. The full URL is still stored on every event.
- **Sessions has no search or sort.** The sessions API supports pagination only, and filtering a single page client-side would be misleading, so the dashboard does not offer it.
- **Heatmap scaling is approximate.** Horizontal position is a proportion of each click's document width; vertical is absolute pixels. Responsive layouts that reflow at different widths will not line up exactly. A pixel-perfect heatmap needs per-viewport bucketing or DOM-element targeting, which I judged out of scope.
- **Ingest** accepts `text/plain` bodies so the tracker avoids CORS preflights and can use `sendBeacon` on page unload. It is open to any origin (required for a third-party tracker), rate limited per IP, size limited (100 KB), whitelist-validated, and accepts valid events from a mixed batch while reporting rejects.
- **Session list is computed with an aggregation** over `events` rather than a maintained `sessions` collection. This is simple and always consistent, but it scans all events, so it is fine for thousands of sessions and would need a pre-aggregated `sessions` collection (upserted on ingest) at larger scale.
- **No authentication** on the dashboard/read API (the assignment does not ask for it). Anyone who can reach the API can read analytics. Put it behind auth or a private network before real use.
- **Events are append-only with no retention policy.** A TTL index on `timestamp` would be the natural addition.
- The tracker does not honor Do Not Track, consent banners, or IP anonymization; real deployments need a privacy review.
- Result caps: 10,000 clicks per heatmap request, 5,000 events per session, 100 sessions per page.

## Testing

`npm test` runs 35 tests: 19 backend tests covering validation, API routes, the real Express app, and repository pipelines, plus 16 dashboard tests covering heatmap math, grid geometry, formatting, and session summaries.

The API tests run against an in-memory fake collection backed by `mingo`, which executes the repository's real queries and aggregation pipelines. This was necessary because a MongoDB server was not available in the environment where this was built. It does **not** exercise the MongoDB driver, index creation, or a real server, so run the quick start above once against a real MongoDB as a smoke test. See [docs/HANDOFF.md](docs/HANDOFF.md) for exactly what was and was not verified.

## Production deployment

Render runs the application as one Node.js web service. The service serves the built React dashboard, Express API, tracker, and demo pages; MongoDB Atlas stores the event documents.

- **Build command:** `npm run install:all && npm run build`
- **Start command:** `npm start`
- **Required environment variable:** `MONGODB_URI`
- **Recommended environment variables:** `MONGODB_DB`, `DASHBOARD_ORIGINS`, `INGEST_RATE_LIMIT_PER_MIN`, and `TRUST_PROXY=1` when Render is behind one reverse proxy
- **Optional DNS workaround:** `MONGODB_DNS_SERVERS`, only when the deployment environment requires an approved explicit resolver

Configure these values in Render's environment settings or secret environment groups. Do not commit `backend/.env` or place MongoDB credentials in this repository. The current deployment uses MongoDB Atlas and the live URLs listed above.

The live dashboard, demo page, and health endpoint were checked over HTTPS. Full production event ingestion and dashboard data flow should still be smoke-tested after deployment with a disposable test session.

## Project layout

```
backend/    Express API (src/), tracker + demo pages (public/), tests (test/), seed script (scripts/)
dashboard/  React app: src/views, src/components (+ ui/), src/styles (tokens + app css), src/lib (pure logic + tests)
docs/       API.md, DESIGN_SYSTEM.md, HANDOFF.md
```
