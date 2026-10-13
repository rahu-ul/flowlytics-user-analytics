import Icon from './ui/Icon.jsx';
import { fmtDateTime, fmtOffset, hostPath } from '../lib/format.js';

/** Chronological journey. Type is carried by icon, colour AND a text label, never colour alone. */
export default function SessionTimeline({ events }) {
  const start = new Date(events[0].timestamp).getTime();
  return (
    <ol className="timeline" aria-label="Events in order">
      {events.map((e, i) => {
        const click = e.type === 'click';
        const { path } = hostPath(e.url);
        const offset = new Date(e.timestamp).getTime() - start;
        return (
          <li key={i} className={`tl-item ${click ? 'is-click' : 'is-view'}`}>
            <span className="tl-node"><Icon name={click ? 'click' : 'page'} size={15} /></span>
            <div className="tl-card">
              <div className="tl-head">
                <p className="tl-main">
                  <span className={`chip ${click ? 'chip-click' : 'chip-view'}`}>{click ? 'Click' : 'Page view'}</span>
                  {click && <span className="mono tl-coords tnum">x {Math.round(e.x)}, y {Math.round(e.y)}</span>}
                </p>
                <time className="tl-time tnum" dateTime={new Date(e.timestamp).toISOString()} title={fmtDateTime(e.timestamp, { seconds: true })}>{fmtOffset(offset)}</time>
              </div>
              <p className={click ? 'tl-sub' : 'tl-path'} title={e.url}>
                {click && <span>on </span>}<span className="mono">{path}</span>
              </p>
              {!click && e.title && <p className="tl-sub">{e.title}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
