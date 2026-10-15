import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutopilot } from '../demo/autopilot.js';

// A tiny fake store: elements know whether they are visible, and what clicking them does.
function fakeStore({ menuHidesTarget }) {
  const clicks = [];
  const make = (id, { visible = true, onClick } = {}) => ({
    id, visible,
    getClientRects() { return this.visible ? [{}] : []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 40 }; },
    scrollIntoView() {},
    dispatchEvent() { clicks.push(id); if (onClick) onClick(); return true; },
  });
  const target = make('target', { visible: !menuHidesTarget });
  const toggle = make('toggle', { visible: menuHidesTarget, onClick: () => { target.visible = true; } });
  const els = { '#target': target, '#toggle': toggle };
  const win = { document: { querySelector: (sel) => els[sel] || null }, MouseEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } } };
  return { win, clicks, target };
}

function run(store, steps) {
  globalThis.window = { setTimeout };
  const dispatches = [];
  return new Promise((resolve) => {
    const pilot = createAutopilot({
      steps, pace: 1,
      getWindow: () => store.win,
      waitForLoad: () => Promise.resolve(),
      onDispatch: (on, step) => { if (on) dispatches.push({ id: step.id, navigates: Boolean(step.navigates) }); },
      onProgress: (p) => { if (p.state === 'done' || p.state === 'stopped') resolve({ p, dispatches }); },
    });
    pilot.start();
  });
}

const STEPS = [{ id: 'go', label: 'Go', target: '#target', reveal: '#toggle', navigates: true }];

test('autopilot opens the control named by `reveal` first when the target is hidden', async () => {
  const store = fakeStore({ menuHidesTarget: true });
  const { p, dispatches } = await run(store, STEPS);
  assert.deepEqual(store.clicks, ['toggle', 'target']);
  assert.equal(p.skipped, 0);
  // The reveal click is not a navigation, only the real step is.
  assert.deepEqual(dispatches.map((d) => d.navigates), [false, true]);
});

test('autopilot clicks nothing extra when the target is already visible', async () => {
  const store = fakeStore({ menuHidesTarget: false });
  const { p } = await run(store, STEPS);
  assert.deepEqual(store.clicks, ['target']);
  assert.equal(p.skipped, 0);
});

test('autopilot still skips a step whose target never appears', async () => {
  const store = fakeStore({ menuHidesTarget: true });
  store.win.document.querySelector = (sel) => (sel === '#target' ? store.target : null); // no toggle exists
  store.target.visible = false;
  const steps = [{ id: 'go', label: 'Go', target: '#target', reveal: '#toggle' }];
  const t0 = Date.now();
  const { p } = await run(store, steps);
  assert.equal(p.skipped, 1);
  assert.deepEqual(store.clicks, []);
  assert.ok(Date.now() - t0 < 6000);
});
