import { fmtClock } from '../../lib/demo.js';
import { fmtNumber, hostPath, truncateId } from '../../lib/format.js';
import Icon from '../ui/Icon.jsx';
import { EmptyState, ErrorState } from '../ui/States.jsx';
import InfoTip from './InfoTip.jsx';

const DELIVERY = {
  pending: { label: 'Pending', icon: 'clock' },
  accepted: { label: 'Accepted', icon: 'check' },
  failed: { label: 'Failed', icon: 'alert' },
};

function Delivery({ entry }) {
  const d = DELIVERY[entry.status];
  return (
    <>
      <span className="chip delivery" data-status={entry.status}><Icon name={d.icon} size={13} /> {d.label}</span>
      <span className="delivery-note">{entry.note}</span>
    </>
  );
}

export default function ActivityFeed({ demo }) {
  const { entries, feed, started, frame, actions } = demo;
  const failedRetryable = entries.filter((e) => e.status === 'failed' && e.retryable);
  const failedRejected = entries.filter((e) => e.status === 'failed' && !e.retryable);
  const unconfirmed = feed.pending > 0;

  return (
    <section className="card card-flush feed" aria-labelledby="feed-title">
      <div className="feed-head">
        <div className="feed-title-row">
          <h2 className="card-title" id="feed-title">
            Live activity{' '}
            <InfoTip label="delivery status">
              Pending: captured, not yet confirmed. Accepted: the API confirmed it stored the event. Failed: not delivered, or rejected by validation. Failed events are not stored.
            </InfoTip>
          </h2>
          <div className="feed-counts">
            <span className="chip"><strong className="tnum">{fmtNumber(feed.total)}</strong> {feed.total === 1 ? 'event' : 'events'}</span>
            {feed.accepted > 0 && <span className="chip delivery" data-status="accepted"><Icon name="check" size={13} /> {fmtNumber(feed.accepted)} accepted</span>}
            {feed.pending > 0 && <span className="chip delivery" data-status="pending"><Icon name="clock" size={13} /> {fmtNumber(feed.pending)} pending</span>}
            {feed.failed > 0 && <span className="chip delivery" data-status="failed"><Icon name="alert" size={13} /> {fmtNumber(feed.failed)} failed</span>}
          </div>
        </div>
        {unconfirmed && (
          <button type="button" className="btn btn-sm" onClick={actions.refreshStored}><Icon name="refresh" size={14} /> Check delivery</button>
        )}
      </div>

      {failedRetryable.length > 0 && (
        <div className="feed-alert">
          <ErrorState
            title={`${fmtNumber(failedRetryable.length)} ${failedRetryable.length === 1 ? 'event was' : 'events were'} not delivered`}
            message={`${failedRetryable[0].note}. These events are not stored. Try again checks MongoDB first, then resends only the ones that are missing.`}
            onRetry={actions.resend}
          />
        </div>
      )}
      {failedRejected.length > 0 && failedRetryable.length === 0 && (
        <p className="notice feed-notice" role="note">{fmtNumber(failedRejected.length)} {failedRejected.length === 1 ? 'event was' : 'events were'} rejected by the API&apos;s validation and are not stored. Resending would fail again.</p>
      )}

      {entries.length === 0 ? (
        <div className="feed-empty">
          {!started ? (
            <EmptyState title="No activity yet">Start the demo, then click around the store or generate sample activity. Events appear here as the tracker captures them.</EmptyState>
          ) : (
            <EmptyState title={frame === 'ready' ? 'Waiting for activity' : 'Starting the store'}>
              {frame === 'ready' ? 'Click anything in the store. Each page view and click is listed here as the tracker captures it.' : 'The first page view appears here as soon as the store has loaded.'}
            </EmptyState>
          )}
        </div>
      ) : (
        <div className="table-wrap feed-wrap">
          <table className="table table-compact feed-table">
            <caption className="sr-only">Events captured by the tracker, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col" className="feed-detail">Page</th>
                <th scope="col" className="feed-detail">Position</th>
                <th scope="col">Time</th>
                <th scope="col" className="feed-detail">Session</th>
                <th scope="col">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const click = e.type === 'click';
                const path = hostPath(e.url).path;
                const position = click ? `x ${Math.round(e.x)}, y ${Math.round(e.y)}` : null;
                return (
                  <tr key={e.id} className="feed-row" data-status={e.status}>
                    <td>
                      <div className="feed-event">
                        <span className={`chip ${click ? 'chip-click' : 'chip-view'}`}><Icon name={click ? 'click' : 'page'} size={13} /> {click ? 'Click' : 'Page view'}</span>
                        {e.origin === 'scripted' && <span className="feed-origin">Scripted visitor</span>}
                        <span className="feed-inline mono">{path}{position && <> · {position}</>}</span>
                      </div>
                    </td>
                    <td className="feed-detail cell-page"><span className="mono" title={e.url}>{path}</span></td>
                    <td className="feed-detail tnum mono">{position || '–'}</td>
                    <td className="tnum nowrap"><time dateTime={new Date(e.timestamp).toISOString()}>{fmtClock(e.timestamp)}</time></td>
                    <td className="feed-detail mono" title={e.sessionId}>{truncateId(e.sessionId)}</td>
                    <td className="feed-delivery"><Delivery entry={e} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{feed.total} events captured, {feed.accepted} accepted, {feed.pending} pending, {feed.failed} failed.</p>
    </section>
  );
}
