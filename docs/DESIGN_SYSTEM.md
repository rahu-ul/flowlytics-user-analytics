# Dashboard design system

Direction (Phase 4 redesign): **polished analytics workspace**. A charcoal sidebar and a large rounded main panel inside a soft pastel backdrop; warm off-white cards with hairline borders; ink-black pills for selection; a restrained coral / amber / lime accent set used for data only. Presentation only: no data, API, tracker or backend behaviour changed.

All styling is plain CSS. Tokens live in `dashboard/src/styles/tokens.css`; `app.css` reads only from tokens. Change the look by changing tokens.

## Tokens (light / dark)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#EBEAE6` | `#1A1D22` | Main panel |
| `--surface` / `--surface-2` | `#F9F9F7` / `#EFEEE9` | `#23272D` / `#2B3037` | Cards / quiet fills (tiles, timeline cards, skeletons) |
| `--text` / `--text-2` | `#14171C` / `#5B5F66` | `#F2F2EE` / `#A5A9B1` | Primary / secondary text |
| `--ink`, `--ink-contrast` | `#14171C`, white | `#F2F2EE`, `#14171C` | Selected pills (segmented control, tooltip) |
| `--sidebar-*` | charcoal `#171A1F` | `#101215` | Sidebar (dark in both themes); active nav is a light pill |
| `--grad-view`, `--grad-click`, `--grad-rank` | lime, amber→coral, coral→amber→lime | muted equivalents | Page-view / click segments, ranking bars |
| `--tint-{coral,amber,lime,sky}-{bg,fg}` | pastel chips | deep chips | Event-type chips, session badges, metric icons |
| `--heat-0/1/2`, `--heat-dot`, `--canvas-*` | peach → orange → red | brown → orange → pale peach | Heatmap canvas; **must stay 6-digit hex** (read by `HeatmapCanvas.jsx`) |

Semantics: green = page view, orange/coral = click (also the heatmap colour). Type is always also conveyed by icon and text label.

## Typography
`Inter Tight` (display: titles, large figures) and `Inter` (UI), loaded from Google Fonts with system fallbacks; mono for IDs, paths and coordinates. Tabular numerals (`.tnum`) on all figures. Scale: 40 title, 22 section, 16 card title, 14.5 body, 12.5 meta; figures 56 (hero) / 42 (metric).

## Shape and layout
Frame radius 32px, cards 22px, rows/tiles 12px, controls fully pill-shaped (height 42px, 46px on coarse pointers). Desktop: 256px sidebar, main panel overlapping it with rounded corners. ≤1280px narrower sidebar; ≤900px the sidebar becomes a sticky top bar with a disclosure menu; tables scroll inside their card and drop secondary columns ≤720px. Focus: 2px outline on every interactive element (white on the sidebar).

## Components
`ui/AppShell`, `ui/Sidebar` (logo mark, nav, theme switch, API host), `ui/ThemeToggle` (sun/moon switch, `role="switch"`), `ui/PageHeader`, `ui/MetricDisplay` (metric cards), `ui/States` (loading, empty, error), `ui/Pager`, `ui/SegmentedControl`, `ui/Icon` (24px outline set), `SessionTimeline`, `PageSelector`, `HeatmapCanvas`. `lib/avatar.js` derives a stable tint and two-character badge from a session ID (presentation only).

## What is deliberately absent
No search, sort, date-range filters, trend charts or percentage changes: the API supports none of them, so they would be invented. The Overview "composition bar" only sizes page views and clicks by their real totals.
