/* GTM interaction events for Treelogy. (r3 — delta-correct add_to_cart, cart resync)
   Loaded (deferred) by snippets/gtm-head.liquid — only when a GTM container ID
   is configured, so window.dataLayer always exists here.

   Events pushed:
   - consent_update   : bridges Shopify Customer Privacy -> Google Consent Mode v2
   - add_to_cart      : GA4 ecommerce, via fetch/XHR intercept on /cart/add
                        (also on quantity increases via /cart/change|update)
   - remove_from_cart : quantity decreases/removals via /cart/change|update diff
                        against a local cart-state cache. /cart/clear is
                        deliberately ignored (buy-now replace flow = noise).
   - view_cart        : mini-cart drawer opens (.mini-cart gains .active);
                        cart page view_cart comes from gtm-head.liquid
   - select_item      : click on any product link (item_handle + source section)
   - whatsapp_click   : click on wa.me / api.whatsapp.com / whatsapp: links
   - section_view     : a .shopify-section became >=40% visible (once per section)
   - section_click    : click on a link/button inside a section (section attribution)
*/
(function () {
  'use strict';

  var dl = (window.dataLayer = window.dataLayer || []);

  function push(obj) {
    dl.push(obj);
  }

  function gtag() {
    dl.push(arguments);
  }

  var currency = (window.__gtmCtx && window.__gtmCtx.currency) || 'IDR';

  /* ---------- Consent bridge: Shopify Customer Privacy -> Consent Mode v2 ---------- */

  function applyConsent(analyticsAllowed, marketingAllowed) {
    gtag('consent', 'update', {
      analytics_storage: analyticsAllowed ? 'granted' : 'denied',
      ad_storage: marketingAllowed ? 'granted' : 'denied',
      ad_user_data: marketingAllowed ? 'granted' : 'denied',
      ad_personalization: marketingAllowed ? 'granted' : 'denied'
    });
    push({
      event: 'consent_update',
      consent_analytics: !!analyticsAllowed,
      consent_marketing: !!marketingAllowed
    });
  }

  document.addEventListener('visitorConsentCollected', function (e) {
    var c = e.detail || {};
    applyConsent(c.analyticsAllowed, c.marketingAllowed);
  });

  if (window.Shopify && window.Shopify.loadFeatures) {
    window.Shopify.loadFeatures(
      [{ name: 'consent-tracking-api', version: '0.1' }],
      function (error) {
        if (error) return;
        var cp = window.Shopify.customerPrivacy;
        if (!cp || !cp.currentVisitorConsent) return;
        var c = cp.currentVisitorConsent();
        // '' means the visitor has not interacted with the banner yet — leave defaults.
        if (!c || (c.analytics === '' && c.marketing === '')) return;
        applyConsent(c.analytics === 'yes', c.marketing === 'yes');
      }
    );
  }

  /* ---------- add_to_cart via /cart/add network intercept ---------- */

  function mapCartItem(i) {
    return {
      item_id: i.sku || String(i.product_id || i.id || ''),
      item_name: i.product_title || i.title || '',
      item_variant: i.variant_title || undefined,
      item_variant_id: String(i.variant_id || i.id || ''),
      price: (i.final_price != null ? i.final_price : i.price || 0) / 100,
      quantity: i.quantity || 1
    };
  }

  /* Short-lived attribution stamp: which UI element initiated the add.
     Set on click (e.g. hero protocol CTAs), consumed by the very next
     successful /cart/add within 15s. */
  var atcAttribution = null;
  function stampAtcSource(source) {
    atcAttribution = { source: source, t: Date.now() };
  }
  function consumeAtcSource() {
    if (!atcAttribution) return '';
    var src = Date.now() - atcAttribution.t < 15000 ? atcAttribution.source : '';
    atcAttribution = null;
    return src;
  }

  /* /cart/add.js returns each line's TOTAL quantity after merging with any
     existing line (verified live: add 1 + add 1 => second response quantity: 2,
     final_line_price = whole line). Reporting the response as-is over-counts
     repeat adds — the true added amount is the delta vs our cached state. */
  function pushAddToCart(data) {
    if (!data) return;
    var items = Array.isArray(data.items) ? data.items : [data];
    if (!items.length || items[0].id == null) return;
    var deltas = [];
    var value = 0;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var key = String(it.id);
      var prevQ = cartState[key] ? cartState[key].quantity || 0 : 0;
      var added = (it.quantity || 0) - prevQ;
      cartState[key] = it;
      if (added > 0) {
        deltas.push(cloneWithQty(it, added));
        value += ((it.final_price != null ? it.final_price : it.price) || 0) / 100 * added;
      }
    }
    if (!deltas.length) return;
    push({ ecommerce: null });
    push({
      event: 'add_to_cart',
      atc_source: consumeAtcSource() || undefined,
      ecommerce: {
        currency: currency,
        value: value,
        items: deltas.map(mapCartItem)
      }
    });
  }

  /* ---------- cart-state cache: view_cart + remove_from_cart ---------- */
  /* Seeded from Liquid ({{ cart.items }} via __gtmCtx.cartItems), kept in sync
     from every cart endpoint response. Mutation endpoints (/cart/change,
     /cart/update) return the FULL cart — diffing old vs new state yields
     remove_from_cart (quantity down) and add_to_cart (quantity up, e.g. the
     drawer's + button). /cart/add pushes add_to_cart directly (its response is
     only the added lines), /cart.js refreshes silently, /cart/clear resets
     silently (buy-now replace flow — events there would be noise). */

  var cartState = {};
  (function seed() {
    var seedItems = (window.__gtmCtx && window.__gtmCtx.cartItems) || [];
    for (var i = 0; i < seedItems.length; i++) {
      cartState[String(seedItems[i].id)] = seedItems[i];
    }
  })();

  function cloneWithQty(item, qty) {
    var out = {};
    for (var k in item) out[k] = item[k];
    out.quantity = qty;
    return out;
  }

  function pushCartDiffEvent(eventName, items) {
    var value = 0;
    for (var i = 0; i < items.length; i++) {
      value += ((items[i].final_price != null ? items[i].final_price : items[i].price) || 0) / 100 * (items[i].quantity || 1);
    }
    push({ ecommerce: null });
    push({
      event: eventName,
      ecommerce: { currency: currency, value: value, items: items.map(mapCartItem) }
    });
  }

  function syncCartState(fullCart, silent) {
    if (!fullCart || !Array.isArray(fullCart.items)) return;
    var newState = {};
    for (var i = 0; i < fullCart.items.length; i++) {
      newState[String(fullCart.items[i].id)] = fullCart.items[i];
    }
    if (!silent) {
      var removed = [];
      var added = [];
      var key;
      for (key in cartState) {
        var oldQ = cartState[key].quantity || 0;
        var newQ = newState[key] ? newState[key].quantity || 0 : 0;
        if (newQ < oldQ) removed.push(cloneWithQty(cartState[key], oldQ - newQ));
      }
      for (key in newState) {
        var prevQ = cartState[key] ? cartState[key].quantity || 0 : 0;
        var curQ = newState[key].quantity || 0;
        if (curQ > prevQ) added.push(cloneWithQty(newState[key], curQ - prevQ));
      }
      if (removed.length) pushCartDiffEvent('remove_from_cart', removed);
      if (added.length) pushCartDiffEvent('add_to_cart', added);
    }
    cartState = newState;
  }

  function cartEndpoint(url) {
    if (typeof url !== 'string') return '';
    if (url.indexOf('/cart/add') !== -1) return 'add';
    if (url.indexOf('/cart/change') !== -1 || url.indexOf('/cart/update') !== -1) return 'mutate';
    if (url.indexOf('/cart/clear') !== -1) return 'clear';
    if (url.indexOf('/cart.js') !== -1) return 'refresh';
    return '';
  }

  function handleCartResponse(kind, data) {
    if (!data) return;
    if (kind === 'add') {
      pushAddToCart(data);
    } else if (kind === 'mutate') {
      syncCartState(data, false);
    } else if (kind === 'refresh') {
      syncCartState(data, true);
    } else if (kind === 'clear') {
      cartState = {};
    }
  }

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var kind = cartEndpoint(url);
      var promise = origFetch.apply(this, arguments);
      if (kind) {
        promise
          .then(function (res) {
            if (!res.ok) return;
            res
              .clone()
              .json()
              .then(function (data) {
                handleCartResponse(kind, data);
              })
              .catch(function () {});
          })
          .catch(function () {});
      }
      return promise;
    };
  }

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var kind = cartEndpoint(url);
    if (kind) {
      this.addEventListener('load', function () {
        if (this.status < 200 || this.status >= 300) return;
        try {
          handleCartResponse(kind, JSON.parse(this.responseText));
        } catch (e) {
          /* non-JSON response — ignore */
        }
      });
    }
    return origOpen.apply(this, arguments);
  };

  /* ---------- cart re-sync: bfcache restore & tab refocus ---------- */
  /* A bfcache-restored or refocused tab may hold a stale seed (cart changed
     elsewhere) — the wrapped fetch classifies /cart.js as 'refresh' and
     silently re-syncs the cache, so later diffs stay truthful. */

  var lastCartSync = Date.now();
  function resyncCartState() {
    if (Date.now() - lastCartSync < 30000) return;
    lastCartSync = Date.now();
    try {
      window.fetch('/cart.js', { headers: { Accept: 'application/json' } });
    } catch (e) {
      /* fetch unavailable — cache stays as-is */
    }
  }
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      lastCartSync = 0;
      resyncCartState();
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') resyncCartState();
  });

  /* ---------- view_cart: mini-cart drawer open ---------- */
  /* The drawer opens optimistically before /cart/add responds — wait briefly,
     then snapshot from a fresh /cart.js (which also re-syncs the cache via the
     wrapped fetch). Falls back to the cache if the request fails. */

  (function () {
    var mini = document.querySelector('.mini-cart');
    if (!mini || !('MutationObserver' in window)) return;

    function pushViewCartFromCache() {
      var items = [];
      for (var key in cartState) items.push(cartState[key]);
      if (items.length) pushCartDiffEvent('view_cart', items);
    }

    var wasOpen = mini.classList.contains('active');
    new MutationObserver(function () {
      var open = mini.classList.contains('active');
      if (open && !wasOpen) {
        setTimeout(function () {
          lastCartSync = Date.now();
          window
            .fetch('/cart.js', { headers: { Accept: 'application/json' } })
            .then(function (res) {
              return res.json();
            })
            .then(function (cart) {
              var items = (cart && cart.items) || [];
              if (items.length) pushCartDiffEvent('view_cart', items);
            })
            .catch(pushViewCartFromCache);
        }, 400);
      }
      wasOpen = open;
    }).observe(mini, { attributes: true, attributeFilter: ['class'] });
  })();

  /* ---------- click delegation: select_item, whatsapp_click, section_click ---------- */

  function sectionIdOf(el) {
    var s = el.closest ? el.closest('.shopify-section') : null;
    return s ? (s.id || '').replace('shopify-section-', '') : '';
  }

  document.addEventListener(
    'click',
    function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      var productLink = t.closest('a[href*="/products/"]');
      if (productLink) {
        var handle = (productLink.pathname.split('/products/')[1] || '')
          .split('?')[0]
          .split('/')[0];
        if (handle) {
          push({
            event: 'select_item',
            item_handle: handle,
            from_section: sectionIdOf(productLink),
            page_path: location.pathname
          });
        }
      }

      var waLink = t.closest(
        'a[href*="wa.me/"], a[href*="api.whatsapp.com"], a[href^="whatsapp:"]'
      );
      if (waLink) {
        push({
          event: 'whatsapp_click',
          link_url: waLink.href,
          from_section: sectionIdOf(waLink),
          page_path: location.pathname
        });
      }

      var actionable = t.closest('a[href], button[type="submit"], [role="button"]');
      if (actionable) {
        var sid = sectionIdOf(actionable);
        if (sid) {
          push({
            event: 'section_click',
            section_id: sid,
            link_url: actionable.href || undefined,
            page_path: location.pathname
          });
        }
      }
    },
    { capture: true, passive: true }
  );

  /* ---------- featured hero: version-labeled funnel events ---------- */
  /* hero_view / hero_cta_click / hero_image_click, all carrying hero_version
     so different hero iterations can be compared over time in GA4.
     Click listener sits on window WITH capture: the seamless ATC interceptor
     (MiniCart, document-capture, registered earlier) calls
     stopImmediatePropagation, which would silence any document-level listener
     registered after it — window capture runs before document capture. */

  (function () {
    var hero = document.querySelector('[data-hero-version]');
    if (!hero) return;
    var heroVersion = hero.dataset.heroVersion;
    var heroHandle = hero.dataset.heroProduct || '';

    if ('IntersectionObserver' in window) {
      var hio = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            push({
              event: 'hero_view',
              hero_version: heroVersion,
              item_handle: heroHandle,
              page_path: location.pathname
            });
            hio.disconnect();
          });
        },
        { threshold: 0.4 }
      );
      hio.observe(hero);
    }

    window.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (!t || !t.closest || !hero.contains(t)) return;

        var cta = t.closest('.protocol-cta, .button-quick-add-cart');
        if (cta && hero.contains(cta)) {
          var ctas = hero.querySelectorAll('.protocol-cta, .button-quick-add-cart');
          stampAtcSource('hero:' + heroVersion);
          push({
            event: 'hero_cta_click',
            hero_version: heroVersion,
            item_handle: heroHandle,
            cta_label: (cta.textContent || '').trim(),
            cta_position: Array.prototype.indexOf.call(ctas, cta) + 1,
            variant_id: cta.dataset.variant || '',
            page_path: location.pathname
          });
          return;
        }

        var imgLink = t.closest('.thumbnail a');
        if (imgLink && hero.contains(imgLink)) {
          push({
            event: 'hero_image_click',
            hero_version: heroVersion,
            item_handle: heroHandle,
            page_path: location.pathname
          });
        }
      },
      { capture: true, passive: true }
    );
  })();

  /* ---------- section_view via IntersectionObserver ---------- */

  if ('IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = (entry.target.id || '').replace('shopify-section-', '');
          if (id && !seen[id]) {
            seen[id] = true;
            push({ event: 'section_view', section_id: id, page_path: location.pathname });
          }
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.4 }
    );

    var initSections = function () {
      document.querySelectorAll('.shopify-section').forEach(function (s) {
        if (s.offsetHeight > 150) io.observe(s);
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSections);
    } else {
      initSections();
    }
  }
})();
