import { useEffect, useMemo, useRef, useState } from 'react';
import { describeCell } from '../lib/heatmap.js';
import { plural } from '../lib/format.js';

const MAX_BACKING = 16000; // browsers cap canvas dimensions; stay well under

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
};
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Three-stop sequential ramp read from the theme tokens: t=0 lightest/quietest, t=1 strongest. */
function ramp(stops, t) {
  const [c0, c1, c2] = stops.map(hexToRgb);
  const rgb = t < 0.5 ? mix(c0, c1, t / 0.5) : mix(c1, c2, (t - 0.5) / 0.5);
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

/** Picks a ruler step so the page height has at most ~12 guide lines. */
function rulerStep(pageHeight) {
  return [100, 250, 500, 1000, 2000, 5000, 10000, 20000].find((s) => pageHeight / s <= 12) ?? 50000;
}

function draw(canvas, { points, grid, bins, mode, pageHeight, scale }) {
  const { width: W, height: H, cols, rows, cw, ch } = grid;
  const dpr = window.devicePixelRatio || 1;
  const k = Math.min(dpr * scale, MAX_BACKING / H, MAX_BACKING / W);
  canvas.width = Math.max(1, Math.round(W * k));
  canvas.height = Math.max(1, Math.round(H * k));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);

  const colors = {
    bg: cssVar('--canvas-bg'), rule: cssVar('--canvas-rule'), label: cssVar('--canvas-label'), dot: cssVar('--heat-dot'),
    stops: [cssVar('--heat-0'), cssVar('--heat-1'), cssVar('--heat-2')],
  };
  const px = 1 / scale; // one screen pixel in logical units, keeps strokes and text a constant on-screen size

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  // Vertical ruler in real page pixels, so y positions can be read off the sheet.
  const step = rulerStep(pageHeight);
  ctx.strokeStyle = colors.rule;
  ctx.lineWidth = px;
  ctx.fillStyle = colors.label;
  ctx.font = `${11 * px}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textBaseline = 'top';
  for (let y = step; y < pageHeight; y += step) {
    const ly = (y / pageHeight) * H;
    // Grid mode already draws cell lines, so the ruler is reduced to a short tick there.
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(mode === 'grid' ? 10 * px : W, ly); ctx.stroke();
    ctx.fillText(`${y} px`, (mode === 'grid' ? 14 : 6) * px, ly + 3 * px);
  }

  if (mode === 'grid') {
    bins.cells.forEach((n, i) => {
      if (!n) return;
      ctx.fillStyle = ramp(colors.stops, Math.sqrt(n / bins.max));
      ctx.fillRect((i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
    });
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = px;
    ctx.beginPath();
    for (let c = 1; c < cols; c += 1) { ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, H); }
    for (let r = 1; r < rows; r += 1) { ctx.moveTo(0, r * ch); ctx.lineTo(W, r * ch); }
    ctx.stroke();
    return;
  }

  // Dots: one translucent circle per recorded click; overlapping clicks deepen the colour.
  const radius = Math.min(Math.max(5 * px, 5), 9);
  ctx.fillStyle = rgba(colors.dot, 0.24);
  ctx.strokeStyle = rgba(colors.dot, 0.55);
  ctx.lineWidth = px;
  for (const { fx, fy } of points) {
    ctx.beginPath();
    ctx.arc(fx * W, fy * H, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export default function HeatmapCanvas({ points, grid, bins, mode, theme, pageHeight, activeCell, onActiveCell, label }) {
  const canvasRef = useRef(null);
  const sheetRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    const el = sheetRef.current;
    const ro = new ResizeObserver(([entry]) => setScale(Math.max(0.2, Math.round(Math.min(1, entry.contentRect.width / grid.width) * 50) / 50)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [grid.width]);

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, { points, grid, bins, mode, pageHeight, scale });
  }, [points, grid, bins, mode, theme, pageHeight, scale]);

  const cell = useMemo(() => (activeCell === null ? null : describeCell(activeCell, grid.cols, grid.rows, pageHeight)), [activeCell, grid, pageHeight]);

  const onMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) { onActiveCell(null); setTip(null); return; }
    const col = Math.min(grid.cols - 1, Math.floor(fx * grid.cols));
    const row = Math.min(grid.rows - 1, Math.floor(fy * grid.rows));
    onActiveCell(row * grid.cols + col);
    setTip({ x: Math.min(e.clientX - rect.left + 14, rect.width - 190), y: Math.min(e.clientY - rect.top + 16, rect.height - 56) });
  };
  const onLeave = () => { onActiveCell(null); setTip(null); };

  const count = activeCell === null ? 0 : bins.cells[activeCell];

  return (
    <div className="sheet" ref={sheetRef} style={{ maxWidth: grid.width }} onPointerMove={onMove} onPointerLeave={onLeave}>
      <canvas ref={canvasRef} role="img" aria-label={label} style={{ aspectRatio: `${grid.width} / ${grid.height}` }} />
      {cell && (
        <span className="cell-outline" aria-hidden="true" style={{ left: `${(cell.col / grid.cols) * 100}%`, top: `${(cell.row / grid.rows) * 100}%`, width: `${100 / grid.cols}%`, height: `${100 / grid.rows}%` }} />
      )}
      {cell && tip && (
        <div className="tooltip" aria-hidden="true" style={{ left: tip.x, top: tip.y }}>
          <strong className="tnum">{count === 0 ? 'No clicks' : plural(count, 'click')}</strong>
          <span className="tnum">x {cell.xFrom}–{cell.xTo}% · y {cell.yFrom}–{cell.yTo} px</span>
        </div>
      )}
    </div>
  );
}
