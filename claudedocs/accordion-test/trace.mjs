/* Merekam apa yang terjadi ke kelas .active SELAMA satu klik, plus menguji
   hipotesis: kalau salah satu dari dua listener dicabut, apakah dropdown hidup? */
import { launch, attach } from '../search-premium-test/cdp.mjs';

const URL = process.argv[2] || 'https://treelogy.com/id/pages/moringa-tree';
const sel = '.accordion.__accordion-wrapper';

const proc = await launch(9342, '/tmp/cdp-accordion2');
const cdp = await attach(9342);
await cdp.goto(URL);
await cdp.eval('new Promise(r => setTimeout(r, 2500))');

/* Pasang observer yang mencatat setiap perubahan atribut class pada item pertama. */
await cdp.eval(`return (() => {
  const it = document.querySelector('${sel}');
  window.__log = [];
  new MutationObserver(ms => {
    for (const m of ms) window.__log.push(it.classList.contains('active') ? 'active DITAMBAH' : 'active DIHAPUS');
  }).observe(it, { attributes: true, attributeFilter: ['class'] });
  return true;
})()`);

async function clickFirst() {
  const box = await cdp.eval(`return (() => {
    const r = document.querySelector('${sel} .accordion-header').getBoundingClientRect();
    window.scrollTo(0, window.scrollY + r.top - 300);
    const r2 = document.querySelector('${sel} .accordion-header').getBoundingClientRect();
    return { x: Math.round(r2.left + r2.width/2), y: Math.round(r2.top + r2.height/2) };
  })()`);
  await cdp.eval('new Promise(r => setTimeout(r, 350))');
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  await cdp.eval('new Promise(r => setTimeout(r, 700))');
}

const snap = () => cdp.eval(`return (() => {
  const it = document.querySelector('${sel}');
  const c = it.querySelector('.accordion-description');
  return { active: it.classList.contains('active'), tinggiIsi: Math.round(c.getBoundingClientRect().height), jejak: window.__log.slice() };
})()`);

console.log('=== KONDISI SEKARANG (dua listener terpasang) ===');
await clickFirst();
console.log(JSON.stringify(await snap(), null, 2));

/* Hipotesis: handler global app.bundle.js yang membatalkan. Cabut SEMUA listener
   dari header (lewat cloneNode) lalu pasang ulang HANYA logika section. */
console.log('\n=== UJI: hanya handler section yang dipasang ===');
await cdp.eval(`return (() => {
  window.__log = [];
  document.querySelectorAll('${sel}').forEach(item => {
    const h = item.querySelector('.accordion-header');
    const nh = h.cloneNode(true);
    h.parentNode.replaceChild(nh, h);
    const content = item.querySelector('.accordion-description');
    nh.addEventListener('click', () => {
      if (item.classList.contains('active')) { item.classList.remove('active'); content.style.maxHeight = null; }
      else { item.classList.add('active'); content.style.maxHeight = content.scrollHeight + 'px'; }
    });
  });
  return true;
})()`);
await clickFirst();
console.log(JSON.stringify(await snap(), null, 2));

cdp.close();
proc.kill();
