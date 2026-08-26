import { launch, attach } from '../search-premium-test/cdp.mjs';
const URL = 'https://treelogy.com/id/pages/moringa-tree';
const proc = await launch(9370, '/tmp/cdp-kl'); const cdp = await attach(9370);
await cdp.goto(URL);
for (const t of [1000, 3000, 6000, 10000, 15000]) {
  await cdp.eval('new Promise(r=>setTimeout(r,' + (t === 1000 ? 1000 : 3000) + '))');
  const r = await cdp.eval(`return (() => {
    const it = document.querySelector('.accordion.__accordion-wrapper');
    it.scrollIntoView({block:'center', behavior:'instant'});
    const h = it.querySelector('.accordion-header');
    const b = h.getBoundingClientRect();
    const x = Math.round(b.left+b.width/2), y = Math.round(b.top+b.height/2);
    const el = (y>0 && y<innerHeight) ? document.elementFromPoint(x,y) : null;
    const nama = el ? el.tagName.toLowerCase() + (typeof el.className==='string' && el.className ? '.'+el.className.trim().split(' ')[0] : '') : '(null)';
    const pop = document.querySelector('[data-testid="POPUP"]');
    const pb = pop ? pop.getBoundingClientRect() : null;
    return { yangKena: nama, terhalang: !(el && h.contains(el)), popup: pop ? Math.round(pb.width)+'x'+Math.round(pb.height)+' op='+getComputedStyle(pop).opacity : 'tidak ada' };
  })()`);
  console.log(`t~${t}ms  yangKena=${r.yangKena}  terhalang=${r.terhalang}  popup=${r.popup}`);
}
cdp.close(); proc.kill();
