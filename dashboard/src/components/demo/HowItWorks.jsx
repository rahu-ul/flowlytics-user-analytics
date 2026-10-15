import Icon from '../ui/Icon.jsx';

const STEPS = [
  { icon: 'store', tint: 'amber', title: 'A visitor interacts', text: 'Someone browses the sample store: they filter, open products and click buttons.' },
  { icon: 'activity', tint: 'lime', title: 'The tracker captures', text: 'tracker.js records page views and pointer clicks, with coordinates, in a session.' },
  { icon: 'server', tint: 'sky', title: 'Events go to the API', text: 'Batches are posted to POST /api/events on the Express server.' },
  { icon: 'database', tint: 'coral', title: 'MongoDB stores them', text: 'The API validates each event and stores the valid ones. Rejects are reported back.' },
  { icon: 'overview', tint: 'amber', title: 'Flowlytics shows them', text: 'Sessions replays each timeline. Heatmaps plots where people clicked.' },
];

export default function HowItWorks() {
  return (
    <ol className="flow" aria-label="How an event travels from the browser to the dashboard">
      {STEPS.map((s, i) => (
        <li className="flow-step" key={s.title}>
          <div className="flow-top">
            <span className={`metric-icon tint-${s.tint}`} aria-hidden="true"><Icon name={s.icon} size={17} /></span>
            <span className="flow-num tnum" aria-hidden="true">{i + 1}</span>
          </div>
          <h3 className="card-title">{s.title}</h3>
          <p className="quiet">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
