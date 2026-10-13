import { useEffect } from 'react';
import { api } from '../api.js';
import { useAsync, useReload } from '../hooks.js';
import { buildHref } from '../router.js';
import { fmtDateTime, fmtDuration, fmtNumber, truncateId } from '../lib/format.js';
import { idBadge, idTint } from '../lib/avatar.js';
import Icon from '../components/ui/Icon.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pager from '../components/ui/Pager.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States.jsx';
import SessionDetail from './SessionDetail.jsx';

const PAGE_SIZE = 20;

export default function SessionsView({ route }) {
  const page = Math.max(1, Number.parseInt(route.params.get('page'), 10) || 1);
  const selected = route.segs[1] || null;
  const [reload, bump] = useReload();

  const list = useAsync((signal) => api.sessions(page, PAGE_SIZE, signal), [page, reload]);
  // Event total across all sessions = page views + clicks over all tracked pages (same figure the Overview shows).
  const totals = useAsync((signal) => api.pages(signal).catch(() => null), [reload]);

  const data = list.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const eventTotal = totals.data ? totals.data.pages.reduce((n, p) => n + p.pageViews + p.clicks, 0) : null;

  const listHref = (p = page) => buildHref(['sessions'], { page: p > 1 ? p : undefined });
  const rowHref = (id) => buildHref(['sessions', id], { page: page > 1 ? page : undefined });

  // On narrow screens the detail replaces the list, so start it at the top.
  useEffect(() => { if (selected && window.matchMedia('(max-width: 1279px)').matches) window.scrollTo(0, 0); }, [selected]);

  const meta = data && (
    <>
      <span className="chip"><strong className="tnum">{fmtNumber(data.total)}</strong> {data.total === 1 ? 'session' : 'sessions'}</span>
      {eventTotal !== null && <span className="chip"><strong className="tnum">{fmtNumber(eventTotal)}</strong> {eventTotal === 1 ? 'event' : 'events'}</span>}
    </>
  );

  return (
    <div className="sessions-view" data-detail={selected ? 'open' : 'closed'}>
      <PageHeader
        title="Sessions"
        description="A session is one visitor's continuous activity on your site, recorded in their browser and closed after 30 minutes without activity. Select a session to replay its events in order."
        meta={meta}
        actions={<button type="button" className="btn" onClick={bump} disabled={list.loading}><Icon name="refresh" size={16} /> Refresh</button>}
      />

      <div className="sessions-layout" data-detail={selected ? 'open' : 'closed'}>
        <div className="sessions-list">
          {list.loading && !data && <LoadingState rows={9} label="Loading sessions" />}
          {list.error && <ErrorState message={list.error} onRetry={bump} />}
          {data && data.total === 0 && (
            <EmptyState title="No sessions recorded yet">Open the demo store at <code>/demo/index.html</code> on the API host and click around. New sessions appear here within a few seconds.</EmptyState>
          )}
          {data && data.total > 0 && data.sessions.length === 0 && (
            <EmptyState title="There are no sessions on this page" action={<a className="btn" href={listHref(1)}>Go to the first page</a>} />
          )}
          {data && data.sessions.length > 0 && (
            <div className="card card-flush">
              <div className="table-wrap" data-busy={list.loading}>
                <table className="table">
                  <caption className="sr-only">Sessions, most recent activity first</caption>
                  <thead>
                    <tr>
                      <th scope="col">Session</th>
                      <th scope="col">Last activity</th>
                      <th scope="col" className="num col-secondary">Duration</th>
                      <th scope="col" className="num col-secondary">Page views</th>
                      <th scope="col" className="num">Clicks</th>
                      <th scope="col" className="num">Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((s) => {
                      const isSel = selected === s.sessionId;
                      return (
                        <tr key={s.sessionId} className="row" data-selected={isSel} onClick={() => { window.location.hash = rowHref(s.sessionId); }}>
                          <td>
                            <a className="row-link id-link" href={rowHref(s.sessionId)} title={s.sessionId} aria-current={isSel ? 'true' : undefined}>
                              <span className={`avatar tint-${idTint(s.sessionId)}`} aria-hidden="true">{idBadge(s.sessionId)}</span>
                              <span className="mono">{truncateId(s.sessionId)}</span>
                            </a>
                          </td>
                          <td className="tnum nowrap">{fmtDateTime(s.lastSeen)}</td>
                          <td className="num tnum col-secondary">{fmtDuration(new Date(s.lastSeen) - new Date(s.firstSeen))}</td>
                          <td className="num tnum col-secondary">{fmtNumber(s.pageViews)}</td>
                          <td className="num tnum">{fmtNumber(s.clicks)}</td>
                          <td className="num tnum strong">{fmtNumber(s.eventCount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={page} totalPages={totalPages} from={(page - 1) * PAGE_SIZE + 1} to={(page - 1) * PAGE_SIZE + data.sessions.length} total={fmtNumber(data.total)} hrefFor={listHref} noun={data.total === 1 ? 'session' : 'sessions'} />
            </div>
          )}
        </div>

        {selected && <SessionDetail key={selected} sessionId={selected} closeHref={listHref()} />}
      </div>
    </div>
  );
}
