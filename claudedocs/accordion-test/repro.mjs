/* Repro bug dropdown /pages/moringa-tree: klik header accordion tidak membuka apa pun.
   Menjalankan halaman LIVE di Chrome sungguhan, menghitung listener yang benar-benar
   terpasang, lalu mengklik dan melihat apa yang terjadi ke kelas .active. */
import { launch, attach } from '../search-premium-test/cdp.mjs';

const URL = process.argv[2] || 'https://treelogy.com/id/pages/moringa-tree';

const proc = await launch(9341, '/tmp/cdp-accordion');
const cdp = await attach(9341);
await cdp.goto(URL);
await cdp.eval('new Promise(r => setTimeout(r, 2500))');

const sel = '.accordion.__accordion-wrapper';

console.log('URL          :', URL);
console.log('jumlah item  :', await cdp.eval(`document.querySelectorAll('${sel}').length`));

/* Listener yang benar-benar terpasang di header pertama - lewat DOMDebugger,
   satu-satunya cara melihat listener tanpa menebak dari kode. */
const { result } = await cdp.send('Runtime.evaluate', {
  expression: `document.querySelector('${sel} .accordion-header')`,
});
const listeners = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
console.log('listener di header pertama:');
for (const l of listeners.listeners) {
  console.log(`  - ${l.type} @ ${String(l.scriptId)}:${l.lineNumber}`);
}

const state = () => cdp.eval(`return (() => {
  const it = document.querySelector('${sel}');
  const c  = it.querySelector('.accordion-description');
  return {
    active: it.classList.contains('active'),
    wrapperMaxH: it.style.maxHeight || '(kosong)',
    contentMaxH: c.style.maxHeight || '(kosong)',
    contentH: c.getBoundingClientRect().height,
  };
})()`);

console.log('\nsebelum klik :', JSON.stringify(await state()));

/* Klik sungguhan lewat CDP (isTrusted=true), bukan el.click() sintetis. */
const box = await cdp.eval(`return (() => {
  const r = document.querySelector('${sel} .accordion-header').getBoundingClientRect();
  window.scrollTo(0, window.scrollY + r.top - 300);
  const r2 = document.querySelector('${sel} .accordion-header').getBoundingClientRect();
  return { x: Math.round(r2.left + r2.width/2), y: Math.round(r2.top + r2.height/2) };
})()`);
await cdp.eval('new Promise(r => setTimeout(r, 400))');

for (const type of ['mousePressed', 'mouseReleased']) {
  await cdp.send('Input.dispatchMouseEvent', {
    type, x: box.x, y: box.y, button: 'left', clickCount: 1,
  });
}
await cdp.eval('new Promise(r => setTimeout(r, 900))');
console.log('sesudah klik :', JSON.stringify(await state()));

cdp.close();
proc.kill();
