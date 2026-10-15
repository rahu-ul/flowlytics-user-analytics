import { useDemo } from '../demo/useDemo.js';
import Icon from '../components/ui/Icon.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ErrorState } from '../components/ui/States.jsx';
import ActivityFeed from '../components/demo/ActivityFeed.jsx';
import ControlsPanel from '../components/demo/ControlsPanel.jsx';
import HowItWorks from '../components/demo/HowItWorks.jsx';
import InfoTip from '../components/demo/InfoTip.jsx';
import SessionPanel from '../components/demo/SessionPanel.jsx';
import StatusChip from '../components/demo/StatusChip.jsx';
import StoreStage from '../components/demo/StoreStage.jsx';

export default function DemoView() {
  const demo = useDemo();
  const { apiState, started, frame, pilot, status, actions } = demo;
  const generating = pilot.state === 'running' || pilot.state === 'paused';

  const primary = !started ? (
    <button type="button" className="btn btn-primary" onClick={actions.start} disabled={apiState.state !== 'up'}>
      <Icon name="play" size={16} /> Start demo
    </button>
  ) : (
    <button type="button" className="btn btn-primary" onClick={actions.generate} disabled={frame !== 'ready' || generating}>
      <Icon name="activity" size={16} /> {generating ? 'Generating activity' : 'Generate sample activity'}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Product Demo"
        description="Explore how Flowlytics captures user activity and transforms it into meaningful analytics."
        meta={(
          <>
            <StatusChip status={status} />
            <span className="chip">
              Live API mode{' '}
              <InfoTip label="live API mode" align="end">Every event here goes through the real tracker to /api/events and is stored in MongoDB. There is no simulation mode: if the API is unavailable, events show as failed and are never displayed as stored.</InfoTip>
            </span>
          </>
        )}
        actions={primary}
      />
      <p className="sr-only" role="status" aria-live="polite">{status.label}. {status.detail}</p>

      {apiState.state === 'down' && (
        <ErrorState
          title="The Flowlytics API is not responding"
          message={`${apiState.error}. ${started ? 'The tracker retries a failed delivery up to 3 times and then drops those events; they appear below as failed.' : 'The sample store stays off until the API responds, because events could not be stored.'}`}
          onRetry={actions.checkApi}
        />
      )}

      <div className="demo-grid">
        <StoreStage demo={demo} />
        <div className="demo-side">
          <SessionPanel demo={demo} />
          <ControlsPanel demo={demo} />
        </div>
      </div>

      <div className="demo-feed"><ActivityFeed demo={demo} /></div>

      <h2 className="section-heading">How it works</h2>
      <HowItWorks />
    </>
  );
}
