'use strict';
// Posts synthetic sessions through the public ingest API (so validation is exercised too).
// Usage: API_URL=http://localhost:4000 PAGE_BASE=http://localhost:4000/demo npm run seed
const API_URL = process.env.API_URL || 'http://localhost:4000';
const PAGE_BASE = process.env.PAGE_BASE || `${API_URL}/demo`;
const SESSIONS = Number.parseInt(process.env.SEED_SESSIONS || '25', 10);

const pages = [
  { url: `${PAGE_BASE}/index.html`, docW: 1280, docH: 1500, hotspots: [[640, 250, 0.4], [330, 420, 0.2], [640, 420, 0.2], [950, 420, 0.1], [640, 1000, 0.1]] },
  { url: `${PAGE_BASE}/pricing.html`, docW: 1280, docH: 900, hotspots: [[330, 380, 0.2], [640, 380, 0.5], [950, 380, 0.3]] },
];
const rand = (min, max) => min + Math.random() * (max - min);
const pickHotspot = (hs) => {
  let r = Math.random();
  for (const [x, y, w] of hs) if ((r -= w) <= 0) return [x, y];
  return hs[0].slice(0, 2);
};
const id = () => 'seed-' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);

async function main() {
  let sent = 0;
  for (let s = 0; s < SESSIONS; s++) {
    const sessionId = id();
    let t = Date.now() - Math.floor(rand(0, 3 * 3600_000));
    const events = [];
    const visits = 1 + Math.floor(Math.random() * pages.length);
    for (let v = 0; v < visits; v++) {
      const page = pages[v % pages.length];
      events.push({ sessionId, type: 'page_view', url: page.url, timestamp: (t += 1000), title: 'Demo Store' });
      const clicks = 1 + Math.floor(Math.random() * 5);
      for (let c = 0; c < clicks; c++) {
        const [hx, hy] = pickHotspot(page.hotspots);
        events.push({
          sessionId, type: 'click', url: page.url, timestamp: (t += Math.floor(rand(500, 6000))),
          x: Math.round(hx + rand(-60, 60)), y: Math.round(hy + rand(-40, 40)), docWidth: page.docW, docHeight: page.docH,
        });
      }
    }
    const res = await fetch(`${API_URL}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }) });
    if (!res.ok) throw new Error(`ingest failed: ${res.status} ${await res.text()}`);
    sent += events.length;
  }
  console.log(`Seeded ${SESSIONS} sessions (${sent} events) via ${API_URL}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
