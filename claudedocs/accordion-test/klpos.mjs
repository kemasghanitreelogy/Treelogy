import { launch, attach } from '../search-premium-test/cdp.mjs';
const proc = await launch(9371, '/tmp/cdp-kl2'); const cdp = await attach(9371);
await cdp.goto('https://treelogy.com/id/pages/moringa-tree');
await cdp.eval('new Promise(r=>setTimeout(r,6000))');
console.log(await cdp.eval(`return (() => {
  const pop = document.querySelector('[data-testid="POPUP"]');
  const b = pop.getBoundingClientRect();
  const cs = getComputedStyle(pop);
  const closeBtn = pop.querySelector('[aria-label*="lose"],[data-testid*="close"],button');
  return JSON.stringify({
    viewport: innerWidth + 'x' + innerHeight,
    popupBox: [b.x,b.y,b.width,b.height].map(Math.round).join(','),
    position: cs.position, zIndex: cs.zIndex,
    menutupiPersenTinggi: Math.round(b.height / innerHeight * 100) + '%',
    adaTombolTutup: !!closeBtn,
    labelTutup: closeBtn ? (closeBtn.getAttribute('aria-label') || closeBtn.textContent.trim().slice(0,30)) : '-',
  }, null, 2);
})()`));
cdp.close(); proc.kill();
