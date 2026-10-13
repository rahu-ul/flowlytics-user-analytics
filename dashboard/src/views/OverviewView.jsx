import { api } from '../api.js';
import { useAsync, useReload } from '../hooks.js';
import { buildHref } from '../router.js';
import { fmtDateTime, fmtNumber, hostPath, plural, truncateId } from '../lib/format.js';
import { idBadge, idTint } from '../lib/avatar.js';
import Icon from '../components/ui/Icon.jsx';
import MetricStrip from '../components/ui/MetricDisplay.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States.jsx';

const PAGES_CAP = 200; // /api/pages returns at most 200 pages

export default function OverviewView() {
  const [reload, bump] = useReload();
  const pages = useAsync((signal) => api.pages(signal), [reload]);
  const sessions = useAsync((signal) => api.sessions(1, 6, signal), [reload]);

  const list = pages.data?.pages;
  const pageViews = list ? list.reduce((n, p) => n + p.pageViews, 0) : undefined;
  const clicks = list ? list.reduce((n, p) => n + p.clicks, 0) : undefined;
  const capped = list && list.length >= PAGES_CAP;
  const nothingYet = sessions.data && pages.data && sessions.data.total === 0 && list.length === 0;

  const events = list ? pageViews + clicks : pages.error ? null : undefined;
  const metrics = [
    { label: 'Sessions', icon: 'sessions', tint: 'sky', value: pages.error || sessions.error ? (sessions.data?.total ?? null) : sessions.data?.total, hint: 'Renewed after 30 minutes idle' },
    { label: 'Page views', icon: 'page', tint: 'lime', value: list ? pageViews : pages.error ? null : undefined, hint: 'Recorded on each page load' },
    { label: 'Clicks', icon: 'click', tint: 'coral', value: list ? clicks : pages.error ? null : undefined, hint: 'Recorded with coordinates' },
    { label: 'Tracked pages', icon: 'globe', tint: 'amber', value: list ? list.length : pages.error ? null : undefined, hint: capped ? `Capped at ${PAGES_CAP} by the API` : 'Pages with recorded activity' },
  ];

  const top = list ? list.slice(0, 6) : [];
  const maxClicks = Math.max(1, ...top.map((p) => p.clicks));
  // Width of each segment in the composition bar is its share of the real event total (no estimates).
  const total = list ? pageViews + clicks : 0;
  const viewShare = total > 0 ? (pageViews / total) * 100 : 0;
  const clickShare = total > 0 ? (clicks / total) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Understand user journeys, sessions, and interactions."
        actions={<button type="button" className="btn" onClick={bump} disabled={pages.loading || sessions.loading}><Icon name="refresh" size={16} /> Refresh</button>}
      />

      {(pages.error || sessions.error) && (
        <ErrorState message={pages.error || sessions.error} onRetry={bump} />
      )}

      {nothingYet ? (
        <EmptyState title="No events recorded yet">Add <code>tracker.js</code> to a page, or open the demo store at <code>/demo/index.html</code> on the API host and click around. Totals and activity appear here once events arrive.</EmptyState>
      ) : (
        <>
          <h2 className="section-heading">Activity</h2>
          <div className="overview-grid">
            <section className="card hero" aria-labelledby="events-title">
              <div className="hero-top">
                <div>
                  <h3 className="card-title" id="events-title">Events recorded</h3>
                  <p className="hero-number tnum">
                    {events === undefined ? <span className="skeleton skeleton-hero" aria-label="Loading" /> : events === null ? <span aria-label="Unavailable">–</span> : fmtNumber(events)}
                  </p>
                </div>
                <span className="chip">Page views + clicks</span>
              </div>

              <div className="compose" role="img" aria-label={list ? `${fmtNumber(pageViews)} page views and ${fmtNumber(clicks)} clicks` : 'Page views and clicks'}>
                {total > 0 ? (
                  <>
                    {pageViews > 0 && <span className="compose-seg compose-view" style={{ flexGrow: viewShare }} />}
                    {clicks > 0 && <span className="compose-seg compose-click" style={{ flexGrow: clickShare }} />}
                  </>
                ) : (
                  <span className="compose-seg compose-empty" style={{ flexGrow: 1 }} />
                )}
              </div>
              <ul className="compose-legend">
                <li><span className="dot dot-view" aria-hidden="true" /> Page views <strong className="tnum">{list ? fmtNumber(pageViews) : '–'}</strong></li>
                <li><span className="dot dot-click" aria-hidden="true" /> Clicks <strong className="tnum">{list ? fmtNumber(clicks) : '–'}</strong></li>
              </ul>

              <div className="hero-sep" />
              <div className="section-head">
                <h3 className="card-title" id="top-pages">Most clicked pages</h3>
                <a className="pill-link" href={buildHref(['heatmaps'])}>All heatmaps <Icon name="next" size={14} /></a>
              </div>
              {pages.loading && !list && <LoadingState rows={6} label="Loading pages" />}
              {list && top.length === 0 && <p className="quiet">No pages tracked yet.</p>}
              {top.length > 0 && (
                <table className="table table-compact" aria-labelledby="top-pages">
                  <caption className="sr-only">Pages with the most clicks</caption>
                  <thead><tr><th scope="col">Page</th><th scope="col" className="num">Clicks</th><th scope="col" className="num">Views</th></tr></thead>
                  <tbody>
                    {top.map((p) => {
                      const { host, path } = hostPath(p.pagePath);
                      return (
                        <tr key={p.pagePath}>
                          <td className="cell-page">
                            <a className="row-link" href={buildHref(['heatmaps'], { url: p.pagePath })} title={p.pagePath}>
                              <span className="mono">{path || '/'}</span>
                              <span className="host">{host}</span>
                            </a>
                            <span className="databar" aria-hidden="true"><span style={{ width: `${(p.clicks / maxClicks) * 100}%` }} /></span>
                          </td>
                          <td className="num tnum strong">{fmtNumber(p.clicks)}</td>
                          <td className="num tnum">{fmtNumber(p.pageViews)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {capped && <p className="footnote">Page figures cover the {PAGES_CAP} most-clicked pages; the API returns no more than that.</p>}
            </section>

            <section className="card recent" aria-labelledby="recent-sessions">
              <div className="section-head">
                <h3 className="card-title" id="recent-sessions">Recent sessions</h3>
                <a className="pill-link" href={buildHref(['sessions'])}>All sessions <Icon name="next" size={14} /></a>
              </div>
              {sessions.loading && !sessions.data && <LoadingState rows={6} label="Loading sessions" />}
              {sessions.data && sessions.data.sessions.length === 0 && <p className="quiet">No sessions recorded yet.</p>}
              {sessions.data && sessions.data.sessions.length > 0 && (
                <ol className="session-list" aria-label="Most recently active sessions">
                  {sessions.data.sessions.map((s) => (
                    <li key={s.sessionId}>
                      <a className="session-item" href={buildHref(['sessions', s.sessionId])} title={s.sessionId}>
                        <span className={`avatar tint-${idTint(s.sessionId)}`} aria-hidden="true">{idBadge(s.sessionId)}</span>
                        <span className="session-item-main">
                          <span className="mono session-item-id">{truncateId(s.sessionId)}</span>
                          <span className="session-item-sub tnum">{fmtDateTime(s.lastSeen)}</span>
                        </span>
                        <span className="session-item-count tnum">{fmtNumber(s.eventCount)}<span className="session-item-unit">{s.eventCount === 1 ? 'event' : 'events'}</span></span>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <h2 className="section-heading">Metrics</h2>
          <MetricStrip items={metrics} />
        </>
      )}
    </>
  );
}
