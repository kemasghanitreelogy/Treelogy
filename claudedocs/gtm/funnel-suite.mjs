// Suite funnel customer journey via GA4 Data API v1alpha runFunnelReport
const T = process.env.GA4_TOKEN;
const PID = '396932726';
const RANGE = [{startDate: '2026-07-30', endDate: '2026-08-02'}];

async function runFunnel(body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1alpha/properties/${PID}:runFunnelReport`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${T}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j;
}

const step = (name, eventName) => ({name, filterExpression: {funnelEventFilter: {eventName}}});
const MASTER = [
  step('Kunjungan', 'session_start'),
  step('Lihat Produk', 'view_item'),
  step('Add to Cart', 'add_to_cart'),
  step('Mulai Checkout', 'begin_checkout'),
  step('Purchase', 'purchase'),
];

function printTable(label, resp) {
  console.log(`\n#### ${label}`);
  const rows = resp.funnelTable?.rows ?? [];
  const dimCount = (resp.funnelTable?.dimensionHeaders ?? []).length;
  for (const r of rows) {
    const dims = r.dimensionValues.map((d) => d.value).join(' | ');
    const mets = r.metricValues.map((m) => m.value).join(' | ');
    console.log(`  ${dims} || ${mets}`);
  }
  console.log('  headers:', JSON.stringify({
    dims: (resp.funnelTable?.dimensionHeaders ?? []).map((h) => h.name),
    mets: (resp.funnelTable?.metricHeaders ?? []).map((h) => h.name),
  }));
}

// 1. Master funnel total (tanpa breakdown)
printTable('MASTER TOTAL', await runFunnel({dateRanges: RANGE, funnel: {isOpenFunnel: false, steps: MASTER}}));

// 2. Breakdown device
printTable('MASTER x DEVICE', await runFunnel({
  dateRanges: RANGE,
  funnel: {isOpenFunnel: false, steps: MASTER},
  funnelBreakdown: {breakdownDimension: {name: 'deviceCategory'}},
}));

// 3. Breakdown channel
printTable('MASTER x CHANNEL', await runFunnel({
  dateRanges: RANGE,
  funnel: {isOpenFunnel: false, steps: MASTER},
  funnelBreakdown: {breakdownDimension: {name: 'sessionDefaultChannelGroup'}, limit: 8},
}));

// 4. New vs returning
printTable('MASTER x NEW/RETURNING', await runFunnel({
  dateRanges: RANGE,
  funnel: {isOpenFunnel: false, steps: MASTER},
  funnelBreakdown: {breakdownDimension: {name: 'newVsReturning'}},
}));

// 5. Funnel hero
printTable('HERO', await runFunnel({dateRanges: RANGE, funnel: {isOpenFunnel: false, steps: [
  step('Lihat Hero', 'hero_view'),
  step('Klik CTA Hero', 'hero_cta_click'),
  step('Add to Cart', 'add_to_cart'),
  step('Purchase', 'purchase'),
]}}));

// 6. Micro-funnel checkout
printTable('CHECKOUT MICRO', await runFunnel({dateRanges: RANGE, funnel: {isOpenFunnel: false, steps: [
  step('Add to Cart', 'add_to_cart'),
  step('Lihat Cart', 'view_cart'),
  step('Mulai Checkout', 'begin_checkout'),
  step('Isi Pembayaran', 'add_payment_info'),
  step('Purchase', 'purchase'),
]}}));

// Pakai: GA4_TOKEN=<ya29 dari OAuth Playground, scope analytics.readonly> \
//   node claudedocs/gtm/funnel-suite.mjs
// Ganti RANGE di atas untuk periode lain. Laporan visual: funnel-journey.src.html
// (render PDF: chrome --headless=new --print-to-pdf).
