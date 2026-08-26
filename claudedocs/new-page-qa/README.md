# QA Use Case — Setiap Halaman Baru

Tiga aturan yang wajib dipenuhi **sebelum** halaman custom apa pun dibuat/di-deploy:

1. **Keputusan sign-up form harus DITANYAKAN lebih dulu, bukan ditebak.**
   Tiap halaman baru → tanya user: *"halaman ini include atau exclude sign-up form?"*
   Jawabannya dicatat di `pages.json`. Tanpa entri itu, QA gagal.
2. **Semua teks & aksi tombol harus dinamis mengikuti translation.**
   Tidak ada string Inggris/Indonesia yang ditanam di `.liquid`, dan tidak ada
   `href` telanjang yang mengunci pengunjung ke satu bahasa.
3. **Email konfirmasi harus tetap sesuai kalau offer per varian berubah.**
   Halaman yang menjual paket per varian wajib punya blok `offer` di `pages.json`;
   `--live` mengunci janji halaman ke data varian hidup.

Jalankan:

```bash
node claudedocs/new-page-qa/qa.mjs why-capsules          # satu halaman (statis)
node claudedocs/new-page-qa/qa.mjs --all                 # semua templates/page.*.json
node claudedocs/new-page-qa/qa.mjs --live why-capsules   # + cek offer vs email konfirmasi
```

Exit code `1` kalau ada `fail`. Tanpa `--live` semuanya statis — tidak butuh toko
hidup, jadi bisa jalan sebelum push ke `staging`. `--live` membaca `STORE_NAME` &
`ADMIN_API_KEY` dari `.env` dan menembak Admin GraphQL `2025-07`.

---

## Use case: "buat halaman baru"

| # | Langkah | Gate |
|---|---------|------|
| 1 | **TANYA user: include atau exclude sign-up form?** Jangan lanjut sebelum dijawab. | GATE-1 |
| 2 | Catat jawaban + alasannya di `pages.json` (`signup`, `reason`, `decided_on`). | GATE-1 |
| 3 | Tentukan `locale_namespace` halaman (mis. `why_capsules`), tulis semua copy ke `locales/en.default.json` **dan** `locales/id.json` sekaligus. | GATE-3 |
| 4 | Bangun section: setiap teks lewat `{{ 'ns.key' \| t }}`, setiap tujuan tombol lewat `routes.*` / setting URL. | I18N-*, BTN-* |
| 5 | Rakit `templates/page.<handle>.json`. Kalau `signup: include`, section form-nya harus benar-benar ada di `order`. | GATE-2 |
| 6 | `node claudedocs/new-page-qa/qa.mjs <handle>` → harus **LULUS**. | semua |
| 7 | Baru deploy. Verifikasi live di `/pages/<handle>` **dan** `/id/pages/<handle>`. | manual |

Langkah 1 adalah gate keras: `qa.mjs` sengaja **gagal** untuk halaman yang belum
terdaftar di `pages.json`, supaya pertanyaannya tidak bisa dilewati diam-diam.

---

## Matriks pemeriksaan

| Kode | Yang dicek | Kenapa penting | Cara benerin |
|------|-----------|----------------|--------------|
| `GATE-0` | Template & section-nya ada | Typo `type` di template = section hilang senyap | Perbaiki nama file/type |
| `GATE-1` | Halaman terdaftar di `pages.json` dengan `signup` + `reason` | **Inti aturan**: keputusan sign-up ditanyakan, bukan diasumsikan | Tanya user, catat jawabannya |
| `GATE-2` | Manifes cocok dengan template yang dirender | "Katanya exclude tapi form-nya nongol" — dan sebaliknya | Samakan `pages.json` ↔ `order` template |
| `GATE-3` | Namespace locale halaman lengkap di EN **dan** ID | Key yang cuma ada di EN → `/id` diam-diam berbahasa Inggris | Lengkapi `locales/id.json` |
| `I18N-1` | Tidak ada teks telanjang di antara tag | Teks hardcoded tidak ikut Translate & Adapt selamanya | Pindah ke locale, render `\| t` |
| `I18N-2` | `placeholder` / `aria-label` / `title` / `alt` dinamis | Screen reader & form tetap Inggris di `/id` | `{{ 'ns.key' \| t }}` |
| `I18N-3` | Setiap key `\| t` benar-benar ada di EN & ID | Key hilang = storefront menampilkan `Translation missing: …` | Tambah key di kedua file |
| `I18N-4` | Key yang dirakit runtime (`'ns.plan_' \| append: i`) prefix-nya seimbang EN/ID | Varian ke-3 sering lupa diterjemahkan | Samakan jumlah key per prefix |
| `BTN-1` | Label `<a>`/`<button>` dinamis | Tombol "Shop now" tetap Inggris di `/id` | `{{ 'ns.cta' \| t }}` atau `section.settings` |
| `BTN-2` | `href` internal lewat `routes.*` / setting | `/collections/all` buang prefix `/id`; `/id/pages/x` justru mengunci ke ID | `{{ routes.all_products_collection_url }}` |
| `BTN-3` | Navigasi JS pakai `window.Shopify.routes.root` | `location.href = '/checkout'` melempar pembeli ID ke storefront EN | Prefix dengan `Shopify.routes.root` |
| `BTN-4` | `form action` tidak telanjang | Sama seperti BTN-2, untuk `/cart/add` dkk | Rakit dari `routes.cart_url` |
| `EMAIL-1` | Setting varian tiap paket terisi & varian-nya hidup | Setting kosong = tombol paket tidak menambah apa pun | Isi setting di theme editor |
| `EMAIL-2` | Harga di copy == `variant.price` hidup | Email mencetak harga varian, bukan angka di halaman | Samakan copy atau harga varian |
| `EMAIL-3` | Harga coret di copy == `compareAtPrice` | Diskon yang cuma ada di halaman tidak muncul di email/checkout | Set compare-at di Admin |
| `EMAIL-4` | Label paket halaman vs judul baris di email | Pembeli beli "3 months", email bilang "270 Moringa Capsules" | Samakan `variant.title`, atau catat di `email_label_ack` |
| `EMAIL-5` | Hadiah yang **dijanjikan** copy benar-benar terkirim | Janji "Free Mystery Gift" tanpa varian pengirim = komplain | Wire hadiahnya, atau cabut janjinya |
| `EMAIL-6` | Hadiah yang terkirim disebut di copy | Barang tak terduga di email (biasanya salah metafield) | Sebut di copy atau cabut dari `eligible_gifts` |
| `EMAIL-7` | Hadiah tidak diklaim permalink **dan** gift engine sekaligus | Risiko baris hadiah dobel di order & email | Pilih satu jalur |
| `EMAIL-8` | Varian hadiah berharga Rp 0 | Email menagih barang yang halaman sebut gratis | Set harga varian hadiah ke 0 |

Nama diri (Instagram, WhatsApp, Treelogy, BPOM, Rp, …) dikecualikan lewat
`PROPER_NOUNS` di `qa.mjs` — "Instagram" memang tetap "Instagram" di `/id`.

## Batas yang diketahui (terbukti melewatkan bug nyata)

Insiden kartu hero 26 Agu 2026 membuktikan dua celah — keduanya belum ditutup:

1. **Hanya `sections/` yang dipindai, bukan `snippets/`.** String `From` yang
   hardcoded ada di `snippets/HeroCardV2.liquid`, jadi lolos. Section yang
   me-`render` snippet perlu ikut menarik snippet-nya ke dalam pemeriksaan.
2. **Blok `{% schema %}` dibuang sebelum diperiksa**, jadi `"default"` berbahasa
   Inggris tidak pernah dilihat. Ini bukan sekadar teks yang terlewat: **schema
   default yang belum pernah tersimpan ke JSON template bukan translatable
   resource sama sekali** — Translate & Adapt tidak bisa melihatnya, jadi ia
   dirender sama di semua locale selamanya. Pemeriksaan yang benar: setiap
   setting bertipe `text`/`textarea` yang punya `default` non-kosong harus
   punya nilai tersimpan di template yang memakainya.

Sampai keduanya ditutup, `LULUS` di sini berarti "section-nya bersih", bukan
"halamannya bersih".

---

## Pola benar vs salah (dari repo ini)

**Benar** — `sections/og-proof.liquid`, `sections/wc-offer.liquid`:

```liquid
{%- assign cta_url = routes.all_products_collection_url -%}
<a class="wc-cta" href="{{ cta_url }}">{{ 'why_capsules.offer.cta_checkout' | t }}</a>
```

```js
var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
window.location.href = root + 'checkout';
```

**Salah** — `sections/founder-letter.liquid:127-130` (temuan nyata):

```liquid
<a href="/id/collections/all">Toko</a>
<a href="/id/pages/moringa-tree">Pohon Moringa</a>
```

Label Indonesia ditanam di markup **dan** URL dikunci ke `/id`: pengunjung
berbahasa Inggris melihat nav Indonesia lalu dilempar ke storefront ID.

**Salah** — `sections/NewslletterForm.liquid` (form sign-up itu sendiri):

```liquid
<input type="email" placeholder="Email Address" name="contact[email]">
<a href="{{ section.settings.privacy_url }}">I accept the privacy policy</a>
```

Kalau sebuah halaman menjawab *include*, form-nya ikut masuk lingkup QA ini —
percuma halamannya diterjemahkan kalau form-nya masih Inggris.

---

## Offer per varian ↔ email konfirmasi (`--live`)

**Email konfirmasi Shopify tidak dirender dari tema.** Ia mencetak apa yang
benar-benar ada di order: `product.title + variant.title`, harga asli varian, dan
tiap baris hadiah. Artinya offer per varian bisa berubah — varian ditukar, harga
digeser, hadiah ditambah/dicabut — dan yang dibaca pembeli di email langsung
melenceng dari yang dijanjikan halaman, **tanpa satu baris tema pun berubah**.
Theme check, `--all`, dan review diff semuanya buta terhadap ini. `--live` yang
menutupnya, dengan menembak Admin API dan membandingkan janji halaman ke varian hidup.

Deklarasinya di `pages.json`:

```json
"offer": {
  "section": "wc-offer",
  "plans": { "p3": "variant_p3", "p2": "variant_p2", "p1": "variant_p1" },
  "gift_settings": { "p3": ["gift_variant"] },
  "keys": {
    "name":      "{ns}.offer.{plan}_name",
    "price":     "{ns}.offer.{plan}_price",
    "price_old": "{ns}.offer.{plan}_price_old",
    "perks":     "{ns}.offer.{plan}_perks_html"
  },
  "non_product_perks": ["shipping", "ongkir", "garansi", "guarantee"],
  "email_label_ack": {
    "p3": {
      "variant": "47255408378044",
      "email_title": "Organic Moringa Capsules - 270 Moringa Capsules",
      "page_label": "3 months",
      "reason": "…"
    }
  }
}
```

`plans` menunjuk **setting varian di template yang benar-benar dirender**, bukan
default schema — itu bedanya "apa yang dijanjikan" dengan "apa yang dikirim".
`gift_settings` diikat per paket karena `gift_variant` hanya ditempel ke permalink
`p3`; menganggapnya berlaku untuk semua paket akan melaporkan hadiah hantu di p1/p2.

**`email_label_ack` adalah sidik jari, bukan sekadar catatan.** Ia mengikat tiga hal
sekaligus: variant ID yang di-wire, judul yang dicetak email, dan label yang dipakai
halaman. Begitu **salah satu** berubah, sidik jarinya tidak cocok lagi dan QA gagal
dengan pesan *"OFFER PER VARIAN BERUBAH sejak email ditinjau"*. Jadi menukar varian
paket atau mengganti nama varian di Admin tidak bisa lolos diam-diam — email
konfirmasi wajib ditinjau ulang dulu, baru ack diperbarui.

Hadiah diperiksa dua arah, karena keduanya pernah jadi insiden: copy menjanjikan
hadiah yang tak pernah dikirim (`EMAIL-5`), dan hadiah terkirim yang tak pernah
disebut copy (`EMAIL-6`). Sumber pengirimnya digabung dari **dua jalur berbeda** —
permalink tombol dan gift engine (`shop.gift_trigger_products` × varian
`custom.eligible_gifts`) — karena keduanya bisa tidak sepakat.

Uji negatif yang sudah dijalankan (semuanya berbunyi, lalu file dikembalikan):

| Simulasi | Yang berbunyi |
|----------|---------------|
| `variant_p3` ditukar ke varian 180 kapsul | `EMAIL-2` (harga 990.000 vs 690.000) + `EMAIL-4` (sidik jari basi) |
| `p3_price` digeser ke `Rp 950.000` tanpa ubah varian | `EMAIL-2` di EN |
| Copy p2 ditambah `Free Moringa Pouch` | `EMAIL-5` (tidak ada varian hadiah bernama itu) |

## Catatan: `section.settings` sebagai sumber teks

`section.settings.newsletter_button_label` **boleh** dipakai — Translate & Adapt
menerjemahkan text setting per-locale. Tapi ingat jebakan yang sudah pernah kena:
setting teknis (mis. `mf_namespace`/`mf_key`) juga ikut tertranslate dan merusak
halaman di `/id`. Aturan praktis: **copy → setting atau locale; identifier →
jangan pernah `type: text`.**

---

## Baseline 26 Agu 2026

`node claudedocs/new-page-qa/qa.mjs --all` → **57 fail, 3 warn, 14 halaman**.

Ini baseline, bukan regresi baru — halaman lama dibuat sebelum aturan ini ada.
Halaman yang sudah bersih dari sisi copy: `why-capsules` dan `guide` (44/44 dan
69/69 key EN/ID seimbang), keduanya hanya menyisakan `aria-label="Footer"` di
`og-footer.liquid`.

Bug nyata yang ditemukan pass pertama:

| Temuan | Lokasi | Dampak |
|--------|--------|--------|
| Key `products.general.sold_out` tidak ada di **kedua** locale | `sections/FeatureProductList.liquid:102` | Storefront merender `Translation missing: en.products.general.sold_out` di badge stok habis |
| Nav footer hardcoded ID + URL `/id/…` | `sections/founder-letter.liquid:127-130` | Pengunjung EN dapat nav Indonesia dan terkunci ke storefront ID |
| Form sign-up masih Inggris penuh | `sections/NewslletterForm.liquid:14,19,24` | Halaman `/id/pages/sub` berbahasa Indonesia tapi form-nya Inggris |
| `aria-label="Footer"` | `sections/og-footer.liquid:6` | Landmark screen reader tetap Inggris di `/id` |

`--live why-capsules` → **1 fail (I18N-2 `aria-label="Footer"`), 1 warn**. Sisi
offer-nya sehat: harga p1/p2/p3 (390k/690k/990k) dan compare-at (—/780k/1.170k)
persis sama dengan varian hidup, hadiah Mystery Gift Rp 0 dengan compare-at 47k.

Dua hal yang perlu keputusanmu:

- **`EMAIL-4` di-ack sementara, belum dikonfirmasi.** Halaman menjual **durasi**
  ("3 months"/"3 bulan"), tapi email konfirmasi mencetak **jumlah kapsul**
  ("Organic Moringa Capsules - 270 Moringa Capsules"). Metafield
  `staged_plan_label` sudah berisi "3 months" — tapi itu hanya dipakai keranjang;
  checkout dan email tetap pakai `variant.title`. Jadi pembeli membeli "3 months"
  lalu menerima email berbunyi "270 Moringa Capsules". `reason` di `pages.json`
  saat ini masih ditandai `BELUM DIKONFIRMASI USER` — mau `variant.title`
  disamakan, atau perbedaannya diterima?
- **`EMAIL-7`**: Mystery Gift diklaim permalink p3 **dan** `custom.eligible_gifts`
  varian p3. Sekarang aman karena `assets/gift-auto-add.js:806` menghitung baris
  hadiah lewat `properties._Gifted || GIFTS[variant_id]` — klausa kedua itulah yang
  menyelamatkan; kalau hilang, hadiah masuk dua kali ke order dan ke email.

Halaman yang belum punya keputusan sign-up tercatat (GATE-1, 11 halaman):
`about`, `1212`, `1212-products`, `benefit`, `faq`, `farm`, `founder-letter`,
`inside-out`, `links`, `menopause-lp`, `moringa-tree`. Isi `pages.json` saat
halaman-halaman itu disentuh berikutnya — jangan diisi dengan tebakan.
