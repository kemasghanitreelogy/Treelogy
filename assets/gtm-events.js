/* GTM interaction events for Treelogy. (r7 — PDP detail + atc_source site-wide)
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
   - select_variant   : product-page pack/variant card chosen (real clicks only —
                        the theme fires synthetic ones to bind its own handlers)
   - pdp_gallery_view : a gallery slide past the first was actually looked at
   - pdp_detail_expand: an accordion/detail block on a product page was opened

   NOTE: every event name here must also exist in the GTM trigger regex
   ("CE - all tracked events"), otherwise it stays in the dataLayer and never
   reaches GA4. See claudedocs/gtm/TRACKING-MASTER.md §3.
*/
(function () {
  'use strict';

  /* Prerender gate — mirrors gtm-head.liquid: Shopify speculation rules
     prerender product/collection pages on hover; IntersectionObservers and
     network intercepts must not run until the page is actually shown.
     gtm-head's own prerenderingchange listener registers first, so __gtmCtx
     is always seeded before this init runs. */
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', init, { once: true });
  } else {
    init();
  }

  function init() {
  var dl = (window.dataLayer = window.dataLayer || []);

  function push(obj) {
    dl.push(obj);
  }

  /* GTM's data layer model merges pushes recursively and PERSISTS values —
     without a reset, atc_source from one hero click would stick to every
     later event on the page (an organic add_to_cart would be mislabeled as
     hero-attributed), item_handle/section_id/etc. likewise. The GA4 tag reads
     all 14 params on every event, so each event push is followed by a reset
     of the ephemeral ones; null clears the model and null params are dropped
     from the GA4 hit. Page-context params (page_locale, market_*, customer_*)
     intentionally persist. */
  var EPHEMERAL_RESET = {
    section_id: null,
    from_section: null,
    item_handle: null,
    link_url: null,
    link_label: null,
    channel: null,
    hero_version: null,
    atc_source: null,
    cta_label: null,
    cta_position: null,
    variant_id: null
  };
  function pushEvent(obj) {
    dl.push(obj);
    dl.push(EPHEMERAL_RESET);
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
      /* item_id priority MUST stay sku-then-VARIANT id: every other path
         (view_item Liquid, checkout pixel, purchase backstop) resolves
         sku || variant_id — product_id here would split one product into
         different item_ids across the funnel for SKU-less variants. */
      item_id: i.sku || String(i.variant_id || i.id || i.product_id || ''),
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
    pushEvent({
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
    pushEvent({
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
          pushEvent({
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
        pushEvent({
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
          pushEvent({
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
            pushEvent({
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
          pushEvent({
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
          pushEvent({
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

  /* ---------- add-to-cart surface attribution (site-wide) ---------- */
  /* Before r7 only the collection hero stamped atc_source, so every add from a
     product page, the variant popup or a direct-add card arrived unlabelled and
     the cart could not be split by the surface that produced it. The stamp is
     consumed by the next successful /cart/add within 15s (see consumeAtcSource).
     Window-capture for the same reason as the hero listener: the seamless-ATC
     interceptor calls stopImmediatePropagation on the click. */

  window.addEventListener(
    'click',
    function (e) {
      var t = e.target;
      if (!t || !t.closest || !e.isTrusted) return;
      var btn = t.closest('#AddToCart, #popup-variants-button-bag, .button-direct-add');
      if (!btn) return;
      /* the hero module already stamped a more specific source for its own CTAs
         (it runs first: same window-capture phase, registered earlier) */
      if (btn.closest('[data-hero-version]') && btn.matches('.protocol-cta, .button-quick-add-cart')) return;
      var source =
        btn.id === 'AddToCart'
          ? 'pdp:main'
          : btn.id === 'popup-variants-button-bag'
            ? 'pdp:popup'
            : 'card:direct';
      stampAtcSource(source);
    },
    { capture: true, passive: true }
  );

  /* ---------- product detail page: pack choice, gallery, expandable copy ---------- */
  /* The three decisions a PDP visitor makes before add_to_cart — which pack,
     how much of the gallery they consumed, which detail they opened — were all
     invisible: variant cards are <div>s (so not even section_click saw them),
     gallery paging is a scroll container, accordions are <div class="button">. */

  (function () {
    var pdp = document.querySelector('.product-detail-wrapper');
    if (!pdp) return;

    var handle = (location.pathname.split('/products/')[1] || '')
      .split('?')[0]
      .split('/')[0];

    function label(el) {
      return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 100);
    }

    /* --- select_variant --- */
    /* section-product-single.js "kickstarts" the variant binding 500ms after
       load by calling .click() on the other card and then back on the active one
       (and app.bundle re-clicks too). Those are synthetic, so isTrusted is the
       only thing separating a real pack choice from two phantom ones per view. */
    var lastVariant = null;
    var variantPushes = 0;

    window.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (!t || !t.closest || !e.isTrusted) return;
        var card = t.closest('.checkbox-button[data-value], .protocol-variant-card[data-value]');
        if (!card) return;
        var vid = card.getAttribute('data-value') || '';
        if (!vid || vid === lastVariant || variantPushes >= 20) return;
        lastVariant = vid;
        variantPushes++;

        var group = card.parentElement
          ? card.parentElement.querySelectorAll('.checkbox-button[data-value]')
          : [card];
        /* the page also renders variant cards for OTHER products (bundle and
           cross-sell blocks); only cards inside the main product block describe
           the product this URL is about — the rest carry from_section instead */
        pushEvent({
          event: 'select_variant',
          item_handle: pdp.contains(card) ? handle : undefined,
          variant_id: vid,
          cta_label: label(card.querySelector('.pv-time')) || label(card.querySelector('.pv-desc')),
          cta_position: Array.prototype.indexOf.call(group, card) + 1,
          from_section: sectionIdOf(card),
          page_path: location.pathname
        });
      },
      { capture: true, passive: true }
    );

    /* --- pdp_gallery_view --- */
    /* Observed against the scroll container itself, so a mobile swipe and a
       desktop thumbnail click (which scrolls the same container) both resolve
       to one event per slide, once each. */
    var scroller = pdp.querySelector('.native-gallery__main-scroll');
    if (scroller && 'IntersectionObserver' in window) {
      var slidesSeen = {};
      var gio = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var idx = parseInt(entry.target.getAttribute('data-index'), 10);
            if (isNaN(idx) || idx > 11 || slidesSeen[idx]) return;
            slidesSeen[idx] = true;
            /* slide 0 is on screen at load — that is view_item, not engagement */
            if (idx === 0) return;
            pushEvent({
              event: 'pdp_gallery_view',
              item_handle: handle,
              cta_position: idx + 1,
              section_id: sectionIdOf(scroller),
              page_path: location.pathname
            });
          });
        },
        { root: scroller, threshold: 0.6 }
      );
      scroller.querySelectorAll('.native-gallery__slide').forEach(function (s) {
        gio.observe(s);
      });
    }

    /* --- pdp_detail_expand --- */
    var expandsSeen = {};
    window.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (!t || !t.closest || !e.isTrusted) return;
        /* two accordion flavours ship on PDPs: the description list
           (.__accordion, app.bundle) and the duplicate blocks
           (.ac-dup-*, accordion-duplicate.js) */
        var head = t.closest('.__accordion-button, .ac-dup-header');
        if (!head) return;
        var wrapper = head.closest('.__accordion-wrapper, .ac-dup-item');
        /* fires on open only; both scripts toggle .active on the wrapper in the
           bubble phase, i.e. AFTER this capture-phase listener — so "not active
           yet" is exactly the click that opens it */
        if (wrapper && wrapper.classList.contains('active')) return;
        var name = label(head);
        if (!name || expandsSeen[name]) return;
        expandsSeen[name] = true;
        pushEvent({
          event: 'pdp_detail_expand',
          item_handle: handle,
          link_label: name,
          section_id: sectionIdOf(head),
          page_path: location.pathname
        });
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
            pushEvent({ event: 'section_view', section_id: id, page_path: location.pathname });
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
  }
})();
