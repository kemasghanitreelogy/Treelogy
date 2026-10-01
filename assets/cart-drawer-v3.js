/* Cart drawer v3 controller.
 *
 * Data flow is one-directional: an action mutates the cart through the
 * Ajax API, then the drawer is re-rendered from the server
 * (snippets/CartDrawerContent via cart?view=mini) and swapped into #cart.
 * Prices, offers, gifts and totals are therefore always the server's —
 * this file never computes money.
 *
 * Mutations run through one serial queue, and only the newest render may
 * paint, so rapid taps cannot interleave or paint a stale cart.
 *
 * Also owns: opening the drawer (header icon + add-to-cart buttons), the
 * change-pack sheet, Esc / focus handling, and the small window.* contract
 * gift-auto-add.js and lp-only-guard rely on (refreshCartUI,
 * cartShowLoading, cartHideLoading, isCartPayload, cartTrack).
 */
(function () {
  'use strict';
  if (window.__cartDrawerV3) return;
  window.__cartDrawerV3 = true;

  var ROOT = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
  var BUSY_WATCHDOG_MS = 12000;
  var ATC_SELECTOR = '#AddToCart, #popup-variants-button-bag, .button-direct-add';
  var ACTION_SELECTOR = [
    '[data-cv3-sheet-close]', '[data-cv3-close]', '[data-cv3-sheet-open]',
    '[data-cv3-qty]', '[data-cv3-swap]', '[data-cv3-switch]', '[data-cv3-add]'
  ].join(',');

  function host() { return document.querySelector('.mini-cart'); }
  function target() { return document.getElementById('cart'); }
  function drawer() { var t = target(); return t && t.querySelector('[data-cv3]'); }
  function isOpen() { var h = host(); return !!h && h.classList.contains('active'); }

  /* ---------- contract used by other scripts ---------- */

  window.isCartPayload = function (c) {
    return !!c && typeof c.total_price === 'number' && Array.isArray(c.items);
  };

  window.cartTrack = function (name, data) {
    try {
      if (document.prerendering) return;
      window.dataLayer = window.dataLayer || [];
      var payload = { event: name };
      var reset = {};
      Object.keys(data || {}).forEach(function (k) { payload[k] = data[k]; reset[k] = null; });
      window.dataLayer.push(payload);
      window.dataLayer.push(reset);
    } catch (e) { /* telemetry must never break the cart */ }
  };

  /* The checkout gate in gift-auto-add.js holds the drawer while it
     verifies gifts. The watchdog guarantees the hold always ends, even
     if its caller never calls hide (in-app browser navigation). */
  var gateBusy = false;
  var gateTimer = null;
  window.cartShowLoading = function (maxMs) {
    gateBusy = true;
    paintBusy();
    clearTimeout(gateTimer);
    gateTimer = setTimeout(function () {
      window.cartHideLoading();
      try { document.dispatchEvent(new CustomEvent('cart:loading-timeout')); } catch (e) { /* noop */ }
      // One emission, both channels (GA + durable) — see assets/cart-analytics.js.
      if (window.cartAnalytics) window.cartAnalytics.track('cart_loading_timeout');
      else window.cartTrack('cart_loading_timeout');
    }, typeof maxMs === 'number' && maxMs > 0 ? maxMs : BUSY_WATCHDOG_MS);
  };
  window.cartHideLoading = function () {
    clearTimeout(gateTimer);
    gateBusy = false;
    paintBusy();
  };

  window.refreshCartUI = function (cart) {
    if (window.isCartPayload(cart)) setIndicator(cart.item_count);
    if (isOpen()) scheduleRender();
  };
  window.loadCompareAtPrices = function () {};
  window.recalcSavings = function () {};

  /* ---------- rendering ---------- */

  /* While anything is in flight every control in the drawer is disabled.
     The checkout button is the one exception to `disabled`: the gift
     checkout gate holds the first click, verifies gifts, then forwards it
     with a programmatic .click() — which a disabled button would swallow.
     It gets aria-disabled + pointer-events:none instead, so taps are
     blocked but the gate's hand-off still goes through. */
  var mutating = 0;
  var HELD = 'data-cv3-held';
  function paintBusy() {
    var d = drawer();
    if (!d) return;
    var busy = gateBusy || mutating > 0;
    d.classList.toggle('is-busy', busy);
    d.setAttribute('aria-busy', busy ? 'true' : 'false');
    d.querySelectorAll('button, a[href]').forEach(function (el) {
      if (busy) {
        if (el.hasAttribute(HELD)) return;
        if (el.name === 'checkout' || el.tagName === 'A') {
          el.setAttribute('aria-disabled', 'true');
          el.setAttribute(HELD, 'aria');
        } else if (!el.disabled) {
          el.disabled = true;
          el.setAttribute(HELD, 'disabled');
        }
      } else if (el.hasAttribute(HELD)) {
        if (el.getAttribute(HELD) === 'aria') el.removeAttribute('aria-disabled');
        else el.disabled = false;
        el.removeAttribute(HELD);
      }
    });
    var checkout = d.querySelector('[name="checkout"]');
    if (checkout) checkout.classList.toggle('is-loading', gateBusy);
  }

  /* ---------- motion ----------
     Hyperframes doctrine: smooth beats bouncy, transform + opacity only,
     micro-motion 150–340 ms, one or two focal points per change.
     settle = expo.out (fast launch, long critically-damped tail),
     leave  = power2.in, both as CSS cubic-beziers for WAAPI. */
  var EASE_SETTLE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var EASE_LEAVE = 'cubic-bezier(0.55, 0, 0.8, 0.4)';
  function reducedMotion() {
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Odometer roll: the old figure lifts away while the new one settles in
     from below. Only runs when the text actually changed. */
  function roll(el, before) {
    if (reducedMotion() || !el.animate || before === el.textContent) return;
    var now = document.createElement('span');
    now.textContent = el.textContent;
    var ghost = document.createElement('span');
    ghost.className = 'cv3-roll-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.textContent = before;
    el.classList.add('cv3-roll');
    el.replaceChildren(now, ghost);
    ghost.animate(
      [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-70%)', opacity: 0 }],
      { duration: 190, easing: EASE_LEAVE, fill: 'forwards' }
    ).onfinish = function () { ghost.remove(); };
    now.animate(
      [{ transform: 'translateY(70%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 340, easing: EASE_SETTLE, delay: 60, fill: 'backwards' }
    );
  }

  function enter(el, index) {
    if (reducedMotion() || !el.animate) return;
    el.animate(
      [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 320, easing: EASE_SETTLE, delay: Math.min(index, 4) * 60, fill: 'backwards' }
    );
  }

  /* Marks what the buyer just touched: the card (or offer) shimmers and
     the pressed pill turns into a spinner until the server answers. */
  function markPending(el, btn) {
    var card = el && el.closest('.cv3-card, .cv3-offer, .cv3-addon');
    if (card) card.classList.add('is-pending');
    if (btn && btn.classList.contains('cv3-pill')) btn.classList.add('is-loading');
  }

  /* Add-to-cart opens the drawer before the server answers: a skeleton
     card holds the slot the new line will land in. */
  function showIncoming() {
    var d = drawer();
    if (!d) return;
    var items = d.querySelector('.cv3-items');
    var skeleton = document.createElement('div');
    skeleton.className = 'cv3-card cv3-card--skeleton';
    skeleton.setAttribute('aria-hidden', 'true');
    skeleton.innerHTML = '<div class="cv3-line"><span class="cv3-skel cv3-skel--photo"></span>'
      + '<span class="cv3-line__info"><span class="cv3-skel" style="width:72%"></span>'
      + '<span class="cv3-skel" style="width:46%"></span><span class="cv3-skel cv3-skel--price"></span></span></div>';
    if (items) items.insertBefore(skeleton, items.firstChild);
    else {
      var empty = d.querySelector('.cv3-empty');
      if (empty) { empty.replaceChildren(skeleton); empty.classList.add('is-incoming'); }
    }
    enter(skeleton, 0);
  }

  function setIndicator(count) {
    var el = document.getElementById('cart-indicator');
    if (el) el.classList.toggle('show', count > 0);
  }

  function enhance() {
    var d = drawer();
    if (!d) return;
    var hour = (new Date().getUTCHours() + 8) % 24;
    if (hour >= 15) {
      d.querySelectorAll('[data-cv3-ship-time]').forEach(function (el) {
        el.textContent = el.getAttribute('data-after');
      });
    }
    fitLabels(d);
    setIndicator(parseInt(d.getAttribute('data-item-count'), 10) || 0);
    setStatus(statusMsg);
    paintBusy();
  }

  /* One-line gift rows. [data-cv3-fit] carries the label from longest to
     shortest ("Free gift: Moringa Seed Oil 3ml" | "Free gift: Seed Oil
     3 ml" | "Seed Oil 3 ml") and [data-cv3-fit-chip] the value ("Worth
     Rp47.000" | "Rp47.000"). The label shortens first; only when even the
     bare name is cut does the chip shorten too. Runs on every render, when
     the web font arrives, and when the drawer resizes. */
  function fitLabels(scope) {
    if (!scope) return;
    var rows = Array.prototype.map.call(scope.querySelectorAll('[data-cv3-fit-row]'), function (row) {
      var label = row.querySelector('[data-cv3-fit]');
      var chip = row.querySelector('[data-cv3-fit-chip]');
      return {
        label: label,
        chip: chip,
        labels: label ? label.getAttribute('data-cv3-fit').split('|') : [],
        chips: chip ? chip.getAttribute('data-cv3-fit-chip').split('|') : []
      };
    }).filter(function (r) { return r.label; });
    /* Level k = chip step × label count + label step. Every row uses the
       same level — the shortest any row needs — so the list reads as one
       consistent set instead of mixing "Free gift: …" with bare names. */
    function apply(r, k) {
      var n = r.labels.length;
      var c = Math.min(Math.floor(k / n), Math.max(r.chips.length - 1, 0));
      var i = Math.min(k - c * n, n - 1);
      if (r.chip) r.chip.textContent = r.chips[c];
      r.label.textContent = r.labels[i];
      return r.label.scrollWidth <= r.label.clientWidth + 1;
    }
    var level = 0;
    rows.forEach(function (r) {
      var max = r.labels.length * Math.max(r.chips.length, 1) - 1;
      var k = level;
      while (k < max && !apply(r, k)) k++;
      level = Math.max(level, k);
    });
    rows.forEach(function (r) { apply(r, level); });
  }

  var renderSeq = 0;
  function render() {
    var seq = ++renderSeq;
    return fetch(ROOT + 'cart?view=mini', { headers: { Accept: 'text/html' } })
      .then(function (r) {
        if (!r.ok) throw new Error('render ' + r.status);
        return r.text();
      })
      .catch(function (err) {
        if (window.cartAnalytics) window.cartAnalytics.track('cart_error', { action: 'render', detail: String(err && err.message).slice(0, 60) });
        throw err;
      })
      .then(function (html) {
        if (seq !== renderSeq) return;
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var fresh = doc.querySelector('[data-cv3]');
        var t = target();
        if (!fresh || !t) return;
        var old = drawer();
        var scroller = old && old.querySelector('.cv3-scroll');
        var scrollTop = scroller ? scroller.scrollTop : 0;
        var hadFocus = old && old.contains(document.activeElement);
        var oldLines = {};
        var oldFigures = {};
        if (old) {
          old.querySelectorAll('[data-cv3-line]').forEach(function (n) { oldLines[n.getAttribute('data-cv3-line')] = true; });
          old.querySelectorAll('[data-cv3-roll]').forEach(function (n) { oldFigures[n.getAttribute('data-cv3-roll')] = n.textContent; });
        }
        t.replaceChildren(document.adoptNode(fresh));
        var next = fresh.querySelector('.cv3-scroll');
        if (next) next.scrollTop = scrollTop;
        enhance();
        if (old) {
          var entering = 0;
          fresh.querySelectorAll('[data-cv3-line]').forEach(function (n) {
            if (!oldLines[n.getAttribute('data-cv3-line')]) enter(n, entering++);
          });
          fresh.querySelectorAll('[data-cv3-roll]').forEach(function (n) {
            var before = oldFigures[n.getAttribute('data-cv3-roll')];
            if (before != null) roll(n, before);
          });
        }
        if (hadFocus) focusFirst();
      });
  }

  var renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () { render().catch(function () {}); }, 120);
  }

  /* ---------- cart API ---------- */

  /* Cart endpoints answer bursts with 429 (as an HTML page). A mutation is
     retried a few times with backoff instead of failing half-way. */
  function post(url, body, attempt) {
    attempt = attempt || 0;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (r.status === 429 && attempt < 3) {
        return new Promise(function (res) { setTimeout(res, 800 * Math.pow(2, attempt)); })
          .then(function () { return post(url, body, attempt + 1); });
      }
      return r.text().then(function (text) {
        var json = null;
        try { json = JSON.parse(text); } catch (e) { /* 429 / bot challenge answer HTML */ }
        if (!r.ok || !json) throw json || { status: r.status };
        return json;
      });
    });
  }

  function add(items) { return post('/cart/add.js', { items: items }); }
  function change(key, quantity) { return post('/cart/change.js', { id: key, quantity: quantity }); }
  /* Replacing lines is ONE /cart/update.js call: the old line keys go to 0
     and the new variant is set by id in the same request, so a swap either
     happens completely or not at all — never "new size added, old one still
     there". Setting by variant id is absolute, hence `have` (what the cart
     already holds of that variant) is added to the moved quantity. */
  function replace(keys, variantId, quantity) {
    var updates = {};
    keys.forEach(function (k) { if (k) updates[k] = 0; });
    updates[variantId] = quantity;
    return post('/cart/update.js', { updates: updates });
  }

  var queue = Promise.resolve();
  function mutate(task, source) {
    markPending(source, source);
    mutating++;
    paintBusy();
    setStatus('');
    queue = queue
      .then(task)
      .catch(function (err) { setStatus((err && err.description) || copy('error', 'Something went wrong. Please try again.')); })
      .then(render)
      .catch(function () {})
      .then(function () { mutating--; paintBusy(); });
    return queue;
  }

  /* Kept outside the DOM so an error survives the re-render that follows it. */
  var statusMsg = '';
  function setStatus(text) {
    statusMsg = text || '';
    var el = drawer() && drawer().querySelector('[data-cv3-status]');
    if (el) el.textContent = statusMsg;
  }

  /* Translated copy lives on the shell (snippets/CartDrawer), outside #cart. */
  function copy(name, fallback) {
    var h = host();
    return (h && h.getAttribute('data-' + name)) || fallback;
  }

  /* ---------- open / close ---------- */

  function open() {
    var h = host();
    if (!h) return;
    h.classList.add('active');
    render().catch(function () {});
  }
  function close() {
    var h = host();
    if (h) h.classList.remove('active');
  }

  var lastFocus = null;
  /* Focus lands on the dialog itself, not on a control: screen readers
     announce the drawer and Tab starts inside it, without painting a focus
     ring on the close button for touch users. */
  function focusFirst() {
    var h = host();
    var panel = h && h.querySelector('.mini-cart-wrapper');
    if (panel) panel.focus({ preventScroll: true });
  }

  /* Other code (app.bundle.js, theme.liquid's /cart redirect) may toggle
     .active directly, so scroll lock and focus follow the class, not open(). */
  function watchHost() {
    var h = host();
    if (!h || !('MutationObserver' in window)) return;
    new MutationObserver(function () {
      var active = h.classList.contains('active');
      if (active === document.documentElement.classList.contains('cv3-locked')) return;
      document.documentElement.classList.toggle('cv3-locked', active);
      if (active) {
        lastFocus = document.activeElement;
        setTimeout(focusFirst, 80);
      } else {
        closeSheet();
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
        lastFocus = null;
      }
    }).observe(h, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- change-pack sheet ---------- */

  function openSheet(key) {
    var d = drawer();
    var sheet = d && d.querySelector('[data-cv3-sheet="' + CSS.escape(key) + '"]');
    if (!sheet) return;
    sheet.hidden = false;
    void sheet.offsetWidth;
    sheet.classList.add('is-open');
    var first = sheet.querySelector('.cv3-option');
    if (first) first.focus({ preventScroll: true });
  }
  function closeSheet() {
    var d = drawer();
    var sheet = d && d.querySelector('.cv3-sheet.is-open');
    if (!sheet) return false;
    sheet.classList.remove('is-open');
    setTimeout(function () { sheet.hidden = true; }, 320);
    return true;
  }

  /* ---------- in-drawer actions ---------- */

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest(ACTION_SELECTOR);
    var h = host();
    if (!el || !h || !h.contains(el)) return;
    e.preventDefault();
    var d = el.dataset;

    if ('cv3SheetClose' in d) { closeSheet(); return; }
    if ('cv3Close' in d) { close(); return; }
    if (gateBusy || mutating > 0) return;
    if ('cv3SheetOpen' in d) { openSheet(d.cv3SheetOpen); return; }

    if ('cv3Qty' in d) {
      var qty = parseInt(d.cv3Qty, 10);
      mutate(function () { return change(d.key, qty); }, el);
      return;
    }

    if ('cv3Swap' in d || 'cv3Switch' in d) {
      closeSheet();
      var keys = ('cv3Swap' in d ? d.key : d.keys || '').split(',');
      var variantId = d.cv3Swap || d.cv3Switch;
      var quantity = (parseInt(d.qty, 10) || 1) + (parseInt(d.have, 10) || 0);
      var source = el.closest('.cv3-sheet') && drawer().querySelector('[data-cv3-line="' + CSS.escape(d.key) + '"]');
      mutate(function () { return replace(keys, variantId, quantity); }, source || el);
      return;
    }
    if ('cv3Add' in d) {
      mutate(function () { return add([{ id: parseInt(d.cv3Add, 10), quantity: 1 }]); }, el);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      if (!closeSheet()) close();
      return;
    }
    if (e.key !== 'Tab') return;
    var d = drawer();
    if (!d) return;
    var scope = d.querySelector('.cv3-sheet.is-open') || d;
    var nodes = Array.prototype.filter.call(
      scope.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (n) { return n.offsetParent !== null && !n.closest('.cv3-sheet[hidden]') && (scope !== d || !n.closest('.cv3-sheet')); }
    );
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  });

  /* ---------- header cart icon ---------- */

  document.addEventListener('click', function (e) {
    var icon = e.target.closest && e.target.closest('a.button.button-cart');
    if (!icon) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open();
  }, true);

  /* ---------- add to cart (PDP, variant popup, direct-add cards) ---------- */

  var MIN_STATE = 350;

  function utmFlowOwnsButton() {
    try {
      return typeof window.isUtmFreeShipping === 'function' && window.isUtmFreeShipping()
        && sessionStorage.getItem('utm_source_matched') === 'kesehatanwanita_blog'
        && sessionStorage.getItem('utm_discount_code');
    } catch (e) {
      return false;
    }
  }

  /* The button keeps its own child nodes (price spans that pdp4.js and
     VariantsButtonV2 update while the buyer switches packs), so the idle
     state is restored by re-attaching those same nodes, not by copying
     markup. */
  function setButtonState(btn, cls, label) {
    btn.classList.remove('is-adding', 'is-added', 'is-error');
    if (cls) btn.classList.add(cls);
    btn.textContent = label;
  }
  function restoreButton(btn) {
    btn.classList.remove('is-adding', 'is-added', 'is-error');
    btn.removeAttribute('aria-busy');
    if (!btn._cv3Idle) return;
    btn.textContent = '';
    btn._cv3Idle.forEach(function (n) { btn.appendChild(n); });
    var active = document.querySelector('.v2-plan.active');
    if (active) {
      btn.querySelectorAll('[data-v2-atc-compare]').forEach(function (n) { n.textContent = active.getAttribute('data-v2-compare') || ''; });
      btn.querySelectorAll('[data-v2-atc-price]').forEach(function (n) { n.textContent = active.getAttribute('data-v2-price') || ''; });
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest(ATC_SELECTOR);
    if (!btn) return;
    var isMain = btn.id === 'AddToCart';
    if (isMain && utmFlowOwnsButton()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (btn.classList.contains('is-adding') || btn.classList.contains('is-added')) return;

    var select = isMain ? document.getElementById('productSelect') : null;
    var pack = isMain ? document.querySelector('#AddToCartForm input[name="pack"]:checked') : null;
    var variantId = parseInt((pack && pack.value) || btn.dataset.variant || btn.dataset.variantId || (select && select.value), 10);
    if (!variantId) return;

    var item = { id: variantId, quantity: 1 };
    if (isMain) {
      var qtyInput = document.getElementById('Quantity');
      if (qtyInput) item.quantity = parseInt(qtyInput.value, 10) || 1;
      var plan = document.querySelector('input[name="selling_plan"]:checked');
      if (plan && plan.value) item.selling_plan = parseInt(plan.value, 10);
    }

    var L = {
      adding: copy('atc-adding', 'Adding…'),
      added: '✓ ' + copy('atc-added', 'Added'),
      failed: copy('atc-failed', 'Could not add')
    };

    btn._cv3Idle = Array.prototype.slice.call(btn.childNodes);
    btn.classList.add('atc-btn');
    btn.setAttribute('aria-busy', 'true');
    setButtonState(btn, 'is-adding', L.adding);

    if (btn.id === 'popup-variants-button-bag') {
      var popup = document.getElementById('popup-variant');
      if (popup) popup.classList.remove('active');
      window.popupVariantActive = false;
    }

    var t0 = Date.now();
    function settle(cls, label, hold) {
      setTimeout(function () {
        setButtonState(btn, cls, label);
        setTimeout(function () { restoreButton(btn); }, hold);
      }, Math.max(0, MIN_STATE - (Date.now() - t0)));
    }

    var h = host();
    if (h) h.classList.add('active');
    showIncoming();
    mutating++;
    paintBusy();
    queue = queue
      .then(function () { return add([item]); })
      .then(function () { settle('is-added', L.added, 1400); })
      .catch(function (err) {
        settle('is-error', L.failed, 1600);
        setStatus((err && err.description) || L.failed);
      })
      .then(render)
      .catch(function () {})
      .then(function () { mutating--; paintBusy(); });
  }, true);

  /* ---------- lifecycle ---------- */

  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    window.cartHideLoading();
    if (isOpen()) render().catch(function () {});
  });

  function init() {
    watchHost();
    enhance();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitLabels(drawer()); });
    if ('ResizeObserver' in window && target()) {
      var lastWidth = 0;
      new ResizeObserver(function (entries) {
        var w = Math.round(entries[0].contentRect.width);
        if (w === lastWidth) return;
        lastWidth = w;
        fitLabels(drawer());
      }).observe(target());
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
