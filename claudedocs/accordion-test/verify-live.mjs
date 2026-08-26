/* Verifikasi akhir di tema LIVE, tanpa patch apa pun.
   Cache halaman Shopify bisa menyajikan snapshot basi berjam-jam, jadi tiap URL
   dibuka dengan query pembeda + cache browser dimatikan. */
import { launch, attach } from '../search-premium-test/cdp.mjs';

const stamp = process.argv[2] || String(process.hrtime.bigint());
const SEL = '.accordion.__accordion-wrapper';
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

const proc = await launch(9390, '/tmp/cdp-verify');
const cdp = await attach(9390);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

async function go(url) {
  await cdp.goto(url + (url.includes('?') ? '&' : '?') + 'cb=' + stamp);
  await cdp.eval('new Promise(r => setTimeout(r, 3000))');
  await cdp.eval(`return (() => { document.querySelectorAll('[class*="kl-private"], [data-testid="POPUP"]').forEach(n => n.remove()); return true; })()`);
}

/* ---------- 1. Accordion ---------- */
console.log('=== /id/pages/moringa-tree (accordion) ===');
await go('https://treelogy.com/id/pages/moringa-tree');

check('kelas __accordion sudah dicabut',
  (await cdp.eval(`return document.querySelectorAll('.scroll-container.__accordion').length`)) === 0);

const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('${SEL}')[0].querySelector('.accordion-header')` });
const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
const lc = listeners.filter((l) => l.type === 'click').length;
check('hanya satu handler klik', lc === 1, lc + ' terpasang');

await cdp.eval(`return (() => { document.querySelectorAll('${SEL}')[0].scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`);
await cdp.eval('new Promise(r => setTimeout(r, 700))');
const probe = await cdp.eval(`return (() => {
  const h = document.querySelectorAll('${SEL}')[0].querySelector('.accordion-header');
  const r = h.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const hit = (y > 0 && y < innerHeight) ? document.elementFromPoint(x, y) : null;
  return { x, y, ok: !!(hit && h.contains(hit)), tag: hit ? hit.tagName.toLowerCase() : '(null)' };
})()`);
check('klik mendarat di header (bukan overlay)', probe.ok, probe.tag);
for (const type of ['mousePressed', 'mouseReleased']) {
  await cdp.send('Input.dispatchMouseEvent', { type, x: probe.x, y: probe.y, button: 'left', clickCount: 1 });
}
await cdp.eval('new Promise(r => setTimeout(r, 900))');
const st = await cdp.eval(`return (() => {
  const it = document.querySelectorAll('${SEL}')[0];
  return {
    active: it.classList.contains('active'),
    tinggi: Math.round(it.querySelector('.accordion-description').getBoundingClientRect().height),
    ikon: getComputedStyle(it.querySelector('.accordion-header svg')).transform,
  };
})()`);
check('klik membuka isi', st.active && st.tinggi > 0, JSON.stringify({ active: st.active, tinggi: st.tinggi }));
check('ikon jadi x (rotate 45deg)', /matrix\(0\.70/.test(st.ikon), st.ikon);

/* ---------- 2. Kartu hero ---------- */
const card = (url) => cdp.eval(`return (() => {
  const a = document.querySelector('.hero-card-v2');
  if (!a) return null;
  const g = (s) => { const e = a.querySelector(s); return e ? e.textContent.trim() : '(tidak ada)'; };
  return {
    label: g('.hero-card-v2__price-label'),
    judul: g('.product-title'),
    blurb: g('.product-excerpt'),
    alt: a.querySelector('img') ? a.querySelector('img').getAttribute('alt') : '(tidak ada)',
  };
})()`);

console.log('\n=== / (EN) - kartu hero ===');
await go('https://treelogy.com/');
const en = await card();
console.log('   ', JSON.stringify(en, null, 2).replace(/\n/g, '\n    '));
check('EN label tetap "From"', en.label === 'From', en.label);
check('EN judul tetap Inggris', en.judul === 'Organic Moringa Powder', en.judul);
check('EN blurb tetap Inggris', /Grown regeneratively/.test(en.blurb), en.blurb.slice(0, 40));
check('EN alt bersih dari prefiks LANG:', !/LANG:/.test(en.alt), en.alt.slice(0, 50));
check('EN alt tidak memakai kalimat Indonesia', !/Kaleng|terbuka dengan/.test(en.alt), en.alt.slice(0, 50));

console.log('\n=== /id (ID) - kartu hero ===');
await go('https://treelogy.com/id');
const id = await card();
console.log('   ', JSON.stringify(id, null, 2).replace(/\n/g, '\n    '));
check('ID label jadi "Dari"', id.label === 'Dari', id.label);
check('ID judul jadi Indonesia', id.judul === 'Bubuk Moringa Organik', id.judul);
check('ID blurb jadi Indonesia', /Ditanam secara regeneratif/.test(id.blurb), id.blurb.slice(0, 45));
check('ID alt bersih dari prefiks LANG:', !/LANG:/.test(id.alt), id.alt.slice(0, 50));

console.log(`\n${fail ? 'ADA YANG GAGAL' : 'SEMUA LULUS'}: ${pass} lulus, ${fail} gagal`);
cdp.close();
proc.kill();
process.exit(fail ? 1 : 0);
