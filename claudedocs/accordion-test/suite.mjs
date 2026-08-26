/* Suite accordion — menjalankan halaman LIVE dua kali:
   BEFORE : apa adanya (bug harus muncul)
   AFTER  : kelas `__accordion` dicabut SEBELUM script apa pun dieksekusi,
            meniru persis fix di ContentWithAccordionList.liquid, lalu script
            section dan app.bundle.js berjalan alami seperti di produksi.

   Setiap klik divalidasi lewat elementFromPoint dulu; klik yang mendarat di
   luar viewport atau tertutup overlay ditolak, bukan dihitung sebagai hasil. */
import { launch, attach } from '../search-premium-test/cdp.mjs';

const URL = process.argv[2] || 'https://treelogy.com/id/pages/moringa-tree';
const SEL = '.accordion.__accordion-wrapper';

/* Dicabut sebelum dokumen ada isinya: MutationObserver menyapu kelas penanda
   begitu .scroll-container muncul, jadi Accodion() tidak pernah menemukannya. */
const PATCH = `
(() => {
  const strip = () => {
    try {
      document.querySelectorAll('.scroll-container.__accordion')
        .forEach(function (n) { n.classList.remove('__accordion'); });
    } catch (e) {}
  };
  /* documentElement belum tentu ada sedini ini - observer dipasang begitu
     tersedia, dan sapuan berkala menutup celah sampai DOMContentLoaded. */
  var iv = setInterval(strip, 5);
  var wire = function () {
    if (!document.documentElement) return setTimeout(wire, 1);
    new MutationObserver(strip).observe(document.documentElement, { childList: true, subtree: true });
  };
  wire();
  document.addEventListener('DOMContentLoaded', function () {
    strip();
    /* Fix kedua: aturan ikon diikat ke id section supaya menang atas theme.css:5703. */
    try {
      var sec = document.querySelector('section.shopify-section.accordion-list');
      if (sec) {
        var st = document.createElement('style');
        st.textContent = '#' + sec.id + ' .accordion.active .accordion-header svg { transform: rotate(45deg); }';
        document.head.appendChild(st);
      }
    } catch (e) {}
  }, true);
  window.addEventListener('load', function () { clearInterval(iv); });
  strip();
})();
`;

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

async function session(port, patched) {
  const proc = await launch(port, '/tmp/cdp-suite-' + port);
  const cdp = await attach(port);
  if (patched) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PATCH });
  await cdp.goto(URL);
  await cdp.eval('new Promise(r => setTimeout(r, 2500))');
  /* Overlay Klaviyo muncul intermiten dan menelan klik; disingkirkan supaya yang
     diuji benar-benar accordion, bukan popup. Perilaku overlay-nya dilaporkan terpisah. */
  const kl = await cdp.eval(`return document.querySelectorAll('[class*="kl-private"]').length`);
  await cdp.eval(`return (() => { document.querySelectorAll('[class*="kl-private"], [data-testid="POPUP"]').forEach(n => n.remove()); return true; })()`);
  return { cdp, proc, kl };
}

async function clickItem(cdp, n) {
  await cdp.eval(`return (() => { document.querySelectorAll('${SEL}')[${n}].scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`);
  await cdp.eval(`return (async () => {
    let last = -1, stable = 0;
    for (let i = 0; i < 40 && stable < 3; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (Math.abs(window.scrollY - last) < 1) stable++; else stable = 0;
      last = window.scrollY;
    }
    return window.scrollY;
  })()`);
  const probe = await cdp.eval(`return (() => {
    const h = document.querySelectorAll('${SEL}')[${n}].querySelector('.accordion-header');
    const r = h.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const inView = y > 0 && y < innerHeight && x > 0 && x < innerWidth;
    const hit = inView ? document.elementFromPoint(x, y) : null;
    return { x, y, inView, ok: !!(hit && h.contains(hit)), tag: hit ? hit.tagName.toLowerCase() : '(null)' };
  })()`);
  if (!probe.inView || !probe.ok) throw new Error('klik tidak sah: inView=' + probe.inView + ' kena=' + probe.tag);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: probe.x, y: probe.y, button: 'left', clickCount: 1 });
  }
  await cdp.eval('new Promise(r => setTimeout(r, 800))');
}

const stateOf = (cdp, n) => cdp.eval(`return (() => {
  const it = document.querySelectorAll('${SEL}')[${n}];
  const c = it.querySelector('.accordion-description');
  return { active: it.classList.contains('active'), tinggi: Math.round(c.getBoundingClientRect().height) };
})()`);

const listenerCount = async (cdp, n) => {
  const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('${SEL}')[${n}].querySelector('.accordion-header')` });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  return listeners.filter((l) => l.type === 'click').length;
};

for (const patched of [false, true]) {
  const label = patched ? 'SESUDAH FIX' : 'SEBELUM FIX';
  console.log(`\n=== ${label} ===`);
  const { cdp, proc, kl } = await session(patched ? 9362 : 9361, patched);
  const n = await cdp.eval(`return document.querySelectorAll('${SEL}').length`);
  console.log(`  (item: ${n}, node Klaviyo saat muat: ${kl})`);

  const stillMarked = await cdp.eval(`return document.querySelectorAll('.scroll-container.__accordion').length`);
  console.log(`  container masih bertanda __accordion: ${stillMarked}`);
  const lc = await listenerCount(cdp, 0);
  console.log(`  listener klik di header: ${lc}`);

  await clickItem(cdp, 0);
  const opened = await stateOf(cdp, 0);
  if (patched) {
    check('satu handler klik saja', lc === 1, lc + ' terpasang');
    check('klik membuka item', opened.active && opened.tinggi > 0, JSON.stringify(opened));
    await clickItem(cdp, 0);
    const closed = await stateOf(cdp, 0);
    check('klik kedua menutup item', !closed.active && closed.tinggi === 0, JSON.stringify(closed));
    await clickItem(cdp, 1);
    await clickItem(cdp, 2);
    const a1 = await stateOf(cdp, 1), a2 = await stateOf(cdp, 2);
    check('buka item lain menutup yang sebelumnya', !a1.active && a2.active, `item1=${JSON.stringify(a1)} item2=${JSON.stringify(a2)}`);
    const last = await cdp.eval(`return (() => {
      const all = Array.from(document.querySelectorAll('${SEL}'));
      for (let i = all.length - 1; i >= 0; i--) if (all[i].getBoundingClientRect().height > 0) return i;
      return 0;
    })()`);
    await clickItem(cdp, last);
    const al = await stateOf(cdp, last);
    check('item terlihat terakhir (#' + last + ') juga berfungsi', al.active && al.tinggi > 0, JSON.stringify(al));
    const tf = await cdp.eval(`return getComputedStyle(document.querySelectorAll('${SEL}')[${last}].querySelector('.accordion-header svg')).transform`);
    const r45 = /matrix\(0\.70[0-9]*, 0\.70[0-9]*, -0\.70[0-9]*, 0\.70[0-9]*/.test(tf);
    check('ikon berputar 45deg saat terbuka (+ jadi x)', r45, tf);
  } else {
    check('BUG tereproduksi (klik tidak membuka)', !opened.active, JSON.stringify(opened));
    check('dua handler klik bertumpuk', lc === 2, lc + ' terpasang');
    /* transform punya transition 0.3s - dibaca setelah settle, bukan di t=0
       (pembacaan mentah mengembalikan matrix identitas dan menyesatkan). */
    const tfB = await cdp.eval(`return (async () => {
      const it = document.querySelectorAll('${SEL}')[0];
      it.classList.add('active');
      await new Promise(r => setTimeout(r, 600));
      const t = getComputedStyle(it.querySelector('.accordion-header svg')).transform;
      it.classList.remove('active');
      return t;
    })()`);
    check('BUG ikon tereproduksi (180deg, + terlihat sama)', /matrix\(-1, 0, 0, -1/.test(tfB), tfB);
  }
  cdp.close();
  proc.kill();
}

console.log(`\n${fail ? 'ADA YANG GAGAL' : 'SEMUA LULUS'}: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
