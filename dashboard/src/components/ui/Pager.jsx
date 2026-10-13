import Icon from './Icon.jsx';

/** Previous/next as links, so paging is a normal navigation (keyboard, middle-click, back button all work). */
export default function Pager({ page, totalPages, from, to, total, hrefFor, noun = 'sessions' }) {
  return (
    <nav className="pager" aria-label="Pagination">
      <p className="pager-range">Showing <span className="tnum">{from}–{to}</span> of <span className="tnum">{total}</span> {noun}</p>
      <div className="pager-buttons">
        <a className="btn" href={hrefFor(page - 1)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} onClick={(e) => page <= 1 && e.preventDefault()}><Icon name="prev" /> Previous</a>
        <span className="pager-pos tnum">Page {page} of {totalPages}</span>
        <a className="btn" href={hrefFor(page + 1)} aria-disabled={page >= totalPages} tabIndex={page >= totalPages ? -1 : undefined} onClick={(e) => page >= totalPages && e.preventDefault()}>Next <Icon name="next" /></a>
      </div>
    </nav>
  );
}
