# TREELOGY — DOKUMEN MASTER TRACKING END-TO-END

Dibuat 3 Agu 2026. Dokumen tunggal untuk SEMUA sistem tracking Treelogy:
arsitektur, setiap komponen, alur data, cara pakai, cara baca, jebakan, dan
batas yang diketahui. Runbook operasional harian tetap di `SETUP.md`; dokumen
ini adalah peta lengkapnya.

---

## 0 · PETA BESAR (60 detik)

```
PENGUNJUNG
   │  klik iklan/link (utm)
   ▼
┌──────────────────────────── STOREFRONT (theme) ────────────────────────────┐
│ theme.liquid:                                                              │
│  1. Normalizer UTM Meta  (rapikan utm SEBELUM siapa pun membacanya)        │
│  2. gtm-head.liquid      (Consent Mode v2 → dataLayer context →            │
│                           view_item/view_item_list/view_cart → GTM loader) │
│  3. gtm-events.js (r6)   (add_to_cart delta, remove, view_cart drawer,     │
│                           select_item, section_*, hero_*, whatsapp_click)  │
│  4. Script UTM→cart      (stamp utm_* + _ga_cid + _ga_sid ke cart          │
│                           attributes; re-apply tiap mutasi cart)           │
└────────────────────────────────────────────────────────────────────────────┘
   │ checkout (theme tidak bisa menjangkau)
   ▼
┌ CUSTOM PIXEL (Customer events) ┐      ┌────────── SERVER (Vercel) ─────────┐
│ begin_checkout                 │      │ treelogy-wa-sync                   │
│ add_shipping_info              │      │  /api/ga4-purchase-backstop        │
│ add_payment_info               │      │    ← webhook orders/paid           │
│ (PURCHASE TIDAK DIKIRIM SINI)  │      │  /api/ga4-refund                   │
└────────────────────────────────┘      │    ← webhook refunds/create        │
   │                                    │  /api/cron-ga4-reconcile           │
   ▼                                    │    ← Vercel cron 00:30 WIB harian  │
┌─────── GTM (GTM-5M855J4V) ─────┐      │  Ledger: metafield order           │
│ Google Tag GA4 (G-N28QHJH222)  │      │  ga4.mp_sent / ga4.mp_refund_<id>  │
│ + 1 tag passthrough (regex     │      └──────────────┬─────────────────────┘
│   semua event custom+ecommerce)│                     │ Measurement Protocol
└───────────────┬────────────────┘                     │ (purchase & refund,
                ▼                                      ▼  cid+sid asli)
        ┌─────────────────────── GA4 (property 396932726) ──────────────────┐
        │ retention 14 bln · 15 custom dims · filter internal-IP aktif ·    │
        │ karantina sh- (gy_ads_spillover) · 3 annotations rezim pengukuran │
        └───────────────────────────────────────────────────────────────────┘
```

**Prinsip arsitektur:** perilaku (view→ATC→checkout) dari sisi klien;
**uang (purchase/refund) dari sisi server — satu order = satu event,
dijamin ledger, bukan asumsi.**

---

## 1 · INVENTARIS KOMPONEN

### 1a. Theme (repo `Treelogy`, branch `staging` = tema live)

| File | Fungsi | Jebakan khusus |
|---|---|---|
| `layout/theme.liquid` (± baris 204) | **Normalizer UTM Meta** — sebelum `gtm-head`. source `meta/fb`→`facebook`; medium berisi placement/`{{placement}}` → `paid-social` + placement pindah ke `utm_term`; URL benar tidak disentuh; `history.replaceState`. | Jangan tulis `{{` literal di .liquid (pakai `'{'+'{'`). Boleh dihapus HANYA kalau semua template Ads Manager sudah bersih permanen. |
| `snippets/gtm-head.liquid` | Consent Mode v2 (granted global, denied EEA/UK/CH `wait_for_update` 500ms) → `__gtmCtx` (currency, locale, cartItems seed) → push context (page_locale, page_type, market_*, customer_*) → `view_item` (PDP) / `view_cart` (/cart) / `view_item_list` (collection, 12 item) → **`{ecommerce:null}`** → GTM loader → `gtm-events.js` defer. Semua digate `document.prerendering`. | No-op sampai `settings.gtm_container_id` terisi. `{ecommerce:null}` setelah blok WAJIB (tag GA4 send-ecommerce menembak semua event). Guard currency `XXX`. |
| `assets/gtm-events.js` (**r6**) | Semua event interaksi + intercept fetch/XHR cart. `pushEvent()` = push + reset 11 param ephemeral. `add_to_cart` = **DELTA vs cache cart-state** (respons `/cart/add.js` berisi qty TOTAL baris). `item_id` = `sku \|\| variant_id` (variant-first). Hero listener di **window-capture** (kebal interceptor seamless). Resync /cart.js saat bfcache/refocus (throttle 30 dtk). | Event baru WAJIB via `pushEvent()`, wajib prerender gate. Asset di CDN ber-digest — setelah deploy, verifikasi konten tersaji. |
| `theme.liquid` script UTM→cart (± baris 620) | Simpan utm_* dari URL (localStorage TTL 30 mnt) + baca cookie `_ga` & `_ga_N28QHJH222` **fresh tiap push** → POST `/cart/update.js` attributes: `utm_*`, `_ga_cid`, `_ga_sid`. Re-apply setelah tiap mutasi cart (`/cart/add\|change\|update\|clear`). | `pushToCart` WAJIB pakai `rawFetch` pre-wrap — lewat wrapper sendiri = loop POST tak berujung (insiden 29 Jul). |
| `sections/LinksHub.liquid` | `links_hub_click/share/upsell_click` — tiap push diikuti reset `{channel,link_url,link_label: null}`. | Aturan reset ephemeral berlaku utk push dataLayer di file MANA PUN. |
| `sections/FeaturedProduct.liquid` | `data-hero-version` (skrg `iop-protocol-2cta-v1`) + `data-hero-product`. Ganti versi hero = ganti atribut ini saja, semua event otomatis terlabel. | Tombol seamless pakai `.button-direct-add` + `data-variant`; jangan tambah `open-popup-variants`. |

### 1b. Custom pixel (Shopify Admin → Settings → Customer events → "GTM Checkout Funnel", id 166920380)

Sumber file: `claudedocs/gtm/custom-pixel-checkout.js`. GTM di-load **lazy**
(hanya saat event checkout pertama) supaya storefront tidak dobel container.
Mengirim: `begin_checkout`, `add_shipping_info`, `add_payment_info`.
**`purchase` SENGAJA TIDAK dikirim dari pixel** (sejak 31 Jul) — komentar guard
ada di file. Perubahan file ini TIDAK otomatis live: **user harus re-paste**
di Customer events.

### 1c. GTM container `GTM-5M855J4V` (akun "Treelogy")

- Tag 1: **Google Tag** GA4 `G-N28QHJH222`, `send_page_view = {{JS - is top window}}`
  (sandbox pixel tidak kirim page_view `/wpm@...`).
- Tag 2: **GA4 Event passthrough** — Event Name `{{Event}}`, Send ecommerce data
  (Data Layer), 9+ parameter DLV; trigger Custom Event regex mencakup semua
  event kustom (lihat kamus §3).
- Import file: `claudedocs/gtm/gtm-container-import.json` (fallback manual di SETUP.md).

### 1d. Server `treelogy-wa-sync` (folder `~/Documents/treelogy-wa-sync` — **BUKAN git repo**; deploy: `cd` ke folder → `vercel deploy --prod --yes`)

| Endpoint | Trigger | Fungsi |
|---|---|---|
| `POST /api/ga4-purchase-backstop` | Webhook `orders/paid` | Verif HMAC → skip test/non-web → **cek ledger `ga4.mp_sent` (guard race/redelivery)** → `buildMpPurchase()` → MP → tulis ledger. |
| `POST /api/ga4-refund` | Webhook `refunds/create` | Verif HMAC → fetch order induk (checkout_token, cid, source) → skip non-web/restock-only → **cek `ga4.mp_refund_<id>`** → MP event `refund` (value = transaksi refund sukses) → tulis ledger. |
| `GET /api/cron-ga4-reconcile` | Vercel cron `30 17 * * *` UTC (=00:30 WIB) + bisa manual | Sapu order web-paid **3 hari terakhir** → kirim HANYA yang tanpa ledger (backfill bocor, jendela 72 jam MP) → verifikasi webhook `ORDERS_PAID` & `REFUNDS_CREATE` masih terdaftar, **re-register otomatis kalau hilang**. Auth `Bearer CRON_SECRET`. |
| `POST /api/ga4-purchase-backstop` dkk. | — | Mapping tunggal `buildMpPurchase()` dipakai webhook & cron — tidak bisa divergen. |
| (warisan) `/api/extension-consent`, `/api/shopify-webhook`, `/api/cron-sweep` | — | Pipeline WA consent (dokumen terpisah). |

Detail mapping purchase MP: `transaction_id = checkout_token` (fallback
`order.id`), `client_id` = `_ga_cid` dari note_attributes (validasi ketat
`\d+.\d+`; fallback sintetis `backstop.<order_id>`), `session_id` = `_ga_sid`,
`timestamp_micros = created_at` di-clamp ≤71 jam, `value = current_total_price`,
tax/shipping/coupon/items (item_id = `sku||variant_id`), param
`purchase_source: "mp_backstop"`, `engagement_time_msec: 1`, **tanpa `event_id`**.

Env Vercel production: `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`
(= client secret app custom — sama dgn `CLIENT_SECRET_APP` di `.env` repo),
`SHOPIFY_API_KEY/SECRET`, `SHOPIFY_STORE`, `GA4_MEASUREMENT_ID`,
`GA4_API_SECRET` (MP secret), `CRON_SECRET`, `KLAVIYO_*`.

### 1e. Webhook Shopify aktif (via app custom, HMAC = client secret app)

```
CUSTOMERS_CREATE / CUSTOMERS_UPDATE → /api/shopify-webhook       (WA consent)
ORDERS_PAID                         → /api/ga4-purchase-backstop
REFUNDS_CREATE                      → /api/ga4-refund
```
Registrasi idempoten: `claudedocs/gtm/register-orders-paid-webhook.mjs`;
cron reconcile juga self-heal kalau ada yang hilang.

### 1f. Konfigurasi GA4 (property **396932726** "Treelogy.com", stream "Treelogy Website", TZ toko/GA4 = **UTC+8**)

| Item | Nilai | Catatan |
|---|---|---|
| Event data retention | **14 months** (diubah 2 Agu dari default 2 bln) | Tanpa ini, Explorations kehilangan data >2 bln. |
| Custom dimensions (15, scope Event) | `page_locale, market_country, customer_logged_in, section_id, from_section, item_handle, link_url, link_label, channel, hero_version, atc_source, cta_label, cta_position, variant_id, purchase_source` | Dimensi mengisi sejak didaftarkan. |
| Key events | `purchase` (otomatis), `whatsapp_click` | — |
| Modify events: **"Quarantine G&Y ads spillover"** | `event_id` starts with `sh-` → rename `gy_ads_spillover` | JANGAN dihapus selama app Google & YouTube terpasang. Event kita tidak boleh punya `event_id`. |
| Internal traffic | Rule IP equals `202.58.206.123` (kantor/QA) + Data filter **Active** | IP ISP bisa berubah → cek `curl ifconfig.me`; HP seluler tidak terfilter. |
| Annotations | 29 Jul 🔵 backstop live · 1 Agu 🟢 MP single-source · 2 Agu 🟣 normalizer UTM | Penanda rezim pengukuran di semua grafik. |
| Measurement Protocol secret | Dibuat 29 Jul (stream → MP API secrets) | Nilai hanya di env Vercel. |
| Dedup channel | Koneksi GA4 di app **Google & YouTube DIPUTUS** (28 Jul) | JANGAN klik "Get started"/"Migrate your Google tags" — mengaktifkan = data dobel kembali. |

### 1g. Iklan Meta (Ads Manager)

Template URL parameter benar (field **Parameter URL**, URL Situs Web bersih
tanpa utm):
```
utm_source=facebook&utm_medium=paid-social&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_content={{ad.name}}&utm_term={{placement}}
```
Template lama yang rusak (di URL Situs Web): `utm_source=meta&utm_medium={{placement}}&utm_campaign={{adset.name}}`
— medium=placement (nyasar "Organic Social"), campaign diisi nama AD SET.
Normalizer theme menambalnya untuk iklan yang belum diedit. Ingat: kolom
"Campaign" GA4 pra-perbaikan sebenarnya berisi nama ad set.

---

## 2 · ALUR DATA END-TO-END (per skenario)

1. **Landing dari iklan** → Normalizer merapikan utm → gtm-head: consent
   default → context push → `view_item` (kalau PDP) → `{ecommerce:null}` →
   GTM load → Google Tag kirim `page_view` (+utm bersih menentukan
   source/medium sesi).
2. **Browsing** → gtm-events: `section_view` (≥40% viewport, 1×/section),
   `select_item` (klik link produk), `hero_view`/`hero_cta_click` (ber-
   `hero_version`), `whatsapp_click`, LinksHub events. Tiap push diikuti
   reset param ephemeral.
3. **Cart** → intercept `/cart/add.js` → `add_to_cart` DELTA (+`atc_source`
   kalau ≤15 dtk setelah klik CTA hero); `/cart/change|update` → diff →
   add/remove; drawer terbuka → `view_cart`. Setelah TIAP mutasi cart, script
   UTM men-stamp ulang `utm_*` + `_ga_cid`/`_ga_sid` ke cart attributes
   (termasuk pasca `/cart/clear` buy-now).
4. **Checkout** → pixel sandbox: `begin_checkout` → `add_shipping_info` →
   `add_payment_info`. Cart attributes ikut menjadi `note_attributes` order.
5. **Pembayaran sukses** → Shopify `orders/paid` → webhook → cek ledger →
   MP `purchase` dengan **cid+sid asli** → tulis `ga4.mp_sent`. GA4 menerima
   purchase yang menempel ke user & sesi aslinya (atribusi + funnel utuh).
   Pembeli yang tidak kembali dari QRIS/VA **tetap tercatat**.
6. **Jaring pengaman** → 00:30 WIB cron menyapu 3 hari: order tanpa ledger
   di-backfill; webhook hilang di-re-register. Kegagalan transient → Shopify
   retry (respon 500).
7. **Refund** → `refunds/create` → event `refund` MP dengan transaction_id
   sama → metrik Refund amount di GA4.

---

## 3 · KAMUS EVENT LENGKAP

| Event | Sumber | Kapan | Param penting |
|---|---|---|---|
| `page_view` | Google Tag (GTM) | tiap halaman (main window saja) | + context |
| `view_item` | gtm-head (Liquid) | load PDP | ecommerce.items, value |
| `view_item_list` | gtm-head | load collection (12 pertama) | item_list_id/name |
| `select_item` | gtm-events | klik link `/products/` | item_handle, from_section |
| `add_to_cart` | gtm-events | delta sukses `/cart/add` + kenaikan via change/update | ecommerce, atc_source?, item_variant_id |
| `remove_from_cart` | gtm-events | penurunan qty via change/update (diff; `/cart/clear` sengaja silent) | ecommerce |
| `view_cart` | gtm-events + gtm-head | drawer `.mini-cart.active` (snapshot /cart.js) ATAU halaman /cart | ecommerce |
| `begin_checkout` / `add_shipping_info` / `add_payment_info` | custom pixel | tahap checkout | ecommerce |
| `purchase` | **SERVER (MP) SAJA** | orders/paid | transaction_id=checkout_token, value, items, purchase_source=mp_backstop, session_id |
| `refund` | server (MP) | refunds/create | transaction_id, value, items |
| `whatsapp_click` | gtm-events | klik wa.me/api.whatsapp/whatsapp: | link_url, from_section |
| `section_view` / `section_click` | gtm-events | section ≥40% / klik dalam section | section_id, link_url |
| `hero_view` / `hero_cta_click` / `hero_image_click` | gtm-events | hero collection | hero_version, cta_label, cta_position, variant_id |
| `links_hub_click` / `_share` / `_upsell_click` | LinksHub.liquid | interaksi LinksHub | link_url, link_label, channel |
| `consent_update` | gtm-events | pilihan cookie banner | consent_analytics/marketing |
| `gy_ads_spillover` | hasil karantina | sampah pixel app G&Y | ABAIKAN di laporan |
| `view_search_results`, `scroll`, `form_*`, `session_start`, `first_visit`, `user_engagement` | GA4 enhanced/otomatis | — | — |

Context di semua hit: `page_locale, page_type, page_template, market_country,
market_currency, customer_logged_in (+orders_count)`. Param ephemeral
(11: section_id, from_section, item_handle, link_url, link_label, channel,
hero_version, atc_source, cta_label, cta_position, variant_id) direset
setelah tiap event.

---

## 4 · CARA MENGGUNAKAN (operasional)

### 4a. Akses data GA4 dari CLI (satu-satunya jalur yang terbukti)

gcloud/ADC **diblokir Google** untuk akun ini. Jalur yang jalan: **OAuth
Playground** (developers.google.com/oauthplayground):
1. Step 1 → "Input your own scopes" →
   `https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/analytics.edit`
   (dua scope sekaligus = satu token untuk baca + tulis konfigurasi).
2. Authorize → login `kemas@treelogy.com` → Step 2 → **Exchange authorization
   code for tokens** → copy `access_token` (`ya29.`, umur 1 jam).
3. Refresh token Playground dicabut ±24 jam — untuk sesi baru ulangi dari awal;
   dalam 24 jam bisa pakai field Refresh token → "Refresh access token".
- Data API menolak token edit-only; Admin API (retention, annotations,
  custom dims) butuh edit. Selalu set `"limit": 100000` di runReport.

### 4b. Skrip siap pakai (semua di `claudedocs/gtm/`)

```bash
# Validasi kesehatan harian/mingguan (paritas, dobel, purchase_source, rasio, atribusi)
GA4_TOKEN=ya29... START=2026-08-02 END=2026-08-03 node claudedocs/gtm/ga4-validate.mjs

# Funnel journey lengkap (master×device×channel×new-returning + hero + checkout micro)
GA4_TOKEN=ya29... node claudedocs/gtm/funnel-suite.mjs   # edit RANGE di file utk periode lain

# Registrasi ulang webhook orders/paid (idempoten; refund di-self-heal cron)
node claudedocs/gtm/register-orders-paid-webhook.mjs

# Trigger reconcile manual (aman kapan pun — ledger mencegah dobel)
#   CRON_SECRET: cd ~/Documents/treelogy-wa-sync && vercel env pull .env.local
curl -H "Authorization: Bearer $CRON_SECRET" https://treelogy-wa-sync.vercel.app/api/cron-ga4-reconcile

# Deploy server
cd ~/Documents/treelogy-wa-sync && vercel deploy --prod --yes

# Render laporan PDF dari src.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --no-pdf-header-footer --print-to-pdf=out.pdf "file:///path/ke/file.src.html"
```

### 4c. Cara MEMBACA data dengan benar

| Pertanyaan | Cara benar |
|---|---|
| Berapa order/revenue (uang) | **Shopify Analytics** — source of truth finansial (net, refund, semua channel). |
| Berapa purchase web di GA4 | Reports → Events → `purchase`. **Sejak 2 Agu** angka standar = akurat 1:1. Era lama: lihat kalender §5. |
| Purchase realtime | **JANGAN dijumlah dari Realtime** (pre-dedup). Realtime hanya untuk "ada aktivitas". |
| MP vs pixel | breakdown dimensi **Purchase source** (`mp_backstop` = jalur server). |
| Funnel/journey | Explorations Funnel ATAU `funnel-suite.mjs` (basis users, kebal artefak). Funnel tertutup tidak memuat purchase ber-cid sintetis (±8%). |
| Channel | Sejak 2 Agu label benar (`facebook / paid-social`). Sebelumnya: mayoritas "Organic Social" = iklan Meta salah label — baca gabungan. |
| Perbandingan periode lintas 29 Jul | SELALU sebut annotations: lonjakan +25% = perbaikan alat ukur, bukan pertumbuhan. Bandingkan uang via Shopify. |
| Revenue net di GA4 | `Purchase revenue − Refund amount` (refund TIDAK mengurangi purchase revenue retroaktif). |
| Batas hari | TZ toko & GA4 = **UTC+8** (bukan WIB) → batas hari = 16:00 UTC. |

### 4d. Ritual verifikasi berkala (mingguan, ±5 menit)

1. `ga4-validate.mjs` untuk 7 hari terakhir → purchase unik == order web-paid
   Shopify; nol transaction_id dobel; `view_item < page_view`.
2. Cek respons cron (`already` ≈ semua, `sent` ≈ 0, `failed` = 0,
   `reregistered` = []).
3. Spot-check order terbaru punya `_ga_cid` di attributes (target ≥85%).
4. Kalau IP kantor berubah → update rule internal traffic.

### 4e. QA tanpa mengotori data

Selalu QA dari IP kantor (terfilter) — QA dari jaringan lain akan masuk data.
Jangan pakai `utm_source` asli untuk tes; sesi QA historis ber-utm
`looptest/phase2test/qa-*` (29 Jul–2 Agu) volumenya kecil, abaikan.

---

## 5 · KALENDER ERA DATA (cara baca per periode)

| Periode | Status | Cara baca purchase |
|---|---|---|
| ≤ 28 Jul 2026 | Era pra-fondasi: view_item inflated (prerender), page_view dobel (sandbox), purchase bocor ±25% (client-only) | Jangan pakai untuk analisis presisi; uang via Shopify. |
| 29 Jul | Transisi: backstop live 09:43, pixel re-paste 10:30, fase-2 siang | 32 tx unik (4 pagi bocor); event 46 (dobel transisi) → **hitung transaction_id UNIK di Explorations** |
| 30–31 Jul | Paritas unik OK (25 & 35) TAPI event digandakan insiden cron buta (54 & 71+ event) — permanen | **WAJIB transaction_id unik**; jangan pakai event count |
| 1 Agu | MP single-source sejak ~10:30; 13 order, 1 dobel sisa (#9589 ×3) | Hampir bersih; unik = 13 |
| **≥ 2 Agu** | **Bersih struktural** — ledger aktif penuh | Laporan standar apa adanya, 1 order = 1 event |

Perilaku non-purchase (view/ATC/section/hero) bersih sejak **29–30 Jul**
(prerender gate + delta + karantina). Baseline analisis perilaku: 30 Jul.

---

## 6 · ATURAN KERAS & JEBAKAN (jangan dilanggar)

1. **JANGAN PERNAH kirim event ke MP tanpa cek ledger** (`ga4.mp_sent` /
   `ga4.mp_refund_<id>`). GA4 TIDAK men-dedup lintas batch — resend keesokan
   hari di-APPEND (insiden 30–31 Jul, permanen).
2. **Jangan simpulkan dari data intraday** — cek "count tak berubah" 31 Jul
   menyesatkan karena processing lag. Verifikasi angka = H+1.
3. **Purchase hanya dari server.** Jangan tambahkan kembali
   `analytics.subscribe('checkout_completed')` di pixel tanpa mematikan MP.
4. **Semua script tracking theme WAJIB prerender gate** (`document.prerendering`
   → `prerenderingchange`).
5. **Push dataLayer di file mana pun wajib reset param ephemeral-nya**;
   event ecommerce wajib `{ecommerce:null}` sebelum/at sesudahnya.
6. **Listener klik analytics = window-capture** (interceptor seamless-ATC
   men-stopImmediatePropagation di document-capture).
7. **Event kita tidak boleh punya `event_id`** (sidik jari karantina `sh-`).
8. **`pushToCart` UTM script wajib `rawFetch`** — lewat wrapper sendiri = loop.
9. **Jangan tulis `{{` literal di file .liquid** — dan **sync GitHub→Shopify
   MENOLAK DIAM-DIAM commit yang gagal validasi Liquid** (push sukses, live
   tidak berubah, nol error). Setiap push yang menyentuh .liquid → verifikasi
   tersaji (Admin API assets `updated_at` / uji perilaku). Fallback: PUT asset
   via Admin API (aman bila konten == GitHub HEAD).
10. **Asset CDN ber-digest** — HTML bisa menahan `?v=` lama belasan menit;
    verifikasi konten asset, bukan cuma push.
11. **Jangan aktifkan Google Analytics di app Google & YouTube** dan abaikan
    banner "Migrate your Google tags" — keduanya mengembalikan data dobel.
    Koneksi yang benar: Merchant Center + Ads TANPA GA.
12. **UTM case-sensitive** di GA4; nilai statis lowercase; medium penentu
    channel (`paid-social`); jangan pernah UTM di link internal situs sendiri.
13. **Semantik `/cart/add.js`**: respons qty = TOTAL baris — add_to_cart wajib
    delta. `/cart/clear` sengaja tanpa event (flow buy-now).
14. **`transaction_id` = `checkout.token`/`checkout_token` di SEMUA jalur** —
    kunci dedup; jangan ganti ke order.id di satu sisi saja.

---

## 7 · BATAS YANG DIKETAHUI (by design, bukan bug)

- **±6–20% order tanpa `_ga_cid`** (ad-blocker/ITP/cookie belum set; terukur
  harian 80–94%) → purchase tercatat (cid sintetis) tapi journey yatim,
  atribusi "direct". Tidak ada solusi sisi web.
- **Cross-device tanpa login tidak terjahit** (hosted new customer accounts —
  theme tak bisa kirim user_id).
- **Safari ITP** membatasi cookie 7 hari → returning-user terfragmentasi
  (insight retensi = undercount).
- **Funnel tertutup** tidak memuat purchase bersintetis-cid.
- **"Paritas 1:1"** = order WEB, PAID, per tanggal DIBUAT (UTC+8), gross −
  event refund. Shopify "Total sales" beda definisi (semua channel + pending
  − refund) — bukan pembanding mentah.
- **MP membalas 204 bahkan untuk event yang dibuangnya** → tidak ada alarm
  end-to-end otomatis; mitigasi = ritual §4d (atau bangun monitoring service
  account — lihat backlog).

---

## 8 · RIWAYAT INSIDEN & PELAJARAN (ringkas)

| Tanggal | Insiden | Pelajaran/aturan |
|---|---|---|
| 28 Jul | page_view dobel (pixel load GTM top-level); view_item phantom (prerender); over-count repeat-add | lazy-load pixel; prerender gate; delta cart-state |
| 29 Jul | sticky param (`atc_source` menempel); dobel view_item (pixel app G&Y `sh-`); **loop POST /cart/update.js** script UTM; ditemukan **bocor purchase 25%** (27 client vs 36 order) | pushEvent reset; karantina sh-; rawFetch; backstop |
| 30 Jul | dua sumber purchase = 16% dobel (GA4 dedup hanya intra-user) | MP single-source |
| 31 Jul–1 Agu | **Cron resend buta menggandakan 30–31 Jul permanen** (GA4 tak dedup lintas batch); verifikasi intraday menyesatkan | Ledger mp_sent; jangan percaya sinyal belum terproses |
| 2 Agu | **Sync GitHub menolak diam-diam** commit Liquid invalid (`{{` di JS); ketahuan view-transitions 31 Jul tak pernah live; retention ternyata masih 2 bulan | Aturan §6.9; retention 14 bln; annotations |

---

## 9 · BACKLOG OPSIONAL (disengaja belum)

1. **Monitoring otomatis end-to-end** — user buat Service Account GCP + grant
   Viewer di GA4 → server bandingkan order kemarin vs purchase GA4 tiap malam
   dan alarm bila selisih (menutup blind spot MP-204).
2. **git-init `treelogy-wa-sync`** + push ke GitHub private (sekarang hanya
   folder lokal + deployment Vercel).
3. **Custom channel group "Treelogy Channels"** (retroaktif utk laporan
   channel era label lama) — bisa via UI atau dicoba via Admin API v1alpha.
4. **Isi SKU 5 varian** (The Ritual Of Radiance dkk.) — WAJIB cek dampak
   integrasi Jubelio/QuickBooks dulu (fix kode r6 sudah menetralkan efek
   analytics-nya).
5. **Meta CAPI** — kirim purchase server-side ke Meta (pola sama dgn backstop
   GA4; fbclid→fbc bisa ditangkap seperti _ga_cid) bila spend naik serius.
6. **Selesaikan template UTM di semua iklan aktif** (normalizer menambal
   sementara, tapi sumbernya tetap harus bersih).

---

## 10 · FILE PENTING

```
claudedocs/gtm/
  TRACKING-MASTER.md            ← dokumen ini
  SETUP.md                      ← runbook kronologis + detail go-live
  custom-pixel-checkout.js      ← sumber pixel (re-paste manual bila berubah)
  gtm-container-import.json     ← import container GTM
  register-orders-paid-webhook.mjs
  ga4-validate.mjs              ← validasi kesehatan (START/END via env)
  funnel-suite.mjs              ← funnel journey via runFunnelReport
claudedocs/
  Treelogy-Customer-Journey-Funnel.pdf (+ funnel-journey.src.html)
  Treelogy-GA4-Landing-Insight-30d.pdf ← laporan era lama (baca dgn konteks §5)
~/Documents/treelogy-wa-sync/server.ts ← seluruh logika server
.env (repo Treelogy, JANGAN commit)    ← ADMIN_API_KEY, CLIENT_SECRET_APP, dll.
```

*Dokumen ini merefleksikan keadaan per 3 Agu 2026. Bila arsitektur berubah,
perbarui dokumen ini + SETUP.md + memory dalam commit yang sama.*
