import { useId, useState } from 'react';
import Icon from '../ui/Icon.jsx';

/** Small "i" button with a tooltip. Opens on hover or keyboard focus and can be dismissed with Escape. */
export default function InfoTip({ label, children, align = 'start' }) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return (
    <span className="infotip" data-align={align} data-dismissed={dismissed} onMouseLeave={() => setDismissed(false)}>
      <button
        type="button"
        className="infotip-btn"
        aria-label={`About ${label}`}
        aria-describedby={id}
        onKeyDown={(e) => { if (e.key === 'Escape') setDismissed(true); }}
        onBlur={() => setDismissed(false)}
      >
        <Icon name="info" size={14} />
      </button>
      <span role="tooltip" id={id} className="infotip-pop"><span className="infotip-box">{children}</span></span>
    </span>
  );
}
