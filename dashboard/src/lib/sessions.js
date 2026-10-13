/** Derives display facts from the events of one session (as returned by /api/sessions/:id/events). */
export function summarizeEvents(events) {
  let pageViews = 0;
  let clicks = 0;
  let first = Infinity;
  let last = -Infinity;
  const pages = new Set();
  for (const e of events) {
    if (e.type === 'page_view') pageViews += 1;
    else if (e.type === 'click') clicks += 1;
    const t = new Date(e.timestamp).getTime();
    if (t < first) first = t;
    if (t > last) last = t;
    pages.add(e.pagePath || e.url);
  }
  const has = events.length > 0;
  return {
    count: events.length,
    pageViews,
    clicks,
    pagesVisited: pages.size,
    first: has ? first : null,
    last: has ? last : null,
    durationMs: has ? last - first : 0,
  };
}
