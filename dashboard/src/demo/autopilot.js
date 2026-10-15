import { SAMPLE_STEPS } from './sampleScript.js';

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * A scripted visitor for the sample store. It scrolls to each target and dispatches a pointer-style click
 * (detail 1, real coordinates inside the element) so the real tracker records it exactly as it would a person's click.
 * The tracker deliberately ignores clicks with detail 0, which is why element.click() would record nothing.
 *
 * Callbacks:
 *   getWindow()        -> the store iframe's window, or null
 *   waitForLoad(ms)    -> resolves when the iframe finishes loading its next page (used after navigating steps)
 *   onDispatch(on, step) called with true just before a click is dispatched and false right after, so the caller
 *                      can label the resulting events as scripted
 *                      (a step may also name `reveal`, a control to click first when its target is hidden)
 *   onProgress(p)      -> { state: 'running'|'paused'|'done'|'stopped', index, total, label, skipped }
 */
export function createAutopilot({ steps = SAMPLE_STEPS, getWindow, waitForLoad, onDispatch, onProgress, pace = 1100 }) {
  let cancelled = false;
  let runId = 0; // a new run (or stop) invalidates any loop still winding down
  let paused = false;
  let release = null; // resolves the pause gate
  let skipped = 0;
  let index = 0;
  let state = 'idle';

  const progress = (extra = {}) => {
    onProgress?.({ state, index, total: steps.length, label: steps[Math.min(index, steps.length - 1)]?.label || '', skipped, ...extra });
  };

  const dead = (token) => cancelled || token !== runId;
  async function gate(token) {
    while (paused && !dead(token)) await new Promise((resolve) => { release = resolve; });
  }
  async function pauseAwareSleep(ms, token) {
    const end = Date.now() + ms;
    while (Date.now() < end && !dead(token)) await wait(Math.min(100, end - Date.now()));
    await gate(token);
  }

  async function find(selector, token, timeoutMs = 3000) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const win = getWindow();
      let el = null;
      try { el = win?.document.querySelector(selector) || null; } catch { el = null; }
      // Hidden or detached elements have no layout boxes: treat them as absent rather than clicking nothing.
      if (el && el.getClientRects().length > 0) return { el, win };
      if (dead(token) || Date.now() >= end) return null;
      await wait(100);
    }
  }

  const visible = (el) => Boolean(el) && el.getClientRects().length > 0;
  const query = (selector) => { try { return getWindow()?.document.querySelector(selector) || null; } catch { return null; } };

  /** Dispatches a pointer-style click inside `el` (see the note at the top of this file about detail: 1). */
  function clickElement(el, win, step) {
    const r = el.getBoundingClientRect();
    const clientX = Math.round(r.left + r.width * (0.3 + Math.random() * 0.4));
    const clientY = Math.round(r.top + r.height * (0.3 + Math.random() * 0.4));
    onDispatch?.(true, step);
    try {
      el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, view: win, clientX, clientY, detail: 1 }));
    } finally {
      onDispatch?.(false, step);
    }
  }

  /**
   * A target can sit behind a control, for example a navigation link inside the store's collapsed phone menu.
   * When the target is hidden and the step names a `reveal` control that is visible, click that control first,
   * exactly as a person would. When the target is already visible (wide layouts), nothing extra is clicked.
   */
  async function revealIfHidden(step, token) {
    if (!step.reveal) return;
    const target = query(step.target);
    if (!target || visible(target)) return;
    const control = query(step.reveal);
    const win = getWindow();
    if (!visible(control) || !win) return;
    control.scrollIntoView({ block: 'center', inline: 'nearest' });
    await pauseAwareSleep(200, token);
    if (dead(token)) return;
    clickElement(control, win, { ...step, navigates: false });
    await pauseAwareSleep(250, token);
  }

  async function run() {
    if (state === 'running' || state === 'paused') return;
    const token = ++runId;
    cancelled = false; paused = false; skipped = 0; index = 0; state = 'running';
    progress();
    for (; index < steps.length; index += 1) {
      await gate(token);
      if (dead(token)) return;
      const step = steps[index];
      progress();
      await revealIfHidden(step, token);
      if (dead(token)) return;
      const found = await find(step.target, token);
      if (dead(token)) return;
      if (!found) { skipped += 1; continue; }
      const { el, win } = found;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      await pauseAwareSleep(250, token);
      if (dead(token)) return;
      const loaded = step.navigates ? waitForLoad(8000) : null;
      clickElement(el, win, step);
      if (loaded) await loaded;
      await pauseAwareSleep(pace, token);
    }
    if (dead(token)) return;
    index = steps.length - 1;
    state = 'done';
    progress({ index: steps.length });
  }

  return {
    start: () => run(),
    pause() { if (state === 'running') { paused = true; state = 'paused'; progress(); } },
    resume() { if (state === 'paused') { paused = false; state = 'running'; progress(); release?.(); } },
    stop() {
      if (state === 'idle' || state === 'done' || state === 'stopped') return;
      cancelled = true; runId += 1; paused = false; state = 'stopped'; release?.(); progress();
    },
    get state() { return state; },
  };
}
