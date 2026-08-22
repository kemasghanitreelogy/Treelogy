/* Order yang pernah klik CTA halaman /pages/why-capsules (kampanye email #25 AUG).
 *
 * Membaca atribut order wc_cta_at / wc_cta_page (ditulis buildAttrs di
 * theme.liquid — pola yang sama dengan wa_click_*, lihat TRACKING-MASTER §2e).
 *
 * Pakai:
 *   node claudedocs/gtm/why-capsules-orders.mjs              # 30 hari terakhir
 *   node claudedocs/gtm/why-capsules-orders.mjs 2026-08-21   # sejak tanggal
 *
 * Butuh env STORE_NAME + ADMIN_API_KEY (fallback: baca .env di root repo).
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const env = { ...process.env };
if (!env.ADMIN_API_KEY) {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim();
    }
  } catch {}
}
const STORE = env.STORE_NAME ?? 'treelogymoringa.myshopify.com';
const TOKEN = env.ADMIN_API_KEY;
if (!TOKEN) { console.error('ADMIN_API_KEY tidak ditemukan'); process.exit(1); }

const since = process.argv[2] ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

const QUERY = `query($cursor: String, $q: String!) {
  orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      name createdAt
      totalPriceSet { shopMoney { amount currencyCode } }
      customAttributes { key value }
      lineItems(first: 25) {
        nodes { vendor title originalTotalSet { shopMoney { amount } } }
      }
    }
  }
}`;

async function gql(variables) {
  const r = await fetch(`https://${STORE}/admin/api/2025-07/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data.orders;
}

const matched = [];
let scanned = 0, cursor = null, hasNext = true;
while (hasNext) {
  const page = await gql({ cursor, q: `created_at:>=${since}` });
  for (const o of page.nodes) {
    scanned++;
    const attrs = Object.fromEntries(o.customAttributes.map((a) => [a.key, a.value]));
    if (!attrs.wc_cta_at) continue;
    // Jalur beli per §2b.3: vendor produk BERBAYAR (baris hadiah Rp 0 diabaikan).
    const paidVendors = new Set(
      o.lineItems.nodes
        .filter((li) => parseFloat(li.originalTotalSet.shopMoney.amount) > 0)
        .map((li) => li.vendor)
    );
    matched.push({
      order: o.name,
      dibuat: o.createdAt.slice(0, 16).replace('T', ' '),
      nilai: `${Math.round(parseFloat(o.totalPriceSet.shopMoney.amount)).toLocaleString('id-ID')} ${o.totalPriceSet.shopMoney.currencyCode}`,
      klik_cta: (attrs.wc_cta_at || '').slice(0, 16).replace('T', ' '),
      halaman: attrs.wc_cta_page || '-',
      jalur: paidVendors.has('TEST') ? 'listing LP' : 'katalog utama',
      juga_klik_wa: attrs.wa_click_at ? 'ya' : '-',
    });
  }
  hasNext = page.pageInfo.hasNextPage;
  cursor = page.pageInfo.endCursor;
}

console.log(`Order sejak ${since}: ${scanned} discan, ${matched.length} pernah klik CTA why-capsules\n`);
if (matched.length) console.table(matched);
else console.log('(atribut guide_cta_* baru terisi untuk klik sejak 21 Agu 2026)');
