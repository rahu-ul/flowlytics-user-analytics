/* Demo Store behaviour: menu, filter, search, product details, add to cart, call to action.
   No analytics code lives here: every click and page view is captured by the separate tracker script the page loads. */
(function () {
  'use strict';
  // The script is loaded once per page; this guard makes a second evaluation a no-op so listeners are never doubled.
  if (window.__demoStoreReady) return;
  window.__demoStoreReady = true;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---- image fallback ---------------------------------------------------------------------------------
  // 'error' does not bubble, so listen in the capture phase. Images that failed before this script ran are caught below.
  function markFallback(img) {
    var tile = img.closest && img.closest('.tile');
    if (tile) tile.classList.add('is-fallback');
  }
  document.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG') markFallback(e.target);
  }, true);
  $$('img').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) markFallback(img);
  });

  // ---- toast ------------------------------------------------------------------------------------------
  var toast = $('#toast');
  var toastTimer = null;
  function say(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.setAttribute('data-show', 'true');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.setAttribute('data-show', 'false'); }, 2200);
  }

  // ---- cart (a counter only; there is no checkout) -------------------------------------------------------
  var CART_KEY = 'demo-store-cart';
  var count = 0;
  try { count = parseInt(window.sessionStorage.getItem(CART_KEY), 10) || 0; } catch (e) { /* storage blocked */ }
  var cartCount = $('#cart-count');
  var cartButton = $('#cart');
  var bumpTimer = null;

  function renderCart(bump) {
    if (cartCount) cartCount.textContent = String(count);
    if (cartButton) {
      cartButton.setAttribute('aria-label', 'Cart, ' + count + (count === 1 ? ' item' : ' items'));
      if (bump) {
        cartButton.setAttribute('data-bump', 'true');
        window.clearTimeout(bumpTimer);
        bumpTimer = window.setTimeout(function () { cartButton.removeAttribute('data-bump'); }, 400);
      }
    }
  }
  function addToCart(name, button) {
    count += 1;
    try { window.sessionStorage.setItem(CART_KEY, String(count)); } catch (e) { /* ignore */ }
    renderCart(true);
    say('Added ' + name + ' to your cart');
    if (button) flashAdded(button);
  }
  // Visible feedback on the pressed button; repeated presses restart the timer instead of stacking timers.
  function flashAdded(button) {
    if (!button.hasAttribute('data-label')) button.setAttribute('data-label', button.textContent);
    button.textContent = 'Added \u2713';
    button.setAttribute('data-added', 'true');
    window.clearTimeout(button.__t);
    button.__t = window.setTimeout(function () {
      button.textContent = button.getAttribute('data-label');
      button.removeAttribute('data-added');
    }, 1400);
  }
  renderCart(false);
  if (cartButton) cartButton.addEventListener('click', function () { say(count ? 'Checkout is disabled in this demo' : 'Your cart is empty'); });

  // ---- mobile menu -----------------------------------------------------------------------------------------
  var menuToggle = $('#menu-toggle');
  var nav = $('#site-nav');
  function setMenu(open, returnFocus) {
    if (!menuToggle || !nav) return;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    if (open) nav.setAttribute('data-open', 'true'); else nav.removeAttribute('data-open');
    if (!open && returnFocus) menuToggle.focus();
  }
  if (menuToggle && nav) {
    menuToggle.addEventListener('click', function () { setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'); });
    nav.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') { setMenu(false, true); }
    });
    // Leaving the phone layout must not leave the menu flagged as open.
    if (window.matchMedia) {
      var mq = window.matchMedia('(min-width: 761px)');
      var onChange = function (e) { if (e.matches) setMenu(false); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
    }
  }

  // ---- filtering and search ------------------------------------------------------------------------------------
  var cards = $$('.product');
  var filters = $$('[data-filter]');
  var search = $('#q');
  var searchClear = $('#q-clear');
  var resultCount = $('#result-count');
  var noResults = $('#no-results');
  var category = 'all';

  // Searches the name, the category and the description.
  function matches(card, q) {
    if (!q) return true;
    var hay = [card.getAttribute('data-name'), card.getAttribute('data-category'), card.getAttribute('data-desc')].join(' ').toLowerCase();
    return q.split(/\s+/).every(function (word) { return hay.indexOf(word) !== -1; });
  }
  function applyFilters() {
    var q = search ? search.value.trim().toLowerCase() : '';
    var shown = 0;
    cards.forEach(function (card) {
      var show = (category === 'all' || card.getAttribute('data-category') === category) && matches(card, q);
      card.hidden = !show;
      if (show) shown += 1;
    });
    if (resultCount) resultCount.textContent = shown + (shown === 1 ? ' product' : ' products');
    if (noResults) noResults.hidden = shown !== 0;
    if (searchClear) searchClear.hidden = !(search && search.value);
  }
  function resetFilters() {
    category = 'all';
    if (search) search.value = '';
    filters.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === 'all')); });
    applyFilters();
  }
  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      category = btn.getAttribute('data-filter');
      filters.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      applyFilters();
    });
  });
  if (search) {
    search.addEventListener('input', applyFilters);
    search.addEventListener('keydown', function (e) { if (e.key === 'Escape' && search.value) { search.value = ''; applyFilters(); } });
  }
  if (searchClear) searchClear.addEventListener('click', function () { if (search) { search.value = ''; applyFilters(); search.focus(); } });
  var clear = $('#clear-filters');
  if (clear) clear.addEventListener('click', resetFilters);

  // ---- add to cart + product details -----------------------------------------------------------------------------
  $$('[data-add]').forEach(function (btn) {
    btn.addEventListener('click', function () { addToCart(btn.closest('.product').getAttribute('data-name'), btn); });
  });

  var dialog = $('#product-dialog');
  var current = null;
  if (dialog && typeof dialog.showModal === 'function') {
    var dialogImage = $('#dialog-image');
    var dialogTile = $('#dialog-tile');
    $$('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.product');
        current = card;
        $('#dialog-name').textContent = card.getAttribute('data-name');
        $('#dialog-price').textContent = card.getAttribute('data-price');
        $('#dialog-desc').textContent = card.getAttribute('data-desc');
        $('#dialog-category').textContent = $('.product-meta', card).textContent;
        if (dialogTile) dialogTile.classList.remove('is-fallback');
        if (dialogTile) dialogTile.setAttribute('data-label', card.getAttribute('data-name'));
        if (dialogImage) { dialogImage.alt = card.getAttribute('data-alt') || ''; dialogImage.src = card.getAttribute('data-image') || ''; }
        document.body.classList.add('no-scroll');
        dialog.showModal();
        dialog.scrollTop = 0;
      });
    });
    $('#dialog-add').addEventListener('click', function (e) { if (current) addToCart(current.getAttribute('data-name'), e.currentTarget); });
    $('#dialog-close').addEventListener('click', function () { dialog.close(); });
    // Clicking the backdrop closes the dialog (the dialog element itself is the click target there).
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    // Fires for every way of closing, including Escape; the browser returns focus to the button that opened it.
    dialog.addEventListener('close', function () { document.body.classList.remove('no-scroll'); });
  } else {
    // Very old browsers without <dialog>: details buttons are simply hidden.
    $$('[data-view]').forEach(function (btn) { btn.hidden = true; });
  }

  // ---- call to action ------------------------------------------------------------------------------------------------
  var ctaButton = $('#cta-button');
  var ctaNote = $('#cta-note');
  if (ctaButton && ctaNote) ctaButton.addEventListener('click', function () {
    ctaNote.textContent = 'Thanks! This is a demo: nothing is stored or sent.';
  });

  // ---- pricing page ----------------------------------------------------------------------------------------------------
  $$('[data-plan]').forEach(function (btn) {
    btn.addEventListener('click', function () { say(btn.getAttribute('data-plan-name') + ' selected. Billing is disabled in this demo'); });
  });

  applyFilters();
})();
