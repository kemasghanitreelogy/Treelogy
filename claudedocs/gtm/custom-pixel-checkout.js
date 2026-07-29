// ============================================================
// Treelogy — Custom Pixel: checkout funnel -> GTM (sandbox)
// Paste di: Admin > Settings > Customer events > Add custom pixel
// Nama saran: "GTM Checkout Funnel"
// Permission: biarkan default (mengikuti consent Customer Privacy)
//
// GANTI GTM_ID di bawah dengan container ID yang sama dengan
// yang diisi di Theme settings > Analytics (GTM).
//
// Checkout TIDAK bisa dijangkau kode theme — event funnel checkout
// (begin_checkout, add_shipping_info, add_payment_info, purchase)
// hanya bisa dikirim dari sini. GTM dimuat di dalam sandbox pixel
// dan memakai tag/trigger yang sama dengan container storefront.
// ============================================================

const GTM_ID = 'GTM-5M855J4V';

window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}

// Consent Mode v2 — default granted; sandbox pixel sudah di-gate oleh
// Shopify Customer Privacy (pixel tidak jalan tanpa consent yang sesuai),
// jadi tidak perlu default denied ganda di sini.
gtag('consent', 'default', {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted'
});

// GTM dimuat LAZY — hanya saat event checkout pertama tiba.
// Custom pixel Shopify jalan di SEMUA halaman (storefront + checkout);
// kalau GTM dimuat langsung di top-level, storefront memuat GTM dua kali
// (theme + sandbox) dan page_view jadi dobel/kotor. Dengan lazy-load,
// sandbox hanya aktif di checkout — storefront 100% single-source (theme).
var gtmLoaded = false;
function ensureGTM() {
  if (gtmLoaded) return;
  gtmLoaded = true;
  (function (w, d, s, l, i) {
    w[l] = w[l] || [];
    w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var f = d.getElementsByTagName(s)[0],
      j = d.createElement(s),
      dl = l != 'dataLayer' ? '&l=' + l : '';
    j.async = true;
    j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
    f.parentNode.insertBefore(j, f);
  })(window, document, 'script', 'dataLayer', GTM_ID);
}

function mapLineItems(lineItems) {
  return (lineItems || []).map(function (li, idx) {
    var v = li.variant || {};
    var p = v.product || {};
    return {
      item_id: v.sku || String(v.id || p.id || ''),
      item_name: p.title || li.title || '',
      item_brand: p.vendor || undefined,
      item_category: p.type || undefined,
      item_variant: v.title || undefined,
      price: v.price ? Number(v.price.amount) : undefined,
      quantity: li.quantity || 1,
      index: idx + 1
    };
  });
}

function checkoutPayload(checkout) {
  checkout = checkout || {};
  var total = checkout.totalPrice || {};
  return {
    currency: total.currencyCode || 'IDR',
    value: total.amount != null ? Number(total.amount) : undefined,
    items: mapLineItems(checkout.lineItems)
  };
}

function pushEcommerce(eventName, ecommerce) {
  ensureGTM();
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({ event: eventName, ecommerce: ecommerce });
}

analytics.subscribe('checkout_started', function (event) {
  pushEcommerce('begin_checkout', checkoutPayload(event.data.checkout));
});

analytics.subscribe('checkout_shipping_info_submitted', function (event) {
  pushEcommerce('add_shipping_info', checkoutPayload(event.data.checkout));
});

analytics.subscribe('payment_info_submitted', function (event) {
  pushEcommerce('add_payment_info', checkoutPayload(event.data.checkout));
});

analytics.subscribe('checkout_completed', function (event) {
  var checkout = event.data.checkout || {};
  var payload = checkoutPayload(checkout);
  // SELALU checkout.token — kunci dedup vs purchase backstop server-side
  // (webhook orders/paid mengirim checkout_token yang sama via Measurement
  // Protocol). JANGAN fallback ke order.id: kunci beda = purchase dobel.
  payload.transaction_id = checkout.token || undefined;
  if (checkout.totalTax && checkout.totalTax.amount != null) {
    payload.tax = Number(checkout.totalTax.amount);
  }
  if (checkout.shippingLine && checkout.shippingLine.price) {
    payload.shipping = Number(checkout.shippingLine.price.amount);
  }
  var discounts = checkout.discountApplications || [];
  if (discounts.length && discounts[0].title) {
    payload.coupon = discounts[0].title;
  }
  pushEcommerce('purchase', payload);
});
