# Handoff

State as of 2026-10-13. All assignment requirements are implemented. Flowlytics is deployed as a single Node.js service on Render.

## Live deployment

- Dashboard: https://flowlytics-user-analytics.onrender.com/
- Demo tracker: https://flowlytics-user-analytics.onrender.com/demo/index.html
- API health: https://flowlytics-user-analytics.onrender.com/api/health
- Repository: https://github.com/rahu-ul/flowlytics-user-analytics

The dashboard, demo page, and health endpoint returned HTTP 200 during the latest deployment check. The health response was `{ "status": "ok" }`. The live service uses MongoDB Atlas and serves the dashboard, API, tracker, and demo from the same Node process.

## What exists
- `backend/public/tracker.js`: page_view + click tracking, localStorage session (30 min idle), batching (flush 1.5 s / 20 events / page hide via sendBeacon), SPA navigation via History API, limited retry on network failure.
- `backend/src`: `app.js` (middleware, routes, error handler), `validation.js`, `repository.js` (all MongoDB queries), `routes/`, `db.js` (connect + indexes), `config.js`, `server.js`.
- `dashboard/src`: Overview, Sessions (paginated table, detail pane with ordered timeline) and Heatmaps (page selector, dots or grid) in an editorial light/dark design. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
- `backend/scripts/seed.js`: synthetic data through the public API.

## Verified (by running it)
- Current test run: 19 backend tests and 16 dashboard tests pass (`npm test`), 35 total.
- Current production dashboard build passes (`npm run build`).
- Tracker behavior in jsdom: session reuse and expiry, click page coordinates, ignoring keyboard clicks, SPA navigation, request shape.
- API behavior through the real Express app: validation, partial batches, text/plain bodies, CORS headers, pagination, ordering, heatmap filtering, health 200/503, 404/400 paths.
- Repository aggregation pipelines executed by `mingo` (a JS implementation of MongoDB semantics).
- `npm run build` for the dashboard succeeds; Express serves `dashboard/dist`, `/demo/*`, and `/tracker.js`.
- `npm run seed` against the test server ingests data that shows up in `/api/sessions` and `/api/pages`.
- `server.js` exits with a clear error when MongoDB is unreachable.
- The deployed Render service responds successfully on the dashboard, demo, and `/api/health` URLs listed above.

## NOT verified
- **Full production event flow.** The deployed health endpoint verifies that the API can ping its configured database, but a disposable production event has not been submitted and checked through the dashboard in this audit. Perform that smoke test without using personal or sensitive event data.
- **Dashboard browser behavior against production data.** The source and pure logic tests pass, but a browser-level production-data check of navigation, live sessions, heatmap updates, and error states remains manual.
- **Browsers other than Chromium.** Safari and Firefox were not tried. Mobile was checked with Chromium viewport and touch emulation, not a real phone.
- **The tracker in real browsers**, including `sendBeacon` on unload (jsdom has no `sendBeacon`; only the fetch path was exercised).
- Load testing and behavior under sustained proxy traffic.

## Phase 3 (premium UI): what changed and what was found
- Added hash routing and an Overview page; the old two-tab layout became Overview, Sessions, Heatmaps (`#/heatmap` still works). `api.js`, `hooks.js` (one helper added), the backend, tracker and demo are untouched.
- Overview figures come from `/api/pages` (page views, clicks) and `/api/sessions` (session total). The event total is page views plus clicks across the pages returned, and `/api/pages` returns at most 200 pages; the UI says so when that cap is reached.
- Sessions: no search or sort, because the API does not provide them. Detail uses the existing `/api/sessions/:id/events`; first/last activity, duration and distinct pages are derived from those events.
- **Two pre-existing heatmap bugs were fixed.** (1) Grid cells were drawn on a fixed 40px step while points were binned by `rows = ceil(height / 40)`, so cells drifted away from their data by up to ~38px on pages whose height is not a multiple of 40. Cells now use `height / rows`, with a test. (2) Canvas height was capped at 2400px and floored at 200px while points were scaled to the capped height, which squashed very tall or very wide pages. The canvas now keeps the page aspect ratio and only lowers backing resolution for extreme pages.
- The theme script is an external file because helmet's default CSP (`script-src 'self'`) blocks inline scripts; an inline version would work under `vite dev` but be blocked behind the API server. The browser checks served the bundle with that CSP header.

## Known limitations
See "Design decisions and trade-offs" in the README (no auth on read API, aggregation-based sessions, approximate heatmap scaling, no retention, no consent handling). Dashboard-specific:
- No search or sort on Sessions; no historical comparisons anywhere (the API has no time-series).
- Heatmap is a coordinate map, not a page screenshot, and pages that reflow across window widths will not align exactly. Extremely tall pages (tens of thousands of px) render at reduced canvas resolution.
- Webfonts come from Google Fonts; self-host them if the dashboard must work offline or under a stricter CSP.
- No automated component or browser tests are included; the browser checks run in Phase 3 were an external script.

## Suggested next steps
1. Submit a disposable event through the live demo and confirm it appears in the deployed dashboard.
2. Add auth on read endpoints; add a TTL index; consider a `sessions` collection if volume grows.
3. Add browser-level tests (Playwright) for the tracker and dashboard; the Phase 3 checks (theme persistence without flash, pagination, deep links, keyboard flow, error/empty/loading states, canvas aspect ratio, mobile navigation) are a good starting list.

## Phase 4 (visual redesign)
UI-only restyle to a charcoal-sidebar / rounded-panel dashboard look. Changed: `dashboard/index.html` (fonts, favicon, and Flowlytics metadata), `src/styles/*`, `components/ui/{Icon,Sidebar,ThemeToggle,States,MetricDisplay}.jsx`, `components/SessionTimeline.jsx`, the four views (markup/classes only; hooks, API calls and calculations untouched), new `src/lib/avatar.js`. Unchanged: `api.js`, `hooks.js`, `router.js`, `theme.js`, `lib/{format,heatmap,sessions}*`, backend behavior, tracker behavior, demo behavior, scripts, tests. Heatmap ramp is now warm (peach to red) and the legend text says "Hotter colours". Verified in headless Chromium against a mock API (both themes, 1440/820/390px, empty/error/loading states). The current local verification also passes `npm test` (19 backend and 16 dashboard tests) and `npm run build`.
