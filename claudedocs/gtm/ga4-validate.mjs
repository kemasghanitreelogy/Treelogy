// Validasi paritas backstop — GA4 Data API property 396932726
const TOKEN = process.env.GA4_TOKEN;
const PID = '396932726';

async function runReport(body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PID}:runReport`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({...body, limit: 100000}),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
}
const rows = (r) => (r.rows ?? []).map((x) => [
  ...x.dimensionValues.map((d) => d.value),
  ...x.metricValues.map((m) => m.value),
]);

const range = [{startDate: process.env.START ?? '2026-08-01', endDate: process.env.END ?? '2026-08-02'}];
const purchaseFilter = {filter: {fieldName: 'eventName', stringFilter: {value: 'purchase'}}};

// 1. Purchase & revenue per hari
const r1 = await runReport({
  dateRanges: range,
  dimensions: [{name: 'date'}],
  metrics: [{name: 'eventCount'}, {name: 'purchaseRevenue'}, {name: 'transactions'}],
  dimensionFilter: purchaseFilter,
});
console.log('== purchase per hari [date, eventCount, revenue, transactions]');
rows(r1).forEach((r) => console.log('  ', r.join(' | ')));

// 2. transaction_id dobel
const r2 = await runReport({
  dateRanges: range,
  dimensions: [{name: 'date'}, {name: 'transactionId'}],
  metrics: [{name: 'eventCount'}],
  dimensionFilter: purchaseFilter,
});
const all = rows(r2);
console.log('== transaction_id unik:', all.length);
const dup = all.filter((r) => Number(r[2]) > 1);
console.log('== transaction_id DOBEL (count>1):', dup.length);
dup.forEach((r) => console.log('  ', r.join(' | ')));

// 3. breakdown purchase_source (dimensi baru terdaftar 29 Jul malam)
try {
  const r3 = await runReport({
    dateRanges: range,
    dimensions: [{name: 'date'}, {name: 'customEvent:purchase_source'}],
    metrics: [{name: 'eventCount'}],
    dimensionFilter: purchaseFilter,
  });
  console.log('== purchase_source [date, source, count]');
  rows(r3).forEach((r) => console.log('  ', r.join(' | ')));
} catch (e) {
  console.log('== purchase_source belum tersedia:', String(e).slice(0, 120));
}

// 4. Rasio kesehatan funnel per hari
const r4 = await runReport({
  dateRanges: range,
  dimensions: [{name: 'date'}, {name: 'eventName'}],
  metrics: [{name: 'eventCount'}],
  dimensionFilter: {filter: {fieldName: 'eventName', inListFilter: {values: [
    'page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase',
    'session_start', 'gy_ads_spillover', 'view_cart', 'remove_from_cart', 'whatsapp_click',
  ]}}},
});
console.log('== event harian [date, event, count]');
rows(r4).sort().forEach((r) => console.log('  ', r.join(' | ')));

// 5. Journey/atribusi purchase: source per purchase (yatim = direct/(not set))
const r5 = await runReport({
  dateRanges: range,
  dimensions: [{name: 'date'}, {name: 'sessionSourceMedium'}],
  metrics: [{name: 'eventCount'}],
  dimensionFilter: purchaseFilter,
});
console.log('== purchase per session source/medium [date, source, count]');
rows(r5).sort().forEach((r) => console.log('  ', r.join(' | ')));
