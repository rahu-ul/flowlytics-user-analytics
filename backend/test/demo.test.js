'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');
const { startTestServer } = require('./helpers/server');

const demoDir = path.join(__dirname, '..', 'public', 'demo');
const read = (f) => fs.readFileSync(path.join(demoDir, f), 'utf8');
const dom = (f) => new JSDOM(read(f)).window.document;

test('demo pages are served, embeddable by the dashboard (same origin), and compatible with the CSP', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  for (const p of ['/demo/index.html', '/demo/pricing.html', '/demo/style.css', '/demo/store.js', '/tracker.js', '/demo/img/hero.svg', '/demo/img/aero-runner.svg']) {
    const res = await fetch(`${s.base}${p}`);
    assert.equal(res.status, 200, p);
  }
  const res = await fetch(`${s.base}/demo/index.html`);
  // The Demo page embeds this page in an iframe on the same origin: that must stay allowed, and cross-origin framing must not.
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /script-src-attr 'none'/);
  // Product photos must be same-origin: the default CSP only allows images from 'self' and data: URIs.
  assert.match(csp, /img-src 'self' data:/);
  assert.equal((await fetch(`${s.base}/demo/img/hero.svg`)).headers.get('content-type').startsWith('image/svg+xml'), true);
});

test('/demo and /demo/ redirect to the store home page instead of returning 404', async (ctx) => {
  const s = await startTestServer(); ctx.after(s.close);
  for (const p of ['/demo', '/demo/']) {
    const res = await fetch(`${s.base}${p}`, { redirect: 'manual' });
    assert.equal(res.status, 302, p);
    assert.equal(res.headers.get('location'), '/demo/index.html', p);
  }
});

test('every local image the store references exists, and every product image has alt text and dimensions', () => {
  for (const f of ['index.html', 'pricing.html']) {
    const d = dom(f);
    for (const img of d.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src');
      assert.equal(src.startsWith('/demo/img/'), true, `${f}: ${src} is a local asset`);
      assert.equal(fs.existsSync(path.join(demoDir, src.replace('/demo/', ''))), true, `${f}: ${src} exists`);
      assert.ok(img.getAttribute('alt'), `${f}: ${src} has alt text`);
      assert.ok(img.getAttribute('width') && img.getAttribute('height'), `${f}: ${src} has intrinsic dimensions (no layout shift)`);
    }
  }
  const d = dom('index.html');
  for (const card of d.querySelectorAll('.product')) {
    assert.ok(card.querySelector('.tile img'), `${card.getAttribute('data-id')} has an image`);
    assert.equal(card.querySelector('.tile img').getAttribute('loading'), 'lazy', 'product images load lazily');
  }
  assert.equal(d.querySelector('.hero img').getAttribute('loading'), null, 'the hero image is not lazy (it is above the fold)');
});

test('each store page loads the tracker exactly once and has no inline scripts or inline handlers (CSP would block them)', () => {
  for (const f of ['index.html', 'pricing.html']) {
    const html = read(f);
    const d = dom(f);
    const scripts = [...d.querySelectorAll('script')];
    assert.equal(scripts.filter((x) => x.getAttribute('src') === '/tracker.js').length, 1, `${f}: one tracker tag`);
    assert.equal(scripts.every((x) => x.hasAttribute('src')), true, `${f}: no inline <script>`);
    assert.equal(/\son[a-z]+\s*=/i.test(html), false, `${f}: no inline event handlers`);
    assert.equal(/localhost|127\.0\.0\.1/.test(html + read('store.js')), false, `${f}: no hard-coded host`);
  }
  assert.equal(/cfAnalytics|CFAnalytics|sendBeacon|fetch\(|XMLHttpRequest|\/api\//.test(read('store.js')), false, 'store.js must not contain analytics or network code');
});

test('the store has the interactive elements the demo relies on', () => {
  const d = dom('index.html');
  assert.ok(d.querySelectorAll('.site-nav a').length >= 3, 'navigation links');
  assert.ok(d.querySelectorAll('.product').length >= 6, 'product cards');
  assert.equal(d.querySelectorAll('.product [data-view]').length, d.querySelectorAll('.product').length, 'a details button on every card');
  assert.equal(d.querySelectorAll('.product [data-add]').length, d.querySelectorAll('.product').length, 'an add-to-cart button on every card');
  assert.ok(d.querySelector('#q'), 'search');
  assert.ok(d.querySelectorAll('[data-filter]').length >= 4, 'filters');
  assert.ok(d.querySelector('#cta-button'), 'call to action');
  assert.ok(d.querySelector('dialog#product-dialog'), 'product dialog');
  assert.ok(d.querySelector('a[href="/demo/pricing.html"]'), 'link to the second page');
  const toggle = d.querySelector('#menu-toggle');
  assert.ok(toggle, 'mobile menu toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-controls'), 'site-nav');
  assert.ok(d.querySelector('nav#site-nav'), 'the toggled navigation exists');
});

test('every step of the "Generate sample activity" script targets an element that exists in the store', async () => {
  const { SAMPLE_STEPS } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'dashboard', 'src', 'demo', 'sampleScript.js')).href);
  assert.ok(SAMPLE_STEPS.length >= 8);
  // Steps are grouped by the page they run on: everything up to a navigating step runs on the page it started on.
  let page = 'index.html';
  for (const step of SAMPLE_STEPS) {
    assert.ok(dom(page).querySelector(step.target), `step "${step.id}" target ${step.target} exists on ${page}`);
    if (step.navigates) {
      const href = dom(page).querySelector(step.target).getAttribute('href');
      page = href.includes('pricing') ? 'pricing.html' : 'index.html';
    }
  }
});

test('store behaviour: filtering, search, details dialog and cart work (run in jsdom)', () => {
  const win = new JSDOM(read('index.html'), { runScripts: 'outside-only', url: 'http://localhost/demo/index.html' }).window;
  // jsdom has no <dialog>.showModal; provide the minimal behaviour the page expects.
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  win.eval(read('store.js'));
  const $ = (s) => win.document.querySelector(s);
  const visible = () => [...win.document.querySelectorAll('.product')].filter((c) => !c.hidden).map((c) => c.getAttribute('data-id'));
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, detail: 1 }));

  assert.equal(visible().length, 6);
  click($('[data-filter="apparel"]'));
  assert.deepEqual(visible(), ['merino-socks', 'rain-shell']);
  assert.equal($('[data-filter="apparel"]').getAttribute('aria-pressed'), 'true');
  assert.equal($('#result-count').textContent, '2 products');
  click($('[data-filter="all"]'));
  $('#q').value = 'watch'; $('#q').dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.deepEqual(visible(), ['field-watch']);
  $('#q').value = 'zzz'; $('#q').dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal($('#no-results').hidden, false);
  click($('#clear-filters'));
  assert.equal(visible().length, 6);

  click($('.product[data-id="aero-runner"] [data-view]'));
  assert.equal($('#product-dialog').hasAttribute('open'), true);
  assert.equal($('#dialog-name').textContent, 'Aero Runner');
  click($('#dialog-add'));
  click($('.product[data-id="daypack"] [data-add]'));
  assert.equal($('#cart-count').textContent, '2');
  assert.equal($('#cart').getAttribute('aria-label'), 'Cart, 2 items');
  click($('#dialog-close'));
  assert.equal($('#product-dialog').hasAttribute('open'), false);
});

test('a real tracker + store page pair records page_view and click with the existing event schema', async (ctx) => {
  // Loads the real served tracker into the real served store page and posts to the real Express ingest route.
  const s = await startTestServer(); ctx.after(s.close);
  const html = await (await fetch(`${s.base}/demo/index.html`)).text();
  const tracker = await (await fetch(`${s.base}/tracker.js`)).text();
  const { window } = new JSDOM(html, { url: `${s.base}/demo/index.html`, runScripts: 'outside-only', pretendToBeVisual: true });
  window.fetch = (u, o) => fetch(new URL(u, s.base), o); // same-origin: the tracker derives /api/events from the page host
  window.CFAnalyticsConfig = { endpoint: `${s.base}/api/events` };
  window.eval(tracker);
  const seen = [];
  window.cfAnalytics.subscribe((r) => seen.push(r));
  window.document.querySelector('[data-filter="bags"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 50, clientY: 40, detail: 1 }));
  window.cfAnalytics.flush();
  await new Promise((r) => setTimeout(r, 100));
  const accepted = seen.find((r) => r.phase === 'accepted');
  assert.equal(accepted.status, 202);
  assert.equal(accepted.accepted, 2);
  assert.deepEqual(accepted.rejected, []);
  const docs = s.collection.docs;
  assert.deepEqual(docs.map((d) => d.type), ['page_view', 'click']);
  assert.equal(docs[0].pagePath, `${s.base}/demo/index.html`);
  assert.equal(docs[0].title, 'Demo Store — Home');
  assert.deepEqual([docs[1].x, docs[1].y], [50, 40]);
  assert.equal(docs[0].sessionId, docs[1].sessionId);
});

function storeWindow(page = 'index.html') {
  const win = new JSDOM(read(page), { runScripts: 'outside-only', url: `http://localhost/demo/${page}` }).window;
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new win.Event('close')); };
  win.eval(read('store.js'));
  return win;
}
const press = (win, el, type, init) => el.dispatchEvent(new win.Event(type, { bubbles: true, ...init }));

test('store behaviour: search covers name, category and description; empty state; clearing', () => {
  const win = storeWindow();
  const $ = (s) => win.document.querySelector(s);
  const visible = () => [...win.document.querySelectorAll('.product')].filter((c) => !c.hidden).map((c) => c.getAttribute('data-id'));
  const type = (v) => { $('#q').value = v; press(win, $('#q'), 'input'); };
  type('waterproof'); assert.deepEqual(visible(), ['rain-shell']); // description
  type('footwear'); assert.deepEqual(visible(), ['aero-runner']); // category
  type('zzz'); assert.equal($('#no-results').hidden, false);
  assert.equal($('#q-clear').hidden, false, 'a clear button is offered while there is text');
  $('#q-clear').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal($('#q').value, ''); assert.equal(visible().length, 6); assert.equal($('#q-clear').hidden, true);
});

test('store behaviour: the details dialog shows the product image and closes cleanly', () => {
  const win = storeWindow();
  const $ = (s) => win.document.querySelector(s);
  $('.product[data-id="aero-runner"] [data-view]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal($('#dialog-image').getAttribute('src'), '/demo/img/aero-runner.svg');
  assert.match($('#dialog-image').getAttribute('alt'), /shoe/);
  assert.equal($('#dialog-category').textContent, 'Footwear');
  assert.equal(win.document.body.classList.contains('no-scroll'), true);
  $('#dialog-close').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal($('#product-dialog').hasAttribute('open'), false);
  assert.equal(win.document.body.classList.contains('no-scroll'), false, 'page scrolling is restored');
});

test('store behaviour: a failed image falls back to a labelled tile without touching other cards', () => {
  const win = storeWindow();
  const card = win.document.querySelector('.product[data-id="daypack"]');
  // jsdom does not load images, so start from a clean slate rather than relying on its notion of a "failed" image.
  win.document.querySelectorAll('.tile').forEach((tile) => tile.classList.remove('is-fallback'));
  card.querySelector('img').dispatchEvent(new win.Event('error')); // error does not bubble: the page listens in the capture phase
  assert.equal(card.querySelector('.tile').classList.contains('is-fallback'), true);
  assert.equal(card.querySelector('.tile').getAttribute('data-label'), 'Daypack 24L');
  assert.equal(win.document.querySelector('.product[data-id="field-watch"] .tile').classList.contains('is-fallback'), false);
});

test('store behaviour: the mobile menu toggles, reports its state, and closes with Escape', () => {
  const win = storeWindow();
  const $ = (s) => win.document.querySelector(s);
  const toggle = $('#menu-toggle');
  toggle.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal($('#site-nav').getAttribute('data-open'), 'true');
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal($('#site-nav').hasAttribute('data-open'), false);
  // Following a link closes the menu too.
  toggle.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  $('#site-nav a[href="/demo/pricing.html"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('store behaviour: cart adds are predictable and evaluating store.js twice does not duplicate listeners', () => {
  const win = storeWindow();
  win.eval(read('store.js')); // a second evaluation must be a no-op
  const $ = (s) => win.document.querySelector(s);
  const add = $('.product[data-id="daypack"] [data-add]');
  add.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal($('#cart-count').textContent, '1');
  add.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal($('#cart-count').textContent, '2');
  assert.equal($('#cart').getAttribute('aria-label'), 'Cart, 2 items');
  assert.match(add.textContent, /Added/);
});

test('the pricing page shares the store script: the menu works and plan buttons give feedback', () => {
  const win = storeWindow('pricing.html');
  const $ = (s) => win.document.querySelector(s);
  $('#menu-toggle').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.equal($('#site-nav').getAttribute('data-open'), 'true');
  $('[data-plan="growth"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.match($('#toast').textContent, /Growth selected/);
});
