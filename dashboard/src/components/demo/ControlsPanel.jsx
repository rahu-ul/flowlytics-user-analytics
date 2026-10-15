import { buildHref } from '../../router.js';
import { pilotPercent } from '../../lib/demo.js';
import Icon from '../ui/Icon.jsx';

/** Pause/resume and progress for the scripted visitor, reset, and links to the views the demo feeds. */
export default function ControlsPanel({ demo }) {
  const { pilot, sessionId, stored, currentPage, started, actions } = demo;
  const running = pilot.state === 'running';
  const paused = pilot.state === 'paused';
  const hasStored = Boolean(sessionId && stored.summary && stored.summary.count > 0);
  const sessionsHref = hasStored ? buildHref(['sessions', sessionId]) : buildHref(['sessions']);
  const heatmapPage = currentPage || `${window.location.origin}/demo/index.html`;
  const heatmapsHref = buildHref(['heatmaps'], { url: heatmapPage });

  const percent = pilotPercent(pilot);
  const showBar = running || paused || pilot.state === 'done';

  let progress = null;
  if (running || paused) progress = `${paused ? 'Paused at' : 'Running'} step ${Math.min(pilot.index + 1, pilot.total)} of ${pilot.total}: ${pilot.label}`;
  else if (pilot.state === 'done') progress = `Sample activity finished.${pilot.skipped ? ` ${pilot.skipped} ${pilot.skipped === 1 ? 'step was' : 'steps were'} skipped because the target was not on the page.` : ''}`;
  else if (pilot.state === 'stopped') progress = 'Sample activity stopped.';

  return (
    <section className="card controls-panel" aria-labelledby="controls-title">
      <h2 className="card-title" id="controls-title">Controls</h2>
      <p className="quiet controls-progress" role="status" aria-live="polite">
        {progress || (started ? 'Click around the store, or generate sample activity: a scripted visitor browses and clicks through it.' : 'Start the demo to enable the store and its controls.')}
      </p>

      {showBar && (
        <div className="progress" role="progressbar" aria-label="Sample activity progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} data-state={pilot.state}>
          <span className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
      )}

      <div className="controls-row">
        {(running || paused) && (
          <button type="button" className="btn" onClick={paused ? actions.resume : actions.pause}>
            <Icon name={paused ? 'play' : 'pause'} size={16} /> {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        <button type="button" className="btn" onClick={actions.reset} disabled={!started} title="Clears this view only. Nothing is deleted from MongoDB.">
          <Icon name="reset" size={16} /> Reset view
        </button>
      </div>
      <p className="footnote">Reset clears this view only. Events already stored in MongoDB are not deleted.</p>

      <div className="controls-links">
        <a className="btn" href={sessionsHref}><Icon name="sessions" size={16} /> {hasStored ? 'Open this session' : 'Open Sessions'}</a>
        <a className="btn" href={heatmapsHref}><Icon name="heatmap" size={16} /> Open Heatmaps</a>
      </div>
    </section>
  );
}
