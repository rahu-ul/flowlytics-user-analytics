import { useEffect } from 'react';

export default function PageHeader({ title, description, meta, actions }) {
  useEffect(() => { document.title = title === 'Overview' ? 'Flowlytics — User Analytics' : `${title} · Flowlytics`; }, [title]);
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
        {meta && <div className="page-meta">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
