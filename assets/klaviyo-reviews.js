/* ==========================================================================
   Klaviyo Reviews — klien data + modal + penggambar tampilan widget lama.

   Satu berkas untuk dua section:

     sections/KlaviyoReviews.liquid  (produk selain kapsul)
       → mountReviews(): merender daftar ulasan (kelas klr-*) dari data
         Klaviyo. CSS-nya assets/klaviyo-reviews.css.

     sections/pdp4-reviews.liquid + assets/pdp4.js  (kapsul)
       → pdp4.js memanggil TLKlaviyoReviews.first/all/questions/openWrite/
         openAsk saat setting `source` = klaviyo; markup dan CSS pdp4 tidak
         berubah sama sekali — hanya sumber datanya yang ditukar.

   Dari mana datanya. Endpoint PUBLIK yang dipakai widget Klaviyo sendiri
   (diamati dari lalu lintas widget, bukan dari dokumentasi — Klaviyo tidak
   mendokumentasikannya, jadi ia bisa berubah tanpa pemberitahuan):

     https://fast.a.klaviyo.com/reviews/api/client_reviews/{product_id}/
       ?product_id=…&company_id=…&limit=50&offset=N&sort=1&type=reviews

   Fakta yang diukur 21 Sep 2026 dan menentukan bentuk kode ini:
     • `limit` DIBATASI 50 apa pun yang diminta (100/200/500 tetap 50).
     • `offset` DIBATASI 500 (`{"error_code":"max_offset_exceeded"}` mulai
       offset 550) → paling banyak 550 ulasan per kombinasi sort/media, dan
       TIDAK ada parameter paginasi lain (page/cursor/after/before/since_id
       semuanya diabaikan) maupun filter varian. Produk dengan >550 ulasan
       (kapsul: 1.545) tidak pernah bisa ditarik utuh; yang bisa dijangkau
       adalah GABUNGAN beberapa kolam — lihat all().
     • `sort`: 0/1 terbaru, 2 rating terendah dulu, 3 "paling relevan".
       Tidak ada rating-tertinggi, terlama, saring bintang, atau cari di
       server (`filter`, `search`, `q`, `keyword` diabaikan) — maka urutan dan
       saringan dikerjakan di klien, dan itu berarti SEMUA halaman ditarik
       begitu pembaca menyentuh kendali apa pun (pola yang sama dengan
       pdp4.js terhadap widget lama).
     • `media=true` = hanya ulasan berfoto (satu-satunya saringan server).
     • `summary.rating_histogram` berurutan 1★→5★; `star_rating`,
       `review_count`, `question_count` ikut di setiap respons.
     • `image_uuid` bisa memuat BEBERAPA gambar dipisah koma.
     • CORS `access-control-allow-origin: *`.

   Gambar: reviews-media.services.klaviyo.com/abc/width:W/height:H/
   resizing_type:fill/plain/https://klaviyo.s3.amazonaws.com/reviews/images/
   {uuid} — layanan resize yang dipakai widget; `abc/plain/` = ukuran asli.

   Formulir tulis ulasan / ajukan pertanyaan: widget Klaviyo tidak punya
   formulir sendiri — ia membuka overlay berisi <iframe> ke
   reviews-app.services.klaviyo.com/rr/{product_id} (ulasan) dan
   /qq/{product_id} (pertanyaan), dengan company_id & lang. Iframe itu
   mengirim postMessage string "loaded" lalu "rating_selected" (saat bintang
   dipilih, formulirnya mengembang); tidak ada pesan tinggi, jadi tingginya
   diatur induk. Overlay di sini meniru persis ukuran overlay widget. Dengan
   cara ini bundel JS widget Klaviyo (URL ber-hash yang bisa basi) TIDAK perlu
   dimuat sama sekali.

   Catatan bahasa: halaman formulir itu berbahasa Inggris untuk semua nilai
   `lang` yang dicoba (id, id-id, in, ms). Bukan sesuatu yang bisa diubah dari
   tema.
   ========================================================================== */
(function () {
  'use strict';
  if (window.TLKlaviyoReviews) return;

  /* CSS-nya (modal formulir, lightbox, tampilan widget lama) dimuat oleh
     sections/KlaviyoReviews.liquid; section kapsul (pdp4-reviews) hanya memuat
     skrip ini secara malas — di sana CSS-nya disusulkan dari sini, URL-nya
     diturunkan dari URL skrip (aset Shopify yang sama, hanya ekstensinya). */
  (function ensureCss() {
    if (document.querySelector('link[href*="klaviyo-reviews"]')) return;
    var me = document.currentScript || document.querySelector('script[src*="klaviyo-reviews"]');
    var src = me && me.getAttribute('src');
    if (!src) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = src.replace(/klaviyo-reviews\.js/, 'klaviyo-reviews.css');
    document.head.appendChild(link);
  })();

  var API = 'https://fast.a.klaviyo.com/reviews/api/client_reviews/';
  var FORM = 'https://reviews-app.services.klaviyo.com/';
  var IMG = 'https://reviews-media.services.klaviyo.com/abc/';
  var S3 = 'https://klaviyo.s3.amazonaws.com/reviews/images/';
  var LIMIT = 50;
  var MAX_OFFSET = 500;      /* diukur 21 Sep 2026: 500 lolos, 550 ditolak */
  var MAX_PAGES = MAX_OFFSET / LIMIT + 1;
  var CONCURRENCY = 5;

  function tz() {
    try { return (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Asia/Jakarta'; } catch (e) { return 'Asia/Jakarta'; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /* widget lama menulis tanggal sebagai dd/mm/yyyy di semua bahasa toko ini. */
  function ddmmyyyy(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  /* --- data ------------------------------------------------------------- */
  function url(pid, company, o) {
    o = o || {};
    return API + encodeURIComponent(pid) + '/?product_id=' + encodeURIComponent(pid) +
      '&company_id=' + encodeURIComponent(company) +
      '&limit=' + (o.limit || LIMIT) + '&offset=' + (o.offset || 0) +
      '&sort=' + (o.sort == null ? 1 : o.sort) + '&filter=' +
      '&type=' + (o.type || 'reviews') + '&media=' + (o.media ? 'true' : 'false') +
      '&kl_review_uuid=&preferred_country=ID&tz=' + encodeURIComponent(tz());
  }
  function getJSON(u) {
    return fetch(u, { credentials: 'omit' }).then(function (r) {
      if (r.ok) return r.json();
      return r.text().then(function (t) {
        var code = '';
        try { code = JSON.parse(t).error_code || ''; } catch (e) { /* bukan JSON */ }
        throw new Error(code || ('klaviyo ' + r.status));
      });
    });
  }
  function picUrls(uuid) {
    uuid = String(uuid || '').trim();
    if (!uuid) return null;
    return {
      thumb: IMG + 'width:320/height:320/resizing_type:fill/plain/' + S3 + uuid,
      full: IMG + 'plain/' + S3 + uuid
    };
  }
  /* Nama pengganti dari impor marketplace / pilihan "anonim" di formulir:
     Tokopedia menulis "Pembeli" bila pembeli menyembunyikan namanya (30 dari
     550 ulasan kapsul terendah, 22 Sep 2026). Itu bukan nama pengguna, jadi
     diperlakukan anonim: kartu hanya menulis "Verified buyer" (permintaan user
     17 Sep: "kalo namanya anonymous gausah tampilin"). */
  var ANON = /^(anonymous|anonim|anonyme|an[oó]nimo|anonimo|pembeli|buyer|customer|pelanggan|匿名)$/i;
  function normalize(r) {
    var pics = String(r.image_uuid || '').split(',').map(picUrls).filter(Boolean);
    var author = String(r.author || '').trim();
    return {
      id: String(r.id || ''),
      score: Number(r.rating) || 0,
      title: r.title || '',
      body: r.content || '',
      author: author,
      anonymous: !author || ANON.test(author),
      verified: !!r.verified,
      iso: r.created_at || '',
      time: Date.parse(r.created_at || '') || 0,
      pics: pics,
      reply: r.public_reply_content ? { body: r.public_reply_content, iso: r.public_reply_updated_at || '' } : null
    };
  }
  function summary(s) {
    s = s || {};
    var h = (s.rating_histogram || [0, 0, 0, 0, 0]).slice(0, 5);
    while (h.length < 5) h.push(0);
    return {
      avg: Number(s.star_rating) || 0,
      count: Number(s.review_count) || 0,
      questions: Number(s.question_count) || 0,
      hist: h.map(Number) /* indeks 0 = 1★ … indeks 4 = 5★ */
    };
  }
  function normalizeQuestion(q) {
    /* Toko ini belum punya satu pun pertanyaan saat ditulis, jadi bentuk
       muatannya belum pernah terlihat; pembacanya sengaja toleran. */
    var answers = q.answers || q.public_answers || (q.answer ? [q.answer] : []);
    return {
      body: q.content || q.question || q.body || '',
      asker: q.author || q.name || '',
      iso: q.created_at || '',
      answers: (Array.isArray(answers) ? answers : []).map(function (a) {
        if (typeof a === 'string') return { who: '', body: a, iso: '' };
        return { who: a.author || a.name || '', body: a.content || a.body || '', iso: a.created_at || a.updated_at || '' };
      }).filter(function (a) { return a.body; })
    };
  }

  /* Satu halaman. */
  function page(pid, company, o) {
    return getJSON(url(pid, company, o)).then(function (j) {
      return {
        summary: summary(j.summary),
        reviews: (j.reviews || []).map(normalize),
        hasMore: !!j.has_more,
        total: Number(j.filtered_count) || 0
      };
    });
  }
  /* Halaman pertama — cukup untuk ringkasan + kartu awal. */
  function first(pid, company, o) { return page(pid, company, o); }
  /* Satu KOLAM: halaman 0 dulu (memberi total & ringkasan), sisanya ditarik
     CONCURRENCY sekaligus, berhenti dini begitu server menjawab
     max_offset_exceeded. `count` boleh diberikan bila pemanggil sudah tahu
     berapa yang dibutuhkan (mis. jumlah ulasan ≤4★ dari histogram). */
  function pool(pid, company, o, count) {
    o = o || {};
    return page(pid, company, o).then(function (p1) {
      var total = count != null ? count : (p1.total || p1.reviews.length);
      var pages = Math.min(Math.ceil(total / LIMIT), MAX_PAGES);
      var offsets = [];
      for (var i = 1; i < pages; i++) offsets.push(i * LIMIT);
      var out = p1.reviews.slice();
      var stop = false;
      function run(chunk) {
        if (stop) return Promise.resolve();
        return Promise.all(chunk.map(function (off) {
          var q = {}; for (var k in o) q[k] = o[k]; q.offset = off;
          return page(pid, company, q).then(function (p) { return p.reviews; }).catch(function (e) {
            if (/max_offset/.test(e && e.message)) stop = true;
            return [];
          });
        })).then(function (lists) { lists.forEach(function (l) { out = out.concat(l); }); });
      }
      var chain = Promise.resolve();
      for (var c = 0; c < offsets.length; c += CONCURRENCY) {
        (function (chunk) { chain = chain.then(function () { return run(chunk); }); })(offsets.slice(c, c + CONCURRENCY));
      }
      return chain.then(function () { return { summary: p1.summary, reviews: out, total: total }; });
    });
  }
  function dedup(lists) {
    var seen = {}, out = [];
    lists.forEach(function (l) {
      l.forEach(function (r) { if (!seen[r.id]) { seen[r.id] = true; out.push(r); } });
    });
    return out;
  }
  /* SEMUA yang bisa dijangkau.
       ≤550 ulasan  → satu kolam sort=1, utuh.
       >550 ulasan  → gabungan empat kolam, karena server tidak pernah memberi
                      lebih dari 550 per kolam:
         sort=1              550 terbaru
         sort=2 (kepala)     SEMUA ulasan ≤4★ — sort=2 menaruh rating terendah di
                             depan, dan jumlahnya diketahui dari histogram, jadi
                             hanya halaman yang perlu yang diminta (kapsul: 42 → 1)
         media=true          SEMUA ulasan berfoto (kapsul: 256 → 6 halaman)
         sort=3 (relevan)    550 lain, sebagian tidak beririsan dengan sort=1
       Akibatnya saringan bintang dan foto EKSAK, tapi "muat lebih banyak",
       cari, dan "terlama dulu" hanya menjangkau gabungan ini (kapsul: 969 dari
       1.545, diukur 21 Sep 2026). Angka ringkasan tetap dari server, jadi tetap benar. Dipanggil
       hanya sesudah `load` atau saat pembaca menyentuh kendali. */
  function all(pid, company, o) {
    o = o || {};
    return pool(pid, company, { sort: o.sort == null ? 1 : o.sort }).then(function (p) {
      var reachable = MAX_OFFSET + LIMIT;
      if (p.total <= reachable) return { summary: p.summary, reviews: dedup([p.reviews]), total: p.total, partial: false };
      var s = p.summary;
      var non5 = (s.hist[0] || 0) + (s.hist[1] || 0) + (s.hist[2] || 0) + (s.hist[3] || 0);
      var jobs = [];
      if (non5 > 0) jobs.push(pool(pid, company, { sort: 2 }, non5));
      jobs.push(pool(pid, company, { sort: 1, media: true }));
      jobs.push(pool(pid, company, { sort: 3 }));
      return Promise.all(jobs.map(function (j) {
        return j.then(function (x) { return x.reviews; }).catch(function () { return []; });
      })).then(function (lists) {
        var uniq = dedup([p.reviews].concat(lists));
        return { summary: s, reviews: uniq, total: p.total, partial: uniq.length < p.total };
      });
    });
  }
  function questions(pid, company) {
    return getJSON(url(pid, company, { type: 'questions', limit: 50 })).then(function (j) {
      return (j.reviews || j.questions || []).map(normalizeQuestion).filter(function (q) { return q.body; });
    }).catch(function () { return []; });
  }

  /* --- kunci gulir halaman (dipakai modal formulir DAN lightbox) ----------- */
  var locks = 0;
  function lock() { if (++locks === 1) document.documentElement.classList.add('tl-klr-lock'); }
  function unlock() { if (locks > 0 && --locks === 0) document.documentElement.classList.remove('tl-klr-lock'); }

  /* --- modal formulir Klaviyo --------------------------------------------- */
  var modal = null;
  function closeModal() {
    if (!modal) return;
    modal.remove();
    modal = null;
    unlock();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('message', onMsg);
  }
  function onKey(e) { if (e.key === 'Escape') closeModal(); }
  function onMsg(e) {
    if (!modal || !/\.klaviyo\.com$/.test(e.origin)) return;
    var d = typeof e.data === 'string' ? e.data : '';
    if (d === 'rating_selected') modal.classList.add('is-expanded');
    else if (/^(close|closed|dismiss|submitted|done)$/.test(d)) closeModal();
  }
  function openForm(kind, pid, company, lang, labels) {
    closeModal();
    labels = labels || {};
    var ov = document.createElement('div');
    ov.className = 'tl-klr-modal';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    if (labels.title) ov.setAttribute('aria-label', labels.title);
    var card = document.createElement('div');
    card.className = 'tl-klr-modal__card';
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'tl-klr-modal__close';
    x.setAttribute('aria-label', labels.close || 'Close');
    x.innerHTML = '&times;';
    var fr = document.createElement('iframe');
    fr.className = 'tl-klr-modal__frame';
    fr.title = labels.title || '';
    fr.src = FORM + (kind === 'ask' ? 'qq' : 'rr') + '/' + encodeURIComponent(pid) +
      '?company_id=' + encodeURIComponent(company) + '&lang=' + encodeURIComponent(lang || 'en-us') + '&onsiteEnabled=true';
    card.appendChild(x);
    card.appendChild(fr);
    ov.appendChild(card);
    document.body.appendChild(ov);
    modal = ov;
    lock();
    x.addEventListener('click', closeModal);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMsg);
    x.focus();
    return true;
  }
  function openWrite(pid, company, lang, labels) { return openForm('write', pid, company, lang, labels); }
  function openAsk(pid, company, lang, labels) { return openForm('ask', pid, company, lang, labels); }

  /* --- lightbox foto ulasan -------------------------------------------------
     Latar gelap, foto di tengah, ×, panah kiri/kanan, penghitung "1 / 2",
     klik foto = berikutnya, klik latar/Esc = tutup — tampilan yang sama
     dengan lightbox lama (kelas `klr-lb-*`, CSS bagian 5c) tanpa memuat
     pustaka apa pun. Tab baru hanya cadangan tanpa JS (href tetap ada). */
  var lb = null;
  function closeLightbox() {
    if (!lb) return;
    var was = lb; lb = null;
    was.bg.remove(); was.wrap.remove();
    document.body.classList.remove('klr-lb-is-open');
    document.removeEventListener('keydown', onLbKey);
    unlock();
    if (was.from && was.from.focus) { try { was.from.focus(); } catch (e) { /* elemen sudah hilang */ } }
  }
  function onLbKey(e) {
    if (!lb) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') lbGo(-1);
    else if (e.key === 'ArrowRight') lbGo(1);
  }
  function lbGo(d) { if (lb && lb.items.length > 1) lbShow(lb.index + d); }
  function lbShow(i) {
    var n = lb.items.length;
    lb.index = (i + n) % n;
    var it = lb.items[lb.index];
    var token = ++lb.token;
    lb.container.classList.remove('klr-lb-s-ready');
    lb.figure.style.visibility = 'hidden';
    lb.counter.textContent = (lb.index + 1) + ' / ' + n;
    var probe = new Image();
    function show(src) {
      if (!lb || token !== lb.token) return;
      lb.img.src = src;
      lb.img.alt = it.alt || '';
      lb.img.style.maxHeight = window.innerHeight + 'px';
      lb.container.classList.add('klr-lb-s-ready');
      lb.figure.style.visibility = 'visible';
    }
    probe.onload = function () { show(it.full); };
    probe.onerror = function () { show(it.thumb || it.full); }; /* ukuran asli gagal → thumbnail */
    probe.src = it.full;
  }
  function openLightbox(items, index, from) {
    if (!items || !items.length) return false;
    closeLightbox();
    var bg = document.createElement('div');
    bg.className = 'klr-lb-bg klr-lb-ready';
    var wrap = document.createElement('div');
    wrap.className = 'klr-lb-wrap klr-lb-close-btn-in klr-lb-auto-cursor klr-lb-gallery klr-lb-ready' +
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? ' klr-lb-img-mobile' : '');
    wrap.tabIndex = -1;
    wrap.style.overflow = 'hidden auto';
    wrap.innerHTML =
      '<div class="klr-lb-container klr-lb-image-holder">' +
        '<div class="klr-lb-content"><div class="klr-lb-figure" style="visibility:hidden">' +
          '<button title="Close (Esc)" type="button" class="klr-lb-close">&times;</button>' +
          '<figure><img class="klr-lb-img" alt="">' +
            '<figcaption><div class="klr-lb-bottom-bar"><div class="klr-lb-title"></div>' +
            '<div class="klr-lb-counter"> <span class="klr-lb-counter__number"></span></div></div></figcaption>' +
          '</figure></div></div>' +
        '<div class="klr-lb-preloader">Loading...</div>' +
        (items.length > 1
          ? '<button title="Previous (Left arrow key)" type="button" class="klr-lb-arrow klr-lb-arrow-left klr-lb-prevent-close"></button>' +
            '<button title="Next (Right arrow key)" type="button" class="klr-lb-arrow klr-lb-arrow-right klr-lb-prevent-close"></button>'
          : '') +
      '</div>';
    document.body.appendChild(bg);
    document.body.appendChild(wrap);
    lb = {
      bg: bg, wrap: wrap, items: items, index: 0, token: 0, from: from,
      container: wrap.querySelector('.klr-lb-container'),
      figure: wrap.querySelector('.klr-lb-figure'),
      img: wrap.querySelector('.klr-lb-img'),
      counter: wrap.querySelector('.klr-lb-counter__number')
    };
    document.body.classList.add('klr-lb-is-open');
    lock();
    document.addEventListener('keydown', onLbKey);
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('.klr-lb-close')) { closeLightbox(); return; }
      if (e.target.closest('.klr-lb-arrow-left')) { lbGo(-1); return; }
      if (e.target.closest('.klr-lb-arrow-right')) { lbGo(1); return; }
      if (e.target.closest('.klr-lb-bottom-bar')) return;
      if (e.target.closest('.klr-lb-figure')) { lbGo(1); return; }   /* navigateByImgClick */
      closeLightbox();                                                /* latar */
    });
    lbShow(index || 0);
    wrap.focus();
    return true;
  }

  /* --- penggambar daftar ulasan --------------------------------------------
     Kelas-kelas di bawah (klr-*) adalah kerangka DOM ulasan yang ditata
     assets/klaviyo-reviews.css dan override di theme.css. */
  function starsHtml(score, forSummary) {
    var full = Math.floor(score), rem = score - full, half = false;
    if (rem >= 0.75) full++;
    else if (rem >= 0.25) half = true;
    if (!forSummary) { full = Math.max(0, Math.min(5, Math.round(score))); half = false; }
    var h = '';
    for (var i = 1; i <= 5; i++) {
      var cls = i <= full ? 'klr--on' : (half && i === full + 1 ? 'klr--half' : 'klr--off');
      h += '<span class="klr-star ' + cls + '"></span>';
    }
    return h;
  }
  var TRUNC = 200;
  function bodyHtml(text, readMore, open) {
    text = String(text || '');
    var t = text.replace(/\r/g, '');
    var truncated = false;
    if (!open && t.length > TRUNC + 40) {
      var cut = t.slice(0, TRUNC);
      var sp = cut.lastIndexOf(' ');
      if (sp > TRUNC * 0.6) cut = cut.slice(0, sp);
      t = cut + '...';
      truncated = true;
    }
    var html = esc(t).replace(/\n/g, '<br>');
    return {
      html: html + (truncated ? '<a class="klr-rev__body-read-more" role="button" tabindex="0">' + esc(readMore) + '</a>' : ''),
      cls: truncated ? ' is-truncated' : ''
    };
  }
  /* `open` = pembaca sudah menekan "Read more" pada ulasan ini; isi penuhnya
     dirender ulang dari data (bukan disimpan di atribut DOM — atribut yang
     dibaca balik lalu ditulis sebagai innerHTML membuka celah XSS dari teks
     ulasan). */
  function card(r, L, open) {
    var b = bodyHtml(r.body, L.readMore, open);
    var h = '<div class="klr-rev klr-divider-top klr--done-setup" data-verified-buyer="' + (r.verified ? 'true' : 'false') + '" data-review-id="' + esc(r.id) + '">' +
      '<div class="klr-rev__header">' +
        '<div class="klr-row-product"></div>' +
        '<div class="klr-row-rating">' +
          '<span class="klr-rev__rating" data-score="' + Math.round(r.score) + '" role="img" aria-label="' + Math.round(r.score) + '/5">' + starsHtml(r.score, false) + '</span>' +
          (r.iso ? '<time class="klr-rev__timestamp" datetime="' + esc(r.iso) + '">' + ddmmyyyy(r.iso) + '</time>' : '') +
        '</div>' +
        '<div class="klr-row-profile">' +
          '<div class="klr-rev__icon"></div>' +
          '<span class="klr-rev__author-wrapper"><span class="klr-rev__author">' + esc(r.anonymous ? '' : r.author) + '</span></span>' +
          (r.verified ? '<span class="klr-rev__buyer-badge-wrapper"><span class="klr-rev__buyer-badge"></span></span>' : '') +
        '</div>' +
        '<div class="klr-row-extra"><span class="klr-rev__location"></span></div>' +
        '<div class="klr-rev__br"></div>' +
      '</div>' +
      '<div class="klr-rev__content">' +
        '<b class="klr-rev__title">' + esc(r.title) + '</b>' +
        '<div class="klr-rev__body' + b.cls + '">' + b.html + '</div>';
    if (r.pics.length) {
      h += '<div class="klr-rev__pics">' + r.pics.map(function (p) {
        return '<a class="klr-rev__pic-link" target="_blank" rel="nofollow noopener" href="' + esc(p.full) + '">' +
          '<img class="klr-rev__pic-img" alt="' + esc(r.author) + ' review photo" src="' + esc(p.thumb) + '" loading="lazy" width="96" height="96"></a>';
      }).join('') + '</div>';
    }
    if (L.showReplies && r.reply) {
      h += '<div class="klr-rev__reply"><div class="klr-rev__replier-wrapper"><span class="klr-rev__replier">' + esc(L.shopName) + '</span></div>' +
        '<div class="klr-rev__reply-content">' + esc(r.reply.body).replace(/\n/g, '<br>') + '</div></div>';
    }
    h += '</div><div class="klr-rev__actions"><div class="klr-rev__social"></div><div class="klr-rev__votes"></div></div></div>';
    return h;
  }
  function histogramHtml(s, L) {
    var total = s.count || 1, h = '';
    for (var star = 5; star >= 1; star--) {
      var n = s.hist[star - 1] || 0;
      var pct = n ? Math.max(1, Math.round(n / total * 100)) : 0;
      h += '<div class="klr-histogram__row" data-rating="' + star + '" data-frequency="' + n + '" data-percentage="' + pct + '" role="button" tabindex="0">' +
        '<div class="klr-histogram__star">' + starsHtml(star, false) + '</div>' +
        '<div class="klr-histogram__bar"><div class="klr-histogram__bar-content" style="width:' + pct + '%"></div></div>' +
        '<div class="klr-histogram__frequency">' + n + '</div></div>';
    }
    h += '<div class="klr-histogram__row klr-histogram__clear-filter" data-rating="null" role="button" tabindex="0">' + esc(L.seeAll) + '</div>';
    return h;
  }
  function shell(s, L) {
    var avg = (Math.round(s.avg * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
    if (avg.indexOf('.') < 0) avg += '.0';
    var based = s.count === 1 ? L.basedOn1 : L.basedOn.replace('__N__', String(s.count));
    return '<div style="clear:both"></div>' +
      '<div class="klr-widget klr-review-widget klr--done-setup-widget" data-widget-name="tl_review_widget" data-product-title="' + esc(L.productTitle) + '">' +
      '<div class="klr-rev-widg" data-average-rating="' + esc(avg) + '" data-number-of-reviews="' + s.count + '" data-number-of-questions="' + s.questions + '">' +
        '<div class="klr-rev-widg__header">' +
          '<h2 class="klr-rev-widg__title">' + esc(L.title) + '</h2>' +
          '<div class="klr-row-stars">' +
            '<div class="klr-rev-widg__summary"><div class="klr-rev-widg__summary-inner">' +
              '<div class="klr-rev-widg__summary-stars" role="img" aria-label="' + esc(avg) + '/5">' + starsHtml(s.avg, true) +
                '<span class="klr-rev-widg__summary-average"><br>' + esc(avg) + '/5</span></div>' +
              '<div class="klr-rev-widg__summary-text klr-all-reviews__summary-text--verified">' + esc(based) + '</div>' +
            '</div></div>' +
            '<div class="klr-histogram" data-tl-hist>' + histogramHtml(s, L) + '</div>' +
            '<div class="klr-widget-actions-wrapper">' +
              '<a href="#" class="klr-write-rev-link" role="button" data-tl-write>' + esc(L.write) + '</a>' +
              (L.showAsk ? '<a href="#" class="klr-ask-question-btn" role="button" data-tl-ask>' + esc(L.ask) + '</a>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="klr-row-actions"><div class="klr-rev-widg__sort-wrapper"><label class="klr-sort-dropdown-wrapper">' +
          /* widget lama menyembunyikan label ini secara visual lewat style inline
             (bukan CSS) — disalin apa adanya supaya pembaca layar tetap dapat
             "Sort by" dan mata tidak. */
          '<span class="klr-sort-dropdown-label" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">' + esc(L.sortBy) + '</span>' +
          '<select class="klr-sort-dropdown" data-tl-sort>' +
            '<option value="most-recent">' + esc(L.recent) + '</option>' +
            '<option value="highest-rating">' + esc(L.highest) + '</option>' +
            '<option value="lowest-rating">' + esc(L.lowest) + '</option>' +
            '<option value="with-pictures">' + esc(L.onlyPics) + '</option>' +
            '<option value="pictures-first">' + esc(L.picsFirst) + '</option>' +
          '</select><span class="klr-sort-dropdown-arrow"></span></label></div></div>' +
        '<div class="klr-rev-widg__body"><div class="klr-rev-widg__reviews" data-tl-list></div>' +
          '<div class="klr-paginate"><a class="klr-btn klr-btn--solid klr-paginate__load-more" role="button" tabindex="0" data-tl-more>' + esc(L.more) + '</a></div>' +
        '</div>' +
        '<div class="klr-rev-widg__paginate-spinner-wrapper"><div class="klr-spinner"></div></div>' +
      '</div></div>';
  }

  function mountReviews(root) {
    if (!root || root.dataset.tlMounted) return;
    root.dataset.tlMounted = '1';
    var D = root.dataset;
    var pid = D.productId, company = D.company || 'T9cUqZ';
    var L = {
      productTitle: D.productTitle || '', title: D.lTitle || 'Customer Reviews',
      write: D.lWrite || 'Write a review', ask: D.lAsk || 'Ask a question',
      sortBy: D.lSort || 'Sort by', recent: D.lRecent || 'Most Recent', highest: D.lHighest || 'Highest Rating',
      lowest: D.lLowest || 'Lowest Rating', onlyPics: D.lOnlyPics || 'Only Pictures', picsFirst: D.lPicsFirst || 'Pictures First',
      more: D.lMore || 'Load More', readMore: D.lReadMore || 'Read more', seeAll: D.lSeeAll || 'See all reviews',
      basedOn: D.lBasedOn || 'Based on __N__ reviews', basedOn1: D.lBasedOn1 || 'Based on 1 review',
      close: D.lClose || 'Close', showAsk: D.showAsk === 'true', showReplies: D.showReplies === 'true', shopName: D.shopName || ''
    };
    var PER = Math.max(1, parseInt(D.perPage, 10) || 5);
    var lang = D.locale === 'id' ? 'id' : 'en-us';
    var pool = [], every = null, fetching = null, hasMore = false, sum = null;
    var state = { sort: 'most-recent', score: null, shown: PER, sorted: false };
    var list, more, hist;
    var expanded = {};   /* id ulasan → "Read more" sudah ditekan */
    var lastKey = '';    /* deretan id kartu yang sedang tergambar */
    var byId = {};       /* id → ulasan, untuk merender ulang satu kartu */

    function rows() {
      var src = every || pool;
      var out = src.filter(function (r) { return !state.score || Math.round(r.score) === state.score; });
      if (state.sort === 'with-pictures') out = out.filter(function (r) { return r.pics.length; });
      out.sort(function (a, b) {
        if (state.sort === 'highest-rating') return (b.score - a.score) || (b.time - a.time);
        if (state.sort === 'lowest-rating') return (a.score - b.score) || (b.time - a.time);
        if (state.sort === 'pictures-first') return ((b.pics.length ? 1 : 0) - (a.pics.length ? 1 : 0)) || (b.time - a.time);
        return b.time - a.time;
      });
      /* Tampilan DEFAULT — aturan yang sama dengan pdp4.js (permintaan user
         22 Sep 2026, "untuk yang pertama aturannya sama kayak kapsul"):
         kartu pertama = ulasan terbaru apa pun bentuknya, sisanya = ulasan
         BERFOTO terbaru dulu. Hanya selama pembaca belum menyentuh apa pun —
         memilih urutan dari dropdown (termasuk "Most recent") atau mengeklik
         baris histogram mengembalikan urutan murni waktu; "See all reviews"
         mengembalikan tampilan default lagi. */
      var neutral = !state.sorted && !state.score && state.sort === 'most-recent';
      if (neutral && out.length) {
        /* Kartu pertama WAJIB punya teks (user 22 Sep: "yang pertama newest
           itu wajib ada kata-kata text review-nya") — data Klaviyo penuh
           ulasan rating-saja impor Shopee yang kartunya kosong. */
        var head = out.filter(function (r) { return (r.body || '').trim() || (r.title || '').trim(); })[0] || out[0];
        out = [head].concat(out.filter(function (r) { return r !== head && r.pics.length > 0; }));
      }
      return out;
    }
    function draw() {
      var all = rows();
      var slice = all.slice(0, state.shown);
      /* Ke-semuanya tiba ±2 detik sesudah kartu pertama tampil; kalau deretan
         kartunya tidak berubah, DOM tidak disentuh — foto tidak berkedip dan
         "Read more" yang sudah dibuka tidak menutup lagi. */
      var key = slice.map(function (r) { return r.id; }).join(',');
      if (key !== lastKey) {
        var html = function (arr) { return arr.map(function (r) { byId[r.id] = r; return card(r, L, !!expanded[r.id]); }).join(''); };
        var had = lastKey ? lastKey.split(',').length : 0;
        if (had && key.indexOf(lastKey + ',') === 0) list.insertAdjacentHTML('beforeend', html(slice.slice(had))); /* "Load More": hanya menambah di bawah */
        else list.innerHTML = html(slice);
        lastKey = key;
      }
      /* Sebelum ke-semuanya tiba, "Load More" dinilai dari total server. */
      var remaining = every ? all.length - state.shown : (state.score || state.sort !== 'most-recent' ? all.length - state.shown : ((sum && sum.count) || 0) - state.shown);
      more.hidden = remaining <= 0;
    }
    function loadEvery() {
      if (every) return Promise.resolve();
      if (fetching) return fetching;
      fetching = all(pid, company, { sort: 1 }).then(function (out) { every = out.reviews; sum = out.summary || sum; })
        .catch(function () {}).then(function () { fetching = null; });
      return fetching;
    }
    function selectScore(score) {
      state.score = score;
      state.shown = PER;
      root.querySelectorAll('.klr-histogram__row[data-rating]').forEach(function (row) {
        row.classList.toggle('klr-histogram__row--selected', !!score && row.getAttribute('data-rating') === String(score));
      });
      var clear = root.querySelector('.klr-histogram__clear-filter');
      if (clear) clear.style.display = score ? 'block' : '';
      draw();
      loadEvery().then(draw);
    }
    function wire() {
      list = root.querySelector('[data-tl-list]');
      more = root.querySelector('[data-tl-more]');
      hist = root.querySelector('[data-tl-hist]');
      more.addEventListener('click', function (e) {
        e.preventDefault();
        state.shown += PER;
        var need = state.shown > (every || pool).length;
        draw();
        if (need && !every) {
          /* Halaman pertama sudah habis dan sisanya masih di jalan: tombol
             diganti spinner widget lama sampai datang, bukan tombol yang diam. */
          root.classList.add('is-loading');
          loadEvery().then(function () { root.classList.remove('is-loading'); draw(); });
        }
      });
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var t = e.target.closest('.klr-rev__body-read-more, [data-tl-more], .klr-histogram__row');
        if (t) { e.preventDefault(); t.click(); }
      });
      root.querySelector('[data-tl-sort]').addEventListener('change', function (e) {
        state.sort = e.target.value;
        state.sorted = true;
        state.shown = PER;
        draw();
        loadEvery().then(draw);
      });
      hist.addEventListener('click', function (e) {
        var row = e.target.closest('.klr-histogram__row');
        if (!row) return;
        var v = row.getAttribute('data-rating');
        if (v === 'null' || (state.score && String(state.score) === v)) selectScore(null);
        else if (row.getAttribute('data-frequency') !== '0') selectScore(Number(v));
      });
      list.addEventListener('click', function (e) {
        var pl = e.target.closest('.klr-rev__pic-link');
        if (pl) {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; /* buka di tab baru: biarkan */
          e.preventDefault();
          var rev0 = pl.closest('.klr-rev');
          var links = [].slice.call(rev0.querySelectorAll('.klr-rev__pic-link'));
          openLightbox(links.map(function (a) {
            var im = a.querySelector('img');
            return { full: a.href, thumb: im ? im.currentSrc || im.src : '', alt: im ? im.alt : '' };
          }), links.indexOf(pl), pl);
          return;
        }
        var rm = e.target.closest('.klr-rev__body-read-more');
        if (!rm) return;
        var rev = rm.closest('.klr-rev');
        var id = rev && rev.getAttribute('data-review-id');
        var body = rev && rev.querySelector('.klr-rev__body');
        if (!body || !id || !byId[id]) return;
        expanded[id] = true;
        body.innerHTML = bodyHtml(byId[id].body, L.readMore, true).html;
        body.classList.remove('is-truncated');
      });
      var w = root.querySelector('[data-tl-write]');
      if (w) w.addEventListener('click', function (e) { e.preventDefault(); openWrite(pid, company, lang, { title: L.write, close: L.close }); });
      var a = root.querySelector('[data-tl-ask]');
      if (a) a.addEventListener('click', function (e) { e.preventDefault(); openAsk(pid, company, lang, { title: L.ask, close: L.close }); });
    }
    function boot() {
      /* Dua halaman pertama diminta BERSAMAAN: 50 terbaru (kartu pertama +
         ringkasan) dan 50 terbaru BERFOTO (sisa kartu tampilan default).
         Dengan begitu tampilan default sudah lengkap pada gambar pertama —
         tidak ada kartu yang menyusul lalu mendorong section di bawahnya
         (diukur 22 Sep 2026: tanpa ini CLS 0,13 dari 2 → 5 kartu). Halaman
         berfoto gagal → tetap jalan dengan halaman pertama saja. */
      Promise.all([
        first(pid, company, { sort: 1 }),
        page(pid, company, { sort: 1, media: true }).catch(function () { return { reviews: [] }; })
      ]).then(function (res) {
        var out = res[0];
        sum = out.summary; hasMore = out.hasMore;
        pool = dedup([out.reviews, res[1].reviews]);
        root.innerHTML = shell(sum, L);
        root.classList.add('is-ready');
        wire();
        draw();
        /* Sisanya hanya DITAMBAHKAN di bawah begitu semuanya tiba — tidak ada
           yang bergeser di atas titik pandang. Ditarik sesudah gambar pertama,
           bukan sebelumnya, supaya ringkasan tidak menunggu 6 permintaan. */
        window.setTimeout(function () { loadEvery().then(draw); }, 0);
      }).catch(function () {
        /* Endpoint tidak terjangkau: biarkan kosong, seperti widget yang gagal
           memuat — jangan pernah menjatuhkan halaman produk. */
        root.classList.add('is-ready');
      });
    }
    /* Section ini jauh di bawah lipatan; datanya diminta saat pembaca mendekat
       (1600px ≈ 1,5 detik gulir), bukan saat halaman lahir — cukup supaya
       tempat kosongnya sudah terisi sebelum masuk pandangan. */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (!entries.some(function (en) { return en.isIntersecting; })) return;
        io.disconnect();
        boot();
      }, { rootMargin: '1600px 0px' });
      io.observe(root);
    } else {
      boot();
    }
  }

  function mountAll() {
    /* :not(script) — pdp4.js memuat skrip ini lewat <script data-tl-klaviyo-reviews>;
       penanda itu milik pemuat, bukan wadah ulasan. */
    document.querySelectorAll('[data-tl-klaviyo-reviews]:not(script)').forEach(mountReviews);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
  document.addEventListener('shopify:section:load', function (e) {
    var el = e.target && e.target.querySelector && e.target.querySelector('[data-tl-klaviyo-reviews]:not(script)');
    if (el) { delete el.dataset.tlMounted; mountReviews(el); }
  });

  window.TLKlaviyoReviews = {
    page: page, first: first, all: all, questions: questions,
    openWrite: openWrite, openAsk: openAsk, closeModal: closeModal,
    openLightbox: openLightbox, closeLightbox: closeLightbox,
    normalize: normalize, summary: summary, mountReviews: mountReviews
  };
})();
