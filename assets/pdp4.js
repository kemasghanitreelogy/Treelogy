/* ===========================================================================
   pdp4 — perilaku halaman produk, port dari blok <script> berkas rujukan
   `treelogy-capsules-pdp-single-file.html` (folder PDP_OMC_2026).

   Blok skrip di rujukan itu pendek, dan setiap perilaku di bawah ini adalah
   salinan langsungnya: kartu alasan yang berganti, thumbnail galeri, video
   yang hanya berputar di slide yang terlihat, dialog BPOM, bilah menempel, dan
   video "cara meminumnya" yang berhenti di luar layar.

   Yang DITAMBAHKAN — dan hanya ini — adalah hal-hal yang tidak mungkin ada di
   sebuah berkas HTML tunggal:

     • kartu paket harus benar-benar mengubah varian yang dibeli, bukan cuma
       menulis ulang angka di layar;
     • section "pilih alasanmu" harus dipindahkan ke dalam kolom hero, karena
       section Shopify tidak bisa bersarang;
     • bilah menempel harus lepas dari pembungkus section-nya;
     • widget ulasan Judge.me datang belakangan, dan kartunya baru bisa
       digambar sesudah ia selesai merender;
     • akordeon FAQ dianimasikan, karena `<details>` bawaan melompat.

   Yang SENGAJA TIDAK diport dari rujukan: penukar judul `?h=a`. Ia
   menyuntikkan satu kalimat Inggris yang dituliskan keras ke dalam skrip, dan
   sebuah halaman toko sungguhan tidak boleh punya judul yang bisa diganti
   siapa pun lewat parameter URL. Kalau varian judul itu memang mau diuji,
   tempatnya aplikasi A/B test yang sudah dipakai toko ini.

   Yang juga TIDAK ada lagi dibanding generasi sebelumnya: Lenis dan animasi
   reveal. Rujukan generasi ini tidak memuat keduanya, dan keduanya membawa
   ongkosnya sendiri — Lenis mencegat gulir drawer keranjang, reveal menggeser
   posisi absolut sasaran anchor saat guliran sedang berjalan. Guliran halus
   sekarang milik browser (`html{scroll-behavior:smooth}`).
   =========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return [].slice.call((ctx || document).querySelectorAll(sel)); }

  var decoder = document.createElement('textarea');
  /* BUG yang pernah terjadi: chip berbunyi "Blood sugar &amp; cholesterol" dan
     badan kartu "the body&#39;s inflammatory balance".

     Sebabnya DUA kali escape. Isi kartu bisa datang dari dua sumber: setting
     section (mentah) atau berkas locale lewat filter `t` — dan `t` sudah
     meng-escape HTML sendiri. Yang sudah ter-escape lalu di-escape lagi di
     sini, sehingga `&` menjadi `&amp;amp;` dan terbaca sebagai `&amp;`.

     Jadi nilainya dinormalkan dulu: dibaca balik jadi teks polos, baru
     di-escape sekali. Idempoten, jadi benar untuk kedua sumber tanpa perlu
     tahu yang mana. */
  function unesc(s) { decoder.innerHTML = String(s == null ? '' : s); return decoder.value; }
  /* Pekerjaan yang boleh menunggu: sesudah `load`, saat browser senggang.
     Dipakai galeri (memasang slide sisa) dan ulasan (menarik ke-200-nya). */
  function afterLoadIdle(fn) {
    function idle() {
      if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 4000 });
      else window.setTimeout(fn, 1500);
    }
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle);
  }
  function esc(s) {
    return unesc(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* Escape untuk teks yang TIDAK pernah lewat filter `t` — mis. isi yang
     dibaca dari DOM widget Judge.me. Menormalkan yang ini akan mengubah
     "&amp;" yang memang ditulis pembeli menjadi "&". */
  function escRaw(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* --- section "pilih alasanmu" pindah ke kolom hero -------------------------
     Di rujukan ia berada DI DALAM kolom kanan hero: di situlah kolom itu
     menjadi cukup tinggi sehingga galerinya bisa menempel sementara teksnya
     bergulir. Section Shopify tidak bisa bersarang, jadi pemindahannya di
     sini.

     Yang dipindahkan adalah PEMBUNGKUS `.shopify-section`-nya, bukan
     section-nya sendiri: theme editor mengganti isi pembungkus itu utuh saat
     merender ulang, dan simpul yang dipindah dari dalamnya akan hilang pada
     penyuntingan pertama.

     Urutan DOM di ponsel sama sebelum dan sesudah pemindahan (hero, lalu
     alasan), jadi halaman tetap benar kalau skrip ini gagal muat. */
  function initRouterSlot() {
    var slot = $('[data-pdp4-router-slot]');
    var sec = $('#pdp4-router');
    if (!slot || !sec) return;
    var wrap = sec.closest('.shopify-section') || sec.parentElement;
    if (!wrap || wrap === slot.parentElement) return;
    slot.hidden = false;
    slot.appendChild(wrap);
  }

  /* --- kartu alasan ---------------------------------------------------------
     Sembilan kartu, satu yang terlihat. Digambar di sisi klien persis seperti
     rujukan: merender kesembilannya lalu menyembunyikan delapan akan membuat
     pembaca layar dan mesin pencari membaca sembilan salinan isi yang saling
     bertabrakan. */
  function initRouter() {
    var chips = $('#pdp4-chips');
    var rcard = $('#pdp4-rcard');
    var data = $('[data-pdp4-routes]');
    if (!chips || !rcard || !data) return;

    var routes;
    try { routes = JSON.parse(data.textContent); } catch (e) { return; }
    if (!routes || !routes.length) return;

    function jsonFrom(sel, fallback) {
      var el = $(sel);
      if (!el) return fallback;
      try { return JSON.parse(el.textContent) || fallback; } catch (e) { return fallback; }
    }
    var cta = jsonFrom('[data-pdp4-router-cta]', '');
    var meta = jsonFrom('[data-pdp4-router-meta]', '');

    /* Chip mana yang terpilih saat halaman dibuka, dan dari mana asalnya.

       Tiga sumber, berurutan dari yang paling disengaja:

         1. `?r=<id>`      — dipakai halaman ini sendiri saat pembeli memilih
                             chip, dan oleh tautan yang menunjuk satu alasan.
         2. `utm_content`  — iklan yang membawa pembeli ke sini. Nilainya JUDUL
                             CHIP dalam huruf kecil semua, mis.
                             `utm_content=stiff mornings`.
         3. chip pertama   — kalau tidak ada keduanya.

       Pencocokannya dinormalkan, bukan disamakan mentah-mentah: sebuah UTM
       melewati pembuat kampanye, URL encoder, dan kadang tangan manusia, jadi
       spasi bisa sampai sebagai `%20`, `+`, `-`, atau `_`, dan `&` di
       "Blood sugar & cholesterol" bisa datang sebagai kata "and" atau hilang
       sama sekali. Yang dibandingkan adalah bentuk yang sudah dilucuti:
       huruf kecil, pemisah apa pun jadi satu spasi, `&` jadi "and", sisanya
       dibuang. Dicocokkan ke ID rute lebih dulu, baru ke judul chipnya. */
    function normKey(v) {
      return unesc(v).toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[\s+_\-]+/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    var qs = new URLSearchParams(location.search);
    function pick() {
      var r = qs.get('r');
      if (r && routes.some(function (x) { return x.id === r; })) return r;

      var utm = qs.get('utm_content');
      if (utm) {
        var key = normKey(utm);
        if (key) {
          var byId = routes.filter(function (x) { return normKey(x.id) === key; })[0];
          if (byId) return byId.id;
          var byChip = routes.filter(function (x) { return normKey(x.chip) === key; })[0];
          if (byChip) return byChip.id;
        }
      }
      return routes[0].id;
    }
    var active = pick();

    /* Judul kartu memakai penanda `|` yang sama dengan judul section — lihat
       snippets/pdp4-sentence-lines.liquid. Di sana Liquid yang menerjemahkannya
       jadi `<br class="brm">`; di sini JS, karena kartunya digambar setelah
       halaman jadi. Satu konvensi, dua tempat yang menerapkannya. */
    function brm(s) {
      return esc(s).split('|').map(function (x) { return x.trim(); })
        .filter(Boolean).join('<br class="brm"> ');
    }

    function renderChips() {
      chips.innerHTML = routes.map(function (r) {
        return '<label class="sk-chip sk-chip--sm"><input type="radio" name="pdp4-door" value="' +
          esc(r.id) + '"' + (r.id === active ? ' checked' : '') + '>' + esc(r.chip) + '</label>';
      }).join('');
    }

    function renderCard() {
      var r = routes.filter(function (x) { return x.id === active; })[0];
      if (!r) return;
      var html = '<h3 class="sk-h3">' + brm(r.title) + '</h3>';
      if (r.body) html += '<p class="sk-body sk-text-secondary">' + esc(r.body) + '</p>';
      if (r.quote) html += '<blockquote class="sk-body pdp-inline-quote" style="margin:0">' + esc(r.quote) + '</blockquote>';
      if (r.who) {
        /* Kartu ditutup penulisnya. Yang punya foto memakai fotonya; sisanya
           jatuh ke huruf pertama namanya — bulatan yang sama, isi yang
           berbeda, jadi barisnya tidak pernah kosong. */
        var face = r.photo
          ? '<img src="' + esc(r.photo) + '" alt="" width="32" height="32" loading="lazy">'
          : esc(r.who.charAt(0));
        html += '<div class="pdp-who sk-small sk-text-secondary"><span class="pdp-avatar">' + face + '</span>' +
          esc(r.who) + (meta ? ' · ' + esc(meta) : '') + '</div>';
      }
      if (cta) html += '<a class="sk-btn sk-btn--text" href="#pdp4-packs">' + esc(cta) + '</a>';
      rcard.innerHTML = html;
    }

    renderChips();
    renderCard();

    chips.addEventListener('change', function (e) {
      if (!e.target.matches('input[name="pdp4-door"]')) return;
      active = e.target.value;
      renderCard();
      /* `replaceState`, bukan `pushState`: memilih alasan bukan navigasi, dan
         tombol Kembali tidak boleh menelusuri sembilan chip sebelum keluar
         dari halaman. */
      /* BUG yang pernah ada di baris ini: ia menulis ulang SELURUH query
         string menjadi `?r=...`, sehingga `utm_source`, `utm_medium`, dan
         `utm_content` lenyap dari URL begitu pembeli menyentuh satu chip.
         Sekarang parameter yang sudah ada dipertahankan dan hanya `r` yang
         disetel. */
      qs.set('r', active);
      history.replaceState(null, '', location.pathname + '?' + qs.toString() + '#pdp4-router');
    });
  }

  /* --- paket: angka DAN varian ----------------------------------------------
     Rujukan hanya menulis ulang tiga angka. Di sini pilihannya juga harus
     sampai ke keranjang, jadi tiga hal tema ikut disetel:

       #productSelect      — tempat tema membaca varian terpilih. Perubahannya
                             DISIARKAN (`change`), tidak disetel diam-diam:
                             harga langganan dan event select_variant GTM
                             menggantung di select yang sama.
       #AddToCart          — `data-variant` yang dibaca handler quick-add.
       .disabled-opacity   — paket habis stok. */
  function initPacks() {
    var form = $('#AddToCartForm');
    if (!form) return;
    var inputs = $$('input[name="pack"]', form);
    if (!inputs.length) return;

    var price = $('#pdp4-atc-price');
    var pdHero = $('#pdp4-pd-hero');
    var pdSticky = $('#pdp4-pd-sticky');
    var select = $('#productSelect');
    var atc = $('#AddToCart');

    function apply() {
      var i = form.querySelector('input[name="pack"]:checked');
      if (!i) return;
      if (price) price.textContent = i.dataset.price || '';
      if (pdHero && i.dataset.pd) pdHero.textContent = i.dataset.pd;
      if (pdSticky && i.dataset.pd) pdSticky.textContent = i.dataset.pd;

      if (select && select.value !== i.value) {
        select.value = i.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (atc) {
        atc.dataset.variant = i.value;
        atc.classList.toggle('disabled-opacity', i.dataset.available === 'false');
      }
    }

    form.addEventListener('change', apply);
    apply();
  }

  /* --- galeri ---------------------------------------------------------------
     Thumbnail menggeser trek; trek yang bergeser memperbarui thumbnail dan
     memutar video slide yang sedang terlihat. Video di slide lain DIJEDA:
     delapan video yang berputar bersamaan di ponsel adalah delapan dekoder
     yang menyala sekaligus. */
  function initGallery() {
    var slides = $('#pdp4-slides');
    if (!slides) return;
    var thumbs = $$('#pdp4-thumbs button');
    var vids = $$('video', slides);
    if (reduce) vids.forEach(function (v) { v.removeAttribute('autoplay'); v.pause(); });

    /* --- media dipasang saat mendekat ---------------------------------------
       Markup hanya membawa `src` untuk slide pertama (elemen LCP). Sisanya —
       gambar dan video — diparkir di `data-src`/`data-srcset` dan dipasang di
       sini: slide aktif beserta tetangga kiri-kanannya, supaya gesekan
       berikutnya sudah siap. Sebelumnya semua slide + tiga video (≈1,8 MB)
       terunduh saat halaman lahir dan menunda gambar hero sampai 13 detik
       pada 4G lambat. Sisanya dipasang belakangan, saat browser senggang
       sesudah `load`, agar melompat lewat thumbnail tetap seketika. */
    var settled = false;
    function hydrate(j) {
      var sl = slides.children[j];
      if (!sl) return;
      var img = sl.querySelector('img[data-src]');
      if (img) {
        if (img.dataset.srcset) { img.srcset = img.dataset.srcset; img.removeAttribute('data-srcset'); }
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }
      var v = sl.querySelector('video[data-src]');
      if (v) {
        if (v.dataset.poster) { v.poster = v.dataset.poster; v.removeAttribute('data-poster'); }
        v.src = v.dataset.src;
        v.removeAttribute('data-src');
        /* `preload="none"` dipertahankan: unduhan baru mulai saat `play()`
           di syncVideos(), yaitu saat slide-nya aktif. Poster mengisi jeda. */
      }
    }
    function hydrateAround(i) { hydrate(i - 1); hydrate(i); hydrate(i + 1); }
    /* Sesudah senggang hanya GAMBAR yang dipasang. Video dibiarkan sampai
       slide-nya benar-benar aktif: ketiganya 825 KB, dan memasang `src` +
       preload di tetangga saja sudah membuat Chrome mengunduh semuanya. */
    function hydrateRest() {
      settled = true;
      for (var j = 0; j < slides.children.length; j++) {
        if (slides.children[j].querySelector('img[data-src]')) hydrate(j);
      }
    }
    afterLoadIdle(hydrateRest);

    function syncVideos() {
      if (reduce) return;
      var i = Math.round(slides.scrollLeft / slides.clientWidth);
      [].slice.call(slides.children).forEach(function (sl, j) {
        var v = sl.querySelector('video');
        if (!v) return;
        if (j === i) {
          if (v.dataset.src) hydrate(j);
          var p = v.play(); if (p && p.catch) p.catch(function () {});
        }
        else { v.pause(); }
      });
    }

    thumbs.forEach(function (b, i) {
      b.addEventListener('click', function () {
        hydrateAround(i);
        slides.scrollTo({ left: i * slides.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
      });
    });

    slides.addEventListener('scroll', function () {
      var i = Math.round(slides.scrollLeft / slides.clientWidth);
      thumbs.forEach(function (b, j) { b.setAttribute('aria-current', String(i === j)); });
      hydrateAround(i);
      syncVideos();
    }, { passive: true });

    hydrateAround(0);
    syncVideos();
  }

  /* --- dialog registrasi BPOM ----------------------------------------------
     Rujukan memakai atribut `open` pada `<div class="pdp-modal">`, bukan kelas
     — dan CSS-nya (`.pdp-modal[open]{display:grid}`) menunggu atribut itu.
     Ia BUKAN `<dialog>` di rujukan, jadi fokus dan Escape dipasang tangan. */
  function initModal() {
    var modal = $('#pdp4-bpom-modal');
    var open = $('#pdp4-bpom-btn');
    var close = $('#pdp4-bpom-close');
    if (!modal || !open) return;
    open.addEventListener('click', function () {
      modal.setAttribute('open', '');
      if (close) close.focus();
    });
    if (close) close.addEventListener('click', function () { modal.removeAttribute('open'); open.focus(); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.removeAttribute('open'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.hasAttribute('open')) { modal.removeAttribute('open'); open.focus(); }
    });
  }

  /* --- bilah menempel: tuan rumahnya <body> ---------------------------------
     Ia `position:fixed`, dan leluhur ber-`transform` atau ber-`filter` menjadi
     containing block bagi keturunannya, sehingga `position:fixed` berhenti
     mengukur diri dari viewport. Di dalam pembungkus section mana pun risiko
     itu selalu ada; di <body> tidak pernah.

     Yang dipindahkan adalah pembungkus `[data-pdp4-sticky-host]`, bukan
     bilahnya sendiri — pembungkus itu yang membawa kelas `.pdp4-page sk-root`
     tempat seluruh token dan gaya dasar hidup, dan bilah yang lepas darinya
     kehilangan warna, ukuran, dan bentuknya sekaligus. */
  function initStickyHost() {
    var host = $('[data-pdp4-sticky-host]');
    if (!host) return;
    if (host.parentElement !== document.body) document.body.appendChild(host);

    /* Tombol bilah sticky di rujukan hanya tautan `#packs`. Permintaan user
       8 Sep (dipertahankan): langsung menambah ke keranjang. Yang diklik
       adalah `#AddToCart` yang asli — sudah membawa varian paket yang sedang
       dipilih — sehingga seluruh koreografi MiniCart (kartu optimistis,
       drawer terbuka, pelacakan add_to_cart) berjalan persis seperti dari
       tombol utama. href tetap dipertahankan sebagai cadangan tanpa
       JavaScript. */
    var btn = host.querySelector('.pdp-sticky .sk-btn');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      var atc = $('#AddToCart');
      if (!atc) return; /* tanpa tombol utama, biarkan tautannya bekerja */
      e.preventDefault();
      e.stopImmediatePropagation();
      atc.click();
    });
  }

  /* --- bilah beli menempel --------------------------------------------------
     Selain menyalakan bilahnya, ia mengumumkan tinggi bilah ke CSS lewat
     `--p3-sticky-h` dan menandai `body.p3-sticky-on`. Nama keduanya sengaja
     TETAP `p3-`: snippets/klaviyo-teaser.liquid membacanya, snippet itu
     dipakai bersama tema live, dan mengganti namanya di sini berarti teaser
     Klaviyo duduk persis di atas tombol beli lagi.

     Tingginya diumumkan, bukan ditulis ulang sebagai angka di berkas lain,
     supaya tinggi ponsel/desktop tidak perlu dijaga di dua tempat. */
  function initSticky() {
    var sticky = $('#pdp4-sticky');
    var packs = $('#pdp4-packs');
    if (!sticky || !packs) return;
    var root = document.documentElement;
    /* Nilai terakhir diingat supaya tiap peristiwa gulir tidak menulis ulang
       atribut dan custom property yang isinya sama. Lihat catatan di
       initAnchors(): menulis ke <html> tiap frame gulir MEMATIKAN galeri yang
       menempel. */
    var lastOn = null, lastH = null;
    function sync() {
      var on = packs.getBoundingClientRect().bottom < 0;
      if (on !== lastOn) { lastOn = on; sticky.setAttribute('data-on', String(on)); }
      else if (lastH !== null) { return; }
      /* Tingginya diukur DULU, dan nol berarti bilahnya memang tidak ada di
         lebar ini (`.pdp-sticky{display:none}` di >=960px). Penanda teaser
         hanya dipasang kalau bilahnya benar-benar menempati ruang — tanpa
         syarat itu teaser Klaviyo terangkat 74px di desktop demi bilah yang
         tidak pernah tergambar di sana. */
      var h = Math.round(sticky.getBoundingClientRect().height);
      document.body.classList.toggle('p3-sticky-on', on && h > 0);
      if (h && h !== lastH) { lastH = h; root.style.setProperty('--p3-sticky-h', h + 'px'); }
    }
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
    window.setTimeout(sync, 300);
  }

  /* --- bilah pengumuman menyusut, header jadi kaca --------------------------
     Permintaan user 9 Sep, HANYA untuk halaman ini. Gaya-nya ada di pdp4.css;
     yang dikerjakan di sini cuma dua hal yang tidak bisa dilakukan CSS:
     mengukur tinggi asli bilahnya (transisi tinggi butuh dua nilai pasti,
     `auto` bukan salah satunya) dan menyalakan penandanya saat digulir.

     Penandanya dipasang di <html>, bukan di header, supaya seluruh aturan bisa
     digerbangi satu kelas. Cakupannya sendiri sudah dijamin berkas: pdp4.css
     hanya dimuat oleh halaman ini, jadi header di halaman lain tidak pernah
     melihat satu pun aturannya.

     Ambangnya bukan nol: pembaca yang menggeser satu-dua piksel tidak sedang
     menggulir, dan menyalakan-mematikan di angka yang sama membuat bilahnya
     berkedip. Jadi ia menyusut sesudah 8px dan baru kembali penuh di 2px. */
  function initNav() {
    var header = document.querySelector('header.header-nav');
    if (!header) return;
    var announce = header.querySelector('.running-text');
    if (!announce) return;
    var root = document.documentElement;

    /* Diukur dengan aturan SENDIRI dimatikan lebih dulu.

       BUG yang sudah terjadi sekali: `measure()` membaca tinggi header yang
       tingginya justru DITENTUKAN oleh angka hasil bacaan itu
       (`height: var(--pdp4-nav-full)`). Sekali ia menangkap nilai di tengah
       transisi, nilai itu terkunci jadi tinggi baru, lalu bacaan berikutnya
       menangkapnya lagi — header menyusut dari 95px ke 15px dalam dua putaran
       dan tidak pernah kembali (terukur 9 Sep).

       Jadi kelasnya dilepas dulu, kotaknya dibaca dalam keadaan apa adanya,
       baru kelasnya dipasang lagi. Keduanya di dalam satu tugas yang sama:
       browser memang menghitung ulang tata letak di antaranya, tapi tidak
       pernah menggambar, jadi tidak ada yang berkedip. `pdp4-nav-measuring`
       mematikan transisinya supaya pemasangan ulang itu tidak dianimasikan. */
    function measure() {
      var sized = root.classList.contains('pdp4-nav-sized');
      var slim = root.classList.contains('pdp4-nav-slim');
      root.classList.add('pdp4-nav-measuring');
      root.classList.remove('pdp4-nav-sized', 'pdp4-nav-slim');
      var f = Math.round(header.getBoundingClientRect().height);
      var a = Math.round(announce.getBoundingClientRect().height);
      if (sized) root.classList.add('pdp4-nav-sized');
      if (slim) root.classList.add('pdp4-nav-slim');
      /* Dibaca sekali lagi supaya kelas yang baru dipasang sudah ikut
         terhitung sebelum transisinya dinyalakan kembali. */
      void header.offsetHeight;
      root.classList.remove('pdp4-nav-measuring');
      if (f > 0) root.style.setProperty('--pdp4-nav-full', f + 'px');
      if (a > 0) root.style.setProperty('--pdp4-announce-h', a + 'px');
    }

    measure();
    /* Hanya urusan TINGGI yang menunggu kelas ini. Warna, kaca, dan garis
       sudah berlaku sejak CSS terurai — kalau ikut menunggu skrip ber-`defer`
       ini, pembeli sempat melihat warna bawaan tema lebih dulu. Lihat catatan
       di pdp4.css. */
    root.classList.add('pdp4-nav-sized');

    var slim = false;
    /* AMBANGNYA = TINGGI BILAH PENGUMUMAN, bukan angka kecil.

       Header ini `position:fixed` dan tema memberi konten jarak atas TETAP
       setinggi header penuh (95px). Jadi saat halaman digulir sejauh `y`,
       atas konten ada di `95 - y`, sementara bawah header melompat ke 55px
       begitu bilahnya menyusut. Dengan ambang 8px, seluruh rentang
       8 < y < 40 menyisakan pita kosong setinggi `40 - y` di antara
       keduanya — terukur 28px di y=12 — dan pita itu memperlihatkan latar
       halaman sebagai jalur pucat di bawah header. Persis itu yang dilaporkan
       user 10 Sep saat menggulir balik ke atas.

       Dengan ambang = tinggi bilah pengumuman, header baru menyusut TEPAT
       ketika konten sudah naik sejauh itu, jadi bawah header dan atas konten
       bertemu (celah 0) lalu saling menimpa. Efeknya juga lebih jujur:
       bilahnya seolah tergulir keluar, bukan mengerut di tempat.

       Histeresis dijaga 2px — cukup untuk mencegah kedipan di ambang, dan
       celah terburuk yang mungkin tersisa jadi 2px, bukan 28px. */
    /* Saat drawer keranjang terbuka, snippets/MiniCart.liquid mengunci latar
       dengan `body{position:fixed;top:-Ypx}`. Dokumen langsung runtuh dan
       `window.scrollY` menjadi 0 — bukan karena pembaca menggulir ke atas.
       Tanpa penjaga ini header memuai dan BILAH PENGUMUMAN MUNCUL LAGI di
       belakang drawer, padahal sebelum drawer dibuka ia tersembunyi
       (dilaporkan user 10 Sep, dua tangkapan layar). Selama terkunci keadaan
       nav dibekukan apa adanya; begitu drawer ditutup posisi gulir dipulihkan
       dan peristiwa gulir berikutnya menyelaraskannya lagi. */
    function locked() {
      /* HANYA dua syarat, dan keduanya membersihkan dirinya sendiri.

         `klaviyo-prevent-body-scrolling` sempat ikut di sini dan itu SALAH
         dua kali: Klaviyo memasang kelas itu lalu TIDAK PERNAH mencabutnya,
         sehingga nav membeku selamanya (header berhenti menyusut di seluruh
         halaman — tertangkap gapsweep/pdp4-nav 10 Sep); dan popupnya memang
         tidak pernah jadi penyebab, karena `window.scrollY` terbukti tetap
         benar (1200) selagi kelas itu terpasang. Yang merusak pembacaan gulir
         cuma pengunci yang MERUNTUHKAN dokumen, yaitu `position:fixed`. */
      return document.body.style.position === 'fixed'
        || !!document.querySelector('.mini-cart.active');
    }
    function sync() {
      if (locked()) return;
      var y = window.scrollY || 0;
      var ann = parseFloat(root.style.getPropertyValue('--pdp4-announce-h')) || 40;
      if (!slim && y >= ann) { slim = true; root.classList.add('pdp4-nav-slim'); }
      else if (slim && y <= ann - 2) { slim = false; root.classList.remove('pdp4-nav-slim'); }
    }
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', function () { measure(); sync(); });
    /* Drawer ditutup lewat banyak jalan (tombol X, Escape, klik latar, jalur
       app.bundle). Daripada mengait ke masing-masing, keadaan `active`-nya
       diikuti langsung — sekali saja, dan hanya menjalankan sync() yang sudah
       murah dan idempoten. */
    var mini = document.querySelector('.mini-cart');
    if (mini && 'MutationObserver' in window) {
      new MutationObserver(function () {
        if (!mini.classList.contains('active')) window.setTimeout(sync, 0);
      }).observe(mini, { attributes: true, attributeFilter: ['class'] });
    }
    sync();
  }

  /* --- anchor: header tema diukur, bukan ditebak ----------------------------
     Rujukan memberi tiap section `scroll-margin-top: 64px` dan menyerahkan
     sisanya ke `scroll-behavior:smooth`. Di toko ini nav-nya `position:fixed`
     dan tingginya berubah saat tergulir, jadi 64px bisa berarti puncak section
     berhenti di BALIK nav.

     Yang diperbaiki hanya angkanya: guliran tetap milik browser. Nilainya
     diumumkan sebagai `--pdp4-nav` dan dipakai oleh `scroll-margin-top` di
     pdp4.css.

     `#pdp4-packs` dapat perlakuan tambahan. 
     Pembeli yang menekan "Pilih paketmu" harus mendarat dengan tombol belinya
     ikut terlihat, bukan dengan kartu pertama tepat di puncak dan tombolnya di
     luar layar — itu keluhan nyata di generasi sebelumnya. Kalau kartu sampai
     tombol tidak muat di bawah nav, guliran mendarat lebih rendah. */
  function initAnchors() {
    var root = document.documentElement;
    function navH() {
      var h = document.querySelector('header.header-nav') || document.querySelector('header');
      if (!h) return 64;
      var pos = getComputedStyle(h).position;
      if (pos !== 'fixed' && pos !== 'sticky') return 8;
      /* Yang dipakai adalah tinggi header SESUDAH bilah pengumuman menyusut,
         bukan tingginya saat ini.

         Alasannya waktu: bilah itu masih penuh pada milidetik pembeli menekan
         tautan, lalu menyusut 40px SELAMA gulirannya berjalan. Memakai angka
         saat-klik membuat guliran berhenti 40px terlalu rendah, dan memakai
         angka yang berubah-ubah membuat galeri menempel tersentak di tengah
         transisi. Sesudah gulir apa pun bilahnya selalu menyusut, jadi tinggi
         itulah satu-satunya yang stabil — dan satu-satunya yang benar di saat
         offsetnya betul-betul dipakai. */
      var box = h.getBoundingClientRect();
      var full = parseFloat(getComputedStyle(root).getPropertyValue('--pdp4-nav-full')) || box.height;
      var ann = parseFloat(getComputedStyle(root).getPropertyValue('--pdp4-announce-h')) || 0;
      return Math.max(0, Math.round(Math.max(box.top, 0) + full - ann));
    }
    /* BUG yang sudah terjadi: menggulir naik-turun beberapa kali membuat galeri
       hero BERHENTI menempel sama sekali — terukur 9 Sep, 24 sampel terpaku di
       halaman segar menjadi 0 sesudah lima kali bolak-balik.

       Sebabnya baris ini. `--pdp4-nav` ditulis ke <html> pada SETIAP peristiwa
       gulir, dan `top` galeri yang menempel diselesaikan dari nilai itu lewat
       `--sk-header-h`. Menulis ulang properti yang menjadi dasar `top` sebuah
       elemen sticky, puluhan kali per detik, membuat Chrome kehilangan batas
       menempelnya dan tidak pernah memulihkannya.

       Nilainya sendiri hampir tidak pernah berubah — header ini tingginya
       tetap. Jadi ia ditulis hanya ketika benar-benar berbeda. */
    var lastNav = null;
    function sync() {
      var n = navH();
      if (n === lastNav) return;
      lastNav = n;
      root.style.setProperty('--pdp4-nav', n + 'px');
    }
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, { passive: true });

    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#pdp4-"]');
      if (!a) return;
      var t = document.querySelector(a.getAttribute('href'));
      if (!t) return;
      var aim = t.querySelector('.pdp-pack') || t;
      var keep = t.querySelector('#AddToCart');
      var nav = navH();
      var gap = 8;
      if (keep) {
        var block = keep.getBoundingClientRect().bottom - aim.getBoundingClientRect().top;
        if (block > window.innerHeight - nav - gap) {
          /* Nol adalah batasnya: kartu tidak pernah didorong ke balik nav. Di
             layar yang terlalu pendek untuk keduanya, kartu tetap menang. */
          gap = Math.max(0, window.innerHeight - block - nav);
        }
      }
      e.preventDefault();
      window.scrollTo({
        top: Math.max(0, Math.round(aim.getBoundingClientRect().top + window.scrollY - nav - gap)),
        behavior: reduce ? 'auto' : 'smooth'
      });
    });
  }

  /* --- video "cara meminumnya" ---------------------------------------------
     Diputar hanya saat terlihat. Video yang berputar di luar layar tidak
     dilihat siapa pun tapi tetap memanaskan ponsel dan menghabiskan kuota. */
  function initHowtoVideo() {
    var v = $('#pdp4-howto-video');
    if (!v) return;
    if (reduce) { v.removeAttribute('autoplay'); v.pause(); return; }
    /* Sumbernya diparkir di `data-src` (lihat sections/pdp4-howto.liquid):
       dipasang saat bagian ini mendekat, diputar saat terlihat. */
    function arm() {
      if (!v.dataset.src) return;
      if (v.dataset.poster) { v.poster = v.dataset.poster; v.removeAttribute('data-poster'); }
      v.src = v.dataset.src;
      v.removeAttribute('data-src');
      v.preload = 'auto';
    }
    if (!('IntersectionObserver' in window)) { arm(); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { arm(); var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
        else v.pause();
      });
    }, { threshold: 0.2, rootMargin: '400px 0px' }).observe(v);
  }

  /* --- akordeon FAQ: buka-tutup beranimasi ----------------------------------
     `<details>` bawaan melompat: tingginya berubah seketika, dan `height` tidak
     bisa ditransisikan dari `auto`. Trik CSS yang lebih baru
     (`interpolate-size`, `::details-content`) belum ada di Safari, dan
     mayoritas pembeli halaman ini memakai iPhone. Jadi tingginya dianimasikan
     lewat WAAPI:

       buka  : pasang `open` DULU supaya isinya bisa diukur, lalu animasikan
               tinggi dari tinggi summary ke tinggi penuh;
       tutup : animasikan tinggi penuh ke tinggi summary, dan `open` baru
               dicabut SESUDAH selesai — dicabut lebih dulu, browser
               menyembunyikan isinya seketika dan tidak ada yang tersisa untuk
               dianimasikan.

     Klik saat animasi berjalan membatalkan yang sedang berlangsung dan
     berbalik arah, jadi menekan cepat dua kali tidak meninggalkan tinggi yang
     tersangkut. */
  function initFaq() {
    var items = $$('.pdp4-page .sk-accordion details');
    if (!items.length || !document.body.animate) return;
    var OPEN = 380, CLOSE = 280, EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

    items.forEach(function (d) {
      var summary = d.querySelector('summary');
      var body = d.querySelector('.sk-accordion__body');
      if (!summary || !body) return;
      var anim = null, closing = false;

      function finish(open) {
        d.open = open;
        d.style.height = '';
        d.style.overflow = '';
        anim = null;
        closing = false;
      }

      function run(open) {
        var from = d.offsetHeight;
        d.style.overflow = 'hidden';
        if (open) d.open = true;
        var to = open ? summary.offsetHeight + body.offsetHeight : summary.offsetHeight;
        if (anim) anim.cancel();
        anim = d.animate({ height: [from + 'px', to + 'px'] },
          { duration: open ? OPEN : CLOSE, easing: EASE });
        body.animate(open ? { opacity: [0, 1], transform: ['translateY(6px)', 'none'] }
                          : { opacity: [1, 0] },
          { duration: open ? OPEN - 60 : 160, delay: open ? 60 : 0, easing: EASE, fill: 'backwards' });
        anim.onfinish = function () { finish(open); };
        anim.oncancel = function () { anim = null; };
      }

      summary.addEventListener('click', function (e) {
        e.preventDefault();
        if (reduce) { d.open = !d.open; return; }
        if (d.open && !closing) { closing = true; run(false); }
        else { run(true); }
      });
    });
  }

  /* --- ulasan: markup rujukan, data Judge.me, kendali milik sendiri ---------
     Widget Judge.me dirender di host tersembunyi dan dibaca dari sana: kartu,
     histogram, tanya-jawab, formulir tulis ulasan. Seluruh ulasan (200-an)
     ditarik sekali dari endpoint widget sendiri supaya pencarian dan saringan
     bekerja pada semuanya, bukan cuma halaman pertama.

     Endpointnya publik, ber-`access-control-allow-origin: *`, dan memang itu
     yang dipanggil widget sendiri untuk "Load more" — tidak ada kunci rahasia
     yang dibawa ke tema. */
  function initReviews() {
    var sec = $('[data-pdp4-reviews]');
    if (!sec) return;
    var host = $('[data-pdp4-jdgm-host]', sec);
    var list = $('[data-pdp4-rev-list]', sec);
    if (!host || !list) return;

    var verifiedLabel = sec.dataset.verifiedLabel || '';
    var locale = sec.dataset.locale || 'en';
    var PAGE = Math.max(1, parseInt(sec.dataset.perPage, 10) || 4);
    var search = $('[data-pdp4-search]', sec);
    var more = $('[data-pdp4-more]', sec);

    var state = { order: 'newest', score: null, photos: false, q: '', shown: PAGE };
    var seed = [];       // dari cetakan widget — cepat, tapi cuma halaman pertama
    var every = null;    // ke-200-nya
    var fetching = false;

    /* Rujukan menulis cap waktu sebagai jarak ("2 weeks ago"), Judge.me sebagai
       tanggal ("12/07/2026"). Yang dipakai atribut `datetime` ISO-nya, bukan
       teks yang terlihat — teks itu format admin Judge.me dan bisa berubah
       tanpa kita tahu. Intl menerjemahkan katanya sendiri, jadi /id membaca
       "2 bulan yang lalu" tanpa satu pun string di tema. */
    function ago(iso) {
      if (!iso || !window.Intl || !Intl.RelativeTimeFormat) return '';
      var then = new Date(iso);
      if (isNaN(then)) return '';
      var days = Math.round((Date.now() - then) / 86400000);
      var rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
      if (days < 1) return rtf.format(0, 'day');
      if (days < 7) return rtf.format(-days, 'day');
      if (days < 35) return rtf.format(-Math.round(days / 7), 'week');
      if (days < 365) return rtf.format(-Math.round(days / 30), 'month');
      return rtf.format(-Math.round(days / 365), 'year');
    }

    function stars(score) {
      var n = Math.max(0, Math.min(5, Math.round(Number(score) || 0)));
      return new Array(n + 1).join('★') + new Array(6 - n).join('☆');
    }

    function readReviews(root) {
      return [].slice.call(root.querySelectorAll('.jdgm-rev')).map(function (r) {
        var rating = r.querySelector('.jdgm-rev__rating');
        var body = r.querySelector('.jdgm-rev__body');
        var text = '';
        if (body) {
          /* "Read more" tautan milik widget, bukan bagian ulasannya. Disalin
             dulu supaya membuangnya tidak merusak DOM widget. */
          var clone = body.cloneNode(true);
          [].slice.call(clone.querySelectorAll('.jdgm-rev__body-read-more')).forEach(function (e) { e.remove(); });
          text = clone.textContent.replace(/\s+/g, ' ').trim();
        }
        var stamp = r.querySelector('.jdgm-rev__timestamp');
        var iso = stamp ? stamp.getAttribute('datetime') : '';
        return {
          id: r.getAttribute('data-review-id') || '',
          score: Number((rating && rating.getAttribute('data-score')) || 5),
          title: ((r.querySelector('.jdgm-rev__title') || {}).textContent || '').trim(),
          body: text,
          author: ((r.querySelector('.jdgm-rev__author') || {}).textContent || '').trim(),
          /* Muatan endpoint menandainya di atribut kartu; muatan yang sudah
             dirender widget menandainya dengan adanya lencana. */
          verified: r.getAttribute('data-verified-buyer') === 'true' || !!r.querySelector('.jdgm-rev__buyer-badge'),
          iso: iso,
          time: iso ? Date.parse(iso) || 0 : 0,
          pics: [].slice.call(r.querySelectorAll('.jdgm-rev__pics img')).map(function (i) {
            return i.getAttribute('src') || i.getAttribute('data-src') || '';
          }).filter(Boolean),
        };
      });
    }

    function card(r) {
      var who = '<span class="kl_reviews__review__author">' + escRaw(r.author) + '</span>';
      if (r.verified && verifiedLabel) who += ' · ' + esc(verifiedLabel);
      var when = ago(r.iso);
      if (when) who += ' · <span class="kl_reviews__review__timestamp">' + escRaw(when) + '</span>';

      var html = '<div class="sk-card sk-stack" style="gap:var(--sk-space-8)">' +
        '<span class="pdp-stars sk-small" aria-label="' + escRaw(r.score) + '/5">' + stars(r.score) + '</span>';
      if (r.title) html += '<p class="sk-title kl_reviews__review__title">' + escRaw(r.title) + '</p>';
      /* `quotes:none` disalin dari rujukan: `<q>` menambahkan tanda kutip
         sendiri di sebagian besar browser, dan kartunya tidak punya. */
      if (r.body) html += '<q class="sk-body kl_reviews__review__content" style="quotes:none">' + escRaw(r.body) + '</q>';
      if (r.pics.length) {
        html += '<div class="pdp-rev-pics">' + r.pics.map(function (src) {
          return '<img src="' + escRaw(src) + '" alt="" loading="lazy" width="78" height="78">';
        }).join('') + '</div>';
      }
      return html + '<p class="sk-small sk-text-secondary">' + who + '</p></div>';
    }

    /* --- seluruh ulasan, sekali ------------------------------------------- */
    function endpoint(page) {
      var pg = host.querySelector('.jdgm-paginate');
      var base = (pg && pg.getAttribute('data-url')) || 'https://cdn.judge.me/reviews/reviews_for_widget';
      return base +
        '?url=' + encodeURIComponent(sec.dataset.shop) +
        '&shop_domain=' + encodeURIComponent(sec.dataset.shop) +
        '&platform=shopify&product_id=' + encodeURIComponent(sec.dataset.productId) +
        '&page=' + page + '&per_page=100';
    }

    function parsePage(html) {
      var box = document.createElement('div');
      box.innerHTML = html;
      return readReviews(box);
    }

    function loadEvery() {
      if (every) return Promise.resolve();
      if (fetching) return fetching;
      /* `per_page` dibatasi server (sekitar 23 apa pun yang diminta), jadi
         halaman pertama dipakai MENGUKUR berapa yang benar-benar datang, lalu
         sisanya ditarik sekaligus. */
      fetching = fetch(endpoint(1))
        .then(function (r) { return r.json(); })
        .then(function (first) {
          var page1 = parsePage(first.html || '');
          var per = page1.length || 1;
          var total = Number(first.total_count) || page1.length;
          var pages = Math.min(Math.ceil(total / per), 30);
          var rest = [];
          for (var i = 2; i <= pages; i++) {
            rest.push(fetch(endpoint(i)).then(function (r) { return r.json(); })
              .then(function (j) { return parsePage(j.html || ''); })
              .catch(function () { return []; }));
          }
          return Promise.all(rest).then(function (chunks) {
            var out = page1;
            chunks.forEach(function (c) { out = out.concat(c); });
            every = out;
          });
        })
        .catch(function () { /* tetap pakai cetakan widget */ })
        .then(function () { fetching = false; });
      return fetching;
    }

    /* --- urut, saring, gambar --------------------------------------------- */
    function rows() {
      var pool = (every && every.length) ? every : seed;
      var q = state.q;
      var out = pool.filter(function (r) {
        if (state.score && Math.round(r.score) !== state.score) return false;
        if (state.photos && !r.pics.length) return false;
        if (q && (r.title + ' ' + r.body + ' ' + r.author).toLowerCase().indexOf(q) < 0) return false;
        return true;
      }).slice();
      /* Permintaan user 8 Sep: ulasan berfoto dan dari pembeli terverifikasi
         didahulukan. Peringkatnya bertingkat — foto+terverifikasi, lalu foto,
         lalu terverifikasi, lalu sisanya — dan di dalam tiap tingkat urutan
         waktu yang dipilih (terbaru/terlama) tetap berlaku. */
      var oldest = state.order === 'oldest';
      function rank(r) { return (r.pics.length ? 2 : 0) + (r.verified ? 1 : 0); }
      out.sort(function (a, b) {
        var d = rank(b) - rank(a);
        if (d) return d;
        return oldest ? a.time - b.time : b.time - a.time;
      });
      return out;
    }

    /* --- tab pertanyaan (Judge.me Q&A, dinyalakan 8 Sep 2026) --------------
       Kartu pertanyaan Judge.me: `.jdgm-quest` > header (`.jdgm-quest__asker
       .jdgm-rev__author`, `.jdgm-rev__timestamp[datetime]`) +
       `.jdgm-quest__body` + `.jdgm-quest__answers` berisi `.jdgm-ans`. Nama-
       nama itu diambil dari CSS dan skrip widget Judge.me, bukan diduga — tapi
       toko ini belum punya satu pun pertanyaan terbit saat ditulis, jadi
       pembacanya sengaja toleran: tiap ruas boleh kosong tanpa merusak
       kartunya. */
    var qlist = $('[data-pdp4-quest-list]', sec);
    var qempty = $('[data-pdp4-quest-empty]', sec);
    var qcount = $('[data-pdp4-qcount]', sec);
    var view = 'reviews';
    var answerLabel = (qlist && qlist.dataset.answerLabel) || '';
    function text(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
    function readQuestions(root) {
      return [].slice.call(root.querySelectorAll('.jdgm-quest')).map(function (q) {
        var stamp = q.querySelector('.jdgm-rev__timestamp');
        return {
          body: text(q.querySelector('.jdgm-quest__body')),
          asker: text(q.querySelector('.jdgm-quest__asker .jdgm-rev__author')) || text(q.querySelector('.jdgm-rev__author')),
          iso: stamp ? stamp.getAttribute('datetime') : '',
          answers: [].slice.call(q.querySelectorAll('.jdgm-ans')).map(function (a) {
            var st = a.querySelector('.jdgm-rev__timestamp');
            return {
              who: text(a.querySelector('.jdgm-ans__answerer .jdgm-rev__author')) || text(a.querySelector('.jdgm-rev__author')),
              body: text(a.querySelector('.jdgm-ans__body')) || text(a.querySelector('.jdgm-ans__content')),
              iso: st ? st.getAttribute('datetime') : ''
            };
          }).filter(function (a) { return a.body; })
        };
      }).filter(function (q) { return q.body; });
    }
    function qcard(q) {
      var who = '<span class="kl_reviews__review__author">' + escRaw(q.asker) + '</span>';
      var when = ago(q.iso);
      if (when) who += ' · <span class="kl_reviews__review__timestamp">' + escRaw(when) + '</span>';
      var html = '<div class="sk-card sk-stack" style="gap:var(--sk-space-8)">' +
        '<p class="sk-title">' + escRaw(q.body) + '</p>' +
        '<p class="sk-small sk-text-secondary">' + who + '</p>';
      q.answers.forEach(function (a) {
        var aw = '<span class="kl_reviews__review__author">' + escRaw(a.who) + '</span>';
        var at = ago(a.iso);
        if (at) aw += ' · <span class="kl_reviews__review__timestamp">' + escRaw(at) + '</span>';
        html += '<div class="pdp-ans sk-stack" style="gap:var(--sk-space-4)">' +
          (answerLabel ? '<p class="sk-eyebrow sk-text-secondary">' + esc(answerLabel) + '</p>' : '') +
          '<p class="sk-body">' + escRaw(a.body) + '</p>' +
          '<p class="sk-small sk-text-secondary">' + aw + '</p></div>';
      });
      return html + '</div>';
    }
    function questionTotal(qs) {
      var w = host.querySelector('.jdgm-rev-widg');
      var n = w ? parseInt(w.getAttribute('data-number-of-questions'), 10) : NaN;
      var sub = host.querySelector('.jdgm-subtab__name[data-tabname="questions"] .jdgm-subtab__count');
      if (sub) n = parseInt(sub.textContent, 10);
      return isNaN(n) ? qs.length : Math.max(n, qs.length);
    }
    function syncQuestions() {
      if (!qlist) return;
      var qs = readQuestions(host);
      if (qcount) qcount.textContent = String(questionTotal(qs));
      qlist.innerHTML = qs.map(qcard).join('');
      var showing = view === 'questions';
      qlist.hidden = !showing || !qs.length;
      if (qempty) qempty.hidden = !showing || qs.length > 0;
    }
    function setView(next) {
      view = next;
      var onReviews = view === 'reviews';
      $$('[data-pdp4-tab]', sec).forEach(function (t) {
        t.setAttribute('aria-selected', String(t.getAttribute('data-pdp4-tab') === view));
      });
      /* Semua kendali daftar ulasan — cari, pil saring, kartu, "Load more" —
         hanya berlaku untuk ulasan. Menampilkannya di atas daftar pertanyaan
         yang tidak dipengaruhinya adalah kendali yang berbohong. */
      [list, search && search.closest('.sk-input-wrap'), $('.sk-chip-group', sec), more].forEach(function (el) {
        if (el) el.hidden = !onReviews;
      });
      if (onReviews) apply(); else if (empty) empty.hidden = true;
      syncQuestions();
    }
    $$('[data-pdp4-tab]', sec).forEach(function (t) {
      t.addEventListener('click', function () { setView(t.getAttribute('data-pdp4-tab')); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView(t.getAttribute('data-pdp4-tab')); }
      });
    });

    var empty = $('[data-pdp4-empty]', sec);
    function apply() {
      if (view !== 'reviews') return;
      var all = rows();
      list.innerHTML = all.slice(0, state.shown).map(card).join('');
      if (more) more.hidden = all.length <= state.shown;
      /* Menyaring sampai kosong adalah hasil yang sah — 2 dan 1 bintang di
         produk ini memang nol. Yang tidak boleh terjadi adalah daftar yang
         lenyap tanpa penjelasan. */
      if (empty) empty.hidden = all.length > 0;
    }

    function reset() { state.shown = PAGE; }

    function syncBars() {
      var src = [].slice.call(host.querySelectorAll('.jdgm-histogram__row'));
      var out = [].slice.call(sec.querySelectorAll('[data-pdp4-bars] .kl_reviews__histogram__row'));
      src.forEach(function (row, i) {
        if (!out[i]) return;
        var freq = row.querySelector('.jdgm-histogram__frequency');
        var fill = row.querySelector('.jdgm-histogram__bar-content');
        var count = out[i].querySelector('[data-pdp4-bar-count]');
        var bar = out[i].querySelector('.kl_reviews__histogram__bar--foreground');
        if (count && freq) count.textContent = freq.textContent.trim();
        if (bar && fill) bar.style.width = fill.style.width || '0%';
        /* Baris histogram berurutan 5→1, dan angkanya dipinjam ke menu bintang
           supaya pilihan yang kosong terlihat kosong sebelum ditekan. */
        var opt = sec.querySelector('[data-pdp4-score-count="' + (5 - i) + '"]');
        if (opt && freq) opt.textContent = freq.textContent.trim();
      });
    }

    /* --- kendali -----------------------------------------------------------
       Dua pil membuka DAFTAR PILIHAN — urutan dan saringan bintang — sedangkan
       "With photos" saklar yang berdiri sendiri dan bisa digabung keduanya. */
    var RATING_TPL = sec.dataset.ratingLabel || '%n% ★';

    function closeMenus(except) {
      $$('[data-pdp4-filter]', sec).forEach(function (wrap) {
        if (wrap === except) return;
        var menu = wrap.querySelector('[data-pdp4-menu]');
        var pill = wrap.querySelector('[data-pdp4-pill]');
        if (menu) menu.hidden = true;
        if (pill) pill.setAttribute('aria-expanded', 'false');
        wrap.classList.remove('pdp-open');
      });
    }

    function labelFor(kind) {
      var pill = sec.querySelector('[data-pdp4-pill="' + kind + '"]');
      if (!pill) return;
      var base = pill.dataset.pdp4Base || '';
      var label = pill.querySelector('[data-pdp4-label]') || pill;
      if (kind === 'order') {
        var opt = sec.querySelector('[data-pdp4-menu="order"] [data-pdp4-value="' + state.order + '"]');
        /* Label pil mengikuti pilihan: sesudah memilih "Oldest first", pilnya
           harus berbunyi begitu — kalau tidak, satu-satunya tempat keadaan itu
           terbaca adalah menu yang sudah tertutup. */
        label.textContent = state.order === 'newest' ? base : (opt ? opt.textContent.trim() : base);
        pill.setAttribute('aria-pressed', String(state.order !== 'newest'));
      } else {
        label.textContent = state.score ? RATING_TPL.replace('%n%', state.score) : base;
        pill.setAttribute('aria-pressed', String(!!state.score));
      }
    }

    $$('[data-pdp4-filter]', sec).forEach(function (wrap) {
      var pill = wrap.querySelector('[data-pdp4-pill]');
      var menu = wrap.querySelector('[data-pdp4-menu]');
      if (!pill || !menu) return;

      pill.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = menu.hidden;
        closeMenus(wrap);
        menu.hidden = !open;
        pill.setAttribute('aria-expanded', String(open));
        wrap.classList.toggle('pdp-open', open);
      });
      pill.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeMenus(); pill.focus(); }
      });

      menu.addEventListener('click', function (e) {
        var opt = e.target.closest('[data-pdp4-value]');
        if (!opt) return;
        e.stopPropagation();
        var kind = menu.dataset.pdp4Menu;
        var val = opt.dataset.pdp4Value;
        if (kind === 'order') state.order = val || 'newest';
        else state.score = val ? Number(val) : null;

        $$('[data-pdp4-value]', menu).forEach(function (o) {
          o.setAttribute('aria-selected', String(o === opt));
        });
        labelFor(kind);
        closeMenus();
        pill.focus();
        reset();
        apply();
        loadEvery().then(apply);
      });
    });

    /* Menu tertutup saat menekan di luarnya — perilaku yang orang harapkan
       dari setiap menu, dan satu-satunya jalan keluar bagi tetikus. */
    document.addEventListener('click', function () { closeMenus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenus(); });

    var photos = sec.querySelector('[data-pdp4-toggle="photos"]');
    if (photos) {
      photos.addEventListener('click', function (e) {
        e.stopPropagation();
        state.photos = !state.photos;
        photos.setAttribute('aria-pressed', String(state.photos));
        reset();
        apply();
        loadEvery().then(apply);
      });
    }

    if (search) {
      search.addEventListener('input', function () {
        state.q = search.value.trim().toLowerCase();
        reset();
        apply();
        if (state.q) loadEvery().then(apply);
      });
    }

    if (more) {
      more.addEventListener('click', function () {
        state.shown += PAGE;
        apply();
        loadEvery().then(apply);
      });
    }

    /* --- formulir Judge.me dibuka DI TEMPAT, di bawah kartu ringkasan -------
       Widget di host sudah di-setup Judge.me, dan formulirnya — validasi,
       unggah foto/video, anti-spam — sepenuhnya milik widget. Tapi selama host
       berada di luar layar, dua hal terjadi: tautan `.jdgm-write-rev-link`
       dipasangi display:none oleh Judge.me (widget dianggap tak terlihat), dan
       pembungkus formulirnya berukuran 0. Klik programatik memang membuka
       formulir, hanya saja di tempat yang tidak pernah terlihat pembeli —
       itulah kenapa tombolnya terasa mati.

       Urutannya: host dipindah tepat di bawah kartu ringkasan (tempat
       tombolnya ditekan), dijadikan terlihat & masuk aliran lewat kelas, BARU
       tautannya diklik. Memindahkan simpul tidak memutus Judge.me: penangan
       kliknya didelegasikan di document dan simpulnya tidak pernah lepas dari
       dokumen. */
    var formOpen = false;
    var summary = sec.querySelector('.sk-card--pad-lg');
    var motion = reduce ? 'auto' : 'smooth';
    function setHost(open) {
      formOpen = open;
      host.classList.toggle('pdp-jdgm-host--form', open);
      if (!open) host.classList.remove('pdp-jdgm-host--qa');
      host.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    function dockHost() {
      if (summary && summary.nextElementSibling !== host) summary.insertAdjacentElement('afterend', host);
    }
    function wrappersOpen() {
      var open = false;
      $$('.jdgm-form-wrapper, .jdgm-form-dynamic-wrapper, .jdgm-question-form-wrapper', host).forEach(function (w) {
        if (getComputedStyle(w).display !== 'none') open = true;
      });
      return open;
    }
    /* Klik tautannya HARUS menunggu Judge.me menyadari widgetnya terlihat.
       Diukur, bukan diduga: dengan host baru saja dijadikan terlihat, klik
       seketika tidak membuka apa pun — Judge.me baru membangun
       `.jdgm-form-wrapper` dan mencabut display:none tautannya lewat
       pemeriksaan visibilitasnya sendiri, beberapa ratus milidetik kemudian.
       Jadi pembungkusnya ditunggu (polling 100ms, paling lama 6s), lalu
       diklik. */
    function whenFormReady(linkSel, wrapSel, done) {
      var tries = 0;
      (function tick() {
        var link = host.querySelector(linkSel);
        var ready = link && getComputedStyle(link).display !== 'none' && host.querySelector(wrapSel);
        if (ready || tries++ > 60) return done();
        /* Pemeriksaan visibilitas Judge.me menumpang pada peristiwa gulir; di
           desktop ia bisa lewat beberapa detik tanpa gulir — jadi disenggol
           tiap putaran. */
        window.dispatchEvent(new Event('scroll'));
        window.setTimeout(tick, 100);
      })();
    }
    /* Satu mekanisme untuk dua formulir Judge.me: ulasan
       (.jdgm-write-rev-link → .jdgm-form-wrapper) dan pertanyaan
       (.jdgm-ask-question-btn → .jdgm-question-form-wrapper). Kalau formulir
       yang satu masih terbuka saat yang lain diminta, Judge.me sendiri yang
       menukarnya. */
    function openJdgmForm(linkSel, wrapSel) {
      var link = host.querySelector(linkSel);
      if (!link) return false;
      dockHost();
      setHost(true);
      /* Host digulirkan ke layar SEBELUM menunggu, bukan sesudahnya: itu yang
         memicu Judge.me menganggap widgetnya terlihat. */
      host.scrollIntoView({ block: 'start', behavior: motion });
      whenFormReady(linkSel, wrapSel, function () {
        if (!formOpen) return; /* ditutup lagi sebelum sempat terbuka */
        var wrap = host.querySelector(wrapSel);
        var isOpen = wrap && getComputedStyle(wrap).display !== 'none';
        if (!isOpen) link.click();
        window.setTimeout(function () {
          (host.querySelector(wrapSel) || host).scrollIntoView({ block: 'start', behavior: motion });
        }, 120);
      });
      return true;
    }
    var activeForm = null;
    function openReviewForm() { activeForm = 'review'; return openJdgmForm('.jdgm-write-rev-link', '.jdgm-form-wrapper'); }
    function openQuestionForm() { activeForm = 'question'; return openJdgmForm('.jdgm-ask-question-btn', '.jdgm-question-form-wrapper'); }
    /* Penutupan diikuti dari DOM, bukan dari klik: Judge.me menutup pembungkus
       formulirnya lewat style inline (tombol "Cancel review", Enter, atau apa
       pun yang ia tambahkan nanti). Pengamat ini menunggu pembungkusnya pernah
       TERBUKA dulu — tepat sesudah klik kita pembungkusnya memang masih
       tertutup, dan tanpa syarat itu host akan ditutup sebelum sempat
       terbuka. */
    var wasOpen = false, closeTimer = null;
    new MutationObserver(function () {
      if (!formOpen) { wasOpen = false; return; }
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(function () {
        if (!formOpen) return;
        if (wrappersOpen()) { wasOpen = true; return; }
        if (wasOpen) { wasOpen = false; setHost(false); }
      }, 150);
    }).observe(host, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });

    var write = $('[data-pdp4-write]', sec);
    if (write) {
      write.addEventListener('click', function () {
        if (formOpen && activeForm === 'review') { setHost(false); return; }
        openReviewForm();
      });
    }

    /* "Ask a question": formulir pertanyaan Judge.me, mekanisme yang sama.
       Kalau widget tidak punya tombolnya (modul Tanya-Jawab dimatikan lagi di
       admin Judge.me), tombolnya jatuh ke `data-href` — WhatsApp. Kalau
       keduanya tidak ada, tombolnya dibuang: tombol yang tidak menuju ke mana
       pun lebih buruk daripada tombol yang tidak ada. */
    var ask = $('[data-pdp4-ask]', sec);
    if (ask) {
      if (!ask.dataset.href && !host.querySelector('.jdgm-ask-question-btn')) {
        /* Diperiksa lagi belakangan: widget mungkin belum selesai merender. */
        window.setTimeout(function () {
          if (!ask.dataset.href && !host.querySelector('.jdgm-ask-question-btn')) ask.remove();
        }, 3000);
      }
      ask.addEventListener('click', function () {
        if (formOpen && activeForm === 'question') { setHost(false); return; }
        if (host.querySelector('.jdgm-ask-question-btn')) { openQuestionForm(); return; }
        if (ask.dataset.href) window.open(ask.dataset.href, '_blank', 'noopener');
      });
    }

    /* --- jalan ------------------------------------------------------------- */
    seed = readReviews(host);
    syncBars();
    syncQuestions();
    apply();
    /* Ke-200 ulasannya (sembilan permintaan ke api.judge.me, ±700 KB JSON
       yang lalu di-parse jadi DOM) dulu ditarik begitu halaman lahir dan ikut
       berebut pita + main thread dengan gambar hero (LCP 15 detik, 10 Sep
       2026). Kini ditarik sesudah `load`, saat browser senggang.

       Hasilnya hanya DIGAMBAR kalau bagian ini belum pernah terlihat: daftar
       yang berganti di bawah mata pembaca mengubah tingginya, dan bagian di
       bawahnya melompat (CLS 0,33 terukur saat pembaca sudah lewat ke bagian
       penutup). Kalau sudah terlihat, ke-200-nya menunggu sentuhan pertama —
       cari/urut/saring/"Load more" semuanya memanggil loadEvery() lalu apply(). */
    var seen = false;
    if ('IntersectionObserver' in window) {
      var seenIO = new IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        seen = true;
        seenIO.disconnect();
      });
      seenIO.observe(sec);
    }
    afterLoadIdle(function () {
      loadEvery().then(function () { if (!seen) apply(); });
    });

    if (!('MutationObserver' in window)) return;
    /* Widget mengisi dirinya bertahap. Selama ke-200-nya belum tiba, cetakan
       pertamanya masih yang tampil, jadi ia diikuti — di-debounce, karena
       kerangka `.jdgm-rev` muncul lebih dulu dan `.jdgm-rev__body` menyusul. */
    var timer = null;
    new MutationObserver(function () {
      /* Selama formulir terbuka host berada di aliran dengan lebar kolom, dan
         Judge.me memotong badan ulasan panjang pada lebar itu; membaca ulang
         saat itu akan mengganti kutipan utuh dengan yang terpotong. */
      if (formOpen) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        seed = readReviews(host);
        syncBars();
        syncQuestions();
        if (!every) apply();
      }, 250);
    }).observe(host, { childList: true, subtree: true });
  }

  function boot() {
    /* Paling dulu: kolom hero harus sudah lengkap dan bilahnya harus sudah di
       <body> sebelum apa pun mengukurnya. */
    initRouterSlot();
    initStickyHost();
    initSticky();
    initNav();
    initAnchors();
    initRouter();
    initPacks();
    initGallery();
    initModal();
    initHowtoVideo();
    initFaq();
    initReviews();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Theme editor merender ulang satu section utuh saat disunting, dan
     pemindahan yang dilakukan boot() ikut hilang bersamanya. */
  document.addEventListener('shopify:section:load', function () {
    initRouterSlot();
    initStickyHost();
    initSticky();
  });
})();
