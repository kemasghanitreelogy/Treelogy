# Harness bug "hapus di cart drawer tidak jadi"

Menjalankan kode ASLI `snippets/MiniCart.liquid` + `assets/gift-auto-add.js`
di atas DOM tiruan dan server keranjang tiruan bersemantik Shopify. Tidak ada
fungsi tema yang di-mock — yang diganti hanya browser dan jaringan.

Invarian tunggal yang diuji: **baris di DOM harus sama dengan isi keranjang di
server**. Pelanggarannya persis keluhan pembeli.

```bash
# versi kerja (lokal)
node claudedocs/cart-remove-test/suite.js

# versi LIVE sebagai pembanding (harus GAGAL di skenario 2, 7, 11)
MINI=claudedocs/cart-remove-test/baseline-live-MiniCart.liquid \
  node claudedocs/cart-remove-test/suite.js
```

JANGAN uji lewat toko sungguhan: sapuan otomatis memicu 429 yang menempel di
sesi/cookie selama belasan menit — lihat memori `cart-endpoint-429-trap`.
