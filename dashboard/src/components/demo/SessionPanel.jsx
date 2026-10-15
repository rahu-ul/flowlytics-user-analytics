import { fmtDateTime, fmtDuration, fmtNumber } from '../../lib/format.js';
import Icon from '../ui/Icon.jsx';
import InfoTip from './InfoTip.jsx';

function Fact({ label, tip, align, children }) {
  return (
    <div>
      <dt>{label}{tip && <InfoTip label={label} align={align}>{tip}</InfoTip>}</dt>
      <dd className="tnum">{children}</dd>
    </div>
  );
}

/** Counts come from the stored events of the session (GET /api/sessions/:id/events), never from the local feed. */
export default function SessionPanel({ demo }) {
  const { sessionId, stored, feed, actions } = demo;
  const s = stored.summary;
  const pending = feed.pending;

  return (
    <section className="card session-panel" aria-labelledby="session-title">
      <div className="section-head">
        <h2 className="card-title" id="session-title">
          Current session{' '}
          <InfoTip label="sessions">A session is one visitor&apos;s continuous activity. It is created in the browser and renewed after 30 minutes without activity, the same rule the Sessions page uses.</InfoTip>
        </h2>
      </div>

      {!sessionId ? (
        <p className="quiet">No session yet. Start the demo to begin one: the tracker creates it when the store page loads.</p>
      ) : (
        <>
          <p className="session-id mono" title={sessionId}>{sessionId}</p>

          {stored.error && (
            <p className="notice" role="alert">
              Could not read the stored session: {stored.error}.{' '}
              <button type="button" className="text-link" onClick={actions.refreshStored}>Try again</button>
            </p>
          )}

          <dl className="facts facts-counts">
            <Fact label="Events" tip="Stored events in this session: page views plus clicks.">{s ? fmtNumber(s.count) : <span className="skeleton skeleton-line" aria-label="Loading" />}</Fact>
            <Fact label="Page views" align="end" tip="One is recorded each time a page loads or the address changes.">{s ? fmtNumber(s.pageViews) : '–'}</Fact>
            <Fact label="Clicks" tip="Pointer clicks, stored with their position on the page. Keyboard activations have no position and are not recorded.">{s ? fmtNumber(s.clicks) : '–'}</Fact>
            <Fact label="Duration" align="end" tip="Time from the first to the last stored event of this session.">{s && s.count > 0 ? fmtDuration(s.durationMs) : '–'}</Fact>
          </dl>
          <dl className="facts facts-1 session-times">
            <div><dt>Started</dt><dd className="tnum">{s && s.count > 0 ? fmtDateTime(s.first, { seconds: true }) : 'Nothing stored yet'}</dd></div>
          </dl>

          <p className="footnote">
            <Icon name="database" size={13} className="inline-icon" /> Counted from events stored in MongoDB.
            {pending > 0 && <> {fmtNumber(pending)} more {pending === 1 ? 'is' : 'are'} not confirmed yet.</>}
            {stored.truncated && ' Only the first 5,000 events are counted.'}
          </p>
        </>
      )}
    </section>
  );
}
