/*
 * Mesin hadiah otomatis — logika murni, nol Liquid.
 *
 * Berkas ini SENGAJA berada di assets/, bukan inline di snippet:
 * Shopify menyajikan assets/ lewat CDN dan meminifikasi + mengompresnya
 * (Brotli/gzip) otomatis, lalu browser menyimpannya lintas halaman. Versi
 * inline sebelumnya menulis ulang 43 KB yang sama ke SETIAP halaman dan
 * tidak pernah bisa di-cache, karena HTML-nya sendiri tidak di-cache.
 *   https://shopify.dev/docs/storefronts/themes/best-practices/performance
 *
 * Yang TETAP inline di snippets/gift-auto-add.liquid adalah data yang berbeda
 * tiap pembeli — peta hadiah, seed keranjang, dan <template> baris hadiah.
 * Berkas ini membacanya dari DOM, jadi tidak ada Liquid yang perlu ikut.
 *
 * TANPA defer, dan itu disengaja. Skrip membungkus window.fetch untuk
 * menumpangkan hadiah pada permintaan pemicunya; urutan pemasangannya relatif
 * terhadap skrip keranjang lain sudah jadi ketergantungan yang tercatat di
 * TRACKING-MASTER (aturan #6 & #8). Tag aset biasa dieksekusi di posisi
 * dokumen yang sama dengan blok inline yang digantikannya, jadi urutannya
 * tidak berubah sedikit pun. Menambahkan defer boleh dipertimbangkan hanya
 * setelah dibuktikan tidak ada permintaan keranjang yang berjalan lebih dulu.
 */

(function () {
  var el = document.querySelector('[data-gift-map]');
  if (!el) return;

  var MAP;
  try { MAP = JSON.parse(el.textContent); } catch (e) { return; }

  var GIFTS = {};
  Object.keys(MAP).forEach(function (k) {
    MAP[k].forEach(function (g) { GIFTS[g] = true; });
  });

  /* Status keranjang terakhir yang diketahui — dasar verifikasi gerbang
     checkout TANPA menyentuh jaringan. Diperbarui setiap kali payload
     keranjang penuh lewat: seed Liquid, respons mutasi, hasil putaran
     sinkronisasi. */
  var lastCart = null;

  /* Benar bila baris hadiah PERSIS sesuai patokan gift_map: tiap varian
     hadiah berjumlah total kuantitas pemicunya, tidak ada hadiah yatim,
     tidak ada hadiah kurang. Murni komputasi lokal — nol permintaan. */
  function giftsMatch(cart) {
    if (!cart || !cart.items) return false;
    var wanted = {};
    var have = {};
    var sane = true;
    var pending = false;
    cart.items.forEach(function (item) {
      if (typeof item.quantity !== 'number') sane = false;
      var gifts = MAP[String(item.variant_id)];
      if (gifts) gifts.forEach(function (g) {
        wanted[g] = (wanted[g] || 0) + item.quantity;
      });
      if (item.properties && item.properties._Gifted) {
        have[item.variant_id] = (have[item.variant_id] || 0) + item.quantity;
      } else if (GIFTS[item.variant_id]) {
        /* Baris varian hadiah TANPA marker statusnya selalu "sedang
           dinormalkan" — runSync akan menolkannya lalu menambah pengganti
           bermarker. Dulu baris begini dihitung "hadir", sehingga gerbang
           meloloskan klik tepat di tengah jendela nolkan-lalu-ganti dan
           checkout berangkat tanpa hadiah (QA G4). Keranjang yang masih
           memuatnya belum terverifikasi, titik. */
        pending = true;
      }
    });
    if (!sane || pending) return false;
    var ok = true;
    Object.keys(wanted).forEach(function (g) {
      if ((have[g] || 0) !== wanted[g]) ok = false;
    });
    Object.keys(have).forEach(function (g) {
      if (!(g in wanted)) ok = false;
    });
    return ok;
  }

  /* ===== Telemetri =====
     Order #9933 (13 Agu) lolos dengan hadiah kurang, dan penyebabnya TIDAK
     bisa dipastikan retroaktif: yang menentukan adalah nasib satu permintaan
     di browser pembeli, dan tidak ada tempat yang mencatatnya. Dua event di
     bawah menutup buta itu — sesudah ini kejadian serupa menjawab dirinya
     sendiri lewat satu query GA4, bukan lewat dugaan.

     Sengaja hanya DUA nama event (`gift_gate_timeout`, `gift_sync_failed`),
     sisanya dibedakan lewat parameter, karena tiap nama baru harus
     didaftarkan ke regex trigger GTM (aturan keras #15 TRACKING-MASTER).
     Tanpa pendaftaran itu event tetap masuk dataLayer tapi tidak sampai GA4.

     Nol PII, nol pengaruh ke alur beli: seluruhnya dibungkus try/catch dan
     digerbang prerender (aturan keras #4). */
  var lastFailStatus = 0;
  var lastFailReport = 0;

  function giftSummary(cart) {
    /* Ringkas "yang seharusnya vs yang ada" jadi satu string pendek supaya
       bisa dibaca langsung di GA4 tanpa menggabungkan beberapa parameter. */
    if (!cart || !cart.items) return 'no-cart';
    var wanted = {}, have = {};
    cart.items.forEach(function (item) {
      var gs = MAP[String(item.variant_id)];
      if (gs) gs.forEach(function (g) { wanted[g] = (wanted[g] || 0) + item.quantity; });
      if ((item.properties && item.properties._Gifted) || GIFTS[item.variant_id]) {
        have[item.variant_id] = (have[item.variant_id] || 0) + item.quantity;
      }
    });
    var keys = {};
    Object.keys(wanted).forEach(function (k) { keys[k] = 1; });
    Object.keys(have).forEach(function (k) { keys[k] = 1; });
    var out = Object.keys(keys).map(function (k) {
      return k + ':' + (wanted[k] || 0) + '/' + (have[k] || 0);
    });
    return out.length ? out.join(',') : 'no-gift';
  }

  function giftTrack(name, data) {
    try {
      if (document.prerendering) return;
      window.dataLayer = window.dataLayer || [];
      var payload = { event: name };
      var reset = {};
      Object.keys(data || {}).forEach(function (k) {
        payload[k] = data[k];
        reset[k] = null;
      });
      window.dataLayer.push(payload);
      /* Reset parameter ephemeral supaya tidak bocor ke event berikutnya
         (aturan keras #5). */
      window.dataLayer.push(reset);
    } catch (e) { /* telemetri tidak boleh pernah mengganggu keranjang */ }
  }

  var seed = null;
  var seedEl = document.querySelector('[data-cart-seed]');
  if (seedEl) {
    try { seed = { items: JSON.parse(seedEl.textContent) }; } catch (e) { /* jatuh ke readCart */ }
  }

  /* Putaran sinkronisasi diserialkan lewat satu rantai promise supaya dua
     putaran tidak pernah berjalan bersamaan; `queued` memampatkan pemicu
     beruntun jadi satu putaran susulan, bukan antrean panjang. */
  var chain = Promise.resolve();
  var queued = false;
  /* Benar selama sebuah putaran sinkronisasi SEDANG BERLARI. `queued` saja
     tidak cukup untuk gerbang checkout: ia dikembalikan ke false di baris
     pertama run, jadi sepanjang putaran berjalan gerbang mengira keadaan
     tenang dan mempercayai lastCart yang bisa jadi potret lama (QA G4/G5c:
     klik yang mendarat di tengah putaran lolos membawa keranjang setengah
     jadi). Gerbang kini menahan selama salah satu dari keduanya menyala. */
  var roundBusy = false;
  /* Menandai permintaan keranjang milik snippet ini sendiri. */
  var internal = 0;
  /* Berapa baris hadiah yang sedang ditunggu. Selama > 0, drawer diberi
     kartu skeleton supaya pembeli langsung melihat hadiahnya sedang datang. */
  var awaiting = 0;
  /* Mutasi keranjang yang balasannya belum selesai disinkronkan. Selama
     > 0, baris hadiah belum tentu cocok dengan pemicunya — gerbang checkout
     di bawah menahan navigasi sampai angka ini kembali nol. */
  var pendingMuts = 0;

  /* Penanda versi keranjang di server, dinaikkan setiap kali SNIPPET INI
     mengubahnya. Seed dari respons /cart/change|update.js adalah potret pada
     saat mutasi itu dijawab; kalau di antara penangkapan dan pemakaiannya
     kita sendiri menambah atau menghapus baris hadiah, potret itu sudah
     berbohong — ia tidak memuat baris yang baru saja kita tambahkan.

     Dulu satu-satunya penjaga adalah `queued`, dan itu hanya menutup kasus
     "dua pemicu datang saat putaran MENGANTRE". Pemicu yang datang saat
     putaran SEDANG BERJALAN lolos, karena `queued` sudah dikembalikan ke
     false di baris pertama run. Akibatnya putaran berikutnya memakai potret
     pra-hadiah, mengira hadiahnya masih kurang, lalu menambahkannya untuk
     kedua kali — hadiah ×2, persis order #9844. */
  var cartEpoch = 0;

  /* ===== Pemutus arus =====
     Endpoint keranjang membatasi laju PER SESI dan membalas 429 sebagai
     halaman HTML. Sekali tersentuh, mengulang agresif justru memperpanjang
     blokirnya. Maka satu 429 menjeda SEMUA lalu lintas keranjang snippet ini
     selama jendela yang diminta server (Retry-After, dibatasi 15 detik)
     atau 8 detik bila server tidak memberi tahu. */
  var cooldownUntil = 0;

  function trip(res) {
    var ra = parseInt(res.headers.get('Retry-After'), 10);
    var ms = ra > 0 && ra <= 15 ? ra * 1000 : 8000;
    var until = Date.now() + ms;
    if (until > cooldownUntil) cooldownUntil = until;
  }

  function breakerWait() {
    var wait = cooldownUntil - Date.now();
    return wait > 0
      ? new Promise(function (r) { setTimeout(r, wait); })
      : Promise.resolve();
  }

  /* Satu permintaan: menunggu pemutus arus, lalu WAJIB memeriksa status —
     .json() di atas halaman 429 melempar SyntaxError yang dulu tertelan
     senyap dan membuat hadiah tampak menyangkut. */
  function request(url, opts) {
    return breakerWait().then(function () {
      internal++;
      var req = fetch(url, opts);
      internal--;
      return req;
    }).then(function (r) {
      if (!r.ok) {
        lastFailStatus = r.status;
        /* Dipancarkan SEKETIKA, bukan menunggu semua percobaan habis:
           retry + jendela pemutus arus bisa memakan >8 detik, dan pembeli
           sering sudah pindah ke checkout sebelum itu — event yang terlambat
           ikut mati bersama halamannya. Dibatasi satu per 10 detik supaya
           badai 429 tidak membanjiri dataLayer. */
        if (Date.now() - lastFailReport > 10000) {
          lastFailReport = Date.now();
          giftTrack('gift_sync_failed', {
            gift_reason: r.status === 429 ? 'http_429' : 'http_error',
            gift_status: r.status,
            gift_state: giftSummary(lastCart)
          });
        }
        trip(r);
        throw new Error('cart ' + r.status);
      }
      return r;
    });
  }

  /* Percobaan ulang per permintaan. Jedanya nyaris nol karena penjedaan
     sesungguhnya milik pemutus arus — retry hanya menyeberangi jendelanya. */
  function withRetry(fn, tries) {
    return fn().catch(function (err) {
      if (tries <= 1) throw err;
      return new Promise(function (r) { setTimeout(r, 400); })
        .then(function () { return withRetry(fn, tries - 1); });
    });
  }

  function post(url, payload) {
    /* post() hanya dipakai untuk mutasi (add/update). Sejak detik ini
       keranjang di server berubah karena kita, jadi setiap seed yang sudah
       ditangkap sebelumnya harus dianggap basi. Dinaikkan SEBELUM permintaan,
       bukan sesudah: kalau permintaannya gagal di tengah jalan, membaca ulang
       yang segar tetap jawaban yang aman. */
    cartEpoch++;
    return withRetry(function () {
      return request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); });
    }, 3);
  }

  function readCart() {
    return withRetry(function () {
      return request('/cart.js', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); });
    }, 3);
  }

  /* Skeleton hanya boleh hidup di dalam .cart-items: fallback lama ke root
     #cart menyisipkannya di luar scope .cart-page, sehingga seluruh gaya
     .cart-item yang discope hilang dan kartunya render sebagai kotak rusak
     (persis glitch "skeleton ngaco" pada add pertama dari cart kosong). */
  function itemsParent(root) {
    var wrap = root.querySelector('.cart-items');
    if (wrap) return wrap;
    var first = root.querySelector('.cart-item');
    return first ? first.parentNode : null;
  }

  /* Skeleton memakai kelas loading milik tema (.cart-item--optimistic dan
     .opt-shimmer) supaya animasi, warna, dan iramanya identik dengan kartu
     optimistis yang sudah dipakai mini cart — bukan gaya baru yang bersaing. */
  function skeletonCard() {
    var el = document.createElement('div');
    el.className = 'cart-item cart-item--gift cart-item--optimistic';
    el.setAttribute('data-gift-skeleton', '');
    el.setAttribute('aria-hidden', 'true');
    /* Struktur mencerminkan CartItemCard.liquid persis (a.thumb + detail-top
       + detail-bottom) dan setiap ukuran ditulis eksplisit, supaya kartunya
       tetap utuh bahkan bila tersisip sebelum gaya scope-nya terpasang. */
    el.innerHTML =
      '<a class="thumb" style="display:block;width:80px;height:80px;border-radius:8px;overflow:hidden">' +
      '<span class="opt-shimmer" style="display:block;width:80px;height:80px;border-radius:8px"></span></a>' +
      '<div class="detail"><div class="detail-top"><div class="detail-info">' +
      '<span class="opt-shimmer" style="display:block;width:7.5rem;height:0.875rem;margin-bottom:0.5rem"></span>' +
      '<span class="opt-shimmer" style="display:block;width:4rem;height:1.25rem;border-radius:999px"></span>' +
      '</div></div>' +
      '<div class="detail-bottom"><div class="price-row">' +
      '<span class="opt-shimmer" style="display:block;width:5rem;height:0.875rem"></span>' +
      '</div></div></div>';
    return el;
  }

  function clearSkeletons(root) {
    (root || document).querySelectorAll('[data-gift-skeleton]').forEach(function (n) {
      /* Beri kepergian singkat lalu buang. Kalau animasi dimatikan pengguna,
         timeout tetap membersihkannya sehingga tidak ada sisa yang menempel. */
      n.classList.add('cart-item--gift-out');
      setTimeout(function () { if (n.parentNode) n.remove(); }, 180);
    });
  }

  var skeletonTTL = null;
  function armSkeletonTTL() {
    /* Jaring pengaman: kalau sinkronisasi macet (429, tab tidur), skeleton
       tidak boleh menempel selamanya. Setelah tenggat lewat ia dibersihkan;
       sinkronisasi berikutnya tetap jalan dan barisnya dirender ulang. */
    if (skeletonTTL) clearTimeout(skeletonTTL);
    skeletonTTL = setTimeout(function () {
      if (awaiting > 0) { awaiting = 0; clearSkeletons(); }
    }, 8000);
  }

  function ensureSkeletons() {
    var c = document.getElementById('cart');
    if (!c || awaiting < 1) return;
    var have = c.querySelectorAll('[data-gift-skeleton]').length;
    var parent = itemsParent(c);
    if (!parent) return;
    for (var i = have; i < awaiting; i++) parent.insertBefore(skeletonCard(), parent.firstChild);
  }

  /* Tema mengisi #cart dengan HTML dari /cart?view=mini setiap kali drawer
     dibuka, jadi skeleton yang disisipkan lebih awal akan tersapu. Mengamati
     perubahan isinya membuat skeleton dipasang ulang tepat setelah render. */
  var cartRoot = document.getElementById('cart');
  if (cartRoot) {
    new MutationObserver(function () { ensureSkeletons(); })
      .observe(cartRoot, { childList: true, subtree: true });
  }

  function animateOut(node) {
    node.classList.add('cart-item--gift-out');
    setTimeout(function () { if (node.parentNode) node.remove(); }, 180);
  }

  /* Baris hadiah yang SEHARUSNYA tampil, diturunkan dari PEMICUNYA — bukan
     dari daftar baris hadiah yang kebetulan terbaca di snapshot ini.

     Ini inti perbaikannya. Versi lama membandingkan `data-key` tiap baris
     dengan kunci baris di snapshot, dan itu rapuh pada dua hal sekaligus:

     1. Kunci baris TIDAK STABIL — Shopify memberi kunci baru setiap kali
        keranjang dimutasi. Baris hadiah yang sah pun jadi "asing" dan dibuang.
     2. Snapshot bisa datang tidak berurutan. Snapshot yang diambil sebelum
        hadiah masuk memandang barisnya sebagai yatim, lalu menghapusnya —
        padahal keranjang server sudah benar. Itulah sebabnya hadiah hilang
        di drawer tapi tetap ada di checkout.

     Patokan yang dipakai sekarang: selama PEMICUNYA masih di keranjang,
     barisnya berhak tampil. Pemicu itu stabil dan tidak bergantung pada
     urutan kedatangan snapshot, jadi dua snapshot yang berselisih menghasilkan
     keputusan yang sama. */
  function desiredGiftRows(cart) {
    var want = {};
    cart.items.forEach(function (item) {
      var gifts = MAP[String(item.variant_id)];
      if (gifts) gifts.forEach(function (g) {
        want[g] = (want[g] || 0) + item.quantity;
      });
    });
    return want;
  }

  /* Buang baris hadiah yang pemicunya sudah tidak ada, plus baris kembar.
     Identitasnya `data-variant` (stabil), bukan `data-key` (berubah-ubah).
     Murni operasi DOM dari status yang sudah di tangan — nol permintaan. */
  function pruneGifts(cart) {
    var c = document.getElementById('cart');
    if (!c) return;
    var want = desiredGiftRows(cart);
    var seen = {};
    c.querySelectorAll('.cart-item--gift').forEach(function (node) {
      if (node.hasAttribute('data-gift-skeleton')) return;
      var v = node.getAttribute('data-variant');
      if (!v || !want[v]) { animateOut(node); return; }
      /* Satu varian hadiah = satu baris; jumlahnya ditulis pada label ×N.
         Baris kembar hanya lahir dari render ganda, dan harus dirapikan. */
      seen[v] = (seen[v] || 0) + 1;
      if (seen[v] > 1) animateOut(node);
    });
  }

  /* Sisipkan baris hadiah yang belum tampil, dari <template> yang dirender
     server-side saat halaman dibuat — nol permintaan, kebal rate limit. */
  function insertGifts(cart) {
    var c = document.getElementById('cart');
    if (!c) { awaiting = 0; return; }
    awaiting = 0;
    clearSkeletons(c);
    var parent = itemsParent(c);
    /* Baris digambar dari daftar YANG SEHARUSNYA TAMPIL, bukan dari baris
       hadiah yang kebetulan sudah terbaca di snapshot. Dengan begitu baris
       tetap muncul walau snapshot-nya belum sempat memuat baris hadiahnya —
       keadaan yang dulu justru membuatnya lenyap. */
    var want = desiredGiftRows(cart);
    var lineOf = {};
    cart.items.forEach(function (item) {
      if (item.properties && item.properties._Gifted) lineOf[item.variant_id] = item;
    });

    Object.keys(want).forEach(function (variantId) {
      var line = lineOf[variantId];
      var qty = line ? line.quantity : want[variantId];
      /* Dicari lewat data-variant, BUKAN data-key: kunci baris berubah tiap
         keranjang dimutasi, dan pencarian lewat kunci membuat baris yang sah
         dianggap belum ada lalu digambar kembar. */
      var existing = c.querySelector('.cart-item--gift[data-variant="' + variantId + '"]');
      if (existing) {
        var q = existing.querySelector('.gift-qty');
        if (q) q.textContent = '\u00d7' + qty;
        existing.setAttribute('data-qty', qty);
        /* Kunci disegarkan supaya kode lain yang masih mencari lewat
           data-key tetap menemukannya. */
        if (line) existing.setAttribute('data-key', line.key);
        return;
      }
      var item = line || { variant_id: variantId, key: '', quantity: qty };
      var tpl = document.querySelector('template[data-gift-template="' + item.variant_id + '"]');
      if (!tpl || !tpl.content.firstElementChild) return;
      var real = tpl.content.firstElementChild.cloneNode(true);
      real.setAttribute('data-key', item.key);
      real.setAttribute('data-qty', item.quantity);
      var qEl = real.querySelector('.gift-qty');
      if (qEl) qEl.textContent = '\u00d7' + item.quantity;
      /* Chip asal-usul: cari produk pemicu hadiah ini di keranjang lewat
         peta yang sama dengan mesin, lalu tampilkan namanya. Tanpa sumber
         (jendela transisi), chip tetap tersembunyi \u2014 render server
         berikutnya melengkapinya. */
      var srcEl = real.querySelector('[data-gift-source]');
      if (srcEl) {
        var srcTitle = '';
        cart.items.forEach(function (ci) {
          if (srcTitle) return;
          var ciGifts = MAP[String(ci.variant_id)];
          if (ciGifts && ciGifts.indexOf(item.variant_id) !== -1) {
            srcTitle = ci.product_title || '';
          }
        });
        if (srcTitle) {
          srcEl.title = srcTitle;
          srcEl.setAttribute('aria-label', srcTitle);
          srcEl.hidden = false;
        }
      }
      real.classList.add('cart-item--gift-in');
      /* Kelas animasinya dilepas setelah selesai supaya render ulang
         berikutnya tidak memutarnya lagi. */
      real.addEventListener('animationend', function handler(ev) {
        if (ev.target !== real) return;
        real.classList.remove('cart-item--gift-in');
        real.removeEventListener('animationend', handler);
      });
      parent.insertBefore(real, parent.firstChild);
    });
  }

  function paint(cart) {
    /* Payload cacat tidak boleh pernah menggerakkan DOM. Halaman error dan
       balasan 429 kadang lolos parse sebagai objek biasa; kalau itu sampai
       ke pruneGifts, `want` kosong dan SEMUA baris hadiah terhapus meski
       keranjang server baik-baik saja. Kontrak yang sama sudah dipakai
       MiniCart lewat window.isCartPayload — mesin ini kini ikut memakainya,
       dengan pemeriksaan cadangan bila snippet itu belum termuat. */
    var sane = typeof window.isCartPayload === 'function'
      ? window.isCartPayload(cart)
      : !!(cart && typeof cart === 'object' && Array.isArray(cart.items));
    if (!sane) return;
    pruneGifts(cart);
    insertGifts(cart);
    /* refreshCartUI ditunda melewati animasi keluar (180ms): recalcSavings
       membaca DOM, jadi memanggilnya saat baris basi masih terpasang membuat
       "You're saving" menampilkan nilai hadiah yang sudah pergi. */
    setTimeout(function () {
      if (typeof window.refreshCartUI === 'function') {
        try { window.refreshCartUI(cart); } catch (e) { /* abaikan */ }
      }
    }, 220);
  }

  /* seedCart: status keranjang yang sudah di tangan (seed Liquid saat muat
     halaman, atau respons /cart/change|update.js) — dipakai ulang supaya
     tidak perlu membaca ulang keranjang. */
  function runSync(seedCart) {
    var start = seedCart ? Promise.resolve(seedCart) : readCart();
    return start.then(function (cart) {
      lastCart = cart;
      /* Kuantitas hadiah MENGIKUTI kuantitas pemicunya: 2 kaleng Powder
         berhak atas 2 Bamboo Scoop. wanted = varian hadiah → total jumlah,
         dijumlah lintas pemicu (satu hadiah bisa dijanjikan beberapa paket). */
      var wanted = {};
      cart.items.forEach(function (item) {
        var gifts = MAP[String(item.variant_id)];
        if (gifts) gifts.forEach(function (g) {
          wanted[g] = (wanted[g] || 0) + item.quantity;
        });
      });

      /* Selaraskan baris hadiah yang ada. SEMUA baris yang varian-nya hadiah
         dianggap milik sistem ini — produk hadiah berharga 0 dan tidak dijual
         terpisah, jadi baris hadiah tanpa penanda _Gifted pun pasti berasal
         dari sini (penanda bisa hilang saat baris digabung atau saat baris
         lama dipulihkan dari sesi sebelumnya).

         Dulu baris tanpa penanda hanya bisa DIHAPUS (cabang want === 0) tapi
         tidak pernah bisa dikoreksi JUMLAHNYA, karena cabang kedua mensyaratkan
         `ours`. Baris seperti itu lalu terjebak di jumlah yang salah selamanya:
         giftsMatch tidak pernah lolos, gerbang checkout jatuh ke batas waktu
         4 detik pada setiap klik, dan pembeli tetap diloloskan membawa jumlah
         hadiah yang keliru. Perlakuannya kini konsisten dengan cabang hapus.

         Bila satu varian hadiah punya lebih dari satu baris, baris PERTAMA
         memikul seluruh jumlah dan sisanya dinolkan. Menyetel tiap baris ke
         `want` akan menghasilkan kelipatan dan tidak pernah konvergen. */
      var adjust = {};
      var assigned = {};
      cart.items.forEach(function (item) {
        var marked = !!(item.properties && item.properties._Gifted);
        var isGiftLine = marked || GIFTS[item.variant_id];
        if (!isGiftLine) return;
        var want = wanted[item.variant_id] || 0;
        /* Baris tanpa penanda dinolkan, bukan dikoreksi jumlahnya. Penanda
           itulah yang membuatnya dirender sebagai baris hadiah (badge GRATIS)
           baik oleh CartItemCard.liquid maupun <template> di atas; tanpa itu
           ia muncul sebagai baris biasa berharga Rp 0 lengkap dengan dropdown
           kuantitas. Kalau masih berhak, penggantinya ditambahkan lewat jalur
           `missing` di bawah — sudah membawa penanda. */
        if (want === 0 || !marked || assigned[item.variant_id]) {
          adjust[item.key] = 0;
          return;
        }
        assigned[item.variant_id] = true;
        if (item.quantity !== want) adjust[item.key] = want;
      });

      /* `present` hanya boleh menghitung baris yang BERTAHAN. Baris yang
         sedang dinolkan tidak boleh menutupi kekurangan: kalau ia terhitung
         hadir, jalur `missing` melewatinya dan hadiahnya lenyap sama sekali
         alih-alih diganti. Urutan di `work` sudah benar — update (menolkan)
         dijalankan sebelum add, jadi tidak pernah ada baris dobel. */
      var present = {};
      cart.items.forEach(function (item) {
        if (adjust[item.key] === 0) return;
        present[item.variant_id] = true;
      });
      var missing = Object.keys(wanted).filter(function (g) { return !present[g]; });

      if (!Object.keys(adjust).length && !missing.length) {
        if (awaiting) { awaiting = 0; clearSkeletons(); }
        /* Server sudah benar BUKAN berarti layar sudah benar. Sejak mutasi
           hadiah menumpang atomik pada mutasi pemicunya, putaran ini hampir
           selalu mendarat di sini dalam keadaan tidak ada yang perlu diubah —
           padahal tema hanya mem-patch baris yang pembeli sentuh, jadi label
           ×N baris hadiah (dan baris hadiah yatim setelah pemicunya dihapus)
           masih menampilkan keadaan lama. Cat ulang dari kebenaran server:
           murni operasi DOM, nol permintaan jaringan. */
        paint(cart);
        return null;
      }

      /* Semua penyetelan (hapus maupun ubah jumlah) digabung ke satu
         /cart/update.js. Endpoint ini menerima line key sebagai kunci
         (diuji langsung ke toko) dan mengembalikan keranjang penuh —
         satu permintaan sudah cukup. */
      var work = Promise.resolve(null);
      if (Object.keys(adjust).length) {
        work = work.then(function () {
          return post('/cart/update.js', { updates: adjust });
        });
      }
      if (missing.length) {
        work = work.then(function () {
          return post('/cart/add.js', {
            items: missing.map(function (g) {
              return { id: Number(g), quantity: wanted[g], properties: { _Gifted: 'true' } };
            })
          });
        });
        /* /cart/add.js hanya mengembalikan baris yang ditambahkan, bukan
           keranjang penuh, jadi di jalur ini pembacaan ulang wajib. */
        return work.then(function () { return readCart(); });
      }
      /* Jalur hapus-saja: /cart/update.js sudah mengembalikan keranjang
         penuh, jadi tidak perlu dibaca ulang. */
      return work;
    }).then(function (cart) {
      /* Cat ulang baris hadiah DULU, baru totalnya — kalau dibalik, total
         sempat dihitung saat baris basi masih terpasang. */
      if (cart) {
        lastCart = cart;
        paint(cart);
      }
      return null;
    });
    /* Sengaja tanpa .catch: errornya milik syncOnce. Skeleton dibiarkan
       selama percobaan ulang — prosesnya memang belum selesai. */
  }

  /* Kalau tetap gagal setelah semua percobaan, keranjang dibaca sekali lagi
     (satu percobaan, tetap lewat pemutus arus) supaya total di tombol
     checkout tidak tertinggal di angka lama — angka basi lebih berbahaya
     daripada baris yang telat hilang. */
  function syncOnce(seedCart) {
    return runSync(seedCart).catch(function () {
      giftTrack('gift_sync_failed', {
        gift_reason: lastFailStatus ? 'exhausted' : 'network',
        gift_status: lastFailStatus,
        gift_state: giftSummary(lastCart)
      });
      awaiting = 0;
      clearSkeletons();
      return withRetry(function () {
        return request('/cart.js', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json(); });
      }, 1)
        .then(function (cart) {
          lastCart = cart;
          paint(cart);
        })
        .catch(function () { /* keranjang benar-benar tak terjangkau */ });
    });
  }

  /* Seed milik putaran yang sedang antre. Digugurkan (null) bila pemicu
     kedua datang sebelum putarannya mulai — dua respons mutasi bisa
     mendarat di jendela microtask yang sama, dan seed pemicu pertama
     sudah basi terhadap pemicu kedua. Tanpa seed, putaran membaca
     /cart.js segar; harga kebenarannya satu permintaan ekstra, dan
     hanya di kasus langka itu. */
  var nextSeed = null;
  var nextSeedEpoch = 0;

  function sync(seedCart) {
    /* Pemicu yang datang saat satu putaran sudah antre tidak menambah
       antrean: putaran yang antre itu membaca status TERKINI saat mulai. */
    if (queued) {
      nextSeed = null;
      return chain;
    }
    queued = true;
    nextSeed = seedCart || null;
    nextSeedEpoch = cartEpoch;
    var run = function () {
      queued = false;
      roundBusy = true;
      var s = nextSeed;
      nextSeed = null;
      /* Seed hanya sah bila keranjang belum kita ubah sejak ia ditangkap.
         Kalau epoch-nya sudah bergerak, potret itu mendahului baris hadiah
         yang baru kita tulis — buang, dan bayar satu /cart.js segar. Itu
         harga yang jauh lebih murah daripada hadiah dobel di pesanan. */
      if (s && nextSeedEpoch !== cartEpoch) s = null;
      /* syncOnce tidak pernah reject (catch-nya menelan semua), tapi
         roundBusy tetap dipulihkan di kedua cabang — bendera yang
         tersangkut menyala berarti gerbang menahan sampai timeout terus. */
      return syncOnce(s).then(
        function (v) { roundBusy = false; return v; },
        function (err) { roundBusy = false; throw err; }
      );
    };
    chain = chain.then(run, run);
    return chain;
  }

  /* Total kuantitas tiap varian hadiah yang PANTAS ada untuk daftar baris
     ini — dijumlah lintas pemicu, kuantitas hadiah mengikuti pemicunya. */
  function wantedFor(items) {
    var wanted = {};
    items.forEach(function (it) {
      var gifts = MAP[String(it.variant_id != null ? it.variant_id : it.id)];
      if (gifts) gifts.forEach(function (g) {
        wanted[g] = (wanted[g] || 0) + (Number(it.quantity) || 1);
      });
    });
    return wanted;
  }

  var origFetch = window.fetch;
  window.fetch = function () {
    var url = arguments[0];
    var href = typeof url === 'string' ? url : (url && url.url) || '';
    var mine = internal > 0;

    if (mine || !/\/cart\/(add|change|update)(\.js)?/.test(href)) {
      /* Harus dipanggil dengan window sebagai this — fetch yang dilepas dari
         konteksnya melempar "Illegal invocation" di sebagian browser. */
      return origFetch.apply(window, arguments);
    }

    var isAdd = /\/cart\/add/.test(href);
    var origUrl = arguments[0];
    var origInit = arguments[1];
    var piggybacked = false;
    /* Apa yang sebenarnya DIMINTA pemanggil pada baris pemicu, kalau
       permintaannya ditulis ulang jadi update.js. Dipakai memverifikasi
       bahwa penulisan ulang itu benar-benar terjadi — lihat catatan di
       bawah `if (piggybacked)`. */
    var pbTarget = null;

    /* ===== Piggyback atomik =====
       Hadiah tidak lagi menyusul lewat permintaan kedua — ia MENUMPANG pada
       mutasi pemicunya sendiri:
       - add.js  : baris hadiah (delta terhadap keranjang terakhir) disisipkan
                   ke body permintaan yang sama. Satu round-trip, hadiah sudah
                   tertulis saat tema mengambil /cart?view=mini, barisnya ikut
                   dirender server-side oleh CartItemCard — animasi masuknya
                   satu paket dengan baris produknya, bukan susulan.
       - change.js pada baris PEMICU: ditulis ulang menjadi /cart/update.js
                   dengan penyesuaian baris hadiah bermarker digabung di
                   permintaan yang sama (kedua endpoint sama-sama membalas
                   keranjang penuh, jadi pemanggilnya tidak bisa membedakan).
       Delta dihitung dari potret lokal (lastCart), jadi bisa saja meleset —
       putaran verifikasi yang tetap berjalan sesudah respons adalah wasitnya,
       dan permintaan gabungan yang DITOLAK server diulang persis seperti
       aslinya di bawah, sehingga alur pembeli tidak pernah lebih buruk
       daripada tanpa piggyback. */
    try {
      var body = origInit && origInit.body;
      if (typeof body === 'string' && lastCart && lastCart.items) {
        var parsed = JSON.parse(body);
        if (isAdd && parsed && Object.prototype.toString.call(parsed.items) === '[object Array]') {
          var touchesGift = parsed.items.some(function (it) { return GIFTS[Number(it.id)]; });
          if (!touchesGift) {
            /* wanted sesudah add ini = hak dari isi keranjang + hak dari
               baris yang sedang ditambahkan; have = baris hadiah yang ada. */
            var wantedAfter = wantedFor(lastCart.items.concat(parsed.items));
            var have = {};
            lastCart.items.forEach(function (item) {
              if ((item.properties && item.properties._Gifted) || GIFTS[item.variant_id]) {
                have[item.variant_id] = (have[item.variant_id] || 0) + item.quantity;
              }
            });
            var extra = [];
            Object.keys(wantedAfter).forEach(function (g) {
              var need = wantedAfter[g] - (have[g] || 0);
              if (need > 0) extra.push({ id: Number(g), quantity: need, properties: { _Gifted: 'true' } });
            });
            if (extra.length) {
              cartEpoch++;
              arguments[1] = Object.assign({}, origInit, {
                body: JSON.stringify({ items: parsed.items.concat(extra) })
              });
              piggybacked = true;
            }
          }
        } else if (
          !isAdd && !/\/cart\/update/.test(href) &&
          parsed && parsed.quantity != null && (parsed.id != null || parsed.line != null)
        ) {
          var idx = -1;
          lastCart.items.forEach(function (item, i) {
            if (idx >= 0 || parsed.id == null) return;
            if (item.key === parsed.id || item.variant_id === Number(parsed.id)) idx = i;
          });
          if (idx < 0 && parsed.line != null) idx = Number(parsed.line) - 1;
          var target = lastCart.items[idx];
          if (target && MAP[String(target.variant_id)]) {
            var newQty = Number(parsed.quantity) || 0;
            var predictedItems = lastCart.items
              .map(function (item, i) {
                if (i !== idx) return item;
                return { variant_id: item.variant_id, key: item.key, quantity: newQty, properties: item.properties };
              })
              .filter(function (item) { return item.quantity > 0; });
            var wantedNow = wantedFor(predictedItems);
            var updates = {};
            updates[target.key] = newQty;
            /* Hanya baris hadiah BERMARKER yang ikut disetel di sini —
               update.js tidak bisa MENAMBAH baris, dan baris tanpa marker
               adalah urusan putaran verifikasi. Satu baris per varian:
               baris pertama memikul seluruh want (pola runSync). */
            var assignedPB = {};
            lastCart.items.forEach(function (item) {
              if (!(item.properties && item.properties._Gifted)) return;
              if (assignedPB[item.variant_id]) return;
              assignedPB[item.variant_id] = true;
              var want = wantedNow[item.variant_id] || 0;
              if (item.quantity !== want) updates[item.key] = want;
            });
            if (Object.keys(updates).length > 1) {
              cartEpoch++;
              /* Yang direkam bukan cuma kuncinya: juga jumlah varian ini
                 SEBELUM permintaan, supaya sesudahnya bisa dinilai apakah
                 servernya benar-benar bergerak — kunci baris bisa saja
                 berganti dan membuat pencocokan per-kunci buta. */
              var pbBefore = 0;
              lastCart.items.forEach(function (item) {
                if (item.variant_id === target.variant_id) pbBefore += item.quantity;
              });
              pbTarget = {
                key: target.key,
                variant_id: target.variant_id,
                prevQty: target.quantity,
                quantity: newQty,
                beforeTotal: pbBefore
              };
              arguments[0] = href.replace(/\/cart\/change(\.js)?/, '/cart/update.js');
              arguments[1] = Object.assign({}, origInit, {
                body: JSON.stringify({ updates: updates })
              });
              piggybacked = true;
            }
          }
        }
      }
    } catch (e) { piggybacked = false; pbTarget = null; arguments[0] = origUrl; arguments[1] = origInit; }

    var result = origFetch.apply(window, arguments);

    if (piggybacked) {
      result = result.then(function (res) {
        if (!res.ok) {
          /* Permintaan gabungan ditolak (potret lokal basi, key hilang, dll):
             ulangi persis permintaan asli si tema. Hadiahnya dibereskan
             putaran verifikasi seperti biasa. */
          giftTrack('gift_sync_failed', {
            gift_reason: 'piggyback_rejected',
            gift_status: res.status,
            gift_state: giftSummary(lastCart)
          });
          return origFetch.call(window, origUrl, origInit);
        }
        if (!pbTarget) return res;
        /* 200 BELUM tentu permintaannya dikerjakan. change.js menjawab 404
           kalau line key-nya tak dikenal — keras, dan pemanggilnya tahu.
           update.js, yang kita tukar di atas, MENGABAIKAN kunci tak dikenal
           tanpa error sama sekali. Jadi penulisan ulang ini bisa mengubah
           "hapus gagal dengan jujur" menjadi "hapus gagal diam-diam": server
           tetap memegang barangnya sementara pemanggilnya mengira berhasil.
           Maka hasilnya diperiksa terhadap apa yang tadi diminta.

           Barisnya sudah tidak ada, atau kuncinya berubah? Jangan menebak —
           serahkan ke putaran verifikasi. Yang diulang hanya kasus yang jelas:
           barisnya masih ada persis dengan kuncinya, dan jumlahnya tidak
           berubah menjadi yang diminta. */
        return res.clone().json().then(function (cart) {
          if (!cart || !cart.items) return res;
          /* Diukur per VARIAN, bukan per kunci: kunci baris bisa berganti dan
             pencocokan per-kunci akan salah menyimpulkan "barisnya hilang".
             Jumlah varian tidak bergerak sedikit pun padahal yang diminta
             memang perubahan jumlah = permintaannya diabaikan. */
          var after = 0;
          for (var i = 0; i < cart.items.length; i++) {
            if (cart.items[i].variant_id === pbTarget.variant_id) after += cart.items[i].quantity;
          }
          if (pbTarget.prevQty === pbTarget.quantity) return res;
          if (after !== pbTarget.beforeTotal) return res;
          giftTrack('gift_sync_failed', {
            gift_reason: 'piggyback_ignored',
            gift_status: res.status,
            gift_state: giftSummary(lastCart)
          });
          return origFetch.call(window, origUrl, origInit);
        }, function () { return res; });
      });
    }

    /* Responsnya TIDAK ditahan: drawer harus terbuka secepat biasanya.
       Skeleton hanya untuk jalur yang TIDAK bisa ditumpangi (body bukan
       JSON items) — pada jalur piggyback baris hadiahnya sudah ikut
       dirender server bersama baris produknya. */
    try {
      if (isAdd && !piggybacked && typeof (origInit && origInit.body) === 'string') {
        var parsedSk = JSON.parse(origInit.body);
        var incomingSk = parsedSk.items || [parsedSk];
        var expect = {};
        incomingSk.forEach(function (it) {
          var gifts = MAP[String(it.id)];
          if (gifts) gifts.forEach(function (g) { expect[g] = true; });
        });
        var n = Object.keys(expect).length;
        if (n) { awaiting = n; ensureSkeletons(); armSkeletonTTL(); }
      }
    } catch (e) { /* payload tak terbaca: lewati skeleton, sinkronisasi tetap jalan */ }

    /* Dihitung SEKARANG (sinkron), bukan saat balasannya tiba: pembeli bisa
       menekan checkout di tengah round-trip mutasi, dan gerbang harus sudah
       tahu ada sinkronisasi yang menyusul. */
    pendingMuts++;
    var settle = function () { if (pendingMuts > 0) pendingMuts--; };

    result.then(function (res) {
      /* /cart/change.js dan /cart/update.js sudah membawa keranjang penuh
         di badannya — dipakai ulang sebagai seed supaya sinkronisasi tidak
         membaca ulang. /cart/add.js hanya membawa baris yang ditambahkan,
         jadi jalur itu tetap membaca sendiri. */
      if (!isAdd && res.ok) {
        res.clone().json().then(
          function (cart) { sync(cart && cart.items ? cart : null).then(settle, settle); },
          function () { sync().then(settle, settle); }
        );
      } else {
        sync().then(settle, settle);
      }
    }).catch(function () { awaiting = 0; clearSkeletons(); settle(); });
    return result;
  };

  /* Muat halaman: seed Liquid sudah memuat status keranjang saat render,
     jadi pemeriksaan awal tidak menyentuh jaringan sama sekali. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { sync(seed); });
  } else {
    sync(seed);
  }

  /* Halaman yang dipulihkan dari bfcache tidak menjalankan DOMContentLoaded,
     dan seed-nya sudah basi — baca ulang sungguhan. */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    /* Restorasi bfcache (kembali dari checkout): overlay loading milik
       gerbang checkout ikut terbekukan di snapshot halaman — matikan dulu,
       bersihkan tombol yang tertinggal sibuk, baru sinkronkan keranjang.
       Tanpa ini drawer terlihat "loading tak berhenti" selamanya. */
    if (typeof window.cartHideLoading === 'function') {
      try { window.cartHideLoading(); } catch (err) { /* abaikan */ }
    }
    document.querySelectorAll('.uc-add[data-busy]').forEach(function (b) {
      b.removeAttribute('data-busy');
    });
    document.querySelectorAll('.atc-btn.is-adding').forEach(function (b) {
      b.classList.remove('is-adding');
      b.removeAttribute('aria-busy');
      /* innerHTML dulu, baru teks. Tombol kartu varian v2 berisi elemen anak
         (label huruf besar, <s> harga coret, dan simpul sasaran syncAtc);
         memulihkan lewat textContent meratakannya jadi satu simpul teks dan
         membuat harga di tombol berhenti mengikuti paket yang dipilih.
         Markup aslinya disimpan MiniCart.liquid di properti _idleHTML. */
      if (b._idleHTML != null) b.innerHTML = b._idleHTML;
      else if (b.dataset.idleLabel) b.textContent = b.dataset.idleLabel;
    });
    awaiting = 0;
    clearSkeletons();
    /* Heap hasil restorasi bfcache membawa lastCart LAMA — potret sebelum
       pembeli pergi ke checkout. Server bisa saja sudah bergeser selama
       halaman tertidur, dan gerbang yang mempercayai potret itu meloloskan
       klik checkout kedua membawa keranjang yang salah (QA G5c). Nol-kan:
       giftsMatch(null) = false, jadi klik ditahan sampai pembacaan segar
       di bawah selesai — paling lama sebatas timeout 4 detik gerbang. */
    lastCart = null;
    sync();
  });

  /* ===== Gerbang checkout =====
     Order #9844 lolos membawa hadiah ×2: pembeli menurunkan kuantitas
     pemicu 2→1 lalu menekan checkout sebelum koreksi jumlah hadiah selesai —
     submit form tidak menunggu siapa pun, dan halaman keburu dibongkar.

     Aturannya: klik lewat tanpa hambatan HANYA bila tidak ada sinkronisasi
     menggantung DAN status keranjang terakhir yang diketahui lolos
     giftsMatch — baris hadiah persis sesuai patokan gift_map. Jalur cepat
     ini murni komputasi lokal, nol permintaan jaringan. Selain itu, klik
     ditahan, overlay loading milik tema ditampilkan, disinkronkan (dan
     diverifikasi ulang; satu kali baca segar bila masih meleset), lalu
     klik diteruskan.

     Batas tunggu 4 detik: kalau keranjang tak terjangkau (mis. jendela
     429), pembeli TETAP diloloskan checkout — hadiah selalu Rp 0, jadi
     skenario terburuknya baris gratis kelebihan, bukan salah tagih;
     kehilangan pembelian karena tombol macet jauh lebih mahal. */
  var gatePass = false;
  document.addEventListener('click', function (e) {
    var t = e.target;
    var btn = t && t.closest && t.closest('[name="checkout"], a[href*="/checkout"]');
    if (!btn) return;
    if (gatePass) { gatePass = false; return; }
    if (!pendingMuts && !queued && !roundBusy && giftsMatch(lastCart)) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof window.cartShowLoading === 'function') {
      try { window.cartShowLoading(); } catch (err) { /* abaikan */ }
    }

    var done = false;
    var go = function () {
      if (done) return;
      done = true;
      gatePass = true;
      /* Render ulang drawer bisa mengganti node tombolnya — cari padanan
         yang masih hidup sebelum meneruskan klik. */
      var live = document.contains(btn)
        ? btn
        : document.getElementById('cart-checkout-btn');
      if (live) {
        live.click();
      } else if (typeof window.cartHideLoading === 'function') {
        try { window.cartHideLoading(); } catch (err) { /* abaikan */ }
      }
    };

    var retried = false;
    (function waitVerified() {
      if (done) return;
      if (!pendingMuts && !queued && !roundBusy) {
        if (giftsMatch(lastCart)) return go();
        /* Sudah tenang tapi masih meleset dari patokan: satu kali paksa
           putaran tanpa seed (baca /cart.js segar + perbaiki). Kalau
           setelah itu tetap meleset, timeout 4 detik yang memutuskan —
           hadiah selalu Rp 0, pembeli tidak boleh tertahan. */
        if (!retried) { retried = true; sync(); }
      }
      setTimeout(waitVerified, 100);
    })();
    setTimeout(function () {
      if (done) return;
      /* Inilah jalur G6 yang tidak bisa ditutup dari sisi klien: keranjang
         tak terjangkau, dan pembeli SENGAJA dilepas karena hadiah selalu
         Rp 0. Yang selama ini hilang adalah catatannya. */
      giftTrack('gift_gate_timeout', {
        gift_state: giftSummary(lastCart),
        gift_pending_muts: pendingMuts,
        gift_queued: queued ? 1 : 0,
        gift_round_busy: roundBusy ? 1 : 0,
        gift_breaker: cooldownUntil > Date.now() ? 1 : 0,
        gift_last_status: lastFailStatus
      });
      go();
    }, 4000);
  }, true);
})();
