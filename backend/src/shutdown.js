'use strict';

/**
 * Builds an idempotent shutdown function that runs `steps` in order, then exits.
 * steps: Array<[name, () => Promise<void>]>. A failing step is logged and does not skip later steps.
 * Exit code: 0 when every step succeeded, 1 otherwise or when `timeoutMs` elapses first.
 */
function createShutdown({ steps, logger = console, exit = process.exit, timeoutMs = 10_000 }) {
  let started = false;
  return async function shutdown(signal) {
    if (started) return;
    started = true;
    logger.log(`${signal} received, shutting down`);
    const timer = setTimeout(() => {
      logger.error('shutdown timed out, forcing exit');
      exit(1);
    }, timeoutMs);
    timer.unref();
    let code = 0;
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (err) {
        code = 1;
        logger.error(`shutdown step "${name}" failed:`, err && err.message);
      }
    }
    clearTimeout(timer);
    exit(code);
  };
}

module.exports = { createShutdown };
