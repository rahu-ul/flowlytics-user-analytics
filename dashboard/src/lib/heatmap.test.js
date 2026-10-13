import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeatPoints, binPoints, gridFor, topCells, describeCell } from './heatmap.js';

test('empty input yields no points', () => {
  assert.deepEqual(buildHeatPoints([]), { aspect: 1, points: [] });
});

test('normalises using document size and reports aspect ratio', () => {
  const { aspect, points } = buildHeatPoints([
    { x: 500, y: 1000, docWidth: 1000, docHeight: 2000 },
    { x: 1000, y: 0, docWidth: 1000, docHeight: 2000 },
  ]);
  assert.equal(aspect, 2);
  assert.deepEqual(points, [{ fx: 0.5, fy: 0.5 }, { fx: 1, fy: 0 }]);
});

test('falls back to observed bounds when document size is missing, and clamps', () => {
  const { points } = buildHeatPoints([{ x: 100, y: 50 }, { x: 10, y: 5 }]);
  assert.ok(points.every((p) => p.fx >= 0 && p.fx <= 1 && p.fy >= 0 && p.fy <= 1));
});

test('binPoints counts per cell and finds the max', () => {
  const { cells, max } = binPoints([{ fx: 0.1, fy: 0.1 }, { fx: 0.12, fy: 0.1 }, { fx: 0.99, fy: 0.99 }], 2, 2);
  assert.deepEqual(cells, [2, 0, 0, 1]);
  assert.equal(max, 2);
});

test('buildHeatPoints reports the page size basis and whether it was estimated', () => {
  const reported = buildHeatPoints([{ x: 10, y: 10, docWidth: 1000, docHeight: 2000 }]);
  assert.equal(reported.pageWidth, 1000);
  assert.equal(reported.pageHeight, 2000);
  assert.equal(reported.estimated, false);
  assert.equal(buildHeatPoints([{ x: 10, y: 10 }]).estimated, true);
});

test('gridFor makes cells that tile the page exactly (no drift)', () => {
  const g = gridFor(1010 / 800); // height 1010 is not a multiple of 40
  assert.equal(g.cols, 20);
  assert.equal(g.rows, 26);
  assert.ok(Math.abs(g.ch * g.rows - g.height) < 1e-9);
  assert.ok(Math.abs(g.cw * g.cols - g.width) < 1e-9);
});

test('a point lands in the cell that is drawn at its position', () => {
  const g = gridFor(1010 / 800);
  const fy = 0.97; // near the bottom of the page
  const { cells } = binPoints([{ fx: 0.5, fy }], g.cols, g.rows);
  const index = cells.findIndex((n) => n === 1);
  const row = Math.floor(index / g.cols);
  assert.ok(fy * g.height >= row * g.ch && fy * g.height < (row + 1) * g.ch);
});

test('topCells orders by count then position and skips empty cells', () => {
  assert.deepEqual(topCells([0, 3, 5, 3, 0], 3), [{ count: 5, index: 2 }, { count: 3, index: 1 }, { count: 3, index: 3 }]);
});

test('describeCell converts a cell to percent and page pixels', () => {
  assert.deepEqual(describeCell(21, 20, 10, 1000), { col: 1, row: 1, xFrom: 5, xTo: 10, yFrom: 100, yTo: 200 });
});
