import { STORE_SRC } from '../../demo/useDemo.js';
import { hostPath } from '../../lib/format.js';
import Icon from '../ui/Icon.jsx';
import { ErrorState } from '../ui/States.jsx';

/** The sample store in a browser-style frame. The page inside loads the real /tracker.js itself. */
export default function StoreStage({ demo }) {
  const { started, frame, frameKey, iframeRef, apiState, currentPage, actions } = demo;
  const shown = currentPage ? hostPath(currentPage) : { host: window.location.host, path: STORE_SRC };

  return (
    <section className="card demo-stage" aria-labelledby="stage-title">
      <div className="stage-head">
        <div>
          <h2 className="card-title" id="stage-title">Sample store</h2>
          <p className="quiet">A working storefront. Everything you do in it is tracked for real. Scroll inside the frame to see the whole store, or open it in its own tab.</p>
        </div>
        <a className="pill-link" href={STORE_SRC} target="_blank" rel="noopener">Open in a new tab <Icon name="external" size={14} /></a>
      </div>

      {frame === 'load-failed' && (
        <ErrorState
          title="The sample store did not load"
          message={`Nothing came back from ${STORE_SRC} in time, so no events are being captured. Check that the backend is running and serving /demo, then try again. If the store loads late it will recover by itself.`}
          onRetry={actions.reloadStore}
          action={<a className="btn" href={STORE_SRC} target="_blank" rel="noopener">Open the store directly <Icon name="external" size={14} /></a>}
        />
      )}

      {frame === 'no-tracker' && (
        <ErrorState
          title="The tracker did not start in the sample store"
          message="The store loaded, but /tracker.js did not initialise, so no events are being captured. A content blocker can cause this."
          onRetry={actions.reloadStore}
        />
      )}

      <div className="browser">
        <div className="browser-bar">
          <span className="browser-url mono" title={currentPage || STORE_SRC}>{shown.host}{shown.path}</span>
          {started && frame === 'ready' && <span className="browser-live"><span className="status-dot" aria-hidden="true" /> Tracking</span>}
        </div>
        {started ? (
          <div className="browser-body" data-loading={frame === 'loading'}>
            <iframe
              key={frameKey}
              ref={iframeRef}
              className="browser-frame"
              src={STORE_SRC}
              title="Demo Store, the tracked sample storefront"
              onLoad={actions.onFrameLoad}
              onError={actions.onFrameError}
            />
            {frame === 'loading' && <div className="browser-loading skeleton" role="status" aria-label="Loading the sample store" />}
          </div>
        ) : (
          <div className="browser-empty">
            <div className="state">
              <span className="state-icon" aria-hidden="true"><Icon name="store" size={22} /></span>
              <p className="state-title">The sample store is off</p>
              <p className="state-body">Starting the demo loads a small store in this frame, with the Flowlytics tracker running inside it. Nothing is recorded until you start.</p>
              <button type="button" className="btn btn-primary" onClick={actions.start} disabled={apiState.state !== 'up'}>
                <Icon name="play" size={16} /> Start demo
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
