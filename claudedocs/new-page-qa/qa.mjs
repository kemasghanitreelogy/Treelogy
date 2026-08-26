#!/usr/bin/env node
/* QA gate untuk SETIAP halaman baru.
 *
 *   node claudedocs/new-page-qa/qa.mjs <handle> [<handle> ...]
 *   node claudedocs/new-page-qa/qa.mjs --all
 *
 * handle = nama template tanpa prefix, mis. `why-capsules` -> templates/page.why-capsules.json
 *
 * Statis by design: tidak butuh toko hidup, jadi bisa jalan sebelum deploy.
 * Yang dijaga:
 *   GATE  keputusan sign-up form sudah DITANYAKAN & dicatat
 *   I18N  tidak ada teks yang dilihat user yang hardcoded
 *   BTN   label DAN tujuan tombol dinamis (ikut locale, bukan path telanjang)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MANIFEST = path.join(HERE, 'pages.json');

/* Template & locale Shopify diawali blok komentar auto-generated -> JSON.parse mati. */
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\s*\/\*[\s\S]*?\*\//, ''));

const SIGNUP_SECTIONS = ['NewslletterForm', 'klaviyo-form', 'RegisterForm'];
/* Section milik tema (header/footer/dll) dipakai lintas-halaman; QA halaman baru hanya
   memeriksa section yang lahir bersama halaman itu. Footer punya newsletter sendiri dan
   itu BUKAN sign-up form halaman. */
const SHARED = /^(Header|Footer|MiniCart|CartDrawer|announcement|Announcement)/;
/* Nama diri tidak diterjemahkan - "Instagram" tetap "Instagram" di /id. Sisanya harus lewat `| t`. */
const PROPER_NOUNS = /^(Treelogy|Instagram|Facebook|TikTok|Pinterest|WhatsApp|YouTube|Twitter|X|LinkedIn|Shopee|Tokopedia|Lazada|Blibli|Klaviyo|Judge\.me|BPOM|HALAL|GMP|HACCP|ISO ?\d*|USDA|COSMOS|Rp|IDR|USD)$/i;

const results = [];
const rec = (page, code, level, msg, where) => results.push({ page, code, level, msg, where });

/* ---------- pembersih liquid ----------
   Setiap potongan diganti newline sebanyak aslinya, supaya nomor baris yang
   dilaporkan tetap cocok dengan file mentah - laporan dengan baris meleset
   lebih buruk daripada tanpa baris sama sekali. */
const blank = (m) => m.replace(/[^\n]/g, ' ');
function stripInert(src) {
  return src
    .replace(/\{%-?\s*schema\s*-?%\}[\s\S]*?\{%-?\s*endschema\s*-?%\}/g, blank)
    .replace(/\{%-?\s*(comment|javascript|stylesheet|style)\s*-?%\}[\s\S]*?\{%-?\s*end\1\s*-?%\}/g, blank)
    .replace(/\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g, blank)
    .replace(/<script[\s\S]*?<\/script>/g, blank)
    .replace(/<style[\s\S]*?<\/style>/g, blank)
    .replace(/<svg[\s\S]*?<\/svg>/g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
}
const stripLiquid = (s) => s.replace(/\{\{[\s\S]*?\}\}/g, blank).replace(/\{%[\s\S]*?%\}/g, blank);
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

/* ---------- kunci locale ---------- */
function localeKeys() {
  const flat = (d, p = '') => {
    const out = new Set();
    for (const [k, v] of Object.entries(d)) {
      const n = p ? `${p}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) for (const x of flat(v, n)) out.add(x);
      else out.add(n);
    }
    return out;
  };
  return {
    en: flat(readJson(path.join(ROOT, 'locales/en.default.json'))),
    id: flat(readJson(path.join(ROOT, 'locales/id.json'))),
  };
}

/* ---------- pemeriksaan per section ---------- */
function checkSection(page, type, LOC) {
  const file = path.join(ROOT, 'sections', type + '.liquid');
  if (!fs.existsSync(file)) {
    rec(page, 'GATE-0', 'fail', 'section "' + type + '" tidak ada di sections/', type);
    return;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const body = stripInert(raw);
  const where = 'sections/' + type + '.liquid';

  /* I18N-1  teks telanjang di antara tag */
  const noLiquid = stripLiquid(body);
  for (const m of noLiquid.matchAll(/>([^<>]{2,})</g)) {
    const txt = m[1].replace(/&[a-z#0-9]+;/gi, '').trim();
    if (!/[A-Za-z]{2}/.test(txt)) continue;
    if (/^[\d\s.,:/%+-]+$/.test(txt)) continue;
    if (PROPER_NOUNS.test(txt)) continue;
    rec(page, 'I18N-1', 'fail', 'teks hardcoded: "' + txt.slice(0, 60) + '"', where + ':' + lineOf(noLiquid, m.index));
  }

  /* I18N-2  atribut yang dibaca user/screen-reader */
  for (const m of body.matchAll(/\b(placeholder|aria-label|title|alt|aria-placeholder)\s*=\s*"([^"]*)"/g)) {
    if (m[2].includes('{{') || m[2].includes('{%') || !/[A-Za-z]{2}/.test(m[2])) continue;
    if (PROPER_NOUNS.test(m[2].trim())) continue;
    rec(page, 'I18N-2', 'fail', 'atribut ' + m[1] + '="' + m[2].slice(0, 50) + '" hardcoded', where + ':' + lineOf(body, m.index));
  }

  /* I18N-3  key `| t` harus ada di EN dan ID */
  let dynamicKeys = 0;
  for (const m of body.matchAll(/(?:'([\w.]+)'|"([\w.]+)"|(\w+))\s*\|\s*t\b/g)) {
    const key = m[1] || m[2];
    if (!key) { dynamicKeys++; continue; }               // key dirakit runtime (append/concat)
    if (!LOC.en.has(key)) rec(page, 'I18N-3', 'fail', 'key "' + key + '" tidak ada di locales/en.default.json', where);
    if (!LOC.id.has(key)) rec(page, 'I18N-3', 'fail', 'key "' + key + '" tidak ada di locales/id.json - halaman jatuh ke bahasa Inggris di /id', where);
  }
  /* I18N-4  key yang dirakit runtime (`'ns.plan_' | append: i | t`) tidak bisa dicocokkan
     satu-satu; yang bisa dijamin: prefix-nya harus punya isi di KEDUA locale. */
  if (dynamicKeys) {
    const prefixes = new Set();
    for (const m of body.matchAll(/'([a-z_][\w]*(?:\.[\w]+)+\.?)'\s*\|\s*append/g)) prefixes.add(m[1]);
    for (const p of prefixes) {
      const nEn = [...LOC.en].filter((k) => k.startsWith(p)).length;
      const nId = [...LOC.id].filter((k) => k.startsWith(p)).length;
      if (!nEn) rec(page, 'I18N-4', 'fail', 'prefix key dinamis "' + p + '" tidak cocok key manapun di en.default.json', where);
      else if (nEn !== nId) rec(page, 'I18N-4', 'fail', 'prefix "' + p + '": ' + nEn + ' key EN vs ' + nId + ' key ID - ada varian yang tidak diterjemahkan', where);
      else rec(page, 'I18N-4', 'info', 'prefix dinamis "' + p + '" seimbang (' + nEn + ' EN / ' + nId + ' ID)', where);
    }
    if (!prefixes.size) rec(page, 'I18N-4', 'warn', dynamicKeys + ' key locale dirakit runtime tanpa prefix literal - cek manual paritas EN/ID', where);
  }

  /* BTN-1  label tombol/link dinamis */
  for (const m of body.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const inner = stripLiquid(m[3]).replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, '').trim();
    if (/[A-Za-z]{2}/.test(inner) && !PROPER_NOUNS.test(inner)) rec(page, 'BTN-1', 'fail', 'label <' + m[1] + '> hardcoded: "' + inner.slice(0, 40) + '"', where + ':' + lineOf(body, m.index));
  }

  /* BTN-2  href internal harus lewat routes.* / setting / filter url - path telanjang
     kehilangan prefix /id dan melempar pengunjung ID balik ke storefront EN */
  for (const m of body.matchAll(/href\s*=\s*"(\/[^"]*)"/g)) {
    if (m[1].includes('{{') || m[1].includes('{%')) continue;
    const pinned = /^\/(id|en)\//.test(m[1]);
    rec(page, 'BTN-2', 'fail',
      'href="' + m[1] + '" hardcoded - ' + (pinned
        ? 'mengunci pengunjung ke satu bahasa apa pun locale-nya'
        : 'kehilangan prefix locale, pengunjung /id terlempar ke storefront EN')
        + '; pakai routes.* atau setting url',
      where + ':' + lineOf(body, m.index));
  }

  /* BTN-3  navigasi via JS harus pakai Shopify.routes.root */
  for (const m of raw.matchAll(/<script[\s\S]*?<\/script>/g)) {
    for (const n of m[0].matchAll(/(location\.href|location\.assign\(|location\.replace\()\s*=?\s*['"](\/[^'"]*)['"]/g)) {
      rec(page, 'BTN-3', 'fail', 'navigasi JS ke "' + n[2] + '" hardcoded - pakai window.Shopify.routes.root', where);
    }
  }

  /* BTN-4  form action ke /cart & /checkout ikut aturan yang sama */
  for (const m of body.matchAll(/action\s*=\s*"(\/[^"]*)"/g)) {
    if (m[1].includes('{{')) continue;
    rec(page, 'BTN-4', 'warn', 'form action="' + m[1] + '" hardcoded', where + ':' + lineOf(body, m.index));
  }
}

/* ---------- pemeriksaan per halaman ---------- */
function checkPage(handle, manifest, LOC) {
  const tpl = path.join(ROOT, 'templates', 'page.' + handle + '.json');
  if (!fs.existsSync(tpl)) {
    rec(handle, 'GATE-0', 'fail', 'templates/page.' + handle + '.json tidak ada', handle);
    return;
  }
  const doc = readJson(tpl);
  const order = doc.order || Object.keys(doc.sections || {});
  const types = order.map((k) => doc.sections && doc.sections[k] && doc.sections[k].type).filter(Boolean);

  /* GATE-1 - inti permintaan: keputusan sign-up harus SUDAH ditanyakan & tercatat. */
  const entry = manifest.pages[handle];
  if (!entry) {
    rec(handle, 'GATE-1', 'fail',
      'halaman belum terdaftar di pages.json - TANYAKAN ke user: "halaman ini include atau exclude sign-up form?" lalu catat jawabannya',
      'templates/page.' + handle + '.json');
  } else if (!['include', 'exclude'].includes(entry.signup)) {
    rec(handle, 'GATE-1', 'fail', 'signup harus "include" atau "exclude", dapat ' + JSON.stringify(entry.signup), 'pages.json');
  } else if (!entry.reason) {
    rec(handle, 'GATE-1', 'fail', 'keputusan sign-up tanpa reason - reason = jawaban user, bukan tebakan', 'pages.json');
  }

  /* GATE-2 - manifes harus cocok dengan template yang benar-benar dirender. */
  const present = types.filter((t) => SIGNUP_SECTIONS.includes(t));
  if (entry && entry.signup === 'include' && present.length === 0) {
    rec(handle, 'GATE-2', 'fail', 'manifes bilang include, tapi tidak ada section sign-up (' + SIGNUP_SECTIONS.join('/') + ') di template', 'templates/page.' + handle + '.json');
  }
  if (entry && entry.signup === 'exclude' && present.length > 0) {
    rec(handle, 'GATE-2', 'fail', 'manifes bilang exclude, tapi template memuat ' + present.join(', '), 'templates/page.' + handle + '.json');
  }
  if (entry && entry.signup === 'include' && entry.signup_section && !present.includes(entry.signup_section)) {
    rec(handle, 'GATE-2', 'warn', 'signup_section "' + entry.signup_section + '" tidak ditemukan di template', 'pages.json');
  }

  /* GATE-3 - namespace locale halaman harus lengkap di kedua bahasa. */
  const ns = entry && entry.locale_namespace;
  if (ns) {
    const en = [...LOC.en].filter((k) => k.startsWith(ns + '.'));
    const id = [...LOC.id].filter((k) => k.startsWith(ns + '.'));
    if (!en.length) rec(handle, 'GATE-3', 'fail', 'namespace "' + ns + '" kosong di en.default.json', 'locales/en.default.json');
    for (const k of en) if (!LOC.id.has(k)) rec(handle, 'GATE-3', 'fail', '"' + k + '" belum diterjemahkan di id.json', 'locales/id.json');
    if (en.length && id.length) rec(handle, 'GATE-3', 'info', 'namespace ' + ns + ': ' + en.length + ' key EN / ' + id.length + ' key ID', 'locales/');
  } else if (entry) {
    rec(handle, 'GATE-3', 'warn', 'locale_namespace null - halaman tidak punya namespace teks sendiri, pastikan memang begitu', 'pages.json');
  }

  const own = types.filter((t) => !SHARED.test(t));
  rec(handle, 'INFO', 'info', own.length + ' section milik halaman: ' + own.join(', '), 'templates/page.' + handle + '.json');
  for (const t of own) checkSection(handle, t, LOC);
  return { doc, entry };
}

/* ================= LAPIS LIVE: offer per varian vs email konfirmasi =================
   Email konfirmasi Shopify TIDAK dirender dari tema — ia mencetak apa yang benar-benar
   ada di order: `variant.title`, harga asli varian, dan tiap baris hadiah. Jadi begitu
   offer per varian berubah (varian ditukar, harga digeser, hadiah ditambah/dicabut),
   yang dilihat pembeli di email bisa langsung beda dari yang dijanjikan halaman —
   tanpa satu baris tema pun berubah. Lapis ini yang mengunci keduanya. */

function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return {};
  const out = {};
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

async function adminGql(env, query, variables) {
  const res = await fetch(`https://${env.STORE_NAME}/admin/api/2025-07/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': env.ADMIN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const VARIANT_Q = `query($ids:[ID!]!){ nodes(ids:$ids){ ... on ProductVariant {
  id title displayName price compareAtPrice sku
  product { title }
  eligible_gifts: metafield(namespace:"custom", key:"eligible_gifts"){ value }
} } }`;

const gid = (id) => 'gid://shopify/ProductVariant/' + String(id).replace(/\D/g, '');
const numId = (g) => String(g).replace(/\D/g, '');
/* "Rp 990.000" / "Rp 1.170.000" -> 990000 / 1170000. Kosong -> null. */
const money = (s) => {
  if (!s || !/\d/.test(s)) return null;
  return Number(String(s).replace(/[^\d]/g, ''));
};
const tKey = (LOC, key) => key; // key resolution dilakukan lewat rawLocale di bawah

function rawLocale(file) {
  return readJson(path.join(ROOT, 'locales', file));
}
const dig = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

async function checkOffer(handle, entry, doc) {
  const offer = entry && entry.offer;
  if (!offer) {
    rec(handle, 'EMAIL-0', 'warn', 'tidak ada blok "offer" di pages.json - lewati pemeriksaan email konfirmasi; isi kalau halaman ini menjual paket per varian', 'pages.json');
    return;
  }
  const env = loadEnv();
  if (!env.STORE_NAME || !env.ADMIN_API_KEY) {
    rec(handle, 'EMAIL-0', 'fail', 'STORE_NAME/ADMIN_API_KEY tidak ada di .env - mode --live butuh Admin API', '.env');
    return;
  }

  /* Setting varian diambil dari template yang BENAR-BENAR dirender, bukan dari default
     schema - itu bedanya "apa yang dijanjikan" dengan "apa yang dikirim". */
  const secKey = Object.keys(doc.sections || {}).find((k) => doc.sections[k].type === offer.section);
  if (!secKey) {
    rec(handle, 'EMAIL-0', 'fail', 'section offer "' + offer.section + '" tidak ada di template', 'pages.json');
    return;
  }
  const st = doc.sections[secKey].settings || {};
  const en = rawLocale('en.default.json');
  const id = rawLocale('id.json');
  const ns = entry.locale_namespace;

  const planIds = {};
  for (const [plan, setting] of Object.entries(offer.plans)) {
    const v = st[setting];
    if (!v) { rec(handle, 'EMAIL-1', 'fail', 'setting "' + setting + '" (paket ' + plan + ') kosong di template - tombol paket tidak menambah apa pun', 'templates/page.' + handle + '.json'); continue; }
    planIds[plan] = numId(v);
  }
  /* Hadiah permalink diikat PER PAKET: di wc-offer setting `gift_variant` hanya
     ditempel ke permalink p3, jadi menganggapnya berlaku untuk semua paket akan
     melaporkan hadiah yang tidak pernah dikirim untuk p1/p2. */
  const giftSettings = offer.gift_settings || {};
  const permalinkGiftsFor = (plan) => (giftSettings[plan] || []).map((s) => st[s]).filter(Boolean).map(numId);
  const allPermalinkGifts = [...new Set(Object.keys(offer.plans).flatMap(permalinkGiftsFor))];

  const ids = [...new Set([...Object.values(planIds), ...allPermalinkGifts])];
  if (!ids.length) return;

  let nodes;
  try {
    nodes = (await adminGql(env, VARIANT_Q, { ids: ids.map(gid) })).nodes;
  } catch (e) {
    rec(handle, 'EMAIL-0', 'fail', 'Admin API gagal: ' + e.message, '.env');
    return;
  }
  const byId = {};
  nodes.forEach((n, i) => { if (n) byId[numId(n.id)] = n; else rec(handle, 'EMAIL-1', 'fail', 'varian ' + ids[i] + ' tidak ada di toko - baris ini tidak akan pernah masuk order', 'templates/page.' + handle + '.json'); });

  /* Kumpulkan varian hadiah yang benar-benar terkirim, dari DUA jalur yang berbeda:
     permalink tombol (setting) dan gift engine (metafield custom.eligible_gifts). */
  const giftIds = new Set(allPermalinkGifts);
  const engineGifts = {};
  for (const [plan, vid] of Object.entries(planIds)) {
    const v = byId[vid];
    if (!v) continue;
    let list = [];
    try { list = v.eligible_gifts ? JSON.parse(v.eligible_gifts.value).map(numId) : []; } catch { list = []; }
    engineGifts[plan] = list;
    list.forEach((g) => giftIds.add(g));
  }
  const missingGift = [...giftIds].filter((g) => !byId[g]);
  if (missingGift.length) {
    const extra = (await adminGql(env, VARIANT_Q, { ids: missingGift.map(gid) })).nodes;
    extra.forEach((n) => { if (n) byId[numId(n.id)] = n; });
  }

  const keyFor = (tpl, plan) => tpl.replace('{ns}', ns).replace('{plan}', plan);
  const freeRe = /^(free|gratis)\s+(.+)$/i;
  const nonProduct = (offer.non_product_perks || ['shipping', 'ongkir', 'gift wrap']).map((s) => s.toLowerCase());

  for (const [plan, vid] of Object.entries(planIds)) {
    const v = byId[vid];
    if (!v) continue;
    const at = 'paket ' + plan + ' (varian ' + vid + ')';

    /* EMAIL-2  harga halaman vs harga varian - email mencetak harga varian, titik. */
    for (const [locName, loc] of [['en', en], ['id', id]]) {
      const shown = money(dig(loc, keyFor(offer.keys.price, plan)));
      const real = Number(v.price);
      if (shown != null && shown !== real) {
        rec(handle, 'EMAIL-2', 'fail',
          at + ': halaman (' + locName + ') tulis Rp ' + shown.toLocaleString('id-ID') + ' tapi varian berharga Rp ' + real.toLocaleString('id-ID') + ' - email konfirmasi akan mencetak angka varian',
          'locales/' + (locName === 'en' ? 'en.default.json' : 'id.json'));
      }
    }

    /* EMAIL-3  harga coret vs compareAtPrice */
    if (offer.keys.price_old) {
      const oldShown = money(dig(en, keyFor(offer.keys.price_old, plan)));
      const cmp = v.compareAtPrice ? Number(v.compareAtPrice) : null;
      if (oldShown != null && cmp == null) {
        rec(handle, 'EMAIL-3', 'fail', at + ': halaman mencoret Rp ' + oldShown.toLocaleString('id-ID') + ' tapi varian tidak punya compare-at - diskon tidak muncul di mana pun selain halaman', 'admin: variant compare-at');
      } else if (oldShown != null && cmp !== oldShown) {
        rec(handle, 'EMAIL-3', 'fail', at + ': harga coret halaman Rp ' + oldShown.toLocaleString('id-ID') + ' != compare-at varian Rp ' + cmp.toLocaleString('id-ID'), 'admin: variant compare-at');
      } else if (oldShown == null && cmp != null) {
        rec(handle, 'EMAIL-3', 'warn', at + ': varian punya compare-at Rp ' + cmp.toLocaleString('id-ID') + ' tapi halaman tidak mencoret apa pun', 'locales/');
      }
    }

    /* EMAIL-4  nama paket di halaman vs judul baris di email konfirmasi.
       Email mencetak product.title + variant.title; halaman mencetak label paketnya
       sendiri. Kalau beda, itu boleh - TAPI harus keputusan sadar yang tercatat, dan
       catatannya diikat ke varian + judul + label. Begitu salah satunya berubah,
       sidik jarinya tidak cocok lagi dan QA memaksa email ditinjau ulang. */
    const pageLabel = dig(en, keyFor(offer.keys.name, plan));
    const emailTitle = v.displayName;
    const ack = (offer.email_label_ack || {})[plan];
    const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
    if (norm(emailTitle).includes(norm(pageLabel)) && pageLabel) {
      // judul email sudah memuat label halaman - pembeli tidak akan bingung
    } else if (!ack) {
      rec(handle, 'EMAIL-4', 'fail',
        at + ': halaman menyebutnya "' + pageLabel + '" tapi email konfirmasi mencetak "' + emailTitle + '" - catat di email_label_ack kalau memang disengaja',
        'pages.json');
    } else if (ack.variant !== vid || norm(ack.email_title) !== norm(emailTitle) || norm(ack.page_label) !== norm(pageLabel)) {
      rec(handle, 'EMAIL-4', 'fail',
        at + ': OFFER PER VARIAN BERUBAH sejak email ditinjau - catatan bilang [varian ' + ack.variant + ' / email "' + ack.email_title + '" / halaman "' + ack.page_label + '"], sekarang [varian ' + vid + ' / email "' + emailTitle + '" / halaman "' + pageLabel + '"]. Tinjau ulang email konfirmasi lalu perbarui email_label_ack',
        'pages.json');
    }

    /* EMAIL-5  hadiah yang DIJANJIKAN copy vs hadiah yang BENAR-BENAR terkirim.
       Dua jalur pengirim (permalink + engine) digabung; yang dibandingkan adalah
       judul produk hadiah, karena itu yang tercetak di email. */
    const delivered = [...new Set([...(engineGifts[plan] || []), ...permalinkGiftsFor(plan)])]
      .map((g) => byId[g]).filter(Boolean);
    const deliveredNames = delivered.map((g) => norm(g.product.title));

    for (const [locName, loc] of [['en', en], ['id', id]]) {
      const perks = dig(loc, keyFor(offer.keys.perks, plan)) || '';
      for (const line of String(perks).split(/<br\s*\/?>/i)) {
        const m = line.replace(/<[^>]*>/g, '').trim().match(freeRe);
        if (!m) continue;
        const promised = norm(m[2]);
        if (nonProduct.some((w) => promised.includes(w))) continue;
        if (!deliveredNames.some((n) => n.includes(promised) || promised.includes(n))) {
          rec(handle, 'EMAIL-5', 'fail',
            at + ': copy (' + locName + ') menjanjikan "' + m[0].trim() + '" tapi tidak ada varian hadiah bernama itu yang terkirim - email konfirmasi tidak akan memuatnya',
            'locales/' + (locName === 'en' ? 'en.default.json' : 'id.json'));
        }
      }
    }
    for (const g of delivered) {
      const perksEn = norm(dig(en, keyFor(offer.keys.perks, plan)) || '');
      if (!perksEn.includes(norm(g.product.title))) {
        rec(handle, 'EMAIL-6', 'warn', at + ': hadiah "' + g.product.title + '" terkirim tapi tidak disebut di copy paket ini', 'locales/en.default.json');
      }
    }

    /* EMAIL-7  hadiah dobel-sumber: permalink DAN engine mengklaim hadiah yang sama. */
    for (const g of (engineGifts[plan] || [])) {
      if (permalinkGiftsFor(plan).includes(g)) {
        rec(handle, 'EMAIL-7', 'warn',
          at + ': hadiah ' + g + ' ditambahkan permalink DAN dijanjikan gift engine (custom.eligible_gifts) - aman hanya selama engine menghitung baris hadiah tanpa properti _Gifted; kalau tidak, email konfirmasi memuatnya dua kali',
          'assets/gift-auto-add.js');
      }
    }
  }

  /* EMAIL-8  hadiah harus benar-benar Rp 0 - email konfirmasi mencetak harga baris. */
  for (const g of giftIds) {
    const v = byId[g];
    if (!v) { rec(handle, 'EMAIL-8', 'fail', 'varian hadiah ' + g + ' tidak ada di toko', 'admin'); continue; }
    if (Number(v.price) !== 0) {
      rec(handle, 'EMAIL-8', 'fail', 'hadiah "' + v.product.title + '" (' + g + ') berharga Rp ' + Number(v.price).toLocaleString('id-ID') + ' - email konfirmasi menagih barang yang halaman sebut gratis', 'admin: variant price');
    } else {
      rec(handle, 'EMAIL-8', 'info', 'hadiah "' + v.product.title + '" Rp 0' + (v.compareAtPrice ? ' (coret Rp ' + Number(v.compareAtPrice).toLocaleString('id-ID') + ')' : ' (tanpa compare-at, nilainya tidak terlihat di email)'), 'admin');
    }
  }
}

/* ---------- runner ---------- */
const manifest = readJson(MANIFEST);
const LOC = localeKeys();
let argv = process.argv.slice(2);
const LIVE = argv.includes('--live');
argv = argv.filter((a) => a !== '--live');
let handles = argv;
if (handles[0] === '--all' || !handles.length) {
  handles = fs.readdirSync(path.join(ROOT, 'templates'))
    .filter((f) => /^page\.[^.]+\.json$/.test(f))
    .map((f) => f.slice(5, -5));
}
for (const h of handles) {
  const ctx = checkPage(h, manifest, LOC);
  if (LIVE && ctx && ctx.doc) await checkOffer(h, ctx.entry, ctx.doc);
}

const ICON = { fail: 'x', warn: '!', info: '.' };
let fails = 0, warns = 0;
for (const h of handles) {
  const rows = results.filter((r) => r.page === h);
  if (!rows.length) continue;
  console.log('\n=== ' + h + ' ' + '='.repeat(Math.max(0, 60 - h.length)));
  for (const r of rows) {
    if (r.level === 'fail') fails++;
    if (r.level === 'warn') warns++;
    console.log('  ' + ICON[r.level] + ' ' + r.code.padEnd(6) + ' ' + r.msg + (r.level === 'info' ? '' : '\n           -> ' + r.where));
  }
}
console.log('\n' + (fails ? 'GAGAL' : 'LULUS') + '  ' + fails + ' fail, ' + warns + ' warn, ' + handles.length + ' halaman');
process.exit(fails ? 1 : 0);
