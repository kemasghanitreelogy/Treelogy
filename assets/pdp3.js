/* ===========================================================================
   pdp3 — perilaku halaman produk, port 1:1 dari `treelogy-capsules-pdp.html`.

   Blok skrip di mockup itu pendek, dan setiap perilaku di bawah ini adalah
   salinan langsungnya: kartu alasan yang berganti, thumbnail galeri, video
   yang hanya berputar di slide yang terlihat, dialog BPOM, reveal saat
   menggulir, bilah menempel, dan penggeseran anchor yang meluncur.

   Yang DITAMBAHKAN — dan hanya ini — adalah hal-hal yang tidak mungkin ada di
   sebuah berkas HTML tunggal:

     • kartu paket harus benar-benar mengubah varian yang dibeli, bukan cuma
       menulis ulang angka di layar;
     • bilah menempel harus lepas dari leluhur ber-transform;
     • widget ulasan Judge.me datang belakangan dan blok angkanya baru bisa
       dipindahkan sesudah ia selesai merender.

   Yang SENGAJA TIDAK diport: penukar judul `?h=a` di mockup. Ia menyuntikkan
   satu kalimat Inggris yang dituliskan keras ke dalam skrip, dan sebuah
   halaman toko sungguhan tidak boleh punya judul yang bisa diganti siapa pun
   lewat parameter URL. Kalau varian judul itu memang mau diuji, tempatnya
   aplikasi A/B test yang sudah dipakai toko ini, bukan baris ini.
   =========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return [].slice.call((ctx || document).querySelectorAll(sel)); }

  /* --- kartu alasan ---------------------------------------------------------
     Sembilan kartu, satu yang terlihat. Digambar di sisi klien persis seperti
     mockup: merender kesembilannya lalu menyembunyikan delapan akan membuat
     pembaca layar dan mesin pencari membaca sembilan salinan isi yang saling
     bertabrakan. */
  function initRouter() {
    var chips = $('#p3-chips');
    var rcard = $('#p3-rcard');
    var data = $('[data-pdp3-routes]');
    if (!chips || !rcard || !data) return;

    var routes;
    try { routes = JSON.parse(data.textContent); } catch (e) { return; }
    if (!routes || !routes.length) return;

    function jsonFrom(sel, fallback) {
      var el = $(sel);
      if (!el) return fallback;
      try { return JSON.parse(el.textContent) || fallback; } catch (e) { return fallback; }
    }
    var cta = jsonFrom('[data-pdp3-router-cta]', 'Choose your pack');
    var meta = jsonFrom('[data-pdp3-router-meta]', 'Verified buyer');

    var param = new URLSearchParams(location.search).get('r');
    var active = routes.some(function (r) { return r.id === param; }) ? param : routes[0].id;

    /* BUG yang pernah terjadi: chip berbunyi "Blood sugar &amp; cholesterol"
       dan badan kartu "the body&#39;s inflammatory balance".

       Sebabnya DUA kali escape. Isi kartu sekarang bisa datang dari dua
       sumber: setting section (mentah) atau berkas locale lewat filter `t` —
       dan `t` sudah meng-escape HTML sendiri. Yang sudah ter-escape lalu
       di-escape lagi di sini, sehingga `&` menjadi `&amp;amp;` dan terbaca
       sebagai `&amp;` di layar.

       Jadi nilainya dinormalkan dulu: dibaca balik jadi teks polos, baru
       di-escape sekali. Idempoten, jadi benar untuk kedua sumber tanpa perlu
       tahu yang mana. */
    var decoder = document.createElement('textarea');
    function unesc(s) {
      decoder.innerHTML = String(s == null ? '' : s);
      return decoder.value;
    }

    function esc(s) {
      return unesc(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    /* Judul kartu memakai penanda `|` yang sama dengan judul section — lihat
       snippets/pdp3-sentence-lines.liquid. Di sana Liquid yang menerjemahkannya
       jadi `<br class="p3-brm">`; di sini JS, karena kartunya digambar setelah
       halaman jadi. Satu konvensi, dua tempat yang menerapkannya. */
    function brm(s) {
      return esc(s).split('|').map(function (x) { return x.trim(); })
        .filter(Boolean).join('<br class="p3-brm"> ');
    }

    function renderChips() {
      chips.innerHTML = routes.map(function (r) {
        return '<button class="p3-pill" type="button" role="radio" aria-checked="' +
          (r.id === active) + '" data-id="' + esc(r.id) + '">' + esc(r.chip) + '</button>';
      }).join('');
    }

    function renderCard(first) {
      var r = routes.filter(function (x) { return x.id === active; })[0];
      if (!r) return;
      /* Kartu ditutup penulisnya. Yang punya foto memakai fotonya; sisanya
         jatuh ke huruf pertama namanya — bulatan yang sama, isi yang berbeda,
         jadi barisnya tidak pernah kosong. */
      var who = '';
      if (r.who) {
        var face = r.photo
          ? '<img src="' + esc(r.photo) + '" alt="" width="32" height="32" loading="lazy">'
          : esc(r.who.charAt(0));
        who = '<div class="p3-who"><span class="p3-avatar">' + face + '</span>' +
          esc(r.who) + (meta ? ' · ' + esc(meta) : '') + '</div>';
      }
      var html = '<svg class="p3-ico"><use href="#' + esc(r.icon) + '"/></svg>' +
        '<h3>' + brm(r.title) + '</h3>' +
        '<p>' + esc(r.body) + '</p>' +
        '<blockquote>' + esc(r.quote) + '</blockquote>' +
        who +
        '<a href="#p3-packs">' + esc(cta) + '</a>';
      if (first) { rcard.innerHTML = html; return; }
      rcard.classList.add('p3-swap');
      window.setTimeout(function () {
        rcard.innerHTML = html;
        rcard.classList.remove('p3-swap');
      }, 180);
    }

    renderChips();
    renderCard(true);

    chips.addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]');
      if (!b) return;
      active = b.dataset.id;
      renderChips();
      renderCard();
      history.replaceState(null, '', '?r=' + active + '#p3-router');
    });
  }

  /* --- paket: angka DAN varian ----------------------------------------------
     Mockup hanya menulis ulang tiga angka. Di sini pilihannya juga harus
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

    var price = $('#p3-atc-price');
    var pdHero = $('#p3-pd-hero');
    var pdSticky = $('#p3-pd-sticky');
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
    var slides = $('#p3-slides');
    if (!slides) return;
    var thumbs = $$('#p3-thumbs button');

    function syncVideos() {
      var i = Math.round(slides.scrollLeft / slides.clientWidth);
      [].slice.call(slides.children).forEach(function (sl, j) {
        var v = sl.querySelector('video');
        if (!v) return;
        if (j === i) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        else { v.pause(); }
      });
    }

    thumbs.forEach(function (b, i) {
      b.addEventListener('click', function () {
        slides.scrollTo({ left: i * slides.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
      });
    });

    slides.addEventListener('scroll', function () {
      var i = Math.round(slides.scrollLeft / slides.clientWidth);
      thumbs.forEach(function (b, j) { b.setAttribute('aria-current', String(i === j)); });
      syncVideos();
    }, { passive: true });

    syncVideos();
  }

  /* --- dialog registrasi BPOM ---------------------------------------------- */
  function initModal() {
    var modal = $('#p3-bpom-modal');
    var open = $('#p3-bpom-btn');
    var close = $('#p3-bpom-close');
    if (!modal || !open) return;
    open.addEventListener('click', function () { modal.classList.add('p3-on'); });
    if (close) close.addEventListener('click', function () { modal.classList.remove('p3-on'); });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.classList.remove('p3-on');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') modal.classList.remove('p3-on');
    });
  }

  /* --- bilah menempel: tuan rumahnya <body> ---------------------------------
     BUG yang pernah terjadi: bilahnya duduk di y=863 pada layar setinggi 852.

     Sebabnya letak, bukan gaya. Bilah itu dirender di dalam section paket, dan
     setiap `.p3-rv` yang belum tergulir masuk masih membawa
     `transform: translateY(12px)`. Elemen ber-transform menjadi containing
     block bagi keturunannya, sehingga `position: fixed` berhenti mengukur diri
     dari viewport.

     Yang dipindahkan adalah PEMBUNGKUS `.pdp3-page`-nya, bukan bilahnya
     sendiri: seluruh token desain hidup di selektor itu, dan bilah yang lepas
     darinya kehilangan warna, ukuran, dan bentuknya sekaligus. */
  function initStickyHost() {
    var host = $('[data-p3-sticky-host]');
    if (host && host.parentElement !== document.body) document.body.appendChild(host);
  }

  /* --- ulasan: markup mockup, data Judge.me, kendali milik sendiri ----------
     sections/pdp3-reviews.liquid mencetak markup MOCKUP — `.kl_reviews__*`,
     `.p3-rev`, tab, kotak cari, tiga pil — dan widget Judge.me dirender di
     wadah tersembunyi sebagai SUMBER DATA saja.

     Versi sebelumnya menyerahkan pengurutan kepada widget: menekan pil berarti
     menyetel `select` milik Judge.me lalu menunggu ia menggambar ulang. Cara
     itu "berjalan" tapi tidak terlihat berjalan, dan alasannya aritmetika —
     widget hanya memuat DUA ulasan sekaligus, dan 194 dari 200 ulasan toko ini
     berbintang lima. Mengurutkan dua ulasan bintang lima menurut bintang
     menghasilkan dua ulasan bintang lima dalam urutan yang sama. Tidak ada yang
     berubah di layar, jadi tombolnya terbaca mati.

     Sekarang seluruh 200 ulasan ditarik sekali lewat endpoint paginasi widget
     itu sendiri, dan pengurutan, penyaringan, pencarian, serta paginasi
     dikerjakan di sini. Widget tinggal memegang dua hal: cetakan pertama
     (supaya kartu muncul sebelum jaringan menjawab) dan formulir tulis ulasan.

     Endpointnya publik, ber-`access-control-allow-origin: *`, dan memang itu
     yang dipanggil widget sendiri untuk "Load more" — tidak ada kunci rahasia
     yang dibawa ke tema. */
  function initReviews() {
    var sec = $('[data-p3-reviews]');
    if (!sec) return;
    var host = $('[data-p3-jdgm-host]', sec);
    var list = $('[data-p3-rev-list]', sec);
    if (!host || !list) return;

    var verifiedLabel = sec.dataset.verifiedLabel || 'Verified buyer';
    var locale = sec.dataset.locale || 'en';
    var PAGE = Math.max(1, parseInt(sec.dataset.perPage, 10) || 4);
    var search = $('[data-p3-search]', sec);
    var more = $('[data-p3-more]', sec);

    var state = { order: 'newest', score: null, photos: false, q: '', shown: PAGE };
    var seed = [];       // dari cetakan widget — cepat, tapi cuma halaman pertama
    var every = null;    // ke-200-nya
    var fetching = false;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    /* Mockup menulis cap waktu sebagai jarak ("2 weeks ago"), Judge.me sebagai
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
      var who = '<span class="kl_reviews__review__author">' + esc(r.author) + '</span>';
      if (r.verified) who += ' · ' + esc(verifiedLabel);
      var when = ago(r.iso);
      if (when) who += ' · <span class="kl_reviews__review__timestamp">' + esc(when) + '</span>';

      var html = '<div class="p3-rev"><div class="p3-stars" aria-label="' + esc(r.score) + '/5">' + stars(r.score) + '</div>';
      if (r.title) html += '<div class="kl_reviews__review__title">' + esc(r.title) + '</div>';
      if (r.body) html += '<q class="kl_reviews__review__content">' + esc(r.body) + '</q>';
      /* Foto pembeli tidak ada di mockup — keempat ulasan contohnya kebetulan
         tanpa foto. Membuangnya berarti membuang isi yang nyata, jadi ia
         dirender dengan bahasa kartu yang sama (78px, sudut 10px). */
      if (r.pics.length) {
        html += '<div class="p3-rev__pics">' + r.pics.map(function (src) {
          return '<img src="' + esc(src) + '" alt="" loading="lazy" width="78" height="78">';
        }).join('') + '</div>';
      }
      return html + '<div class="p3-who">' + who + '</div></div>';
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
      var oldest = state.order === 'oldest';
      out.sort(function (a, b) { return oldest ? a.time - b.time : b.time - a.time; });
      return out;
    }

    /* --- tab pertanyaan (Judge.me Q&A, dinyalakan 8 Sep 2026) --------------
       Kartu pertanyaan Judge.me: `.jdgm-quest` > header (`.jdgm-quest__asker
       .jdgm-rev__author`, `.jdgm-rev__timestamp[datetime]`) + `.jdgm-quest__body`
       + `.jdgm-quest__answers` berisi `.jdgm-ans` (`.jdgm-ans__answerer
       .jdgm-rev__author`, `.jdgm-ans__body`). Nama-nama itu diambil dari CSS
       dan skrip widget Judge.me, bukan diduga — tapi toko ini belum punya satu
       pun pertanyaan terbit saat ditulis, jadi pembacanya sengaja toleran:
       tiap ruas boleh kosong tanpa merusak kartunya. Hitungan tab dari
       `data-number-of-questions` pada `.jdgm-rev-widg`. */
    var kl = $('.p3-kl-list', sec);
    var qlist = $('[data-p3-quest-list]', sec);
    var qempty = $('[data-p3-quest-empty]', sec);
    var qcount = $('[data-p3-qcount]', sec);
    var answerLabel = (qlist && qlist.dataset.answerLabel) || 'Answer';
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
            return { who: text(a.querySelector('.jdgm-ans__answerer .jdgm-rev__author')) || text(a.querySelector('.jdgm-rev__author')),
                     body: text(a.querySelector('.jdgm-ans__body')) || text(a.querySelector('.jdgm-ans__content')),
                     iso: st ? st.getAttribute('datetime') : '' };
          }).filter(function (a) { return a.body; })
        };
      }).filter(function (q) { return q.body; });
    }
    function qcard(q) {
      var who = '<span class="kl_reviews__review__author">' + esc(q.asker) + '</span>';
      var when = ago(q.iso); if (when) who += ' · <span class="kl_reviews__review__timestamp">' + esc(when) + '</span>';
      var html = '<div class="p3-rev p3-quest"><div class="kl_reviews__review__title">' + esc(q.body) + '</div><div class="p3-who">' + who + '</div>';
      q.answers.forEach(function (a) {
        var aw = '<span class="kl_reviews__review__author">' + esc(a.who) + '</span>';
        var at = ago(a.iso); if (at) aw += ' · <span class="kl_reviews__review__timestamp">' + esc(at) + '</span>';
        html += '<div class="p3-ans"><b>' + esc(answerLabel) + '</b>' + esc(a.body) + '<div class="p3-who">' + aw + '</div></div>';
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
      var showing = kl && kl.getAttribute('data-p3-view') === 'questions';
      qlist.hidden = !showing || !qs.length;
      if (qempty) qempty.hidden = !showing || qs.length > 0;
    }
    function setView(view) {
      if (!kl) return;
      kl.setAttribute('data-p3-view', view);
      $$('[data-p3-tab]', sec).forEach(function (t) {
        var on = t.getAttribute('data-p3-tab') === view;
        t.classList.toggle('p3-on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      syncQuestions();
    }
    $$('[data-p3-tab]', sec).forEach(function (t) {
      t.addEventListener('click', function () { setView(t.getAttribute('data-p3-tab')); });
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView(t.getAttribute('data-p3-tab')); } });
    });

    var empty = $('[data-p3-empty]', sec);
    function apply() {
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
      var out = [].slice.call(sec.querySelectorAll('[data-p3-bars] .kl_reviews__histogram__row'));
      src.forEach(function (row, i) {
        if (!out[i]) return;
        var freq = row.querySelector('.jdgm-histogram__frequency');
        var fill = row.querySelector('.jdgm-histogram__bar-content');
        var count = out[i].querySelector('[data-p3-bar-count]');
        var bar = out[i].querySelector('.kl_reviews__histogram__bar--foreground');
        if (count && freq) count.textContent = freq.textContent.trim();
        if (bar && fill) bar.style.width = fill.style.width || '0%';
        /* Baris histogram berurutan 5→1, dan angkanya dipinjam ke menu
           bintang supaya pilihan yang kosong terlihat kosong sebelum ditekan. */
        var opt = sec.querySelector('[data-p3-score-count="' + (5 - i) + '"]');
        if (opt && freq) opt.textContent = freq.textContent.trim();
      });
    }

    /* --- kendali -----------------------------------------------------------
       Tanda `⌄` di mockup bukan hiasan: ia menandai pil yang membuka DAFTAR
       PILIHAN. Dua pil bertanda panah karena itu punya menu — urutan dan
       saringan bintang — sedangkan "With photos" tidak bertanda karena ia
       saklar yang berdiri sendiri dan bisa digabung dengan keduanya. */
    var RATING_TPL = sec.dataset.ratingLabel || '%n% ★';

    function closeMenus(except) {
      sec.querySelectorAll('[data-p3-filter]').forEach(function (wrap) {
        if (wrap === except) return;
        var menu = wrap.querySelector('[data-p3-menu]');
        var pill = wrap.querySelector('[data-p3-pill]');
        if (menu) menu.hidden = true;
        if (pill) pill.setAttribute('aria-expanded', 'false');
        wrap.classList.remove('p3-open');
      });
    }

    function labelFor(kind) {
      var wrap = sec.querySelector('[data-p3-pill="' + kind + '"]');
      if (!wrap) return;
      var base = wrap.dataset.p3Base || '';
      /* Hanya KATA-nya yang ditulis ulang, bukan seluruh isi pil: panahnya
         elemen tersendiri di sebelahnya, dan `textContent = ...` akan
         menghapusnya. */
      var label = wrap.querySelector('[data-p3-label]') || wrap;
      if (kind === 'order') {
        var opt = sec.querySelector('[data-p3-menu="order"] [data-p3-value="' + state.order + '"]');
        /* Label pil mengikuti pilihan: sesudah memilih "Oldest first", pilnya
           harus berbunyi begitu — kalau tidak, satu-satunya tempat keadaan itu
           terbaca adalah menu yang sudah tertutup. */
        label.textContent = state.order === 'newest' ? base : (opt ? opt.textContent.trim() : base);
        wrap.classList.toggle('p3-on', state.order !== 'newest');
      } else {
        label.textContent = state.score ? RATING_TPL.replace('%n%', state.score) : base;
        wrap.classList.toggle('p3-on', !!state.score);
      }
    }

    sec.querySelectorAll('[data-p3-filter]').forEach(function (wrap) {
      var pill = wrap.querySelector('[data-p3-pill]');
      var menu = wrap.querySelector('[data-p3-menu]');
      if (!pill || !menu) return;

      function toggle() {
        var open = menu.hidden;
        closeMenus(wrap);
        menu.hidden = !open;
        pill.setAttribute('aria-expanded', String(open));
        wrap.classList.toggle('p3-open', open);
      }
      pill.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
      pill.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        if (e.key === 'Escape') { closeMenus(); pill.focus(); }
      });

      menu.addEventListener('click', function (e) {
        var opt = e.target.closest('[data-p3-value]');
        if (!opt) return;
        e.stopPropagation();
        var kind = menu.dataset.p3Menu;
        var val = opt.dataset.p3Value;
        if (kind === 'order') state.order = val || 'newest';
        else state.score = val ? Number(val) : null;

        menu.querySelectorAll('[data-p3-value]').forEach(function (o) {
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

    var photos = sec.querySelector('[data-p3-toggle="photos"]');
    if (photos) {
      function pressPhotos() {
        state.photos = !state.photos;
        photos.classList.toggle('p3-on', state.photos);
        photos.setAttribute('aria-pressed', String(state.photos));
        reset();
        apply();
        loadEvery().then(apply);
      }
      photos.addEventListener('click', function (e) { e.stopPropagation(); pressPhotos(); });
      photos.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pressPhotos(); }
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

    var ask = $('[data-p3-ask]', sec);
    /* --- formulir Judge.me dibuka DI TEMPAT, di bawah kartu ringkasan -------
       Widget di host sudah di-setup Judge.me (jdgm--done-setup-widget), dan
       formulirnya — validasi, unggah foto/video, anti-spam — sepenuhnya milik
       widget. Tapi selama host berada di luar layar, dua hal terjadi: tautan
       `.jdgm-write-rev-link` dipasangi display:none oleh Judge.me (widget
       dianggap tak terlihat), dan pembungkus formulirnya berukuran 0. Klik
       programatik memang membuka formulir, hanya saja di tempat yang tidak
       pernah terlihat pembeli — itulah kenapa tombolnya terasa mati.

       Urutannya sekarang: host dipindah tepat di bawah kartu ringkasan (tempat
       tombolnya ditekan), dijadikan terlihat & masuk aliran lewat kelas, BARU
       tautannya diklik. CSS `.p3-jdgm-host--form` menyembunyikan badan ulasan,
       paginasi, dan baris aksi widget; yang tampil hanya pembungkus formulir
       di header. Memindahkan simpul tidak memutus Judge.me: penangan kliknya
       didelegasikan di document dan simpulnya tidak pernah lepas dari dokumen.

       Menutup: tombol "Cancel review" milik Judge.me di dalam formulir
       menyembunyikan pembungkusnya lagi; itu diikuti dengan memeriksa
       display pembungkus sesaat setelah klik apa pun di host. Tombol kita
       sendiri juga bisa menutup (tekan sekali lagi). */
    var formOpen = false;
    var summary = $('.kl_reviews__summary', sec);
    var motion = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth';
    function setHost(open) {
      formOpen = open;
      host.classList.toggle('p3-jdgm-host--form', open);
      if (!open) host.classList.remove('p3-jdgm-host--qa');
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
       seketika (juga sesudah initializeWidgets(), juga sesudah display
       inline tautannya dihapus tangan) tidak membuka apa pun — Judge.me baru
       membangun `.jdgm-form-wrapper` dan mencabut display:none tautannya
       lewat pemeriksaan visibilitasnya sendiri, beberapa ratus milidetik
       kemudian. Klik yang datang sesudah pembungkus itu ada membuka formulir
       setinggi ~1100px. Jadi pembungkusnya ditunggu (polling 100ms, paling
       lama 3s), lalu diklik. */
    function whenFormReady(linkSel, wrapSel, done) {
      var tries = 0;
      (function tick() {
        var link = host.querySelector(linkSel);
        var ready = link && getComputedStyle(link).display !== 'none' && host.querySelector(wrapSel);
        if (ready || tries++ > 60) return done();
        /* Pemeriksaan visibilitas Judge.me menumpang pada peristiwa gulir;
           di desktop (kolom lebar, host mungkin di luar lipatan) ia bisa
           lewat beberapa detik tanpa gulir — jadi disenggol tiap putaran. */
        window.dispatchEvent(new Event('scroll'));
        window.setTimeout(tick, 100);
      })();
    }
    /* Satu mekanisme untuk dua formulir Judge.me: ulasan
       (.jdgm-write-rev-link → .jdgm-form-wrapper) dan pertanyaan
       (.jdgm-ask-question-btn → .jdgm-question-form-wrapper; modul Tanya-Jawab
       dinyalakan di admin Judge.me 8 Sep 2026). Kalau formulir yang satu masih
       terbuka saat yang lain diminta, Judge.me sendiri yang menukarnya
       (kliknya menutup yang lain). */
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
          var f = host.querySelector(wrapSel) || host;
          f.scrollIntoView({ block: 'start', behavior: motion });
        }, 120);
      });
      return true;
    }
    var activeForm = null;
    function openReviewForm() { activeForm = 'review'; return openJdgmForm('.jdgm-write-rev-link', '.jdgm-form-wrapper'); }
    function openQuestionForm() { activeForm = 'question'; return openJdgmForm('.jdgm-ask-question-btn', '.jdgm-question-form-wrapper'); }
    /* Penutupan diikuti dari DOM, bukan dari klik: Judge.me menutup
       pembungkus formulirnya lewat style inline (tombol "Cancel review",
       Enter di keyboard, atau apa pun yang ia tambahkan nanti). Pengamat ini
       menunggu pembungkusnya pernah TERBUKA dulu — tepat sesudah klik kita
       pembungkusnya memang masih tertutup, dan tanpa syarat itu host akan
       ditutup sebelum sempat terbuka. */
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

    var write = $('[data-p3-write]', sec);
    if (write) {
      write.addEventListener('click', function () {
        if (formOpen && activeForm === 'review') { setHost(false); return; }
        openReviewForm();
      });
    }

    /* "Ask a question": formulir pertanyaan Judge.me, mekanisme yang sama.
       Kalau widget tidak punya tombolnya (modul Tanya-Jawab dimatikan lagi
       di admin Judge.me), tombolnya jatuh ke `data-href` — WhatsApp. */
    if (ask) {
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
    loadEvery().then(function () { apply(); });

    if (!('MutationObserver' in window)) return;
    /* Widget mengisi dirinya bertahap. Selama ke-200-nya belum tiba, cetakan
       pertamanya masih yang tampil, jadi ia diikuti — di-debounce, karena
       kerangka `.jdgm-rev` muncul lebih dulu dan `.jdgm-rev__body` menyusul. */
    var timer = null;
    var mo = new MutationObserver(function () {
      /* Selama formulir terbuka host berada di aliran dengan lebar kolom —
         di ponsel 393px — dan Judge.me memotong badan ulasan panjang pada
         lebar itu; membaca ulang saat itu akan mengganti kutipan utuh dengan
         yang terpotong. */
      if (formOpen) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        seed = readReviews(host);
        syncBars();
        syncQuestions();
        if (!every) apply();
      }, 250);
    });
    mo.observe(host, { childList: true, subtree: true });
  }

  /* --- reveal, bilah, dan anchor yang meluncur -------------------------------
     Satu blok di mockup, dan dibiarkan satu blok di sini karena ketiganya
     digerakkan oleh guliran yang sama. Seluruhnya mati saat pembaca meminta
     gerakan dikurangi — termasuk `js-reveal`, sehingga halamannya terbuka
     dalam keadaan sudah terlihat, bukan transparan menunggu observer. */
  function initMotion() {
    if (reduce) return;
    document.documentElement.classList.add('p3-js-reveal');

    var rvs = $$('.p3-rv');
    var sticky = $('#p3-sticky');
    var packs = $('#p3-packs');
    var lenis = null;

    if (window.Lenis) {
      /* Lenis mencegat roda & sentuhan di seluruh dokumen, termasuk di atas
         wadah gulir bersarang — drawer keranjang (`<form>` di .mini-cart) jadi
         tidak bisa digulir sama sekali di halaman ini, padahal di PDP lain
         (tanpa Lenis) bisa. Diukur 8 Sep: sentuh→0, roda→0; dengan
         `data-lenis-prevent` di .mini-cart keduanya →300. Dua penjaga:
         opsi `prevent` (Lenis ≥1.1) dan atributnya, untuk versi mana pun. */
      var LENIS_PREVENT = '.mini-cart, .search-input-wrapper, .header-popup, [data-lenis-prevent]';
      $$('.mini-cart, .search-input-wrapper, .header-popup').forEach(function (el) { el.setAttribute('data-lenis-prevent', ''); });
      lenis = new window.Lenis({
        lerp: 0.1,
        smoothWheel: true,
        prevent: function (node) { return !!(node && node.closest && node.closest(LENIS_PREVENT)); }
      });
      var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }

    /* Anchor dalam halaman meluncur, bukan melompat. Offsetnya tinggi nav. */
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href === '#') return;
      var t = document.querySelector(href);
      if (!t) return;
      e.preventDefault();
      var top = Math.round(t.getBoundingClientRect().top + window.scrollY - 64);
      if (lenis) {
        lenis.resize();
        lenis.scrollTo(top, { duration: 1.1, easing: function (x) { return 1 - Math.pow(1 - x, 3); } });
      } else {
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });

    function tick() {
      var vh = window.innerHeight;
      rvs.forEach(function (el) {
        if (!el.classList.contains('p3-in') && el.getBoundingClientRect().top < vh * 0.92) {
          el.classList.add('p3-in');
        }
      });
      if (sticky && packs) {
        sticky.classList.toggle('p3-on', packs.getBoundingClientRect().bottom < 0);
      }
    }

    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', tick);
    tick();
    window.setTimeout(tick, 300);
  }

  /* --- video "cara meminumnya" ---------------------------------------------
     Diputar hanya saat terlihat. Video yang berputar di luar layar tidak
     dilihat siapa pun tapi tetap memanaskan ponsel dan menghabiskan kuota. */
  function initHowtoVideo() {
    var v = $('#p3-howto-video');
    if (!v || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
        else v.pause();
      });
    }, { threshold: 0.2 }).observe(v);
  }

  /* --- akordeon FAQ: buka-tutup beranimasi -----------------------------------
     `<details>` bawaan melompat: tingginya berubah seketika, dan `height` tidak
     bisa ditransisikan dari `auto`. Trik CSS yang lebih baru
     (`interpolate-size`, `::details-content`) belum ada di Safari, dan mayoritas
     pembeli halaman ini memakai iPhone. Jadi tingginya dianimasikan lewat
     WAAPI:

       buka  : pasang `open` DULU supaya isinya bisa diukur, lalu animasikan
               tinggi dari tinggi summary ke tinggi penuh;
       tutup : animasikan tinggi penuh ke tinggi summary, dan `open` baru
               dicabut SESUDAH selesai — dicabut lebih dulu, browser
               menyembunyikan isinya seketika dan tidak ada yang tersisa untuk
               dianimasikan.

     Klik saat animasi berjalan membatalkan yang sedang berlangsung dan berbalik
     arah, jadi menekan cepat dua kali tidak meninggalkan tinggi yang
     tersangkut. */
  function initFaq() {
    var items = $$('.p3-faq details');
    if (!items.length) return;
    var OPEN = 380, CLOSE = 280, EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

    items.forEach(function (d) {
      var summary = d.querySelector('summary');
      var body = d.querySelector('.p3-a');
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

  function boot() {
    /* Paling dulu: bilahnya harus sudah di <body> sebelum apa pun mengukurnya. */
    initStickyHost();
    initRouter();
    initPacks();
    initGallery();
    initModal();
    initHowtoVideo();
    initFaq();
    initReviews();
    initMotion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
