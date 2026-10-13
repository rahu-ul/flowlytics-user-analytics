# Handoff

State as of 2026-10-13. All assignment requirements are implemented. Nothing has been deployed.

## What exists
- `backend/public/tracker.js`: page_view + click tracking, localStorage session (30 min idle), batching (flush 1.5 s / 20 events / page hide via sendBeacon), SPA navigation via History API, limited retry on network failure.
- `backend/src`: `app.js` (middleware, routes, error handler), `validation.js`, `repository.js` (all MongoDB queries), `routes/`, `db.js` (connect + indexes), `config.js`, `server.js`.
- `dashboard/src`: Overview, Sessions (paginated table, detail pane with ordered timeline) and Heatmaps (page selector, dots or grid) in an editorial light/dark design. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
- `backend/scripts/seed.js`: synthetic data through the public API.

## Verified (by running it)
Items other than the dashboard unit tests and the Phase 3 browser checks described below are carried over from the earlier handoff and were not repeated in Phase 3.
- Dashboard unit tests: 16 pass (the original 4 heatmap tests plus 12 for grid geometry, formatting and session summaries), run in the Phase 3 environment. The 18 backend tests were **not re-run in Phase 3** (backend dependencies could not be installed offline); no backend file was changed.
- Tracker behavior in jsdom: session reuse and expiry, click page coordinates, ignoring keyboard clicks, SPA navigation, request shape.
- API behavior through the real Express app: validation, partial batches, text/plain bodies, CORS headers, pagination, ordering, heatmap filtering, health 200/503, 404/400 paths.
- Repository aggregation pipelines executed by `mingo` (a JS implementation of MongoDB semantics).
- `npm run build` for the dashboard succeeds; Express serves `dashboard/dist`, `/demo/*`, and `/tracker.js`.
- `npm run seed` against the test server ingests data that shows up in `/api/sessions` and `/api/pages`.
- `server.js` exits with a clear error when MongoDB is unreachable.

## NOT verified
- **Any run against a real MongoDB.** No `mongod` was available. The driver calls (`insertMany`, `aggregate`, `find` with `projection`, `countDocuments`, `createIndex`) are standard, but first run needs a smoke test: start, open `/demo/index.html`, click, check the dashboard. `mingo` and MongoDB can differ in edge cases (e.g. `$facet`, `$min/$max` on dates), so confirm `GET /api/sessions` on real data.
- **Dashboard against the real backend.** Phase 3 rendered the dashboard in headless Chromium (Playwright), but against a **mock API** that implements the shapes in `API.md`, not the Express app and MongoDB. The mock and the harness are not part of this repository. Real-data behaviour (for example how `$facet` sessions look on real events) still needs the smoke test above.
- **`vite build` and `vite dev`.** Vite and `npm install` were not available offline, so Phase 3 bundled the same sources with esbuild (React 19 instead of the pinned 18) to check that they compile and run. Run `npm run install:all && npm run build` once to confirm the Vite build; `dashboard/vite.config.js` is unchanged. Vite-specific points to watch: `public/theme-init.js` is referenced from `index.html` as a plain `<script>` and must end up at `dist/theme-init.js`, and the two Google Fonts `<link>` tags need network access (the UI falls back to system fonts without it).
- **Browsers other than Chromium.** Safari and Firefox were not tried. Mobile was checked with Chromium viewport and touch emulation, not a real phone.
- **The tracker in real browsers**, including `sendBeacon` on unload (jsdom has no `sendBeacon`; only the fetch path was exercised).
- Hosting, HTTPS, load, and behavior behind a proxy.

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
1. Smoke test on real MongoDB (above), fix anything it finds.
2. Deploy as one Node service + Atlas; add the URL to the README.
3. Add auth on read endpoints; add a TTL index; consider a `sessions` collection if volume grows.
4. Add browser-level tests (Playwright) for the tracker and dashboard; the Phase 3 checks (theme persistence without flash, pagination, deep links, keyboard flow, error/empty/loading states, canvas aspect ratio, mobile navigation) are a good starting list.

## Phase 4 (visual redesign)
UI-only restyle to a charcoal-sidebar / rounded-panel dashboard look. Changed: `dashboard/index.html` (fonts, favicon), `src/styles/*`, `components/ui/{Icon,Sidebar,ThemeToggle,States,MetricDisplay}.jsx`, `components/SessionTimeline.jsx`, the four views (markup/classes only; hooks, API calls and calculations untouched), new `src/lib/avatar.js`. Unchanged: `api.js`, `hooks.js`, `router.js`, `theme.js`, `lib/{format,heatmap,sessions}*`, backend, tracker, demo, scripts, tests. Heatmap ramp is now warm (peach to red) and the legend text says "Hotter colours". Verified in headless Chromium against a mock API (both themes, 1440/820/390px, empty/error/loading states). `vite build` and the Express-dependent backend tests were not run in that environment (npm registry unreachable); run `npm run install:all && npm test && npm run build` once locally.
