/* Dua pertanyaan dipisah:
   A. Kalau tidak ada overlay, apakah accordion-nya sendiri berfungsi?
   B. Seberapa sering overlay Klaviyo muncul dan menelan klik?  */
import { open, clickItem, stateOf, listenersOn, SEL } from './harness.mjs';

const { cdp, proc } = await open(undefined, 9353);

const klaviyoState = () => cdp.eval(`return (() => {
  const n = document.querySelectorAll('[class*="kl-private"], [data-testid="POPUP"], .needsclick');
  if (!n.length) return 'tidak ada node Klaviyo';
  const el = n[0];
  const cs = getComputedStyle(el), b = el.getBoundingClientRect();
  return n.length + ' node; pertama: pos=' + cs.position + ' z=' + cs.zIndex
    + ' opacity=' + cs.opacity + ' pointerEvents=' + cs.pointerEvents
    + ' box=' + Math.round(b.width) + 'x' + Math.round(b.height);
})()`);

console.log('Klaviyo saat muat   :', await klaviyoState());
console.log('listener klik #0    :', (await listenersOn(cdp, 0)).join(', ') || '(tidak ada)');

/* Singkirkan overlay apa pun supaya pertanyaan A murni soal accordion. */
await cdp.eval(`return (() => {
  document.querySelectorAll('[class*="kl-private"], [data-testid="POPUP"]').forEach(n => n.remove());
  return true;
})()`);

console.log('\n--- A. accordion tanpa overlay ---');
console.log('sebelum       :', JSON.stringify(await stateOf(cdp, 0)));
await clickItem(cdp, 0);
const afterOpen = await stateOf(cdp, 0);
console.log('sesudah klik 1:', JSON.stringify(afterOpen));
await clickItem(cdp, 0);
const afterClose = await stateOf(cdp, 0);
console.log('sesudah klik 2:', JSON.stringify(afterClose));

console.log('\n--- eksklusivitas: buka #1 lalu #2, #1 harus tertutup ---');
await clickItem(cdp, 1);
await clickItem(cdp, 2);
console.log('item1:', JSON.stringify(await stateOf(cdp, 1)));
console.log('item2:', JSON.stringify(await stateOf(cdp, 2)));

const verdictA = afterOpen.active && afterOpen.tinggiIsi > 0 && !afterClose.active;
console.log('\nVERDIKT A:', verdictA ? 'accordion SEHAT tanpa overlay' : 'accordion RUSAK walau tanpa overlay');

cdp.close();
proc.kill();
