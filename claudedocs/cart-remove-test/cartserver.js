/* Server keranjang tiruan dengan semantik Shopify yang TERDOKUMENTASI:
   - /cart/change.js  : id = line key ATAU variant_id; kunci tak dikenal →
                        404 { status, message, description }  (diverifikasi
                        live sebelumnya, dicatat di MiniCart.liquid baris 185)
   - /cart/update.js  : updates = { key|variant_id : qty }.
                        "adds new line items if the variant_id provided doesn't
                        match any line item already in the cart" (docs).
                        Untuk LINE KEY tak dikenal perilakunya tidak
                        didokumentasikan → dapat dikonfigurasi.
   - /cart/add.js     : merge per (variant, properties) */
function hash(props) {
  const s = JSON.stringify(props || {});
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ('00000000' + h.toString(16)).slice(-8).repeat(4);
}
function makeServer(opts) {
  opts = opts || {};
  const st = {
    items: [],
    unknownLineKey: opts.unknownLineKey || 'ignore', // 'ignore' | 'add' | 'error'
    rotateKeys: !!opts.rotateKeys,   // simulasikan kunci baris berputar tiap mutasi
    salt: 0,
    log: [],
    throttle: opts.throttle || null, // fungsi(path, n) → true kalau harus 429
    n: 0,
  };
  const keyOf = it => it.variant_id + ':' + hash(Object.assign({ _s: st.rotateKeys ? st.salt : 0 }, it.properties));
  const rekey = () => { if (st.rotateKeys) st.salt++; st.items.forEach(it => { it.key = keyOf(it); }); };
  const cart = () => ({
    token: 'tok', note: '', attributes: {},
    total_price: st.items.reduce((t, i) => t + i.price * i.quantity, 0),
    items_subtotal_price: st.items.reduce((t, i) => t + i.price * i.quantity, 0),
    item_count: st.items.reduce((t, i) => t + i.quantity, 0),
    items: st.items.map(i => ({
      key: i.key, variant_id: i.variant_id, quantity: i.quantity,
      properties: i.properties || {}, product_title: i.title, title: i.title,
      price: i.price, line_price: i.price * i.quantity, final_line_price: i.price * i.quantity,
    })),
  });
  const ok = body => Promise.resolve({
    ok: true, status: 200, headers: { get: () => null },
    json: () => Promise.resolve(JSON.parse(JSON.stringify(body))),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone() { return this; },
  });
  const err = (status, body) => Promise.resolve({
    ok: false, status, headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    clone() { return this; },
  });
  st.seed = list => {
    st.items = list.map(i => Object.assign({ price: 100000, properties: {}, title: 'Item ' + i.variant_id }, i));
    st.items.forEach(i => { i.key = keyOf(i); });
    return cart();
  };
  st.cart = cart;
  st.fetch = function (url, init) {
    const href = typeof url === 'string' ? url : (url && url.url) || '';
    const path = href.split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/^\/id/, '');
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    st.n++;
    st.log.push({ path, body });
    if (st.throttle && st.throttle(path, st.n)) return err(429, '<!DOCTYPE html><html>429</html>');
    if (st.latency) {
      const ms = st.latency(path) || 0;
      if (ms > 0) {
        const run = () => handle();
        return new Promise(res => setTimeout(() => res(run()), ms));
      }
    }
    return handle();
    function handle() {

    if (/\/cart\.js$/.test(path)) return ok(cart());
    if (/\/cart$/.test(path) && /view=mini/.test(href)) return ok({ __mini: cart() });

    if (/\/cart\/add\.js$/.test(path)) {
      const incoming = body && body.items ? body.items : [body];
      incoming.forEach(it => {
        const props = it.properties || {};
        const found = st.items.find(x => x.variant_id === Number(it.id) && JSON.stringify(x.properties || {}) === JSON.stringify(props));
        if (found) found.quantity += Number(it.quantity || 1);
        else st.items.push({ variant_id: Number(it.id), quantity: Number(it.quantity || 1), properties: props, price: 100000, title: 'Item ' + it.id, key: '' });
      });
      rekey(); st.items.forEach(i => { if (!i.key) i.key = keyOf(i); });
      return ok({ items: incoming });
    }

    if (/\/cart\/change\.js$/.test(path)) {
      let idx = st.items.findIndex(x => x.key === body.id);
      if (idx < 0 && body.id != null && /^\d+$/.test(String(body.id))) idx = st.items.findIndex(x => x.variant_id === Number(body.id));
      if (idx < 0 && body.line != null) idx = Number(body.line) - 1;
      if (idx < 0 || !st.items[idx]) {
        return err(404, { status: 404, message: 'Cart Error', description: 'Cannot find variant' });
      }
      st.items[idx].quantity = Number(body.quantity);
      st.items = st.items.filter(i => i.quantity > 0);
      rekey();
      return ok(cart());
    }

    if (/\/cart\/update\.js$/.test(path)) {
      if (body && body.updates) {
        for (const k of Object.keys(body.updates)) {
          const q = Number(body.updates[k]);
          const byKey = st.items.findIndex(x => x.key === k);
          if (byKey >= 0) { st.items[byKey].quantity = q; continue; }
          if (/^\d+$/.test(k)) {
            const byVar = st.items.findIndex(x => x.variant_id === Number(k));
            if (byVar >= 0) { st.items[byVar].quantity = q; continue; }
            if (q > 0) st.items.push({ variant_id: Number(k), quantity: q, properties: {}, price: 100000, title: 'Item ' + k, key: '' });
            continue;
          }
          /* line key tak dikenal */
          if (st.unknownLineKey === 'error') return err(422, { status: 422, message: 'Cart Error', description: 'Invalid line key' });
          if (st.unknownLineKey === 'add' && q > 0) st.items.push({ variant_id: Number(String(k).split(':')[0]), quantity: q, properties: {}, price: 100000, title: 'Item', key: '' });
          /* 'ignore' → diam saja */
        }
        st.items = st.items.filter(i => i.quantity > 0);
        rekey(); st.items.forEach(i => { if (!i.key) i.key = keyOf(i); });
      }
      return ok(cart());
    }
    if (/\/cart\/clear\.js$/.test(path)) { st.items = []; return ok(cart()); }
    return ok({});
    }
  };
  return st;
}
module.exports = { makeServer };
