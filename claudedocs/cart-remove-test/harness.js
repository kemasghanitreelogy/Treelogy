/* Menjalankan kode ASLI drawer (blok <script> MiniCart.liquid) + mesin hadiah
   (assets/gift-auto-add.js) di atas DOM tiruan dan server keranjang tiruan.
   Tidak ada fungsi tema yang di-mock: yang diganti hanya browser dan jaringan. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { makeEl } = require('./dom.js');
const { makeServer } = require('./cartserver.js');

const D = __dirname;
function scripts(file) {
  const src = fs.readFileSync(file, 'utf8');
  return [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
    .join('\n;\n')
    /* Liquid → nilai netral. {{ x | json }} jadi string, {% %} dibuang. */
    .replace(/\{\{[\s\S]*?\}\}/g, '"X"')
    .replace(/\{%[\s\S]*?%\}/g, '');
}

/* --- membangun halaman: #cart + baris + modal konfirmasi --- */
function buildPage(lines, opts) {
  opts = opts || {};
  const body = makeEl('body');
  const cart = makeEl('div', { id: 'cart' });
  body.appendChild(cart);
  const page = makeEl('div', { class: 'cart-page min-cart-template' });
  cart.appendChild(page);
  const cartWrap = makeEl('div', { class: 'cart' });
  page.appendChild(cartWrap);
  const form = makeEl('form');
  cartWrap.appendChild(form);
  const items = makeEl('div', { class: 'cart-items' });
  form.appendChild(items);
  const dock = makeEl('div', { class: 'cart-bottom-dock' });
  form.appendChild(dock);
  const footer = makeEl('div', { class: 'sub-total cart-footer' });
  dock.appendChild(footer);
  const subtotal = makeEl('div', { id: 'sub-total-mini' });
  footer.appendChild(subtotal);

  lines.forEach(l => items.appendChild(makeRow(l)));

  /* modal konfirmasi — markup MiniCart.liquid */
  const modal = makeEl('div', { id: 'cart-remove-modal' });
  const backdrop = makeEl('div', { class: 'cart-remove-backdrop' });
  modal.appendChild(backdrop);
  const nameEl = makeEl('span', { id: 'cart-remove-name' });
  modal.appendChild(nameEl);
  const cancelBtn = makeEl('button', { id: 'cart-remove-cancel' });
  modal.appendChild(cancelBtn);
  const confirmBtn = makeEl('button', { id: 'cart-remove-confirm' });
  modal.appendChild(confirmBtn);
  body.appendChild(modal);

  return { body, cart, items, modal, confirmBtn, cancelBtn };
}
function makeRow(l) {
  const row = makeEl('div', {
    class: 'cart-item' + (l.gift ? ' cart-item--gift' : ''),
    id: 'item-' + l.variant_id,
    'data-variant': String(l.variant_id),
    'data-key': l.key,
    'data-price': String(l.price || 100000),
    'data-qty': String(l.quantity),
  });
  const title = makeEl('span', { class: 'title' });
  title.textContent = l.title || ('Item ' + l.variant_id);
  row.appendChild(title);
  if (!l.gift) {
    const rm = makeEl('div', { class: 'button-remove-force', 'data-key': l.key });
    row.appendChild(rm);
    const sel = makeEl('select', { class: 'qty-select', 'data-key': l.key, 'data-id': String(l.variant_id) });
    sel.value = String(l.quantity);
    row.appendChild(sel);
  }
  return row;
}

function boot(o) {
  const server = o.server;
  const page = o.page;
  const giftMap = o.giftMap || {};
  const seed = o.seed || [];

  const mapEl = makeEl('script', { 'data-gift-map': '' });
  mapEl.textContent = JSON.stringify(giftMap);
  const seedEl = makeEl('script', { 'data-cart-seed': '' });
  seedEl.textContent = JSON.stringify(seed);
  page.body.appendChild(mapEl); page.body.appendChild(seedEl);
  (o.giftTemplates || []).forEach(v => {
    const tpl = makeEl('template', { 'data-gift-template': String(v) });
    tpl.content = { firstElementChild: makeRow({ variant_id: v, key: '', quantity: 1, gift: true, title: 'Gift ' + v }) };
    page.body.appendChild(tpl);
  });

  const doc = {
    readyState: 'complete', body: page.body, documentElement: makeEl('html'),
    hidden: false, prerendering: false,
    createElement: t => makeEl(t),
    createDocumentFragment: () => makeEl('#fragment'),
    getElementById: id => page.body.querySelector('#' + id) || null,
    querySelector: sel => page.body.querySelector(sel) || (sel === 'body' ? page.body : null),
    querySelectorAll: sel => page.body.querySelectorAll(sel),
    addEventListener: (t, f, opts) => {
      const capture = opts === true || !!(opts && opts.capture);
      (doc._l = doc._l || {})[t] = (doc._l[t] || []).concat({ fn: f, capture });
    },
    removeEventListener: () => {},
    dispatch: (t, ev) => ((doc._l && doc._l[t]) || []).slice().forEach(l => l.fn(ev)),
    dispatchEvent: ev => { doc.dispatch(ev && ev.type, ev); return true; },
    /* Klik yang setia pada urutan fase sungguhan: listener CAPTURE di document
       berjalan sebelum listener BUBBLE, dan stopPropagation() di fase capture
       benar-benar menghalangi fase bubble. Gerbang checkout hadiah bergantung
       persis pada perilaku itu, jadi uji yang mengabaikannya akan menyesatkan.
       Mengembalikan defaultPrevented supaya uji bisa membedakan "klik ditahan"
       dari "submit form natif berjalan" — beda antara diskon terbawa dan
       diskon hilang diam-diam. */
    dispatchClick: target => {
      const ls = ((doc._l && doc._l.click) || []).slice();
      let prevented = false, stopped = false, stoppedNow = false;
      const ev = {
        type: 'click', target,
        preventDefault() { prevented = true; },
        stopPropagation() { stopped = true; },
        stopImmediatePropagation() { stopped = true; stoppedNow = true; },
      };
      const run = list => { for (const l of list) { if (stoppedNow) return; l.fn(ev); } };
      run(ls.filter(l => l.capture));
      if (!stopped) run(ls.filter(l => !l.capture));
      return { defaultPrevented: prevented, propagationStopped: stopped };
    },
    contains: n => page.body.contains(n),
    activeElement: null,
  };
  const win = {
    fetch: server.fetch,
    addEventListener: (t, f) => { (win._l = win._l || {})[t] = (win._l[t] || []).concat(f); },
    removeEventListener: () => {},
    dispatch: (t, ev) => ((win._l && win._l[t]) || []).slice().forEach(f => f(ev)),
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    dataLayer: [],
    requestAnimationFrame: f => setTimeout(() => f(0), 0),
    cancelAnimationFrame: () => {},
    location: { pathname: '/', search: '', href: 'https://treelogy.com/' },
    innerWidth: 400, innerHeight: 800, scrollY: 0,
    getComputedStyle: () => ({ getPropertyValue: () => '', transform: 'none' }),
    navigator: { vibrate: () => {}, sendBeacon: () => true, userAgent: 'node' },
    Shopify: { locale: 'id', currency: { active: 'IDR', rate: 1 } },
  };
  const ctx = Object.assign({}, win, {
    window: win, document: doc, console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    JSON, Date, Math, Object, Array, String, Number, Boolean, Promise, Error,
    parseInt, parseFloat, isFinite, isNaN, encodeURIComponent, decodeURIComponent,
    RegExp, Set, Map, Symbol,
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    IntersectionObserver: function () { this.observe = () => {}; this.disconnect = () => {}; this.unobserve = () => {}; },
    ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    DOMParser: function () {
      this.parseFromString = txt => {
        /* /cart?view=mini tiruan mengirim JSON keranjang; kami bangun pohon
           baris yang setara dengan render server. */
        let data = null;
        try { data = JSON.parse(txt); } catch (e) { data = null; }
        const d = makeEl('div');
        const wrap = makeEl('div', { class: 'cart-items' });
        d.appendChild(wrap);
        const mini = makeEl('div', { id: 'mini-cart-content' });
        d.appendChild(mini);
        const foot = makeEl('div', { class: 'sub-total cart-footer' });
        d.appendChild(foot);
        const c = data && data.__mini ? data.__mini : null;
        if (c) c.items.forEach(i => wrap.appendChild(makeRow({
          variant_id: i.variant_id, key: i.key, quantity: i.quantity,
          gift: !!(i.properties && i.properties._Gifted), title: i.product_title,
        })));
        d.getElementById = id => d.querySelector('#' + id);
        return d;
      };
    },
    performance: { now: () => Date.now() },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    XMLHttpRequest: function () { this.open = () => {}; this.send = () => {}; this.setRequestHeader = () => {}; },
  });
  ctx.globalThis = ctx; ctx.self = ctx; ctx.window = ctx;
  ctx.document = doc;
  vm.createContext(ctx);
  /* window.X = ... di dalam kode tema harus mendarat di global konteks */
  const load = (code, label) => {
    try { vm.runInContext(code, ctx, { filename: label }); }
    catch (e) { console.log('   !! gagal memuat ' + label + ': ' + e.message); }
  };
  if (o.miniCartSrc) load(scripts(o.miniCartSrc), 'MiniCart');
  if (o.giftSrc) load(fs.readFileSync(o.giftSrc, 'utf8'), 'gift-auto-add');
  return ctx;
}

module.exports = { buildPage, makeRow, boot, makeServer, makeEl, scripts };
