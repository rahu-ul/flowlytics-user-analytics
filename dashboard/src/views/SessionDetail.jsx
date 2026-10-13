import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAsync, useReload } from '../hooks.js';
import { fmtDateTime, fmtDuration, fmtNumber } from '../lib/format.js';
import { summarizeEvents } from '../lib/sessions.js';
import Icon from '../components/ui/Icon.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States.jsx';
import SessionTimeline from '../components/SessionTimeline.jsx';

function CopyId({ id }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(id); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* clipboard unavailable */ }
  };
  return (
    <button type="button" className="btn btn-sm" onClick={copy} aria-label="Copy session ID">
      <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copied' : 'Copy ID'}
    </button>
  );
}

export default function SessionDetail({ sessionId, closeHref }) {
  const [reload, bump] = useReload();
  const { data, error, loading } = useAsync((signal) => api.sessionEvents(sessionId, signal), [sessionId, reload]);
  const current = data && data.sessionId === sessionId ? data : null;
  const summary = useMemo(() => (current ? summarizeEvents(current.events) : null), [current]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
      window.location.hash = closeHref;
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeHref]);

  return (
    <section className="detail" aria-label="Session details">
      <div className="detail-top">
        <a className="btn btn-sm back-link" href={closeHref}><Icon name="back" size={15} /> All sessions</a>
        <a className="btn-icon close-link" href={closeHref} aria-label="Close session details"><Icon name="close" size={20} /></a>
      </div>

      <div className="detail-head">
        <div>
          <h2 className="detail-title">Session journey</h2>
          <p className="detail-id mono" title={sessionId}>{sessionId}</p>
        </div>
        {current && <CopyId id={sessionId} />}
      </div>

      {(loading || !current) && !error && <LoadingState rows={9} label="Loading session events" />}
      {error && <ErrorState title="Could not load this session" message={error} onRetry={bump} action={<a className="btn" href={closeHref}>Back to sessions</a>} />}

      {current && summary && (
        <>
          <dl className="facts facts-counts">
            <div><dt>Events</dt><dd className="tnum">{fmtNumber(summary.count)}</dd></div>
            <div><dt>Page views</dt><dd className="tnum">{fmtNumber(summary.pageViews)}</dd></div>
            <div><dt>Clicks</dt><dd className="tnum">{fmtNumber(summary.clicks)}</dd></div>
            <div><dt>Pages visited</dt><dd className="tnum">{fmtNumber(summary.pagesVisited)}</dd></div>
          </dl>
          <dl className="facts facts-times">
            <div><dt>First activity</dt><dd className="tnum">{fmtDateTime(summary.first, { seconds: true })}</dd></div>
            <div><dt>Last activity</dt><dd className="tnum">{fmtDateTime(summary.last, { seconds: true })}</dd></div>
            <div><dt>Duration</dt><dd className="tnum">{fmtDuration(summary.durationMs)}</dd></div>
          </dl>

          <h3 className="card-title detail-section">Events</h3>
          {current.truncated && <p className="notice" role="note">Showing the first {fmtNumber(current.events.length)} events only. Later events are not displayed.</p>}
          {current.events.length === 0
            ? <EmptyState title="No events in this session." />
            : <SessionTimeline events={current.events} />}
        </>
      )}
    </section>
  );
}
