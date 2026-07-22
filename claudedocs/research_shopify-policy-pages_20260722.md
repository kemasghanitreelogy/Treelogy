# Riset: Best Practice Shopify Policy Pages + Terjemahan (Juli 2026)

Konteks: treelogymoringa (treelogy.com), theme custom, locale `en` (primary) + `id` (published), 4 dokumen kebijakan EN+ID siap di `content policy pages/`.

## 1. Mekanisme resmi policy pages — TERVERIFIKASI live schema (API 2025-10)

- Mutation: `shopPolicyUpdate(shopPolicy: ShopPolicyInput!)`, scope `write_legal_policies`.
- `ShopPolicyInput` hanya 2 field: `type` (enum `ShopPolicyType`) + `body` (String, HTML).
- Enum live: `REFUND_POLICY`, `SHIPPING_POLICY`, `PRIVACY_POLICY`, `TERMS_OF_SERVICE`, `TERMS_OF_SALE`, `LEGAL_NOTICE`, `SUBSCRIPTION_POLICY`, `CONTACT_INFORMATION`.
- **URL handle tidak bisa custom.** `SUBSCRIPTION_POLICY` render di `/policies/subscription-policy` — `/policies/subscription-terms` bukan handle native. Solusi: pakai native + URL redirect `/policies/subscription-terms → /policies/subscription-policy` (mekanisme redirect admin yang sudah terbukti dipakai untuk `/daun-kelor` & `/ai-*`).
- Kondisi store saat ini: PRIVACY (23.1k chars), REFUND (25.5k), TOS (25.5k) **sudah terisi**; SUBSCRIPTION_POLICY **belum ada**. Update = OVERWRITE konten lama (tidak ada versioning API — backup dulu).

## 2. Terjemahan (ID) — TERVERIFIKASI live schema

- `TranslatableResourceType.SHOP_POLICY` ada → jalur resmi: query `translatableResources(resourceType: SHOP_POLICY)` untuk ambil `translatableContent { key, value, digest }` per policy, lalu `translationsRegister(resourceId, translations: [{ key: "body", value: <html-id>, locale: "id", translatableContentDigest: <digest> }])`.
- **Digest wajib** dan berubah setiap kali body EN di-update → urutan wajib: (1) update body EN, (2) ambil digest baru, (3) register terjemahan ID. Tidak butuh app Translate & Adapt.
- Storefront: `/policies/x` serve EN, `/id/policies/x` serve terjemahan ID otomatis (locale `id` sudah published).

## 3. Styling — fakta + praktik komunitas

- Markup `/policies/*` di-render Shopify di dalam layout theme: `.shopify-policy__container` > `.shopify-policy__title` (h1) > `.shopify-policy__body`. **Tidak ada template Liquid** untuk halaman ini — kontrol hanya via CSS theme + HTML di body policy. (Praktik komunitas terdokumentasi: [Tom Blanchard](https://tomblanchard.co.uk/taking-design-control-of-shopify-policies/), [Shopify Community](https://community.shopify.com/t/how-can-i-adjust-the-page-width-and-title-size-on-policy-pages/272126/2).)
- Best practice legal page panjang: max-width berbasis karakter (~70–75ch) untuk line-length terbaca, line-height ≥1.6, hierarchy h2 jelas, spacing antar section.
- Brand: body `#2a3b34`, judul + link `#a5bb86` (perhatian: `#a5bb86` di atas putih ≈ kontras 1.9:1 — di bawah WCAG AA 4.5:1 untuk body text; aman untuk h1/h2 ukuran besar bila bold (3:1 large-text) tapi borderline; untuk link inline sebaiknya ditambah underline agar tetap dapat diidentifikasi tanpa bergantung warna).

## 4. Konteks hukum subscription auto-renewal (US) — sekunder, bukan legal advice

- FTC Click-to-Cancel Rule **divacate** Eighth Circuit (2025, cacat prosedural); FTC membuka ANPRM Maret 2026 untuk menghidupkan kembali ([Jones Day](https://www.jonesday.com/en/insights/2026/05/ftc-revives-clicktocancel-rule-new-risks-for-subscription-businesses), [Crowell](https://www.crowell.com/en/insights/client-alerts/clicking-all-the-right-boxes-ftc-moves-to-revive-click-to-cancel-rule-following-eighth-circuit-vacatur), [FTC](https://www.ftc.gov/legal-library/browse/rules/negative-option-rule)).
- Ekspektasi requirement bertahan: disclosure jelas & mencolok, express consent, cancel semudah subscribe, tanpa misrepresentasi. ~30 negara bagian punya auto-renewal law sendiri (CA paling ketat, [Paul Hastings](https://www.paulhastings.com/insights/client-alerts/updated-california-and-ftc-auto-renewal-regulations-take-effect)).
- Draft Subscription Terms Treelogy sudah selaras: disclosure kapital mencolok, reminder 3 hari, cancel self-service, refund billing error.

## Rencana implementasi

1. Konversi 8 docx → HTML bersih (h2/h3/p/ul, tanpa inline style), link internal EN → `https://treelogy.com/...`, ID → `https://treelogy.com/id/...`.
2. Backup body 3 policy lama ke scratchpad + claudedocs.
3. `shopPolicyUpdate` ×4 (EN): REFUND, PRIVACY, TERMS_OF_SERVICE, SUBSCRIPTION_POLICY (baru).
4. `translatableResources` ambil digest ×4 → `translationsRegister` locale `id` ×4.
5. Redirect `/policies/subscription-terms → /policies/subscription-policy`.
6. CSS theme: `.shopify-policy__*` — warna brand, max-width 75ch, typography legal.
7. Verifikasi live: `/policies/*` + `/id/policies/*` + footer links; validasi theme.
