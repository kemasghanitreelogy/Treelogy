import { launch, attach } from '../search-premium-test/cdp.mjs';
const proc = await launch(9396, '/tmp/cdp-which'); const cdp = await attach(9396);
await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
for (const u of ['https://treelogy.com/id', 'https://treelogy.com/id/pages/moringa-tree']) {
  await cdp.goto(u + '?cb=' + process.hrtime.bigint());
  await cdp.eval('new Promise(r=>setTimeout(r,2000))');
  console.log(u, '->', await cdp.eval('return JSON.stringify({id: Shopify.theme.id, name: Shopify.theme.name, role: Shopify.theme.role})'));
}
console.log('bar dev terlihat?', await cdp.eval(`return (() => { const t = document.body.innerText; return /Development \\(/.test(t) ? 'YA' : 'tidak'; })()`));
cdp.close(); proc.kill();
