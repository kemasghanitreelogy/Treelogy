/* GTM interaction events for Treelogy.
   Loaded (deferred) by snippets/gtm-head.liquid — only when a GTM container ID
   is configured, so window.dataLayer always exists here.

   Events pushed:
   - consent_update   : bridges Shopify Customer Privacy -> Google Consent Mode v2
   - add_to_cart      : GA4 ecommerce, via fetch/XHR intercept on /cart/add
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

  function pushAddToCart(data) {
    if (!data) return;
    var items = Array.isArray(data.items) ? data.items : [data];
    if (!items.length || items[0].id == null) return;
    var value = 0;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      value += (it.final_line_price != null ? it.final_line_price : it.line_price || 0) / 100;
    }
    push({ ecommerce: null });
    push({
      event: 'add_to_cart',
      atc_source: consumeAtcSource() || undefined,
      ecommerce: {
        currency: currency,
        value: value,
        items: items.map(mapCartItem)
      }
    });
  }

  function isCartAdd(url) {
    return typeof url === 'string' && url.indexOf('/cart/add') !== -1;
  }

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var promise = origFetch.apply(this, arguments);
      if (isCartAdd(url)) {
        promise
          .then(function (res) {
            if (!res.ok) return;
            res
              .clone()
              .json()
              .then(pushAddToCart)
              .catch(function () {});
          })
          .catch(function () {});
      }
      return promise;
    };
  }

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isCartAdd(url)) {
      this.addEventListener('load', function () {
        if (this.status < 200 || this.status >= 300) return;
        try {
          pushAddToCart(JSON.parse(this.responseText));
        } catch (e) {
          /* non-JSON response — ignore */
        }
      });
    }
    return origOpen.apply(this, arguments);
  };

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
