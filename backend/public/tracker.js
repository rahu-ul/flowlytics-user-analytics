/*
 * Flowlytics analytics tracker.
 * Usage:  <script src="https://YOUR_API_HOST/tracker.js" defer></script>
 * Optional: data-endpoint="https://YOUR_API_HOST/api/events" on the script tag
 *           (defaults to /api/events on the host that served this file).
 *
 * Tracks: page_view (initial load + SPA navigations) and click (page x/y coordinates).
 */
(function () {
  'use strict';
  if (window.__cfAnalyticsLoaded) return;
  window.__cfAnalyticsLoaded = true;

  var script = document.currentScript;
  var cfg = window.CFAnalyticsConfig || {};
  var endpoint =
    cfg.endpoint ||
    (script && script.getAttribute('data-endpoint')) ||
    (script && script.src ? new URL('/api/events', script.src).href : '/api/events');

  var SESSION_KEY = 'cf_session';
  var SESSION_TTL_MS = 30 * 60 * 1000; // new session after 30 minutes of inactivity
  var FLUSH_DELAY_MS = 1500;
  var MAX_BATCH = 50; // must not exceed the server's batch limit
  var MAX_QUEUE = 500;
  var MAX_RETRIES = 3;

  // ---- session -------------------------------------------------------------
  var memorySession = null; // fallback when localStorage is unavailable (private mode, blocked)

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var bytes = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map
      .call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); })
      .join('');
  }

  function sessionId() {
    var now = Date.now();
    var s = memorySession;
    try {
      var raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) s = JSON.parse(raw);
    } catch (e) { /* storage unavailable or corrupt: fall through */ }
    if (!s || !s.id || now - s.last > SESSION_TTL_MS) s = { id: uuid(), last: now };
    s.last = now;
    memorySession = s;
    try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    return s.id;
  }

  // ---- sending -------------------------------------------------------------
  var queue = [];
  var timer = null;
  var failures = 0;

  function send(batch, useBeacon) {
    // text/plain keeps the request "simple" (no CORS preflight) and works with sendBeacon.
    var body = JSON.stringify({ events: batch });
    if (useBeacon && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(endpoint, body)) return; } catch (e) { /* fall back to fetch */ }
    }
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: body,
      keepalive: true,
      credentials: 'omit',
    }).then(function () {
      failures = 0;
    }, function () {
      // Network failure: retry a limited number of times, then drop (analytics must never break the page).
      if (++failures <= MAX_RETRIES && queue.length < MAX_QUEUE) {
        queue = batch.concat(queue);
        schedule(5000 * failures);
      }
    });
  }

  function schedule(delay) {
    if (!timer) timer = setTimeout(function () { flush(false); }, delay);
  }

  function flush(useBeacon) {
    if (timer) { clearTimeout(timer); timer = null; }
    while (queue.length) send(queue.splice(0, MAX_BATCH), useBeacon);
  }

  function enqueue(event) {
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push(event);
    if (queue.length >= 20) flush(false);
    else schedule(FLUSH_DELAY_MS);
  }

  // ---- events --------------------------------------------------------------
  function base(type) {
    return {
      sessionId: sessionId(),
      type: type,
      url: window.location.href,
      timestamp: Date.now(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  }

  var lastTrackedUrl = null;
  function trackPageView() {
    if (window.location.href === lastTrackedUrl) return;
    lastTrackedUrl = window.location.href;
    var e = base('page_view');
    if (document.referrer) e.referrer = document.referrer;
    if (document.title) e.title = document.title;
    enqueue(e);
  }

  function docSize() {
    var de = document.documentElement;
    var b = document.body || {};
    return {
      w: Math.max(de.scrollWidth || 0, b.scrollWidth || 0),
      h: Math.max(de.scrollHeight || 0, b.scrollHeight || 0),
    };
  }

  document.addEventListener(
    'click',
    function (ev) {
      // detail === 0 means keyboard-activated or programmatic click: it has no meaningful pointer position.
      if (ev.detail === 0) return;
      var e = base('click');
      // Page coordinates (relative to the whole document, not the viewport) so scrolled clicks plot correctly.
      e.x = Math.round(ev.clientX + (window.pageXOffset || 0));
      e.y = Math.round(ev.clientY + (window.pageYOffset || 0));
      var size = docSize();
      if (size.w > 0) e.docWidth = size.w;
      if (size.h > 0) e.docHeight = size.h;
      enqueue(e);
    },
    true,
  );

  // SPA support: History API navigations do not reload the page.
  ['pushState', 'replaceState'].forEach(function (fn) {
    var original = history[fn];
    if (typeof original !== 'function') return;
    history[fn] = function () {
      var result = original.apply(this, arguments);
      trackPageView();
      return result;
    };
  });
  window.addEventListener('popstate', trackPageView);

  window.addEventListener('pagehide', function () { flush(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true);
  });

  window.cfAnalytics = { flush: function () { flush(false); } };

  trackPageView();
})();
