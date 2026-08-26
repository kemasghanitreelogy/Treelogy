/* Siapa yang menelan kliknya? Cek elementFromPoint di titik klik + rekam
   propagation sungguhan lewat listener capture di document. */
import { launch, attach } from '../search-premium-test/cdp.mjs';

const URL = process.argv[2] || 'https://treelogy.com/id/pages/moringa-tree';
const sel = '.accordion.__accordion-wrapper';

const proc = await launch(9343, '/tmp/cdp-accordion3');
const cdp = await attach(9343);
await cdp.goto(URL);
await cdp.eval('new Promise(r => setTimeout(r, 2500))');

const box = await cdp.eval(`return (() => {
  const r = document.querySelector('${sel} .accordion-header').getBoundingClientRect();
  window.scrollTo(0, window.scrollY + r.top - 300);
  const r2 = document.querySelector('${sel} .accordion-header').getBoundingClientRect();
  return { x: Math.round(r2.left + r2.width/2), y: Math.round(r2.top + r2.height/2), w: Math.round(r2.width), h: Math.round(r2.height) };
})()`);
await cdp.eval('new Promise(r => setTimeout(r, 350))');
console.log('bbox header  :', JSON.stringify(box));

console.log('elementFromPoint di titik klik:');
console.log(await cdp.eval(`return (() => {
  const el = document.elementFromPoint(${box.x}, ${box.y});
  const chain = [];
  let n = el;
  while (n && n !== document.body && chain.length < 6) {
    chain.push(n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).join('.') : ''));
    n = n.parentElement;
  }
  return '  ' + chain.join('\\n  <- ');
})()`));

/* Rekam jalur event sungguhan. */
await cdp.eval(`return (() => {
  window.__path = null;
  document.addEventListener('click', e => {
    window.__path = e.composedPath().slice(0, 6).map(n => n.tagName
      ? n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).join('.') : '')
      : String(n));
  }, true);
  return true;
})()`);

for (const type of ['mousePressed', 'mouseReleased']) {
  await cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
await cdp.eval('new Promise(r => setTimeout(r, 600))');
console.log('\njalur event klik (capture di document):');
console.log(await cdp.eval('return (window.__path || ["(TIDAK ADA event click sama sekali)"]).join("\\n  ")'));

/* Header yang punya listener itu masih nyambung ke dokumen? */
console.log('\nheader terhubung ke DOM?', await cdp.eval(`return document.querySelector('${sel} .accordion-header').isConnected`));
console.log('jumlah .accordion-header di item pertama:', await cdp.eval(`return document.querySelector('${sel}').querySelectorAll('.accordion-header').length`));
console.log('pointer-events header:', await cdp.eval(`return getComputedStyle(document.querySelector('${sel} .accordion-header')).pointerEvents`));
console.log('pointer-events item  :', await cdp.eval(`return getComputedStyle(document.querySelector('${sel}')).pointerEvents`));

cdp.close();
proc.kill();
