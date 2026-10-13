/**
 * Converts raw click records into points normalised to 0..1 of the page.
 * Horizontal position uses each click's own document width (so different window widths line up by
 * proportion); vertical position uses absolute pixels over the tallest document seen.
 * Falls back to the observed maximum when documents sizes were not reported.
 */
export function buildHeatPoints(clicks) {
  if (!clicks.length) return { aspect: 1, points: [] };
  const maxX = Math.max(...clicks.map((c) => c.x));
  const maxY = Math.max(...clicks.map((c) => c.y));
  const reportedW = clicks.some((c) => c.docWidth);
  const reportedH = clicks.some((c) => c.docHeight);
  const width = reportedW ? Math.max(...clicks.map((c) => c.docWidth || 0)) : Math.max(maxX * 1.1, 1);
  const height = reportedH ? Math.max(...clicks.map((c) => c.docHeight || 0)) : Math.max(maxY * 1.1, 1);

  const clamp = (v) => Math.min(Math.max(v, 0), 1);
  const points = clicks.map((c) => ({
    fx: clamp(c.x / (c.docWidth || width)),
    fy: clamp(c.y / height),
  }));
  return { aspect: height / width, points, pageWidth: width, pageHeight: height, estimated: !reportedW || !reportedH };
}

/** Bins normalised points into a cols x rows grid; returns counts and the max cell value. */
export function binPoints(points, cols, rows) {
  const cells = new Array(cols * rows).fill(0);
  for (const { fx, fy } of points) {
    const cx = Math.min(cols - 1, Math.floor(fx * cols));
    const cy = Math.min(rows - 1, Math.floor(fy * rows));
    cells[cy * cols + cx] += 1;
  }
  return { cells, max: Math.max(0, ...cells) };
}

export const HEAT_WIDTH = 800; // logical drawing width; the canvas is scaled to the container with the aspect ratio preserved
export const HEAT_CELL = 40;

/**
 * Grid geometry for a page of the given aspect ratio. Cell height is height / rows (not a fixed 40),
 * so drawn cells line up exactly with the bins computed by binPoints.
 */
export function gridFor(aspect, width = HEAT_WIDTH, cell = HEAT_CELL) {
  const height = width * aspect;
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  return { width, height, cols, rows, cw: width / cols, ch: height / rows };
}

/** Indices of the n busiest cells, busiest first (ties by position). */
export function topCells(cells, n = 5) {
  return cells
    .map((count, index) => ({ count, index }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, n);
}

/** Human-readable extent of a cell: x as percent of page width, y in page pixels. */
export function describeCell(index, cols, rows, pageHeight) {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    col,
    row,
    xFrom: Math.round((col / cols) * 100),
    xTo: Math.round(((col + 1) / cols) * 100),
    yFrom: Math.round((row / rows) * pageHeight),
    yTo: Math.round(((row + 1) / rows) * pageHeight),
  };
}
