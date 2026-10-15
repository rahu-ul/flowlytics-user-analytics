import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api } from '../api.js';
import { deriveStatus, feedReducer, pagePathOf, resolveRecord, selectResendable, summarizeFeed } from '../lib/demo.js';
import { summarizeEvents } from '../lib/sessions.js';
import { useSocketEvent, useSocketReconnect } from '../hooks.js';
import { REALTIME_EVENTS } from '../lib/realtime.js';
import { createAutopilot } from './autopilot.js';
import { SAMPLE_STEPS } from './sampleScript.js';

export const STORE_SRC = '/demo/index.html';
const IDLE_PILOT = { state: 'idle', index: 0, total: SAMPLE_STEPS.length, label: '', skipped: 0 };
const POLL_MS = 3000;
const POLL_MAX = 8;
const FRAME_TIMEOUT_MS = 15000; // a store page that has not finished loading by then is reported, with a retry

/**
 * Connects the Demo page to the REAL tracker running in the sample-store iframe.
 *
 * - The tracker is loaded by the store page itself (<script src="/tracker.js">). This hook never injects, copies or
 *   re-implements it; it only calls cfAnalytics.subscribe() once per page load to observe delivery.
 * - Feed entries start "pending" and only become "accepted" when the API confirmed them or a read of the stored
 *   session shows them (lib/demo.js).
 * - There is no simulation mode: if the API is down, events fail and are shown as failed.
 */
export function useDemo() {
  const [apiState, setApiState] = useState({ state: 'checking', error: null });
  const [started, setStarted] = useState(false);
  const [frame, setFrame] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'no-tracker' | 'load-failed'
  const [frameKey, setFrameKey] = useState(0);
  const [entries, dispatch] = useReducer(feedReducer, []);
  const [sessionId, setSessionId] = useState(null);
  const [currentPage, setCurrentPage] = useState(null);
  const [lastDelivery, setLastDelivery] = useState(null);
  const [stored, setStored] = useState({ loading: false, error: null, summary: null, truncated: false });
  const [pilot, setPilot] = useState(IDLE_PILOT);

  const iframeRef = useRef(null);
  const idsRef = useRef(new WeakMap()); // tracker event object -> feed id (identity, so retries map back to the same row)
  const eventsRef = useRef(new Map()); // feed id -> tracker event object (needed to resend failed events)
  const counterRef = useRef(0);
  const unsubRef = useRef(null);
  const trackerRef = useRef(null);
  const sessionRef = useRef(null);
  const scriptedRef = useRef(false); // true only while the script dispatches a click
  const navScriptedRef = useRef(false); // true from a scripted navigation click until the next page's events are captured
  const loadWaitersRef = useRef([]);
  const pilotRef = useRef(null);
  const storedCtrlRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const healthCtrlRef = useRef(null);
  const unmountedRef = useRef(false);

  // ---- API health ----------------------------------------------------------------------------------
  const checkApi = useCallback(async () => {
    healthCtrlRef.current?.abort();
    const ctrl = new AbortController();
    healthCtrlRef.current = ctrl;
    setApiState({ state: 'checking', error: null });
    try {
      const res = await api.health(ctrl.signal);
      if (res?.status !== 'ok') throw new Error('The health check did not report ok');
      setApiState({ state: 'up', error: null });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setApiState({ state: 'down', error: err.message || 'Request failed' });
    }
  }, []);

  useEffect(() => { checkApi(); return () => healthCtrlRef.current?.abort(); }, [checkApi]);

  // ---- stored events for the current session (source of truth for counts and for confirming events) ------
  const refreshStored = useCallback(async () => {
    const id = sessionRef.current;
    if (!id) return null;
    storedCtrlRef.current?.abort();
    const ctrl = new AbortController();
    storedCtrlRef.current = ctrl;
    setStored((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.sessionEvents(id, ctrl.signal);
      if (id !== sessionRef.current) return null;
      setStored({ loading: false, error: null, summary: summarizeEvents(data.events), truncated: data.truncated });
      dispatch({ type: 'verified', sessionId: id, stored: data.events });
      return data.events;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      if (err.status === 404) { // nothing stored for this session yet: a normal state, not an error
        setStored({ loading: false, error: null, summary: summarizeEvents([]), truncated: false });
        return [];
      }
      setStored((s) => ({ ...s, loading: false, error: err.message || 'Request failed' }));
      return null;
    }
  }, []);

  const scheduleRefresh = useCallback((delay = 900) => {
    window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(refreshStored, delay);
  }, [refreshStored]);

  // ---- tracker records -----------------------------------------------------------------------------------
  const onRecord = useCallback((rec) => {
    if (unmountedRef.current) return;
    const events = rec.events || [];

    if (rec.phase === 'queued') {
      const event = events[0];
      if (!event) return;
      let id = idsRef.current.get(event);
      if (id == null) { id = ++counterRef.current; idsRef.current.set(event, id); eventsRef.current.set(id, event); }
      dispatch({ type: 'queued', id, event, origin: scriptedRef.current || navScriptedRef.current ? 'scripted' : 'visitor' });
      if (event.sessionId !== sessionRef.current) {
        sessionRef.current = event.sessionId; // a new session starts after 30 minutes idle
        setSessionId(event.sessionId);
        setStored({ loading: false, error: null, summary: null, truncated: false });
        scheduleRefresh(300);
      }
      if (event.type === 'page_view') setCurrentPage(pagePathOf(event.url));
      return;
    }

    const results = resolveRecord(events.map((e) => idsRef.current.get(e)), rec);
    dispatch({ type: 'resolve', results });

    if (rec.phase === 'accepted') {
      setLastDelivery('ok');
      setApiState((s) => (s.state === 'down' ? { state: 'up', error: null } : s));
    } else if (rec.phase === 'failed') {
      if (rec.rejected?.length) setLastDelivery('ok'); // the API answered; it rejected the events themselves
      else { setLastDelivery('failed'); if (!rec.status) checkApi(); }
    }
    if (rec.phase === 'accepted' || rec.phase === 'beacon' || rec.phase === 'sent') scheduleRefresh();
  }, [checkApi, scheduleRefresh]);

  // ---- store iframe ---------------------------------------------------------------------------------------
  const settleLoadWaiters = () => {
    const waiters = loadWaitersRef.current;
    loadWaitersRef.current = [];
    waiters.forEach((resolve) => resolve());
  };

  /** Runs on every load of the iframe (the first page and each navigation inside the store). */
  const onFrameLoad = useCallback(() => {
    unsubRef.current?.(); // one subscription per page load, never two
    unsubRef.current = null;
    trackerRef.current = null;
    let tracker = null;
    try { tracker = iframeRef.current?.contentWindow?.cfAnalytics || null; } catch { tracker = null; }
    if (!tracker || typeof tracker.subscribe !== 'function') {
      setFrame('no-tracker');
    } else {
      trackerRef.current = tracker;
      unsubRef.current = tracker.subscribe(onRecord); // replays this page load's earlier records first
      setFrame('ready');
    }
    navScriptedRef.current = false;
    settleLoadWaiters();
  }, [onRecord]);

  const waitForLoad = useCallback((ms) => new Promise((resolve) => {
    const done = () => { navScriptedRef.current = false; resolve(); };
    loadWaitersRef.current.push(done);
    window.setTimeout(() => { loadWaitersRef.current = loadWaitersRef.current.filter((w) => w !== done); done(); }, ms);
  }), []);

  /** The iframe never reported a load in time (a stalled network, or the store is not being served). A late load still recovers. */
  useEffect(() => {
    if (!started || frame !== 'loading') return undefined;
    const timer = window.setTimeout(() => setFrame((f) => (f === 'loading' ? 'load-failed' : f)), FRAME_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [started, frame, frameKey]);

  const onFrameError = useCallback(() => setFrame('load-failed'), []);

  const start = useCallback(() => {
    if (apiState.state !== 'up') return;
    setStarted(true);
    setFrame('loading');
  }, [apiState.state]);

  const reloadStore = useCallback(() => {
    unsubRef.current?.(); unsubRef.current = null; trackerRef.current = null;
    setFrame('loading');
    setFrameKey((k) => k + 1); // a fresh iframe is a fresh page load, so the tracker records one page_view for it
  }, []);

  // ---- scripted visitor -------------------------------------------------------------------------------------
  const generate = useCallback(() => {
    if (frame !== 'ready') return;
    pilotRef.current?.stop();
    pilotRef.current = createAutopilot({
      getWindow: () => iframeRef.current?.contentWindow || null,
      waitForLoad,
      onDispatch: (on, step) => { scriptedRef.current = on; if (on && step?.navigates) navScriptedRef.current = true; },
      onProgress: (p) => { if (!unmountedRef.current) setPilot(p); },
    });
    pilotRef.current.start();
  }, [frame, waitForLoad]);
  const pause = useCallback(() => pilotRef.current?.pause(), []);
  const resume = useCallback(() => pilotRef.current?.resume(), []);

  // ---- reset / resend ---------------------------------------------------------------------------------------
  /** Clears this page's local view only. Nothing is deleted from MongoDB. */
  const reset = useCallback(() => {
    pilotRef.current?.stop();
    pilotRef.current = null;
    setPilot(IDLE_PILOT);
    dispatch({ type: 'reset' });
    eventsRef.current = new Map();
    setLastDelivery(null);
  }, []);

  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const resend = useCallback(async () => {
    const tracker = trackerRef.current;
    if (!tracker) return;
    // Read the stored session first: an event whose request errored may still have reached MongoDB, and resending it would duplicate it.
    const storedEvents = await refreshStored();
    if (storedEvents === null) return;
    const targets = selectResendable(entriesRef.current, sessionRef.current, storedEvents)
      .map((e) => eventsRef.current.get(e.id))
      .filter(Boolean);
    if (targets.length === 0) return;
    tracker.requeue(targets);
    tracker.flush();
  }, [refreshStored]);

  // ---- poll while some events are sent but unconfirmed ------------------------------------------------------
  const feed = useMemo(() => summarizeFeed(entries), [entries]);
  useEffect(() => {
    if (!started || feed.awaiting === 0) return undefined;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > POLL_MAX) { window.clearInterval(timer); return; }
      refreshStored();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [started, feed.awaiting > 0, refreshStored]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- real-time socket events & reconnect recovery ---------------------------------------------------------
  useSocketEvent(REALTIME_EVENTS.EVENT, (event) => {
    if (unmountedRef.current || !event) return;
    dispatch({ type: 'socket_event', event });
    if (event.sessionId === sessionRef.current) {
      scheduleRefresh(300);
    }
  });

  useSocketReconnect(() => {
    if (sessionRef.current) {
      refreshStored();
    }
    checkApi();
  });

  // ---- cleanup ---------------------------------------------------------------------------------------------------
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      pilotRef.current?.stop();
      unsubRef.current?.();
      storedCtrlRef.current?.abort();
      window.clearTimeout(refreshTimerRef.current);
      settleLoadWaiters();
    };
  }, []);

  const status = deriveStatus({ api: apiState.state, started, frame, lastDelivery });

  return {
    apiState, started, frame, frameKey, iframeRef, entries, feed, sessionId, currentPage, stored, pilot, status,
    actions: { checkApi, start, reloadStore, generate, pause, resume, reset, resend, refreshStored, onFrameLoad, onFrameError },
  };
}
