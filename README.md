# Flowlytics User Analytics

A small full-stack analytics app: a JavaScript tracker records `page_view` and `click` events, a Node/Express API stores them in MongoDB, and a React dashboard shows sessions, user journeys, and a click heatmap.

## Tech stack

| Layer | Choice |
|---|---|
| Tracker | Vanilla JS (no dependencies), served by the API at `/tracker.js` |
| Backend | Node.js 18+, Express 4, official `mongodb` driver, helmet, cors, express-rate-limit |
| Database | MongoDB (single `events` collection, 2 indexes) |
| Dashboard | React 18 + Vite, plain CSS with design tokens (light/dark), hash routing, `<canvas>` heatmap |
| Tests | `node:test`, jsdom (tracker), mingo (in-memory MongoDB query/aggregation engine) |

## Quick start

Prerequisites: Node 18+ and a MongoDB instance (local, Docker `docker run -p 27017:27017 mongo:7`, or Atlas).

```bash
npm run install:all
cp backend/.env.example backend/.env      # set MONGODB_URI if not local
npm run build                              # builds the dashboard into dashboard/dist
npm start                                  # API + tracker + demo + dashboard on http://localhost:4000
```

- Demo store (tracked): http://localhost:4000/demo/index.html
- Dashboard: http://localhost:4000/ (Overview, Sessions, Heatmaps; light and dark theme)
- Optional sample data: `npm run seed` (posts 25 synthetic sessions through the public ingest API)

Dashboard dev mode with hot reload: run `npm start` in one terminal and `npm --prefix dashboard run dev` in another (http://localhost:5173, `/api` is proxied to port 4000).

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

`npm test` runs 34 tests: validation, API routes (real Express app and the real repository pipelines), the tracker in jsdom, and the dashboard's pure logic (heatmap math and grid geometry, formatting, session summaries).

The API tests run against an in-memory fake collection backed by `mingo`, which executes the repository's real queries and aggregation pipelines. This was necessary because a MongoDB server was not available in the environment where this was built. It does **not** exercise the MongoDB driver, index creation, or a real server, so run the quick start above once against a real MongoDB as a smoke test. See [docs/HANDOFF.md](docs/HANDOFF.md) for exactly what was and was not verified.

## Deployment (not done)

The app is a single Node service (API + tracker + demo + dashboard) plus MongoDB, so any Node host plus MongoDB Atlas works: build command `npm run install:all && npm run build`, start command `npm start`, env `MONGODB_URI`, `TRUST_PROXY=1`. Not deployed or tested on any host.

## Project layout

```
backend/    Express API (src/), tracker + demo pages (public/), tests (test/), seed script (scripts/)
dashboard/  React app: src/views, src/components (+ ui/), src/styles (tokens + app css), src/lib (pure logic + tests)
docs/       API.md, DESIGN_SYSTEM.md, HANDOFF.md
```
