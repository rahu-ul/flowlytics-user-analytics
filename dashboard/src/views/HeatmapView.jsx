import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAsync, useReload } from '../hooks.js';
import { navigate } from '../router.js';
import { useTheme } from '../theme.js';
import { binPoints, buildHeatPoints, describeCell, gridFor, topCells } from '../lib/heatmap.js';
import { fmtDateTime, fmtNumber, hostPath, plural } from '../lib/format.js';
import Icon from '../components/ui/Icon.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import SegmentedControl from '../components/ui/SegmentedControl.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States.jsx';
import PageSelector from '../components/PageSelector.jsx';
import HeatmapCanvas from '../components/HeatmapCanvas.jsx';

const MODES = [{ value: 'dots', label: 'Dots' }, { value: 'grid', label: 'Grid' }];

export default function HeatmapView({ route }) {
  const { theme } = useTheme();
  const [reload, bump] = useReload();
  const [mode, setMode] = useState('dots');
  const [activeCell, setActiveCell] = useState(null);

  const pagesState = useAsync((signal) => api.pages(signal), [reload]);
  const pages = pagesState.data?.pages ?? [];
  const requested = route.params.get('url') || '';
  const url = pages.some((p) => p.pagePath === requested) ? requested : pages[0]?.pagePath || '';
  const pageInfo = pages.find((p) => p.pagePath === url);

  const heat = useAsync(
    (signal) => (url ? api.heatmap(url, signal).then((d) => ({ ...d, requestedFor: url })) : Promise.resolve(null)),
    [url, reload],
  );
  const result = heat.data && heat.data.requestedFor === url ? heat.data : null;

  const model = useMemo(() => {
    if (!result || result.clicks.length === 0) return null;
    const built = buildHeatPoints(result.clicks);
    const grid = gridFor(built.aspect);
    const bins = binPoints(built.points, grid.cols, grid.rows);
    const top = topCells(bins.cells, 5).map((c) => ({ ...c, ...describeCell(c.index, grid.cols, grid.rows, built.pageHeight) }));
    return { ...built, grid, bins, top };
  }, [result]);

  const { host, path } = hostPath(url);
  const loadingHeat = url && (heat.loading || !result) && !heat.error;
  const label = model
    ? `Click map for ${host}${path}: ${plural(model.points.length, 'click')} plotted${model.top[0] ? `. Busiest region: x ${model.top[0].xFrom} to ${model.top[0].xTo} percent, y ${model.top[0].yFrom} to ${model.top[0].yTo} pixels, ${plural(model.top[0].count, 'click')}` : ''}.`
    : 'Click map';

  return (
    <>
      <PageHeader
        title="Heatmaps"
        description="Where visitors click on a page, plotted from the click coordinates the tracker recorded. This is a coordinate map of the page area, not a screenshot of the page."
      />

      {pagesState.loading && !pagesState.data && <LoadingState variant="block" label="Loading pages" />}
      {pagesState.error && <ErrorState title="Could not load tracked pages" message={pagesState.error} onRetry={bump} />}
      {pagesState.data && pages.length === 0 && (
        <EmptyState title="No tracked pages yet">Pages appear here after the tracker records a page view. Open the demo store at <code>/demo/index.html</code> on the API host and click around.</EmptyState>
      )}

      {pages.length > 0 && (
        <>
          <div className="toolbar">
            <PageSelector pages={pages} value={url} onChange={(u) => navigate(['heatmaps'], { url: u }, { replace: true })} />
            <div className="field">
              <span className="field-label" id="mode-label">Display</span>
              <SegmentedControl label="Display mode" value={mode} options={MODES} onChange={setMode} />
            </div>
          </div>

          <div className="heat-layout">
            <div className="stage" aria-busy={Boolean(loadingHeat)}>
              {loadingHeat && <LoadingState variant="block" label="Loading clicks" />}
              {heat.error && <ErrorState title="Could not load clicks for this page" message={heat.error} onRetry={bump} />}
              {result && result.clicks.length === 0 && (
                <EmptyState title="No clicks recorded for this page">{pageInfo ? `${plural(pageInfo.pageViews, 'page view')} so far, but no clicks.` : 'The tracker has not recorded a click here yet.'} Clicks appear once visitors interact with the page.</EmptyState>
              )}
              {model && (
                <HeatmapCanvas points={model.points} grid={model.grid} bins={model.bins} mode={mode} theme={theme} pageHeight={model.pageHeight} activeCell={activeCell} onActiveCell={setActiveCell} label={label} />
              )}
            </div>

            <aside className="inspector" aria-label="Page details">
              <section>
                <h2 className="card-title">Selected page</h2>
                <p className="inspector-url mono">{host}<br />{path || '/'}</p>
                <a className="text-link" href={url} target="_blank" rel="noopener noreferrer">Open page <Icon name="external" size={14} /><span className="sr-only"> (opens in a new tab)</span></a>
              </section>

              {result && (
                <section>
                  <dl className="facts facts-1">
                    <div><dt>Clicks recorded</dt><dd className="tnum">{fmtNumber(result.total)}</dd></div>
                    {result.truncated && <div><dt>Clicks plotted</dt><dd className="tnum">{fmtNumber(result.clicks.length)} <span className="quiet">(most recent)</span></dd></div>}
                    {pageInfo && <div><dt>Page views</dt><dd className="tnum">{fmtNumber(pageInfo.pageViews)}</dd></div>}
                    {pageInfo && <div><dt>Last activity</dt><dd className="tnum">{fmtDateTime(pageInfo.lastSeen)}</dd></div>}
                    {model && <div><dt>Page size used</dt><dd className="tnum">{fmtNumber(Math.round(model.pageWidth))} × {fmtNumber(Math.round(model.pageHeight))} px{model.estimated && <span className="quiet"> (estimated)</span>}</dd></div>}
                  </dl>
                </section>
              )}

              {model && (
                <section aria-labelledby="regions-title">
                  <h2 className="card-title" id="regions-title">Busiest regions</h2>
                  <ol className="regions">
                    {model.top.map((r) => (
                      <li key={r.index} data-active={activeCell === r.index}>
                        <button type="button" onMouseEnter={() => setActiveCell(r.index)} onMouseLeave={() => setActiveCell(null)} onFocus={() => setActiveCell(r.index)} onBlur={() => setActiveCell(null)}>
                          <span className="tnum region-where">x {r.xFrom}–{r.xTo}%, y {fmtNumber(r.yFrom)}–{fmtNumber(r.yTo)} px</span>
                          <span className="tnum region-count">{fmtNumber(r.count)}</span>
                          <span className="databar" aria-hidden="true"><span style={{ width: `${(r.count / model.bins.max) * 100}%` }} /></span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {model && (
                <section>
                  <h2 className="card-title">Reading the map</h2>
                  <p className="legend">
                    {mode === 'dots'
                      ? 'Each dot is one recorded click. Colour deepens where clicks overlap.'
                      : <>Each cell covers 5% of page width. Hotter colours mean more clicks. <span className="legend-ramp" aria-hidden="true" /> Fewer to more.</>}
                  </p>
                  <p className="legend">
                    Horizontal position is each click's share of its own page width; vertical position is in page pixels, measured down from the top. Pages that reflow at different window widths will not line up exactly.
                  </p>
                  {model.estimated && <p className="notice" role="note">Some clicks did not report the page size, so the extent is estimated from the click positions.</p>}
                </section>
              )}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
