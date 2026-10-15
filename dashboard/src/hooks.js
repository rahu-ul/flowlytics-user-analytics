import { useEffect, useState } from 'react';

/** Runs `fn(signal)` whenever `deps` change; aborts stale requests. Returns { data, error, loading }. */
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fn(ctrl.signal).then(
      (data) => setState({ data, error: null, loading: false }),
      (error) => { if (error.name !== 'AbortError') setState({ data: null, error: error.message, loading: false }); },
    );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** Counter that views bump to re-run their useAsync calls (Refresh / Try again). */
export function useReload() {
  const [n, setN] = useState(0);
  return [n, () => setN((v) => v + 1)];
}

export { useSocketStatus, useSocketEvent, useSocketReconnect } from './useSocket.js';
