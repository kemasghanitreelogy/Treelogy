/* QA: perbaikan "checkout freeze" di cart drawer.
   Menjalankan kode ASLI snippets/MiniCart.liquid (+ assets/gift-auto-add.js
   untuk blok interaksi gerbang) di atas DOM dan jaringan tiruan.

   Jalankan:
     node claudedocs/cart-freeze-test/suite.js
   Menguji berkas lain:
     MINI=/path/ke/MiniCart.liquid node claudedocs/cart-freeze-test/suite.js

   Yang diuji — tiga cacat yang menyebabkan/memperparah freeze:
   A. Overlay loading tanpa batas hidup (akar masalah: ia memblokir SELURUH
      sentuhan di drawer, jadi sekali menyala tanpa penutup, keranjang mati).
   B. Serah-terima voucher: ketukan kedua dulu jatuh ke submit natif dan
      membuang kode diskon diam-diam.
   C. Interaksi dengan gerbang checkout hadiah (fase capture).
   D. Regresi: jalur mutasi normal tetap menutup overlay-nya sendiri. */
const path = require('path');
const H = require('../cart-remove-test/harness.js');
const { makeEl } = require('../cart-remove-test/dom.js');

const REPO = path.resolve(__dirname, '../..');
const MINI = process.env.MINI || path.join(REPO, 'snippets/MiniCart.liquid');
const GIFT = process.env.GIFT || path.join(REPO, 'assets/gift-auto-add.js');

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

/* ---------- lingkungan ---------- */
function setup(opts) {
  opts = opts || {};
  const server = H.makeServer(opts.server || {});
  /* Halaman dibangun DARI keranjang server supaya kunci baris di DOM identik
     dengan kunci server — kalau tidak, mutasi pertama menjawab 404 dan jalur
     percobaan-ulang menyandera uji di timer, bukan menguji apa pun. */
  const cart0 = server.seed(opts.lines || []);
  const page = H.buildPage(cart0.items.map(i => ({
    variant_id: i.variant_id, key: i.key, quantity: i.quantity,
    title: i.product_title, gift: !!(i.properties && i.properties._Gifted),
  })));

  /* Tombol checkout persis seperti CartDrawerContent.liquid: submit di dalam
     <form action="/cart" method="post">. */
  const form = page.cart.querySelector('form');
  const btn = makeEl('button', { type: 'submit', name: 'checkout', id: 'cart-checkout-btn' });
  form.appendChild(btn);

  /* Blok voucher persis seperti selector appliedVoucherCode(). */
  const vwrap = makeEl('div', { 'data-cart-voucher': '', 'data-state': opts.voucherState || 'idle' });
  page.cart.appendChild(vwrap);
  (opts.codes || []).forEach(c => {
    vwrap.appendChild(makeEl('span', { 'data-voucher-chip': c }));
  });

  const ctx = H.boot({
    server, page, miniCartSrc: MINI,
    giftSrc: opts.withGift ? GIFT : null,
    giftMap: opts.giftMap || {}, seed: cart0.items,
    giftTemplates: opts.giftTemplates || [],
  });

  /* Jam palsu DIPASANG SETELAH boot: kode tema menyelesaikan `setTimeout` dari
     global konteks pada saat dipanggil, jadi timer yang dijadwalkan sesudah ini
     memakai jam kita. Tanpa ini, menguji penjaga 12 detik berarti menunggu 12
     detik sungguhan. */
  let now = 0, seq = 0;
  const timers = [];
  ctx.setTimeout = (fn, ms) => { timers.push({ id: ++seq, fn, at: now + (ms || 0) }); return seq; };
  ctx.clearTimeout = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
  const advance = ms => {
    const target = now + ms;
    for (;;) {
      const due = timers.filter(t => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      now = due.at;
      try { due.fn(); } catch (e) { /* biarkan uji yang menilai */ }
    }
    now = target;
  };

  /* `live.click()` gerbang hadiah harus sampai ke listener terdelegasi di
     document, seperti klik sungguhan. */
  btn.click = () => ctx.document.dispatchClick(btn);

  const overlay = () => ctx.document.querySelector('#cart .cart-loading-overlay');
  const visible = () => { const o = overlay(); return !!o && o.style.display !== 'none'; };
  const tap = () => ctx.document.dispatchClick(btn);

  return { ctx, page, btn, server, advance, overlay, visible, tap, vwrap };
}
const flush = () => new Promise(r => setImmediate(r));

/* =======================================================================
   A. Primitif overlay — batas hidup dijamin di sini
   ======================================================================= */
section('A. Overlay: penjaga masa hidup');
{
  const t = setup({});
  t.ctx.cartShowLoading();
  ok('A1 show() memunculkan overlay', t.visible());

  t.ctx.cartHideLoading();
  ok('A2 hide() menyembunyikan overlay', !t.visible());

  t.advance(60000);
  ok('A3 hide() melucuti penjaga (tak ada efek susulan)', !t.visible());
  ok('A4 pasangan show/hide normal tidak memicu telemetri timeout',
    !t.ctx.dataLayer.some(d => d.event === 'cart_loading_timeout'));
}
{
  const t = setup({});
  t.ctx.cartShowLoading();
  t.advance(11999);
  ok('A5 penjaga TIDAK menyala sebelum ambang 12 dtk', t.visible());
  t.advance(2);
  ok('A6 penjaga menutup overlay pada 12 dtk', !t.visible());
  ok('A7 penjaga mencatat telemetri cart_loading_timeout',
    t.ctx.dataLayer.some(d => d.event === 'cart_loading_timeout'));
  const n1 = t.ctx.dataLayer.filter(d => d.event === 'cart_loading_timeout').length;
  t.advance(60000);
  ok('A8 penjaga hanya menyala sekali per show (tidak berulang)',
    t.ctx.dataLayer.filter(d => d.event === 'cart_loading_timeout').length === n1);
}
{
  const t = setup({});
  let seen = 0;
  t.ctx.document.addEventListener('cart:loading-timeout', () => { seen++; });
  t.ctx.cartShowLoading();
  t.advance(12001);
  ok('A9 event cart:loading-timeout benar-benar terkirim sekali', seen === 1, 'seen=' + seen);
}
{
  const t = setup({});
  t.ctx.cartShowLoading(8000);
  t.advance(7999);
  ok('A10 batas khusus dihormati (belum tutup di 7,999 dtk)', t.visible());
  t.advance(2);
  ok('A11 batas khusus dihormati (tutup di 8 dtk)', !t.visible());
}
{
  const t = setup({});
  t.ctx.cartShowLoading();
  t.advance(5000);
  t.ctx.cartShowLoading();           /* show ulang harus MENYETEL ULANG jam */
  t.advance(8000);                   /* total 13 dtk, tapi 8 dtk sejak show ke-2 */
  ok('A12 show ulang menyetel ulang penjaga', t.visible());
  t.advance(4001);
  ok('A13 penjaga tetap menutup setelah jendela baru', !t.visible());
}
{
  const t = setup({});
  t.ctx.cartShowLoading();
  t.ctx.cartShowLoading();
  const n = t.ctx.document.querySelectorAll('#cart .cart-loading-overlay').length;
  ok('A14 show berulang tidak menggandakan simpul overlay', n === 1, 'n=' + n);
}
{
  const t = setup({});
  t.ctx.document.getElementById('cart').remove();
  let threw = false;
  try { t.ctx.cartShowLoading(); } catch (e) { threw = true; }
  ok('A15 show() tanpa #cart tidak melempar', !threw);
}

/* =======================================================================
   B. Serah-terima voucher
   ======================================================================= */
section('B. Serah-terima voucher ke checkout');
{
  const t = setup({ voucherState: 'idle', codes: [] });
  const r = t.tap();
  ok('B1 tanpa voucher: klik TIDAK ditahan (submit natif utuh)', !r.defaultPrevented);
  ok('B2 tanpa voucher: tidak ada navigasi buatan', t.ctx.location.href === 'https://treelogy.com/');
  ok('B3 tanpa voucher: overlay tidak dinyalakan', !t.visible());
}
{
  const t = setup({ voucherState: 'applied', codes: ['WELCOME15'] });
  const r = t.tap();
  ok('B4 dengan voucher: klik ditahan (submit natif dicegah)', r.defaultPrevented);
  ok('B5 navigasi satu-lompatan ke /checkout?discount=CODE',
    t.ctx.location.href === '/checkout?discount=WELCOME15', t.ctx.location.href);
  ok('B6 overlay dinyalakan selama serah-terima', t.visible());
}
{
  const t = setup({ voucherState: 'applied', codes: ['WELCOME15'] });
  t.ctx.Shopify.routes = { root: '/id/' };
  t.tap();
  ok('B7 awalan market /id/ dihormati',
    t.ctx.location.href === '/id/checkout?discount=WELCOME15', t.ctx.location.href);
}
{
  const t = setup({ voucherState: 'applied', codes: ['WELCOME15', 'MOR10'] });
  t.tap();
  ok('B8 daftar berkoma digabung + di-encode',
    t.ctx.location.href === '/checkout?discount=WELCOME15%2CMOR10', t.ctx.location.href);
}
{
  /* Inti bug kedua: dulu ketukan kedua lolos tanpa preventDefault, form submit
     ke /cart, dan pembeli sampai di checkout TANPA kode — diskon hilang. */
  const t = setup({ voucherState: 'applied', codes: ['WELCOME15'] });
  t.tap();
  t.ctx.location.href = 'SENTINEL';
  const r2 = t.tap();
  ok('B9 ketukan kedua TETAP menahan submit natif (diskon tidak hilang)', r2.defaultPrevented);
  ok('B10 ketukan kedua tidak menavigasi ulang', t.ctx.location.href === 'SENTINEL', t.ctx.location.href);
}
{
  const t = setup({ voucherState: 'applied', codes: ['WELCOME15'] });
  t.tap();
  t.ctx.location.href = 'SENTINEL';
  t.advance(8001);                       /* penjaga serah-terima menyerah */
  ok('B11 penjaga membebaskan overlay saat navigasi tak mendarat', !t.visible());
  const r3 = t.tap();
  ok('B12 setelah penjaga menyala, percobaan ulang berangkat lagi',
    r3.defaultPrevented && t.ctx.location.href === '/checkout?discount=WELCOME15',
    t.ctx.location.href);
}
{
  const t = setup({ voucherState: 'applied', codes: ['WELCOME15'] });
  t.tap();
  t.ctx.location.href = 'SENTINEL';
  t.ctx.window.dispatch('pageshow', { persisted: true });   /* kembali via bfcache */
  const r4 = t.tap();
  ok('B13 kembali via bfcache membebaskan serah-terima',
    r4.defaultPrevented && t.ctx.location.href === '/checkout?discount=WELCOME15',
    t.ctx.location.href);
}
{
  const t = setup({ voucherState: 'applied', codes: ['WELCOME15'] });
  t.tap();
  t.ctx.location.href = 'SENTINEL';
  t.ctx.window.dispatch('pageshow', { persisted: false });  /* muat baru, bukan bfcache */
  const r5 = t.tap();
  ok('B14 pageshow non-bfcache tidak membebaskan (masih satu penerbangan)',
    t.ctx.location.href === 'SENTINEL', t.ctx.location.href);
}
{
  const t = setup({ voucherState: 'applied', codes: ['WELCOME15'] });
  t.vwrap.setAttribute('data-state', 'idle');   /* pembeli mencabut vouchernya */
  const r6 = t.tap();
  ok('B15 voucher dicabut: klik kembali ke submit natif', !r6.defaultPrevented);
}

/* =======================================================================
   C. Interaksi dengan gerbang checkout hadiah (fase capture)
   ======================================================================= */
section('C. Gerbang hadiah × serah-terima voucher');
(async () => {
  {
    /* Keranjang bersih tanpa hadiah yang diharapkan → gerbang lewat jalur
       cepat, voucher langsung berangkat. */
    const t = setup({
      withGift: true, voucherState: 'applied', codes: ['WELCOME15'],
      lines: [{ variant_id: 111, quantity: 1 }],
      giftMap: {},
    });
    await flush();
    const r = t.tap();
    ok('C1 jalur cepat gerbang: voucher tetap berangkat',
      r.defaultPrevented && t.ctx.location.href === '/checkout?discount=WELCOME15',
      t.ctx.location.href);
  }
  {
    /* Reproduksi paling dekat dengan laporan pembeli: voucher terpasang,
       hadiah yang diharapkan belum cocok, DAN keranjang sedang di jendela 429
       sehingga mesin hadiah tidak bisa memperbaikinya. Gerbang WAJIB menahan
       klik di fase capture, lalu menyerah pada batas 4 detiknya — dan setelah
       menyerah, serah-terima voucher harus tetap membawa kodenya.
       Justru di sinilah urutan capture/bubble menentukan: kalau salah, kode
       diskonnya hilang tanpa suara. */
    const t = setup({
      withGift: true, voucherState: 'applied', codes: ['WELCOME15'],
      lines: [{ variant_id: 111, quantity: 1 }],
      giftMap: { 111: [999] },
      server: { throttle: () => true },   /* semua permintaan keranjang 429 */
    });
    await flush(); await flush();

    const before = t.ctx.location.href;
    const r = t.tap();
    ok('C2 gerbang menahan klik (belum menavigasi)',
      t.ctx.location.href === before, t.ctx.location.href);
    ok('C3 gerbang menyalakan overlay saat menahan', t.visible());
    ok('C4 klik yang ditahan tidak lolos ke submit natif', r.defaultPrevented);

    t.advance(4001);                 /* batas 4 dtk gerbang → lepaskan pembeli */
    await flush();
    ok('C5 setelah gerbang menyerah, voucher berangkat dengan kodenya',
      t.ctx.location.href === '/checkout?discount=WELCOME15', t.ctx.location.href);
  }
  {
    /* Dan kalau navigasinya tidak pernah mendarat, penjaga overlay tetap
       membebaskan keranjang — jaring pengaman terakhir yang dulu tidak ada,
       diuji dengan mesin hadiah ikut termuat. */
    const t = setup({
      withGift: true, voucherState: 'applied', codes: ['WELCOME15'],
      lines: [{ variant_id: 111, quantity: 1 }],
      giftMap: {},
    });
    await flush();
    t.tap();
    ok('C6 overlay menyala saat serah-terima', t.visible());
    t.advance(8001);
    ok('C7 penjaga membebaskan keranjang meski gerbang hadiah ikut terlibat',
      !t.visible());
  }

  /* =====================================================================
     D. Regresi: jalur mutasi normal
     ===================================================================== */
  section('D. Regresi jalur mutasi');
  {
    const t = setup({ lines: [{ variant_id: 111, quantity: 1 }] });
    const sel = t.ctx.document.querySelector('.qty-select');
    sel.value = '2';
    t.ctx.cartChangeQty(sel);
    ok('D1 ubah jumlah menyalakan overlay', t.visible());
    await flush(); await flush(); await flush();
    ok('D2 ubah jumlah menutup overlay saat sukses', !t.visible());
    ok('D3 tidak ada telemetri timeout di jalur sehat',
      !t.ctx.dataLayer.some(d => d.event === 'cart_loading_timeout'));
  }
  {
    const t = setup({ lines: [{ variant_id: 111, quantity: 1 }] });
    const rm = t.ctx.document.querySelector('.button-remove-force');
    t.ctx.cartRemoveItem(rm);
    await flush();
    t.page.confirmBtn.dispatch('click', {});
    ok('D4 hapus baris menyalakan overlay', t.visible());
    await flush(); await flush(); await flush();
    ok('D5 hapus baris menutup overlay saat sukses', !t.visible());
  }

  console.log('\n================ RINGKASAN ================');
  console.log('LULUS ' + pass + ' · GAGAL ' + failures.length);
  if (failures.length) {
    console.log('\nYang gagal:');
    failures.forEach(f => console.log('  - ' + f));
    process.exitCode = 1;
  }
})();
