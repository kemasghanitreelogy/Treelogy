/* Membedah elemen yang menelan klik di posisi header accordion. */
import { open, SEL } from './harness.mjs';

const { cdp, proc } = await open(undefined, 9352);
await cdp.eval("return (() => { document.querySelectorAll('" + SEL + "')[0].scrollIntoView({block:'center',behavior:'instant'}); return 1; })()");
await cdp.eval('new Promise(r=>setTimeout(r,1500))');

const CHAIN = `return (() => {
  const h = document.querySelectorAll('${SEL}')[0].querySelector('.accordion-header');
  const r = h.getBoundingClientRect();
  const el = document.elementFromPoint(Math.round(r.left+r.width/2), Math.round(r.top+r.height/2));
  const name = (n) => n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(' ').slice(0,3).join('.') : '');
  const out = [];
  let n = el;
  while (n && n !== document.documentElement) {
    const cs = getComputedStyle(n), b = n.getBoundingClientRect();
    out.push(name(n)
      + ' | pos=' + cs.position + ' z=' + cs.zIndex + ' opacity=' + cs.opacity
      + ' visibility=' + cs.visibility + ' pointerEvents=' + cs.pointerEvents
      + ' anim=' + cs.animationName
      + ' box=' + Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height)
      + (n.getAttribute('data-testid') ? ' testid=' + n.getAttribute('data-testid') : ''));
    n = n.parentElement;
  }
  return out.join('\\n');
})()`;

console.log('=== rantai elemen yang menerima klik ===');
console.log(await cdp.eval(CHAIN));

const KL = `return (() => {
  const nodes = Array.from(document.querySelectorAll('[data-testid], [class*="kl-private"]')).slice(0, 15);
  return nodes.map((n) => {
    const cs = getComputedStyle(n), b = n.getBoundingClientRect();
    return n.tagName.toLowerCase()
      + ' testid=' + (n.getAttribute('data-testid') || '-')
      + ' pos=' + cs.position + ' z=' + cs.zIndex + ' opacity=' + cs.opacity
      + ' pointerEvents=' + cs.pointerEvents + ' anim=' + cs.animationName
      + ' box=' + Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height);
  }).join('\\n');
})()`;

console.log('\n=== node Klaviyo di halaman ===');
console.log(await cdp.eval(KL));

console.log('\n=== apakah popup menutupi seluruh layar? ===');
console.log(await cdp.eval(`return (() => {
  const pts = [[100,200],[500,400],[250,600],[900,300]];
  return pts.map((p) => {
    const el = document.elementFromPoint(p[0], p[1]);
    return p[0] + ',' + p[1] + ' -> ' + (el ? el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(' ')[0] : '') : 'null');
  }).join('\\n');
})()`));

cdp.close();
proc.kill();
