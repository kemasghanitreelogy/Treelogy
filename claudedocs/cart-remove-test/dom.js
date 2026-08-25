/* DOM tiruan seperlunya — pohon SUNGGUHAN (parent/children), cukup untuk
   jalur hapus di MiniCart.liquid dan pembungkus fetch gift-auto-add.js. */
function makeEl(tag, attrs) {
  attrs = attrs || {};
  const cls = new Set(String(attrs.class || '').split(' ').filter(Boolean));
  const el = {
    tagName: String(tag).toUpperCase(), children: [], parentNode: null,
    _attr: Object.assign({}, attrs), style: {}, dataset: {}, textContent: '',
    _cls: cls, _listeners: {}, value: '',
  };
  delete el._attr.class;
  el.classList = {
    add: (...c) => c.forEach(x => cls.add(x)),
    remove: (...c) => c.forEach(x => cls.delete(x)),
    contains: c => cls.has(c),
    toggle: (c, on) => (on === undefined ? (cls.has(c) ? cls.delete(c) : cls.add(c)) : (on ? cls.add(c) : cls.delete(c))),
  };
  /* `el.className = '...'` harus mendarat di set kelas yang sama dengan yang
     dibaca pencocok selector. Tanpa ini, simpul yang dibuat lewat
     createElement + className (mis. overlay loading keranjang) tidak pernah
     cocok dengan `.kelasnya` dan uji jadi buta terhadapnya. */
  Object.defineProperty(el, 'className', {
    get: () => [...cls].join(' '),
    set: v => { cls.clear(); String(v).split(' ').filter(Boolean).forEach(x => cls.add(x)); },
  });
  el.getAttribute = k => (k === 'class' ? [...cls].join(' ') : (k in el._attr ? el._attr[k] : null));
  el.setAttribute = (k, v) => {
    if (k === 'class') { cls.clear(); String(v).split(' ').filter(Boolean).forEach(x => cls.add(x)); }
    else el._attr[k] = String(v);
  };
  el.hasAttribute = k => (k === 'class' ? cls.size > 0 : k in el._attr);
  el.removeAttribute = k => { delete el._attr[k]; };
  Object.defineProperty(el, 'attributes', {
    get: () => [{ name: 'class', value: [...cls].join(' ') }].concat(
      Object.keys(el._attr).map(k => ({ name: k, value: el._attr[k] }))),
  });
  el.appendChild = c => { if (c.parentNode) c.remove(); c.parentNode = el; el.children.push(c); return c; };
  el.insertBefore = (c, ref) => {
    if (c.parentNode) c.remove();
    c.parentNode = el; const i = el.children.indexOf(ref);
    el.children.splice(i < 0 ? el.children.length : i, 0, c); return c;
  };
  el.removeChild = c => { el.children = el.children.filter(x => x !== c); c.parentNode = null; return c; };
  el.remove = () => { if (el.parentNode) { el.parentNode.children = el.parentNode.children.filter(x => x !== el); el.parentNode = null; } };
  el.cloneNode = () => {
    const copy = makeEl(tag, Object.assign({}, el._attr, { class: [...cls].join(' ') }));
    copy._html = el._html;
    el.children.forEach(ch => copy.appendChild(ch.cloneNode(true)));
    return copy;
  };
  /* innerHTML: kami tidak mem-parse HTML. Yang penting untuk uji ini adalah
     EFEKNYA — menyetel innerHTML membuang seluruh anak. Nilainya disimpan
     supaya perbandingan `a.innerHTML !== b.innerHTML` tetap bermakna. */
  Object.defineProperty(el, 'innerHTML', {
    get: () => (el._html !== undefined ? el._html : el.children.map(c => c._outer || '').join('')),
    set: v => { el.children.forEach(c => { c.parentNode = null; }); el.children = []; el._html = String(v); },
  });
  el.addEventListener = (t, f) => { (el._listeners[t] = el._listeners[t] || []).push(f); };
  el.removeEventListener = (t, f) => { el._listeners[t] = (el._listeners[t] || []).filter(x => x !== f); };
  el.dispatch = (t, ev) => (el._listeners[t] || []).slice().forEach(f => f(Object.assign({ target: el, preventDefault() {}, stopPropagation() {} }, ev)));
  el.click = () => el.dispatch('click', {});
  el.getBoundingClientRect = () => ({ height: 40, width: 300, top: 0, left: 0, right: 300, bottom: 40 });
  el.animate = () => ({ finished: Promise.resolve(), cancel() {} });
  el.getAnimations = () => [];
  el.focus = () => {}; el.select = () => {}; el.scrollIntoView = () => {}; el.scrollTo = () => {};
  el.closest = sel => { let n = el; while (n) { if (match(n, sel)) return n; n = n.parentNode; } return null; };
  el.querySelector = sel => walk(el).find(n => match(n, sel)) || null;
  el.querySelectorAll = sel => walk(el).filter(n => match(n, sel));
  el.contains = n => { while (n) { if (n === el) return true; n = n.parentNode; } return false; };
  Object.defineProperty(el, 'firstElementChild', { get: () => el.children[0] || null });
  Object.defineProperty(el, 'offsetWidth', { get: () => 300 });
  return el;
}
const walk = root => { const o = []; (function r(n) { (n.children || []).forEach(c => { o.push(c); r(c); }); })(root); return o; };
/* Pencocok selector: menangani bentuk yang benar-benar dipakai kode tema —
   '.a', 'tag', '#id', '[attr]', '[attr="v"]', gabungan '.a.b', keturunan
   'a b', dan daftar 'a, b'. */
function match(n, sel) {
  if (!n || !n._cls) return false;
  return String(sel).split(',').map(s => s.trim()).filter(Boolean).some(one => {
    const parts = one.split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (!simple(n, last)) return false;
    let node = n.parentNode, i = parts.length - 2;
    while (i >= 0) {
      let found = false;
      while (node) { if (simple(node, parts[i])) { found = true; node = node.parentNode; break; } node = node.parentNode; }
      if (!found) return false;
      i--;
    }
    return true;
  });
}
function simple(n, s) {
  const tokens = String(s).match(/^[a-zA-Z*][\w-]*|\.[\w-]+|#[\w-]+|\[[^\]]+\]/g);
  if (!tokens) return false;
  for (const t of tokens) {
    if (t[0] === '.') { if (!n._cls.has(t.slice(1))) return false; }
    else if (t[0] === '#') { if (n.getAttribute('id') !== t.slice(1)) return false; }
    else if (t[0] === '[') {
      const m = t.slice(1, -1).match(/^([\w-]+)(?:\s*=\s*"?([^"\]]*)"?)?$/);
      if (!m) return false;
      if (!n.hasAttribute(m[1])) return false;
      if (m[2] !== undefined && n.getAttribute(m[1]) !== m[2]) return false;
    } else if (t !== '*') { if (n.tagName !== t.toUpperCase()) return false; }
  }
  return true;
}
module.exports = { makeEl, walk, match };
