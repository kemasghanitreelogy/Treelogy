/* Suite skenario hapus di cart drawer.
   INVARIAN: setelah semua reda, baris di DOM == baris di keranjang server.
   Pelanggaran invarian = persis gejala yang dilaporkan pembeli. */
const H = require('./harness.js');
const MINI = process.env.MINI || './live_snippets_MiniCart.liquid';
const GIFT = process.env.GIFT || '/Users/kemasghani/Documents/Treelogy/assets/gift-auto-add.js';
const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0; const failed = [];
function ok(cond, msg) { console.log('   ' + (cond ? 'OK   ' : 'GAGAL') + ' ' + msg); cond ? pass++ : (fail++, failed.push(msg)); }

function domRows(page) {
  return page.items.children.filter(n => n._cls.has('cart-item'))
    .map(n => ({ v: Number(n.getAttribute('data-variant')), gift: n._cls.has('cart-item--gift') }));
}
function serverRows(server) {
  return server.cart().items.map(i => ({ v: i.variant_id, gift: !!(i.properties && i.properties._Gifted) }));
}
function sameSet(a, b) {
  const k = x => x.map(i => i.v + (i.gift ? 'g' : '')).sort().join(',');
  return k(a) === k(b);
}
function invariant(page, server, label) {
  const d = domRows(page), s = serverRows(server);
  const good = sameSet(d, s);
  ok(good, label + ' — DOM ' + JSON.stringify(d.map(x => x.v)) + ' vs server ' + JSON.stringify(s.map(x => x.v)));
  return good;
}
/* Re-render drawer seperti jalur add di live: oldItems.innerHTML = newItems.innerHTML
   (simpul lama DICABUT, simpul baru dibuat dari HTML server). */
function rerender(page, server) {
  const fresh = server.cart().items.map(i => H.makeRow({
    variant_id: i.variant_id, key: i.key, quantity: i.quantity,
    gift: !!(i.properties && i.properties._Gifted), title: i.product_title,
  }));
  page.items.children.forEach(c => { c.parentNode = null; });
  page.items.children = [];
  fresh.forEach(r => page.items.appendChild(r));
}
function setup(lines, opts) {
  opts = opts || {};
  const server = H.makeServer(opts.server || {});
  const cart0 = server.seed(lines);
  const page = H.buildPage(cart0.items.map(i => ({
    variant_id: i.variant_id, key: opts.domKey ? opts.domKey(i) : i.key,
    quantity: i.quantity, title: i.product_title,
    gift: !!(i.properties && i.properties._Gifted),
  })));
  const ctx = H.boot({
    server, page, miniCartSrc: MINI, giftSrc: opts.noGift ? null : GIFT,
    seed: cart0.items, giftMap: opts.giftMap || {}, giftTemplates: opts.giftTemplates || [],
  });
  return { server, page, ctx };
}
async function removeRow(page, ctx, idx, between) {
  const row = page.items.children[idx];
  const btn = row.querySelector('.button-remove-force');
  ctx.cartRemoveItem(btn);
  await wait(5);
  if (between) await between();
  page.confirmBtn.dispatch('click', {});
  await wait(0);
}
const P = { CAPS: 111, POWDER: 222, OIL: 333, SCOOP: 999 };

(async () => {
console.log('SKENARIO 1 — hapus biasa, tanpa gangguan (kontrol)');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 2 }]);
  await removeRow(page, ctx, 0); await wait(400);
  invariant(page, server, 'hapus bersih');
  ok(serverRows(server).length === 1, 'server tersisa 1 baris');
}

console.log('\nSKENARIO 2 — drawer RE-RENDER di antara klik tong sampah dan konfirmasi');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 2 }]);
  await removeRow(page, ctx, 0, async () => { rerender(page, server); });
  await wait(500);
  ok(serverRows(server).length === 1, 'server: baris benar-benar terhapus');
  invariant(page, server, 'RE-RENDER di tengah modal');
}

console.log('\nSKENARIO 3 — 429 di semua percobaan (rate limit)');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 2 }],
    { server: { throttle: p => /change|update/.test(p) } });
  await removeRow(page, ctx, 0); await wait(4200);
  ok(serverRows(server).length === 2, 'server: tidak ada yang terhapus (benar)');
  invariant(page, server, '429 total');
}

console.log('\nSKENARIO 4 — 429 sekali lalu pulih');
{
  let n = 0;
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 2 }],
    { server: { throttle: p => (/change|update/.test(p) ? ++n === 1 : false) } });
  await removeRow(page, ctx, 0); await wait(2500);
  ok(serverRows(server).length === 1, 'server: terhapus setelah percobaan ulang');
  invariant(page, server, '429 lalu pulih');
}

console.log('\nSKENARIO 5 — data-key di DOM BASI (kunci baris sudah berputar di server)');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 2 }],
    { domKey: i => i.key + '-BASI' });
  await removeRow(page, ctx, 0); await wait(4200);
  ok(serverRows(server).length === 2, 'server: tidak terhapus (kunci tak dikenal)');
  invariant(page, server, 'kunci basi');
}

console.log('\nSKENARIO 6 — hapus produk PEMICU hadiah (ditulis ulang jadi update.js)');
{
  const { server, page, ctx } = setup(
    [{ variant_id: P.POWDER, quantity: 1 }, { variant_id: P.SCOOP, quantity: 1, properties: { _Gifted: 'true' } }],
    { giftMap: { [P.POWDER]: [P.SCOOP] }, giftTemplates: [P.SCOOP] });
  await wait(150);
  await removeRow(page, ctx, 0); await wait(600);
  ok(serverRows(server).length === 0, 'server: pemicu DAN hadiah ikut terhapus');
  invariant(page, server, 'hapus pemicu + hadiah');
  console.log('     jalur:', server.log.map(l => l.path).join(' | '));
}

console.log('\nSKENARIO 7 — hapus pemicu saat potret mesin hadiah BASI (kunci hadiah lama)');
{
  const { server, page, ctx } = setup(
    [{ variant_id: P.POWDER, quantity: 1 }, { variant_id: P.SCOOP, quantity: 1, properties: { _Gifted: 'true' } }],
    { giftMap: { [P.POWDER]: [P.SCOOP] }, giftTemplates: [P.SCOOP] });
  await wait(150);
  /* server memutar kunci di belakang layar (mis. mutasi dari tab lain) */
  server.rotateKeys = true; server.salt++; server.items.forEach(i => { i.key = i.variant_id + ':' + 'x'.repeat(32) + server.salt; });
  await removeRow(page, ctx, 0); await wait(4200);
  invariant(page, server, 'potret basi + kunci berputar');
  console.log('     jalur:', server.log.map(l => l.path).join(' | '));
}

console.log('\nSKENARIO 8 — dua baris varian SAMA (properties beda): hapus yang benar');
{
  const { server, page, ctx } = setup([
    { variant_id: P.CAPS, quantity: 1, properties: {} },
    { variant_id: P.CAPS, quantity: 1, properties: { note: 'hadiah ultah' } },
    { variant_id: P.POWDER, quantity: 1 },
  ]);
  const before = serverRows(server).length;
  await removeRow(page, ctx, 1); await wait(500);
  ok(serverRows(server).length === before - 1, 'server: tepat satu baris hilang');
  invariant(page, server, 'varian kembar');
}

console.log('\nSKENARIO 9 — hapus baris TERAKHIR (keranjang jadi kosong)');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }]);
  await removeRow(page, ctx, 0); await wait(900);
  ok(serverRows(server).length === 0, 'server kosong');
  invariant(page, server, 'baris terakhir');
}

console.log('\nSKENARIO 10 — konfirmasi diklik DUA KALI (pembeli tidak sabar)');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 2 }]);
  const row = page.items.children[0];
  ctx.cartRemoveItem(row.querySelector('.button-remove-force'));
  await wait(5);
  page.confirmBtn.dispatch('click', {});
  page.confirmBtn.dispatch('click', {});
  await wait(600);
  ok(serverRows(server).length === 1, 'server: hanya satu baris hilang');
  invariant(page, server, 'klik ganda');
}

console.log('\nSKENARIO 11 — hapus item B tepat saat re-render dari add item C mendarat');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 1 }]);
  await removeRow(page, ctx, 1, async () => {
    await server.fetch('/cart/add.js', { body: JSON.stringify({ items: [{ id: P.OIL, quantity: 1 }] }) });
    rerender(page, server);
  });
  await wait(600);
  ok(serverRows(server).length === 2, 'server: 2 baris (CAPS + OIL)');
  invariant(page, server, 'hapus bertabrakan dengan add');
}

console.log('\nSKENARIO 12 — re-render mendarat SETELAH konfirmasi, saat permintaan di jalan');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 2 }]);
  const row = page.items.children[0];
  ctx.cartRemoveItem(row.querySelector('.button-remove-force'));
  await wait(5);
  page.confirmBtn.dispatch('click', {});
  await wait(1);                 /* permintaan sudah berangkat */
  rerender(page, server);        /* simpul lama tercabut sebelum responsnya tiba */
  await wait(600);
  ok(serverRows(server).length === 1, 'server: terhapus');
  invariant(page, server, 're-render saat permintaan di jalan');
}

console.log('\nSKENARIO 13 — REGRESI: baris HADIAH tidak boleh ikut dibuang');
{
  const { server, page, ctx } = setup([{ variant_id: P.POWDER, quantity: 1 }],
    { giftMap: { [P.POWDER]: [P.SCOOP] }, giftTemplates: [P.SCOOP] });
  /* mesin hadiah menggambar baris hadiah lebih dulu (server belum punya) */
  page.items.appendChild(H.makeRow({ variant_id: P.SCOOP, key: '', quantity: 1, gift: true, title: 'Gift' }));
  const before = page.items.children.length;
  ctx.refreshCartUI(server.cart());
  await wait(50);
  ok(page.items.children.length === before, 'baris hadiah optimistis BERTAHAN (' + before + ' → ' + page.items.children.length + ')');
}

console.log('\nSKENARIO 14 — REGRESI: baris OPTIMISTIS (ATC) tidak boleh ikut dibuang');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }]);
  const opt = H.makeRow({ variant_id: P.OIL, key: '', quantity: 1, title: 'Baru' });
  opt.classList.add('cart-item--optimistic');
  page.items.insertBefore(opt, page.items.children[0]);
  const before = page.items.children.length;
  ctx.refreshCartUI(server.cart());
  await wait(50);
  ok(page.items.children.length === before, 'baris optimistis BERTAHAN (' + before + ' → ' + page.items.children.length + ')');
}

console.log('\nSKENARIO 15 — kunci basi SEMBUH sendiri, hapus berikutnya berhasil');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 2 }],
    { domKey: i => i.key + '-BASI' });
  ctx.refreshCartUI(server.cart());          /* satu refresh biasa */
  await wait(50);
  const healed = page.items.children[0].getAttribute('data-key');
  ok(healed === server.cart().items[0].key, 'data-key baris tersegarkan dari payload server');
  await removeRow(page, ctx, 0); await wait(600);
  ok(serverRows(server).length === 1, 'hapus SESUDAH sembuh: berhasil di server');
  invariant(page, server, 'kunci sembuh lalu hapus');
}

console.log('\nSKENARIO 16 — RISIKO BARU: respons hapus LAMBAT, ada add yang menyusul');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 1 }]);
  server.latency = pth => (/change/.test(pth) ? 300 : 0);   /* respons hapus lambat */
  const row = page.items.children[0];
  ctx.cartRemoveItem(row.querySelector('.button-remove-force'));
  await wait(5);
  page.confirmBtn.dispatch('click', {});
  await wait(30);
  /* pembeli menambah barang lain; jalur add menaikkan nomor urut saat
     BERANGKAT lalu menggambar ulang daftar saat mendarat */
  ctx.cartMutSeq++;
  await server.fetch('/cart/add.js', { body: JSON.stringify({ items: [{ id: P.OIL, quantity: 1 }] }) });
  rerender(page, server);
  await wait(700);                                          /* respons hapus akhirnya mendarat */
  const dom = domRows(page).map(x => x.v).sort();
  ok(dom.indexOf(P.OIL) >= 0, 'barang yang baru ditambahkan BERTAHAN — DOM ' + JSON.stringify(dom));
  ok(serverRows(server).map(x => x.v).indexOf(P.CAPS) < 0, 'server: yang dihapus memang terhapus');
}

console.log('\nSKENARIO 17 — tanpa mutasi penyusul, pembuangan tetap jalan (penjaga tidak kebablasan)');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 1 }]);
  server.latency = pth => (/change/.test(pth) ? 200 : 0);
  await removeRow(page, ctx, 0);
  await wait(700);
  invariant(page, server, 'respons lambat tanpa penyusul');
}

console.log('\nSKENARIO 18 — hapus, lalu drawer digambar ulang: tidak ada baris hantu yang kembali');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 1 }]);
  await removeRow(page, ctx, 0); await wait(500);
  rerender(page, server);
  ctx.refreshCartUI(server.cart());
  await wait(50);
  invariant(page, server, 'sesudah re-render lanjutan');
}

console.log('\nSKENARIO 19 — piggyback DIABAIKAN server: gagalnya harus JUJUR, bukan diam');
{
  const { server, page, ctx } = setup(
    [{ variant_id: P.POWDER, quantity: 1 }, { variant_id: P.SCOOP, quantity: 1, properties: { _Gifted: 'true' } }],
    { giftMap: { [P.POWDER]: [P.SCOOP] }, giftTemplates: [P.SCOOP] });
  await wait(150);
  server.rotateKeys = true; server.salt++;
  server.items.forEach(i => { i.key = i.variant_id + ':' + 'x'.repeat(32) + server.salt; });
  server.log.length = 0;
  await removeRow(page, ctx, 0); await wait(4500);
  const paths = server.log.map(l => l.path);
  ok(paths.indexOf('/cart/update.js') >= 0, 'piggyback tetap dicoba lebih dulu');
  ok(paths.filter(p => p === '/cart/change.js').length >= 1,
     'permintaan ASLI diulang setelah ketahuan diabaikan — jalur: ' + paths.join(' | '));
  invariant(page, server, 'piggyback diabaikan');
}

console.log('\nSKENARIO 20 — piggyback NORMAL: tidak ada permintaan tambahan (tanpa regresi biaya)');
{
  const { server, page, ctx } = setup(
    [{ variant_id: P.POWDER, quantity: 1 }, { variant_id: P.SCOOP, quantity: 1, properties: { _Gifted: 'true' } }],
    { giftMap: { [P.POWDER]: [P.SCOOP] }, giftTemplates: [P.SCOOP] });
  await wait(150);
  server.log.length = 0;
  await removeRow(page, ctx, 0); await wait(700);
  const muts = server.log.map(l => l.path).filter(p => /change|update|add/.test(p));
  ok(muts.length === 1 && muts[0] === '/cart/update.js',
     'tepat SATU mutasi seperti sebelumnya — ' + JSON.stringify(muts));
  invariant(page, server, 'piggyback normal');
}

console.log('\nSKENARIO 21 — kunci basi: klik hapus KEDUA berhasil (sudah tersembuhkan)');
{
  const { server, page, ctx } = setup([{ variant_id: P.CAPS, quantity: 1 }, { variant_id: P.POWDER, quantity: 2 }],
    { domKey: i => i.key + '-BASI' });
  await removeRow(page, ctx, 0); await wait(4500);      /* klik pertama: 404, baris dipulihkan */
  ok(serverRows(server).length === 2, 'klik pertama memang gagal (jujur)');
  await removeRow(page, ctx, 0); await wait(700);       /* klik kedua */
  ok(serverRows(server).length === 1, 'klik KEDUA berhasil karena data-key sudah disegarkan');
  invariant(page, server, 'sembuh lalu berhasil');
}

console.log('\n================ RINGKASAN ================');
console.log('LULUS ' + pass + ' · GAGAL ' + fail);
if (failed.length) { console.log('\nYang gagal:'); failed.forEach(f => console.log('  - ' + f)); }
})();
