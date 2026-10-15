# Flowlytics User Analytics

Flowlytics is a full-stack user analytics application. Its JavaScript tracker records page views and clicks, groups events into visitor sessions, and sends them to a Node/Express API backed by MongoDB Atlas. The React dashboard displays session counts, ordered user journeys, and click heatmaps.

## Live demo

Flowlytics is deployed as a single Node.js web service on Render. The service hosts the React dashboard, API, tracker, and demo pages.

- **Dashboard:** https://flowlytics-user-analytics.onrender.com/
- **Demo section (in the dashboard):** https://flowlytics-user-analytics.onrender.com/#/demo
- **Demo tracker (standalone sample store):** https://flowlytics-user-analytics.onrender.com/demo/index.html
- **API health:** https://flowlytics-user-analytics.onrender.com/api/health
- **GitHub:** https://github.com/rahu-ul/flowlytics-user-analytics

The latest recorded deployment check reported HTTP 200 for the dashboard, demo tracker, and health endpoint. A free hosting instance may take a short time to wake after inactivity; production event ingestion still needs a disposable smoke test after deployment.

## Tech Stack

| Layer | Choice |
|---|---|
| Tracker | Vanilla JS (no dependencies), served by the API at `/tracker.js` |
| Backend | Node.js `>=18`, Express `^4.22.3`, official `mongodb` driver `^7.7.0`, helmet, cors, express-rate-limit, Socket.IO `^4.8` (live broadcast) |
| Database | MongoDB (single `events` collection, 2 indexes) |
| Dashboard | React `^18.3.1` + Vite `^8.3.4`, plain CSS with design tokens (light/dark), hash routing, `<canvas>` heatmap |
| Tests | `node:test`, jsdom (tracker), mingo (in-memory MongoDB query/aggregation engine), socket.io-client (real-time tests) |

## Setup Steps

Prerequisites: Node 18+ and a MongoDB instance (local, Docker `docker run -p 27017:27017 mongo:7`, or Atlas).

```bash
npm run install:all
cp backend/.env.example backend/.env      # set MONGODB_URI if not local
npm run build                              # builds the dashboard into dashboard/dist
npm start                                  # API + tracker + demo + dashboard on http://localhost:4000
```

`npm run install:all` runs `npm --prefix backend install` and `npm --prefix dashboard install`. The equivalent commands can be run separately when only one workspace needs dependencies. The root project has no runtime dependencies of its own and no root lockfile; the backend and dashboard each maintain their own lockfile.

- Backend-served dashboard: http://localhost:4000/ (Overview, Sessions, Heatmaps, Demo; light and dark theme)
- Demo section: http://localhost:4000/#/demo
- Standalone sample store and tracker: http://localhost:4000/demo/index.html
- Optional sample data: `npm run seed` (posts 25 synthetic sessions through the public ingest API)

Dashboard development mode with hot reload: run `npm start` in one terminal and `npm --prefix dashboard run dev` in another. The Vite dashboard runs at http://localhost:5173 and proxies `/api`, `/demo` and `/tracker.js` to the backend at http://localhost:4000 (the Demo page's store runs in an iframe and must be same-origin with the dashboard).

### Development workflow

Run the backend and Vite dashboard in separate terminals:

```bash
npm start
npm --prefix dashboard run dev
```

Use `http://localhost:5173` for dashboard development with hot reload. Vite proxies `/api`, `/demo`, `/tracker.js`, and `/socket.io` to the backend at `http://localhost:4000`. The backend-served dashboard at `http://localhost:4000` is the production-shaped local workflow.

### Production workflow

Build and serve the dashboard through Express:

```bash
npm run build
npm start
```

The backend serves `dashboard/dist`, the tracker, the demo storefront, REST APIs, and Socket.IO from one HTTP service. `npm run build` does not start a server.

### Atlas DNS resolution

If the machine's configured DNS resolver refuses Node's SRV query while `nslookup` works, set `MONGODB_DNS_SERVERS` in `backend/.env` before starting the API, for example:

```text
MONGODB_DNS_SERVERS=8.8.8.8,8.8.4.4
```

The setting is applied before the MongoDB driver is loaded. Public resolvers can improve local troubleshooting, but they move DNS metadata outside the local network, may be blocked by a corporate firewall or policy, and are not guaranteed to be reachable from every deployment. Prefer the deployment environment's approved resolver in production. Invalid DNS settings fail startup rather than being ignored.

Run the complete test suite with `npm test` (no MongoDB is required for the automated tests; see [Testing](#testing)).

## Dashboard

Routes (hash-based, so the Express static hosting needs no fallback rules and a browser refresh keeps the page): `#/overview`, `#/sessions` (`?page=`), `#/sessions/:id`, `#/heatmaps` (`?url=`), `#/demo`.

- **Overview**: totals for sessions, events, page views and clicks, the most clicked pages and the most recent sessions. Every figure comes from `/api/sessions` and `/api/pages`; nothing is estimated or trended.
- **Sessions**: paginated table; selecting a row opens the session's ordered event timeline beside the list (or full width on small screens).
- **Heatmaps**: page selector, dots or grid view of real click coordinates on a proportional sheet, busiest regions, and plain notes about how positions are scaled.
- **Theme**: light and dark, saved in `localStorage` and applied before first paint. See [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).
- **Demo**: a guided product demo, described below.

## Sample store (`/demo`)

The sample store is a static, self-contained storefront (`backend/public/demo/`): `index.html`, `pricing.html`, `style.css`, `store.js` and `img/`. It uses system fonts and same-origin images only, because the default Helmet CSP allows images from `'self'` and `data:` and scripts from `'self'` (no inline scripts or handlers). `/demo` and `/demo/` redirect to `/demo/index.html`.

- **Images.** The product, hero and story images in `backend/public/demo/img/` are original SVG illustrations created for this project (no third-party licence applies). They are illustrations, not photographs. To use licensed photography, add the files to `img/` and change the matching `src` (and `data-image` on the product card, which feeds the details dialog). Keep the `width`/`height` attributes (they reserve space and prevent layout shift) and the descriptive `alt` text. A failed image falls back to a labelled tile.
- **Behaviour** (`store.js`): mobile menu, category filters, search over name, category and description, details dialog (native `<dialog>`: focus trap, Escape, focus returns to the opener), and a cart counter. There is no checkout and no payment. The script contains no analytics code; the tracker is a separate `<script>` tag.
- **Responsive.** The header navigation collapses into a menu at 760px and below. The Demo page's scripted visitor opens that menu first when its target link is hidden (`reveal` in `dashboard/src/demo/sampleScript.js`), so the Pricing steps work in a narrow frame.

## Demo section

Open **Demo** in the sidebar (`#/demo`). It shows the whole pipeline working on real data.

1. **Start demo** loads the sample store (`/demo/index.html`, the existing demo page, now a small storefront) in a frame. The store loads the normal `/tracker.js` itself; nothing is injected or re-implemented by the dashboard. Nothing is tracked until you press Start.
2. Click around the store: filter, search, open product details, add to cart, claim the welcome code, open Pricing. Every page view and pointer click is captured by the tracker and posted to `POST /api/events`.
3. **Generate sample activity** runs a scripted visitor (10 steps, defined in `dashboard/src/demo/sampleScript.js`). It dispatches pointer-style clicks inside the store, so the tracker records them like any other click; **Pause**/**Resume** control it. The scripted events are real events in your current session and are labelled "Scripted visitor" in the feed.
4. **Live activity** lists each captured event with type, page, click position, time, shortened session ID and delivery status:
   - **Pending**: captured but not confirmed (queued, retrying after a network error, or sent while a page was closing).
   - **Accepted**: the API replied 202 for it, or a read of the stored session proves it ("Confirmed in MongoDB"). Events the API rejected individually in a partial batch are shown as **Failed** with the API's reason.
   - **Failed**: not delivered or rejected. Failed events are not stored. **Try again** first reads the stored session and resends only events that are really missing, so a retry cannot create duplicates.
5. **Current session** shows the session ID and the counts, which come from the stored events (`GET /api/sessions/:id/events`), not from the local feed.
6. **Open this session** and **Open Heatmaps** jump to the Sessions timeline and the heatmap for the store page you just used.

**Live mode only, no simulation mode.** Every event on this page is real and stored in MongoDB. If the API is unavailable, the status chip and a banner say so (with **Try again**), the store stays off until the API responds, and events captured during an outage show as failed rather than stored. **Reset view** clears only the on-screen feed and counters; it never deletes anything from MongoDB.

### Event flow

```
visitor click / page load
  -> /tracker.js (session in localStorage, 30 min idle expiry; page x/y + document size)
  -> POST /api/events  (text/plain body, sendBeacon on page close, any-origin CORS)
  -> Express: validate each event, insertMany into MongoDB `events`; reply { accepted, rejected[] }
  -> GET /api/sessions, /api/sessions/:id/events, /api/pages, /api/heatmap
  -> Sessions timeline and Heatmaps in this dashboard
  -> (real-time backend) events MongoDB confirmed as stored are also emitted over Socket.IO, see below
```

The Demo page learns about delivery through a small observer API added to the tracker (`cfAnalytics.subscribe`, `cfAnalytics.requeue`; see below). It changes nothing about what the tracker sends.

## Real-time backend (Socket.IO)

The backend pushes newly stored events to connected dashboards over Socket.IO. The React dashboard consumes these events in real time.

- Socket.IO is attached to the **same HTTP server** as Express (`src/createServer.js`), so `PORT`, static hosting, the demo, and every REST route behave as before. Path: `/socket.io`.
- `POST /api/events` stays the only way events enter the system. After MongoDB confirms which events were stored (`repository.insertEventsConfirmed`), exactly those are emitted. Rejected events and failed writes are never emitted, and the HTTP reply and tracker retry behaviour are unchanged.
- Events: `analytics:event` (per persisted event), `analytics:session-updated` (per-session deltas), `analytics:heatmap-updated` (new clicks per page). Payloads are minimal and documented in [docs/API.md](docs/API.md#real-time-socketio).
- Configuration: origins reuse `DASHBOARD_ORIGINS` (plus the serving host). Optional `REALTIME_MAX_CLIENTS` (default 200). No other new variables.
- **Dashboard integration:** the React dashboard (`dashboard/src/socket.js`) maintains a singleton `socket.io-client` connection. Custom hooks (`useSocket.js`) subscribe to all three event types. Views (Overview, Sessions, Session Detail, Heatmap) and the Demo/Activity Feed apply incremental updates in real time with deduplication (`dashboard/src/lib/realtime.js`). A connection-status indicator in the sidebar reflects live/reconnecting/disconnected state. On reconnect, REST data is refetched to fill any gap.
- **Limitations:** there is no authentication on the dashboard, the read API or the socket, so anyone who can connect can watch all live events; the origin check is not authorization. Delivery is best effort with no replay: clients refetch REST data after reconnecting. Broadcasting is in-memory for one instance; multiple instances would need a Socket.IO adapter.
- Shutdown (`SIGTERM`/`SIGINT`): stop accepting connections, disconnect sockets, let in-flight requests finish, then close MongoDB.
- When dependencies change, run `npm run install:all` to synchronize the backend and dashboard installations. Socket.IO is already included in both manifests where required.

## Adding the tracker to a page

```html
<script src="https://YOUR_API_HOST/tracker.js" defer></script>
```

It derives the API URL from its own `src`; override with `data-endpoint="https://.../api/events"`. Nothing is hard-coded to a host, so the same tracker works locally and in production.

What it records: `sessionId`, event `type`, page `url`, `timestamp` (epoch ms), and for clicks the page `x`/`y` plus document width/height. It also sends viewport size, and `title`/`referrer` on page views.

### Optional observer API

For hosts that want to watch delivery (the Demo page does). It adds no network traffic.

```js
const stop = window.cfAnalytics.subscribe((rec) => { /* rec.phase: queued | beacon | sent | accepted | failed */ });
window.cfAnalytics.requeue(events);   // re-send events that failed
```

`accepted` carries the API's `{ accepted, rejected: [{ index, error }] }`. `beacon` (sent while the page closes) and `sent` (reply unreadable) cannot confirm storage, so hosts must not present them as stored. `subscribe` replays the current page load's earlier records first. Unchanged behaviour: HTTP errors are still not retried; only network failures are (3 times).

## API

See [docs/API.md](docs/API.md). Summary:

- `POST /api/events` ingest (single event or `{ "events": [...] }`, max 50)
- `GET /api/sessions?page=&limit=` sessions with event counts
- `GET /api/sessions/:sessionId/events` ordered events for a session
- `GET /api/pages` pages with click counts
- `GET /api/heatmap?url=` click coordinates for a page

## Assumptions and Trade-offs

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

`npm test` runs the backend tests (validation, API routes, the real Express app, repository pipelines, tracker behaviour including the observer API, and the demo store: markup, CSP/iframe headers, the `/demo` redirect, image assets, behaviour in jsdom, and a real tracker-to-API round trip) and the dashboard tests (heatmap math, grid geometry, formatting, session summaries, the Demo's feed/delivery-status logic, the scripted visitor, and the real-time utility library: deduplication, session delta application, heatmap click merging, feed reducer, reconnect recovery, and listener cleanup).

The real-time tests (`realtime.test.js`) start the real service on an ephemeral port and connect real `socket.io-client` sockets; unit tests cover the publisher payloads, persistence confirmation (including partial bulk failures), origin policy, shutdown sequencing, and the ingest handler.

The API tests run against an in-memory fake collection backed by `mingo`, which executes the repository's real queries and aggregation pipelines. This was necessary because a MongoDB server was not available in the environment where this was built. It does **not** exercise the MongoDB driver, index creation, or a real server, so run the quick start above once against a real MongoDB as a smoke test. See [docs/HANDOFF.md](docs/HANDOFF.md) for exactly what was and was not verified.

## Production deployment

Render runs the application as one Node.js web service. The service serves the built React dashboard, Express API, tracker, and demo pages; MongoDB Atlas stores the event documents.

- **Build command:** `npm run install:all && npm run build`
- **Start command:** `npm start`
- **Required environment variable:** `MONGODB_URI`
- **Recommended environment variables:** `MONGODB_DB`, `DASHBOARD_ORIGINS`, `INGEST_RATE_LIMIT_PER_MIN`, and `TRUST_PROXY=1` when Render is behind one reverse proxy
- **Optional:** `REALTIME_MAX_CLIENTS` (Socket.IO connection cap). Render supports WebSockets on web services; run a single instance unless a Socket.IO adapter is added
- **Optional DNS workaround:** `MONGODB_DNS_SERVERS`, only when the deployment environment requires an approved explicit resolver

Configure these values in Render's environment settings or secret environment groups. Do not commit `backend/.env` or place MongoDB credentials in this repository. The current deployment uses MongoDB Atlas and the live URLs listed above.

The live dashboard, demo page, and health endpoint were checked over HTTPS. Full production event ingestion and dashboard data flow should still be smoke-tested after deployment with a disposable test session.

## Project layout

```
backend/    Express API + Socket.IO (src/), tracker + sample store (public/, public/demo/), tests (test/), seed script (scripts/)
dashboard/  React app: src/views, src/components (+ ui/, demo/), src/demo (tracker hook, scripted visitor), src/styles (tokens + app css), src/lib (pure logic + tests)
docs/       API.md, DESIGN_SYSTEM.md, HANDOFF.md
```
