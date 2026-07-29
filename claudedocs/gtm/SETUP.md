# Treelogy — GTM & dataLayer Foundation (Setup & Runbook)

Dibuat 27 Jul 2026 · diperbarui 28 Jul 2026.
Branch `staging` = tema live (sync GitHub 2 arah), jadi push = deploy.

## STATUS TERKINI (28 Jul 2026)

**SUDAH LIVE di theme** (commit `4d69562` fondasi + `51dff80` atribusi):
- Seluruh fondasi GTM (gtm-head/gtm-body/gtm-events.js/theme.liquid/settings_schema)
  — **no-op sampai Theme settings → Analytics (GTM) → container ID diisi**.
- Instrumentasi hero `/collections/all` (hero Inside Out Protocol, 2 CTA direct-add):
  `hero_view` (≥40% visible), `hero_cta_click` (cta_label, cta_position, variant_id),
  `hero_image_click` — semua ber-`hero_version: iop-protocol-2cta-v1`.
- Atribusi ATC: klik CTA hero men-stamp sumber (15 dtk) → event `add_to_cart`
  berikutnya membawa `atc_source: hero:iop-protocol-2cta-v1`; setiap item cart
  kini punya `item_variant_id` (30 Day = 46129731666108, 60 Day = 46129728487612).
- Semua diuji end-to-end via Chrome headless (klik → /cart/add → dataLayer benar).

**BELUM (harus manual di UI, API tidak bisa):**
1. Buat akun+container GTM di tagmanager.google.com (pembuatan AKUN tidak ada di API;
   OAuth client gcloud DIBLOK Google untuk scope Tag Manager — jalur CLI mustahil).
2. Import `gtm-container-import.json` (sudah termasuk semua event hero) → Publish.
3. Isi container ID di theme settings — bisa minta Claude pasang via Admin API.
4. Custom pixel checkout + dedup app Google & YouTube + GA4 custom dimensions
   (langkah 4–7 di bawah).

**Cara baca dampak hero baru (pertanyaan bisnis → data):**
- ATC dari hero: `add_to_cart` filter `atc_source = hero:iop-protocol-2cta-v1`.
- Per variant: breakdown `item_variant_id` / `cta_label` (30 vs 60 Day).
- Sampai checkout / hanya ATC / hanya lihat: Funnel Exploration GA4:
  `hero_view` → `hero_cta_click` → `add_to_cart(atc_source=hero)` → `begin_checkout`
  → `purchase`; drop-off tiap langkah = jawabannya. Bandingkan pre/post 28 Jul.
- Iterasi hero berikutnya: cukup ganti `data-hero-version` di
  `sections/FeaturedProduct.liquid` — semua event otomatis terlabel versi baru.

**Jebakan teknis yang sudah ditangani (jangan di-regres):**
- Interceptor seamless-ATC (MiniCart.liquid) memakai document-capture +
  `stopImmediatePropagation` → listener klik GTM harus di **window-capture**
  (sudah begitu di gtm-events.js) atau event klik CTA tidak akan pernah terekam.
- Tombol hero pakai `.button-direct-add` (hook interceptor seamless) — drawer
  terbuka optimistic; jangan tambah `open-popup-variants` ke tombol ini.

## Apa yang berubah di theme (lokal)

| File | Perubahan |
|---|---|
| `snippets/gtm-head.liquid` | BARU — Consent Mode v2 (default granted, denied utk EEA/UK/CH), dataLayer page-context, `view_item` (PDP), `view_item_list` (collection), GTM loader |
| `snippets/gtm-body.liquid` | BARU — noscript iframe GTM |
| `assets/gtm-events.js` | BARU — `add_to_cart` (intercept fetch/XHR `/cart/add`), `select_item`, `whatsapp_click`, `section_view`, `section_click`, bridge consent Shopify→Google |
| `layout/theme.liquid` | render `gtm-head` sebelum `content_for_header`; `gtm-body` setelah `<body>` |
| `config/settings_schema.json` | Setting baru: **Analytics (GTM) → GTM container ID** |
| `sections/LinksHub.liquid` | Fix: `window.gtag` (mati — gtag tidak pernah ada di main window) → `dataLayer.push` |

Seluruh sistem **no-op sampai setting GTM container ID diisi** — aman di-deploy
kapan pun; tracking baru aktif setelah ID diisi di theme editor.

## Urutan go-live (jangan dibalik)

1. **Buat container GTM** (web) di tagmanager.google.com → dapat `GTM-XXXXXXX`.
2. **Import** `gtm-container-import.json` (Admin → Import Container → workspace baru → **Merge**).
   Berisi: Google Tag GA4 (`G-N28QHJH222`), 1 tag GA4 passthrough (semua event custom
   + ecommerce dari dataLayer), trigger regex, variabel DLV.
   Kalau import ditolak, buat manual sesuai tabel di bawah.
3. **Deploy theme** (saat sudah boleh live) → isi **Theme settings → Analytics (GTM)**
   dengan `GTM-XXXXXXX` → save.
4. **Custom pixel checkout**: Admin → Settings → Customer events → Add custom pixel →
   paste `custom-pixel-checkout.js` → ganti `GTM_ID` → Connect.
   (Checkout tidak bisa dijangkau theme; begin_checkout/add_shipping_info/
   add_payment_info/purchase datang dari pixel ini, lewat container GTM yang sama.)
5. **DEDUP — WAJIB**: di app **Google & YouTube** channel, putuskan koneksi
   **Google Analytics (GA4 `G-N28QHJH222`)**. Kalau tidak, `page_view` dan `purchase`
   terkirim dobel (channel sandbox + GTM). Koneksi **Google Ads (AW-…)** biarkan dulu.
6. **GA4 Admin → Custom definitions** — register custom dimensions (scope: Event):
   `page_locale`, `market_country`, `customer_logged_in`, `section_id`, `from_section`,
   `item_handle`, `link_url`, `link_label`, `channel`,
   `hero_version`, `atc_source`, `cta_label`, `cta_position`, `variant_id`.
7. **GA4 Admin → Key events**: tandai `whatsapp_click` (dan `purchase` otomatis).
8. **Validasi**: GTM Preview mode + GA4 DebugView — checklist di bawah.

## Kamus event

| Event | Sumber | Kapan | Param penting |
|---|---|---|---|
| `view_item` | Liquid (gtm-head) | load PDP | ecommerce.items, value |
| `view_item_list` | Liquid | load collection (12 item pertama) | item_list_id/name, index |
| `select_item` | gtm-events.js | klik link `/products/` | item_handle, from_section |
| `add_to_cart` | gtm-events.js | response sukses `/cart/add` (fetch & XHR); juga kenaikan qty via `/cart/change|update` (diff state) | ecommerce dari response cart |
| `remove_from_cart` | gtm-events.js | penurunan qty / hapus item via `/cart/change|update` (diff vs cache state; `/cart/clear` sengaja di-skip — noise flow buy-now) | ecommerce items yang dihapus |
| `view_cart` | gtm-events.js + gtm-head | drawer mini-cart terbuka (`.mini-cart` dapat `.active`, delay 600ms) ATAU load halaman `/cart` | ecommerce seluruh isi cart |
| `begin_checkout` / `add_shipping_info` / `add_payment_info` / `purchase` | custom pixel | checkout events | ecommerce, transaction_id |
| `whatsapp_click` | gtm-events.js | klik wa.me / api.whatsapp.com / whatsapp: | link_url, from_section |
| `section_view` | gtm-events.js | section ≥40% terlihat (1× per section per page) | section_id |
| `section_click` | gtm-events.js | klik link/button di dalam section | section_id, link_url |
| `hero_view` | gtm-events.js | hero collection ≥40% terlihat (1× per load) | hero_version, item_handle |
| `hero_cta_click` | gtm-events.js | klik CTA protocol di hero (window-capture, kebal interceptor) | hero_version, cta_label, cta_position, variant_id |
| `hero_image_click` | gtm-events.js | klik gambar hero → PDP | hero_version, item_handle |
| `add_to_cart` + `atc_source` | gtm-events.js | ATC yang dipicu CTA hero membawa `atc_source=hero:<version>` (stamp 15 dtk) + `item_variant_id` per item | atc_source, ecommerce.items |
| `links_hub_click` / `links_hub_share` / `links_hub_upsell_click` | LinksHub.liquid | interaksi LinksHub | link_url, link_label, channel |
| `consent_update` | gtm-events.js | user memilih di cookie banner | consent_analytics/marketing |

Context di semua hit (via dataLayer awal): `page_locale`, `page_type`, `page_template`,
`market_country`, `market_currency`, `customer_logged_in` (+`customer_orders_count`).

## Consent

- Default: granted global, **denied untuk region EEA + UK + CH** (`wait_for_update` 500 ms).
- `CookieBannerCustom` → `Shopify.customerPrivacy.setTrackingConsent` → event
  `visitorConsentCollected` → `gtag('consent','update', …)` (bridge di gtm-events.js).
  State awal dibaca via `currentVisitorConsent()` (loadFeatures consent-tracking-api).
- Decline banner = analytics & ads denied (Consent Mode tetap kirim cookieless pings → modeling).

## Checklist validasi (GTM Preview + GA4 DebugView)

- [ ] Homepage: `page_view` sekali (bukan dua), `section_view` bertahap saat scroll
- [ ] PDP: `view_item` dengan items terisi benar (harga = harga display / 100 sudah benar)
- [ ] Collection: `view_item_list` + klik produk → `select_item`
- [ ] Add to cart (PDP + quick-add + bundle) → `add_to_cart` sekali per aksi
- [ ] Klik tombol WA → `whatsapp_click`
- [ ] Checkout → begin/shipping/payment/purchase (purchase punya `transaction_id`)
- [ ] `/id` locale → `page_locale: "id"`
- [ ] Tolak cookie banner → event GA4 berhenti / cookieless
- [ ] LinksHub (`/pages/links`?) → `links_hub_click`
- [ ] Tidak ada purchase dobel di GA4 Realtime setelah step 5 dedup

## Setup manual GTM (fallback kalau import gagal)

1. Variabel konstanta `Const - GA4 Measurement ID` = `G-N28QHJH222`.
2. Variabel Data Layer (versi 2): `page_locale`, `market_country`, `customer_logged_in`,
   `section_id`, `from_section`, `item_handle`, `link_url`, `link_label`, `channel`.
3. Tag **Google Tag** → Tag ID `{{Const - GA4 Measurement ID}}` → trigger Initialization - All Pages.
4. Tag **GA4 Event** → Measurement ID `{{Const…}}`, Event Name `{{Event}}`,
   ✅ Send ecommerce data (Data layer), Event parameters = 9 DLV di atas →
   trigger Custom Event (regex): `^(view_item|view_item_list|select_item|add_to_cart|begin_checkout|add_shipping_info|add_payment_info|purchase|whatsapp_click|section_view|section_click|links_hub_click|links_hub_share|links_hub_upsell_click)$`

## Resep insight (setelah data masuk ±2 minggu)

- **Funnel per segmen**: GA4 Explore → Funnel: `view_item → add_to_cart → begin_checkout →
  purchase`, breakdown `page_locale` / source-medium / device.
- **Section mana menghasilkan uang**: Explore Free-form — `section_click` (dimension
  `section_id`) vs sesi yang berakhir `purchase`; atau segment "users with section_click
  section_id=X" vs conversion rate.
- **Review → konversi**: segment sesi dengan `section_view` = section review Judge.me
  di PDP vs tanpa — bandingkan rate `add_to_cart`.
- **WA sebagai konversi**: key event `whatsapp_click`, lihat per landing page & campaign;
  nanti import ke Google Ads.
- **Audience**: Admin → Audiences — "PDP ≥2 in 7d no purchase", "ATC no checkout 3d",
  → share ke Google Ads (setelah link).
- **Subscription-ready**: saat subscription launch, tambahkan `selling_plan_selected`
  (PDP) + flag `purchase_type` di items — struktur dataLayer sudah siap menerimanya.

## Anti-redundansi (28 Jul 2026, setelah GA4 channel diputus)

- **PRERENDER GATE (jebakan paling halus)**: Shopify menyuntik speculation rules
  yang me-prerender `/products/*` & `/collections/*` saat hover (eagerness
  moderate). Script JALAN di prerender tersembunyi → tanpa gate, tiap hover
  kartu produk memancarkan `view_item` phantom (terlihat live: view_item 45 >
  page_view 30 — mustahil untuk kunjungan nyata). Fix: SEMUA init tracking
  (gtm-head inline + gtm-events.js r4) ditunda ke `prerenderingchange`.
  Kalau menambah script tracking apa pun ke theme, WAJIB pakai gate yang sama.

- **Custom pixel lazy-load GTM**: pixel Shopify jalan di SEMUA halaman (storefront +
  checkout). Versi awal memuat GTM di top-level → GTM dobel di storefront
  (theme + sandbox) → page_view dobel. Fix: `ensureGTM()` dipanggil hanya saat
  event checkout pertama tiba. Kalau edit pixel, JANGAN kembalikan loader ke top-level.
- **Guard `send_page_view`**: Google Tag di container memakai config
  `send_page_view = {{JS - is top window}}` (Custom JS: `window.self === window.top`)
  → sandbox pixel (iframe) tidak pernah kirim page_view sampah ber-path `/wpm@…`;
  page_view hanya dari main window theme. Checkout tidak punya page_view — funnel
  checkout dibaca dari event begin_checkout → purchase (by design).
- **add_to_cart satu sumber per jalur**: `/cart/add` → langsung; `/cart/change|update`
  → hanya delta kenaikan (tidak dobel dengan /cart/add karena endpoint berbeda).
- **RESET PARAM EPHEMERAL (r5)**: model dataLayer GTM mem-persist nilai hasil merge —
  tanpa reset, `atc_source` dari satu klik hero menempel ke SEMUA event berikutnya
  di halaman itu (ATC organik ikut terlabel hero), `item_handle`/`section_id`/dll.
  bocor serupa. Setiap event push di gtm-events.js diikuti push `EPHEMERAL_RESET`
  (11 param → null; null menghapus model & di-drop dari hit GA4). Param context
  (page_locale, market_*, customer_*) sengaja persist. Event baru apa pun WAJIB
  lewat `pushEvent()`, bukan `push()`.
- **`/cart/clear` tidak menghasilkan event** — dipakai flow buy-now replace
  (MainProductDetail); remove_from_cart dari situ = noise, bukan intent user.
- **Dedup channel**: koneksi GA4 di app Google & YouTube DIPUTUS 28 Jul
  (verifikasi: `G-N28QHJH222` 0 kemunculan di HTML storefront). Google Ads (AW-) tetap.

## PURCHASE BACKSTOP — paritas 1:1 dengan Shopify (DIBANGUN 29 Jul, AKTIVASI TERSISA)

**Status implementasi (29 Jul 2026) — fase 1 (paritas count):**
- ✅ Pixel `custom-pixel-checkout.js`: `transaction_id` = SELALU `checkout.token`
  (fallback order.id dihapus) → **user WAJIB re-paste ke Customer events**.
- ✅ Endpoint `POST /api/ga4-purchase-backstop` live di `treelogy-wa-sync`
  (`server.ts`, deploy dpl_5Rzvv1GQP5TxFrPw2vBtzV4mb5qk) — HMAC verify (reuse
  SHOPIFY_WEBHOOK_SECRET, app sama dgn webhook customers), skip `test` &
  `source_name != "web"`, dedup-safe utk redelivery (client_id deterministik
  `backstop.<order_id>` + transaction_id sama → GA4 drop duplikat), 18/18 unit
  test pass (scratchpad test-backstop.mjs), 401 utk request tanpa HMAC (diverifikasi live).
  Param tambahan `purchase_source: "mp_backstop"` utk membedakan MP vs client di GA4.
- ✅ Script registrasi webhook siap: `claudedocs/gtm/register-orders-paid-webhook.mjs`
  (mutation tervalidasi live schema, idempoten — cek duplikat dulu).
- ✅ GA4 MP api_secret dibuat user 29 Jul → terpasang sbg `GA4_API_SECRET`
  (Vercel production, redeploy OK); payload tervalidasi via `/debug/mp/collect`
  (validationMessages kosong).
- ✅ Webhook `orders/paid` TERDAFTAR 29 Jul:
  `gid://shopify/WebhookSubscription/1666451964092` →
  `https://treelogy-wa-sync.vercel.app/api/ga4-purchase-backstop`.
- ✅ Pixel re-pasted user 29 Jul (verifikasi screenshot editor pixel 166920380:
  `transaction_id = checkout.token` terpasang). **SISTEM LENGKAP & AKTIF.**
- Validasi H+1 (30 Jul): Reports → Events → `purchase` == order web paid
  Shopify; Explorations breakdown `transaction_id` tanpa dobel; MP dibedakan
  via `purchase_source = mp_backstop`.

**Masalah**: `purchase` client-side (custom pixel, thank-you page) bocor kalau
customer tidak kembali dari redirect pembayaran (QRIS/VA/e-wallet — umum di ID),
pakai ad-blocker, atau menutup browser.

**Arsitektur**: Shopify webhook `orders/paid` → endpoint Vercel (reuse project
webhook WA consent) → GA4 **Measurement Protocol** kirim `purchase` →
GA4 dedup vs purchase client via `transaction_id` yang sama → tiap order
tercatat TEPAT SEKALI.

**Kunci dedup (WAJIB konsisten)**: `checkout.token` (pixel) = `checkout_token`
(payload webhook order). Pixel saat ini pakai `checkout.order.id || checkout.token`
— HARUS diubah jadi SELALU `checkout.token`, lalu user re-paste pixel di
Customer events. Tanpa ini MP & client memakai kunci beda → dobel.

**Langkah implementasi (urut)**:
1. Edit `custom-pixel-checkout.js`: `payload.transaction_id = checkout.token`
   (hapus fallback order.id) → user re-paste ke Shopify Customer events.
2. GA4: stream Treelogy Website → **Measurement Protocol API secrets** → Create
   → simpan `api_secret` (taruh di env Vercel, JANGAN commit).
3. Endpoint Vercel `POST /api/ga4-purchase-backstop`:
   - Verifikasi HMAC `X-Shopify-Hmac-Sha256` (webhook secret).
   - Map payload order → MP body:
     `client_id`: fallback `"backstop.<order_id>"` (fase 1; lihat catatan atribusi),
     `timestamp_micros`: created_at order,
     event `purchase`: `transaction_id` = `checkout_token`, `value` =
     `current_total_price`, `currency`, `tax` = `total_tax`, `shipping` =
     `total_shipping_price_set`, `coupon` = `discount_codes[0].code`,
     `items[]` = line_items (item_id = sku || variant_id, item_name, price,
     quantity, item_variant_id).
   - POST `https://www.google-analytics.com/mp/collect?measurement_id=G-N28QHJH222&api_secret=…`
4. Register webhook via Admin API: topic `orders/paid` → URL endpoint.
5. Validasi H+1: GA4 purchase count == jumlah order web paid Shopify; tidak ada
   transaction_id dobel (cek Explorations breakdown transaction_id).

**FASE 2 — ATRIBUSI (DIBANGUN & LIVE 29 Jul, commit `652c4ff`)**: script UTM di
`theme.liquid` kini juga men-stamp `_ga_cid` (cookie `_ga`) + `_ga_sid` (cookie
`_ga_N28QHJH222`) ke cart attributes — dibaca fresh tiap push, re-apply setelah
tiap mutasi cart (termasuk pasca `/cart/clear` buy-now). Webhook memvalidasi
format ketat (`\d+.\d+` / `\d+`), pakai cid asli + `session_id` → purchase
backstop menempel ke user & sesi asli (atribusi + funnel utuh); tanpa stamp
(ad-blocker/consent denied) fallback sintetis. Timestamp di-clamp ≤71 jam
(order dibayar telat tidak di-drop MP diam-diam). Diverifikasi live headless:
`cart.attributes` berisi `_ga_cid`/`_ga_sid` valid. Log endpoint menandai
`cid:real`/`cid:synthetic` per order.

**BUG LOOP UTM DIFIX (29 Jul, commit yang sama)**: `pushToCart()` lama memakai
`fetch` yang sudah dibungkus wrapper-nya sendiri → SETIAP mutasi cart memicu
re-apply → yang memicu re-apply lagi → POST `/cart/update.js` tak berujung
(~tiap 2,5 dtk per tab, terkonfirmasi live) untuk semua pengunjung ber-UTM yang
menyentuh cart. Fix: `rawFetch` di-capture sebelum wrap. Kalau menyentuh script
ini lagi, JANGAN kembalikan pushToCart ke `fetch` global.

**Jangan lupa**: purchase MP TIDAK melewati Modify events client rule apa pun
yang bergantung event_id (aman — rule karantina hanya menyasar `sh-`), dan
kirim HANYA untuk order `source_name == "web"` supaya order manual/draft tidak
mencemari funnel web.

## Karantina spillover pixel Google & YouTube (29 Jul 2026)

Web pixel app Google & YouTube (main window, LAX) mengirim event remarketing
Ads/Merchant Center (`view_item`, `begin_checkout`, `search`, …) via
`gtag(send_to: AW/MC)` dengan `event_id` berawalan `sh-`. Config Google tag
gabungan ikut men-dispatch event itu ke GA4 → duplikat. Fix permanen di GA4:
**Modify events rule "Quarantine G&Y ads spillover"** (stream Treelogy Website):
`event_id` starts with `sh-` → `event_name` = `gy_ads_spillover`.
- Event `gy_ads_spillover` di laporan = sampah terkarantina, abaikan.
- JANGAN hapus rule ini selama app Google & YouTube masih terpasang.
- Event theme/pixel kita TIDAK boleh diberi param `event_id` (itu sidik jari
  pembeda satu-satunya).

## Catatan arsitektur

- **Semantik `/cart/add.js` (diverifikasi live 28 Jul):** response berisi `quantity`
  = TOTAL baris setelah merge dengan line yang sudah ada (add 1 + add 1 → response
  kedua qty 2, `final_line_price` = seluruh baris). Karena itu add_to_cart WAJIB
  dihitung sebagai DELTA vs cache cart-state (gtm-events.js r3) — jangan pernah
  laporkan response mentah, itu over-count.
- add_to_cart mengandalkan intercept fetch/XHR — meng-cover semua jalur AJAX
  (MainProductDetail, FeaturedBundle, MiniCart, quick-add). Kalau suatu saat ada form
  cart yang submit native (non-AJAX), event tidak tertangkap — cek dulu sebelum menambah listener
  submit (risiko double-fire di form AJAX).
- `gtm-events.js` hanya dimuat saat GTM ID terisi (dirender kondisional dari gtm-head).
- Jangan tambahkan GA4/gtag kedua di theme — satu-satunya jalur adalah GTM.
