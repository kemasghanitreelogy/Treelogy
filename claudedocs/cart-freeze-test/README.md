# QA — perbaikan "checkout freeze" di cart drawer

Menjalankan kode **asli** `snippets/MiniCart.liquid` (+ `assets/gift-auto-add.js`)
di atas DOM dan jaringan tiruan. Tidak ada fungsi tema yang di-mock; yang diganti
hanya browser, jaringan, dan jam.

```bash
node claudedocs/cart-freeze-test/suite.js          # 42 asersi
MINI=/path/lain/MiniCart.liquid node claudedocs/cart-freeze-test/suite.js
```

## Bug yang ditutup (laporan pembeli 25 Agu 2026)

Pembeli di in-app browser Instagram menekan CHECK OUT dengan voucher WELCOME15
terpasang; seluruh drawer memudar berspinner dan **tidak bisa disentuh lagi** —
tombol checkout, tombol tutup, ubah jumlah, semuanya mati.

| # | Cacat | Akibat |
|---|---|---|
| 1 | `.cart-loading-overlay` menutup seluruh `#cart` (`z-index:100`, tanpa `pointer-events:none`) dan **tidak punya batas hidup**. Serah-terima voucher menyalakannya lalu menavigasi — kalau navigasinya tidak mendarat, overlay abadi. Satu-satunya penutup adalah `pageshow` bfcache, yang justru tidak terjadi di WebView in-app. | **Freeze permanen.** |
| 2 | Ketukan kedua pada tombol checkout jatuh ke `return` **tanpa `preventDefault`** → form submit natif ke `/cart` → pembeli sampai di checkout **tanpa kode diskonnya**. | Diskon hilang diam-diam. |
| 3 | Rantai `/discount/CODE?redirect=/checkout` = dua lompatan (terukur 1,0–4,2 dtk hanya untuk lompatan pertama). | Jendela freeze makin lebar. |

## Perbaikan

1. **Masa hidup dijamin di primitif.** `cartShowLoading()` memasang penjaga
   (bawaan 12 dtk — sengaja di atas anggaran ~10 dtk `cartChangeWithRetry`);
   `cartHideLoading()` melucutinya. Satu perubahan ini menutup semua pemanggil,
   yang ada sekarang maupun yang ditambahkan nanti. Saat menyala ia mengirim
   `cart:loading-timeout` dan mencatat `cart_loading_timeout`.
2. **Ketukan kedua ditelan penuh** (`preventDefault` sebelum penjaga
   `handoffInFlight`), dan statusnya disimpan di closure — bukan `btn.dataset`,
   yang ikut lenyap saat drawer dirender ulang.
3. **Satu lompatan:** `/checkout?discount=CODE` (terukur 0,8–1,0 dtk), terverifikasi
   membawa kode utuh termasuk daftar berkoma, ter-encode maupun tidak, dan di
   bawah awalan market `/id/`.

## Cakupan

- **A (15)** — primitif overlay: ambang, batas khusus, setel-ulang, sekali-saja,
  tanpa simpul ganda, tanpa `#cart`, dan pasangan show/hide normal tidak
  memicu apa pun.
- **B (15)** — serah-terima voucher: tanpa voucher submit natif utuh; dengan
  voucher URL satu-lompatan; awalan `/id/`; daftar berkoma; **ketukan kedua tidak
  membuang diskon**; pembebasan lewat penjaga dan lewat bfcache; pageshow biasa
  tidak membebaskan; voucher dicabut kembali ke submit natif.
- **C (7)** — interaksi gerbang checkout hadiah di fase capture, termasuk
  reproduksi insiden: voucher terpasang + hadiah tak cocok + keranjang di
  jendela 429 → gerbang menahan, menyerah di 4 dtk, voucher tetap membawa kode.
- **D (5)** — regresi: ubah jumlah & hapus baris tetap menutup overlay sendiri
  dan tidak memicu telemetri timeout.

## Bukti suite ini bermakna

Dijalankan lawan berkas **pra-perbaikan**: `LULUS 27 · GAGAL 15` — termasuk
`B9` (ketukan kedua membuang diskon), `A6/A11/A13` (overlay tak pernah menutup
sendiri), `C7` (freeze juga terjadi dengan mesin hadiah aktif).
Lawan berkas sesudah perbaikan: **LULUS 42 · GAGAL 0**.

## Catatan harness

`../cart-remove-test/harness.js` diperluas (aditif, suite lama tetap 37/3 seperti
sebelumnya):
- `document.addEventListener` kini menyimpan flag **capture**, dan
  `document.dispatchClick(target)` menjalankan fase capture sebelum bubble serta
  menghormati `stopPropagation()`. Gerbang hadiah bergantung persis pada urutan
  ini — uji yang mengabaikannya akan menyesatkan.
- `document.dispatchEvent` + global `CustomEvent`.
- `dom.js`: `el.className = '...'` kini mendarat di set kelas yang dibaca
  pencocok selector. Tanpa ini, simpul yang dibuat lewat `createElement` +
  `className` (persis overlay ini) tidak pernah cocok dengan `.kelasnya` dan uji
  jadi buta terhadapnya.

## PR untuk user

Nama event `cart_loading_timeout` harus didaftarkan ke regex trigger GTM supaya
sampai ke GA4 — pola yang sama dengan `gift_gate_timeout` / `gift_sync_failed`.
Selama belum didaftarkan, perbaikannya tetap bekerja; hanya angkanya yang tidak
terlihat.
