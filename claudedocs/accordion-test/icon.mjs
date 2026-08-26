import { launch, attach } from '../search-premium-test/cdp.mjs';
const PATCH = `(() => { const s=()=>{try{document.querySelectorAll('.scroll-container.__accordion').forEach(n=>n.classList.remove('__accordion'))}catch(e){}}; setInterval(s,5); s(); })();`;
const proc = await launch(9381, '/tmp/cdp-icon'); const cdp = await attach(9381);
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PATCH });
await cdp.goto('https://treelogy.com/id/pages/moringa-tree');
await cdp.eval('new Promise(r=>setTimeout(r,3000))');
await cdp.eval(`return (()=>{document.querySelectorAll('[class*="kl-private"],[data-testid="POPUP"]').forEach(n=>n.remove());return 1})()`);
const S='.accordion.__accordion-wrapper';
// Simulasi fix CSS: aturan ber-id seperti di section, disuntik dengan cara yang sama persis.
await cdp.eval(`return (() => {
  const sec = document.querySelector('section.shopify-section.accordion-list') || document.querySelector('[id^="shopify-section-"]');
  const st = document.createElement('style');
  st.textContent = '#' + sec.id + ' .accordion.active .accordion-header svg { transform: rotate(45deg); }';
  document.head.appendChild(st);
  return sec.id;
})()`);
const icon = (n) => cdp.eval(`return getComputedStyle(document.querySelectorAll('${S}')[${n}].querySelector('.accordion-header svg')).transform`);
console.log('ikon item0 tertutup :', await icon(0));
await cdp.eval(`return (()=>{document.querySelectorAll('${S}')[0].scrollIntoView({block:'center',behavior:'instant'});return 1})()`);
await cdp.eval('new Promise(r=>setTimeout(r,600))');
const b = await cdp.eval(`return (()=>{const h=document.querySelectorAll('${S}')[0].querySelector('.accordion-header');const r=h.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
for (const t of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type:t,x:b.x,y:b.y,button:'left',clickCount:1});
await cdp.eval('new Promise(r=>setTimeout(r,900))');
console.log('ikon item0 terbuka  :', await icon(0), '(rotate 45deg ~ matrix(0.707,0.707,-0.707,0.707,0,0))');
cdp.close(); proc.kill();
