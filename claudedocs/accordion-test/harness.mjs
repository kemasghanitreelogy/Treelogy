/* Harness accordion — memastikan klik BENAR-BENAR mendarat di header sebelum
   menyimpulkan apa pun. Kesalahan pertama waktu mendiagnosa bug ini adalah
   mengklik koordinat di luar viewport lalu menyimpulkan "listener tidak jalan".
   Di sini setiap klik diverifikasi lewat elementFromPoint dulu. */
import { launch, attach } from '../search-premium-test/cdp.mjs';

const URL = process.argv[2] || 'https://treelogy.com/id/pages/moringa-tree';
const SEL = '.accordion.__accordion-wrapper';

export async function open(url = URL, port = 9350) {
  const proc = await launch(port, '/tmp/cdp-acc-' + port);
  const cdp = await attach(port);
  await cdp.goto(url);
  await cdp.eval('new Promise(r => setTimeout(r, 2500))');
  return { cdp, proc };
}

/* Klik item ke-n dengan verifikasi: gulirkan, tunggu guliran BERHENTI, ukur ulang,
   pastikan titiknya di dalam viewport dan elementFromPoint jatuh di dalam header. */
export async function clickItem(cdp, n = 0) {
  await cdp.eval(`return (() => {
    document.querySelectorAll('${SEL}')[${n}].scrollIntoView({ block: 'center', behavior: 'instant' });
    return true;
  })()`);
  /* Tunggu sampai scrollY stabil dua frame berturut-turut - halaman ini punya
     smooth-scroll dan pengukuran di tengah animasi menghasilkan koordinat palsu. */
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
    return {
      x, y, inView,
      hitsHeader: !!(hit && h.contains(hit)),
      hitTag: hit ? hit.tagName.toLowerCase() + (typeof hit.className === 'string' && hit.className ? '.' + hit.className.trim().split(/\\s+/).join('.') : '') : '(null)',
    };
  })()`);
  if (!probe.inView || !probe.hitsHeader) {
    throw new Error('klik tidak sah - inView=' + probe.inView + ' yangKena=' + probe.hitTag);
  }
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: probe.x, y: probe.y, button: 'left', clickCount: 1 });
  }
  await cdp.eval('new Promise(r => setTimeout(r, 800))');
  return probe;
}

export const stateOf = (cdp, n = 0) => cdp.eval(`return (() => {
  const it = document.querySelectorAll('${SEL}')[${n}];
  const c = it.querySelector('.accordion-description');
  return {
    active: it.classList.contains('active'),
    tinggiIsi: Math.round(c.getBoundingClientRect().height),
    wrapperMaxH: it.style.maxHeight || '',
    contentMaxH: c.style.maxHeight || '',
  };
})()`);

export const listenersOn = async (cdp, n = 0) => {
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: `document.querySelectorAll('${SEL}')[${n}].querySelector('.accordion-header')`,
  });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  return listeners.filter((l) => l.type === 'click').map((l) => `script${l.scriptId}:${l.lineNumber}`);
};

export { SEL, URL };
