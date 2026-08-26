# Accordion `/pages/moringa-tree` — dua bug, satu section

```bash
node claudedocs/accordion-test/suite.mjs                       # halaman default
node claudedocs/accordion-test/suite.mjs <url>                 # halaman lain
```

Suite menjalankan halaman **live** dua kali: apa adanya (bug harus tereproduksi)
dan dengan fix disimulasikan lewat `Page.addScriptToEvaluateOnNewDocument`,
sehingga script section dan `app.bundle.js` tetap berjalan alami seperti di
produksi. Hasil: **9 lulus, 0 gagal**.

## Bug 1 — dua handler klik bertumpuk di elemen yang sama

`app.bundle.js` mengekspor `Accodion()` yang dipanggil di dalam listener
`DOMContentLoaded`-nya sendiri. Fungsi itu memindai `.__accordion`, lalu
memasang handler klik di tiap `.__accordion-button`. Section ini memberi
`.scroll-container` kelas `__accordion` **dan** punya handler sendiri.

Urutannya yang mematikan:

1. `<script>` inline section berjalan saat parsing → mendaftarkan listener
   `DOMContentLoaded` **lebih dulu**.
2. `app.bundle.js` (defer) dieksekusi setelah parsing → mendaftarkan listener
   `DOMContentLoaded` **kedua**.
3. `DOMContentLoaded` menyala: `initAccordion` jalan duluan — meng-clone header
   (trik "buang listener lama") lalu memasang handler section. Sesudahnya
   `Accodion()` jalan dan memasang handler global **di header hasil clone itu**.

Sejak itu satu klik menjalankan dua handler berurutan: yang pertama menambah
`.active`, yang kedua membacanya sebagai "sudah terbuka" lalu menghapusnya lagi.
Netto: `.active` tidak pernah bertahan, tidak ada yang membuka, dan tidak ada
error di console. Trik clone-header kalah semata-mata karena urutan.

Bukti terukur sebelum fix: `contentMaxH` **terisi** `147px` (handler section
memang jalan) tapi `active: false` (handler global mencabutnya).

**Fix**: cabut kelas `__accordion` dari `.scroll-container`, jadi `Accodion()`
tidak pernah menemukan section ini. Kelas `__accordion-wrapper` / `-button` /
`-content` di dalamnya dipertahankan — `theme.css` memakainya untuk gaya
buka/tutup, dan tanpa penanda di pembungkus semuanya jadi inert bagi JS global.

`Footer.liquid` dan `MainProductDetail.liquid` juga memakai `__accordion`, tapi
keduanya **tidak** punya script accordion sendiri, jadi tetap bergantung penuh
pada `Accodion()` dan tidak terpengaruh.

Ditambahkan juga penjaga `document.readyState` supaya init tetap jalan kalau
section disuntikkan setelah `DOMContentLoaded` lewat (Section Rendering API).

## Bug 2 — ikon `+` tidak pernah berubah

`theme.css:5703`

```css
.accordion-list .right-list .scroll-container .accordion.active svg { transform: rotate(180deg); }
```

Spesifisitas `0,4,1`, mengalahkan aturan section `.accordion.active
.accordion-header svg` (`0,3,1`). Aturan itu ditulis untuk ikon panah; di sini
ikonnya tanda `+`, dan **`+` diputar 180° terlihat persis sama**. Jadi meski
accordion terbuka, tandanya tidak pernah berubah jadi `x`.

**Fix**: ikat aturan section ke id section (`#shopify-section-{{ section.id }}`,
spesifisitas `1,3,1`) — menang tanpa `!important`.

## Catatan: popup Klaviyo (BUKAN penyebabnya, tapi sempat menyesatkan)

Sekitar detik ke-3 sebuah popup Klaviyo muncul di tengah layar (`500×304` di
viewport `500×757`, ~40% tinggi layar) dan menutupi area accordion. Saat itu
`document.elementFromPoint` di posisi header mengembalikan
`input.needsclick.kl-private-reset-css-*`, bukan header.

Popup ini punya tombol "Close dialog" dan berperilaku normal — bukan overlay
tersangkut seperti insiden sebelumnya. Tapi ia membuat diagnosa pertama salah
arah, jadi `suite.mjs` menyingkirkannya dulu sebelum menguji accordion.

## Jebakan waktu menulis harness ini

Diagnosa pertama saya salah karena mengklik koordinat **di luar viewport**
(header ada di `y=1763`, `scrollTo` masih beranimasi saat diukur) lalu
menyimpulkan "tidak ada listener yang jalan". Karena itu `clickItem()` sekarang:
menunggu `scrollY` stabil tiga kali berturut-turut, mengukur ulang, memastikan
titiknya di dalam viewport, dan memverifikasi `elementFromPoint` jatuh di dalam
header — klik yang tidak sah dilempar sebagai error, bukan dihitung jadi hasil.

Pembacaan `transform` juga harus menunggu transisi 0.3s selesai; dibaca di `t=0`
hasilnya matriks identitas dan menyesatkan.

## Berkas

| Berkas | Guna |
|---|---|
| `suite.mjs` | suite before/after, 9 asersi |
| `harness.mjs` | helper klik tervalidasi + pembaca state |
| `klaviyo.mjs`, `klcheck.mjs`, `klpos.mjs` | investigasi overlay Klaviyo |
| `repro.mjs`, `trace.mjs`, `diag.mjs`, `icon.mjs` | skrip diagnosa bertahap |
| `sesudah-fix.png` | tangkapan layar accordion terbuka sesudah fix |
