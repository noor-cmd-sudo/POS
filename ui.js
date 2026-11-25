'use strict';
/* ============ app state, dialogs, toasts ============ */
const S = { screen: '', view: 'pos', q: '', cat: 'All', sel: null, pin: '', stab: 'store', range: 'today', pay: null };
const ACT = {};
const VIEWS = {};
let dlgClose = null;

function modal(html, cls = '') { $('#modal').innerHTML = `<div class="ov"><div class="md ${cls}" role="dialog">${html}</div></div>` }
function closeModal() { $('#modal').innerHTML = '' }
function toast(msg, type = '') {
  const el = document.createElement('div'); el.className = 'tst ' + type; el.textContent = msg;
  $('#toast').appendChild(el); setTimeout(() => el.remove(), 2400);
}
function ask({ title, msg, ok = 'OK', danger, input, value, type }) {
  return new Promise(res => {
    $('#dialog').innerHTML = `<div class="ov dlg"><div class="md sm"><h3>${esc(title || '')}</h3>${msg ? `<p class="muted">${msg}</p>` : ''}${input !== undefined ? `<input id="dlgIn" class="input" type="text" ${type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(value ?? '')}" placeholder="${esc(input)}">` : ''}<div class="row end mt"><button class="btn cancel" id="dlgNo">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" id="dlgOk">${ok}</button></div></div></div>`;
    const done = v => { $('#dialog').innerHTML = ''; dlgClose = null; res(v) };
    $('#dlgNo').onclick = () => done(input !== undefined ? null : false);
    $('#dlgOk').onclick = () => done(input !== undefined ? $('#dlgIn').value : true);
    dlgClose = () => $('#dlgNo').click();
    const i = $('#dlgIn');
    if (i) { i.focus(); i.select(); i.onkeydown = e => { if (e.key === 'Enter') $('#dlgOk').click(); if (e.key === 'Escape') $('#dlgNo').click() } }
  });
}
const fd = root => { const o = {}; $$('[name]', root || $('#modal')).forEach(el => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value }); return o };

document.addEventListener('click', e => {
  const t = e.target;
  if (t.classList && t.classList.contains('ov')) { if (t.classList.contains('dlg')) dlgClose && dlgClose(); else closeModal(); return }
  const a = t.closest('[data-act]'); if (!a) return;
  const f = ACT[a.dataset.act]; if (f) { e.preventDefault(); f(a, e) }
});
ACT.mclose = () => closeModal();

/* ============ auth screens ============ */
const SAMPLE = [
  ['Cola 1.5L', 'Beverages', 85, 70, 24, 'bottle'], ['Bottled Water 500ml', 'Beverages', 15, 10, 48, 'bottle'],
  ['3-in-1 Coffee Sachet', 'Coffee & Tea', 8, 6, 120, 'sachet'], ['Instant Pancit Canton', 'Noodles & Pasta', 17, 14, 60, 'pack'],
  ['Sardines 155g', 'Canned Goods', 24, 20, 36, 'can'], ['Rice (Regular)', 'Rice & Grains', 52, 46, 80, 'kg'],
  ['Cooking Oil 1L', 'Condiments', 95, 84, 18, 'bottle'], ['Soy Sauce 385ml', 'Condiments', 28, 22, 20, 'bottle'],
  ['Egg (Medium)', 'Dairy & Eggs', 9, 7.5, 90, 'pc'], ['Fresh Milk 1L', 'Dairy & Eggs', 120, 102, 12, 'pack'],
  ['Pandesal (10pcs)', 'Bread & Bakery', 35, 26, 15, 'pack'], ['Laundry Bar Soap', 'Household', 22, 17, 40, 'pc']
];

function screenSetup() {
  S.screen = 'setup';
  $('#root').innerHTML = `<div class="auth"><div class="acard"><div class="logo big">🛒</div><h2>Welcome</h2><p class="muted">Set up your store and the owner account.</p>
  <label>Store name<input id="s_store" class="input" placeholder="e.g. Aling Rosa Grocery"></label>
  <label>Your name<input id="s_name" class="input" placeholder="Owner"></label>
  <label>Owner PIN (4–8 digits)<input id="s_pin" class="input" type="password" inputmode="numeric" maxlength="8"></label>
  <label>Confirm PIN<input id="s_pin2" class="input" type="password" inputmode="numeric" maxlength="8"></label>
  <label class="chk"><input type="checkbox" id="s_sample" checked> Add sample products so I can try it</label>
  <button class="btn primary block lg" data-act="setup-go">Create my store</button>
  <button class="btn ghost block" data-act="cloud-connect">Already set up on another device? Connect</button></div></div>`;
}
ACT['setup-go'] = async () => {
  const store = $('#s_store').value.trim(), name = $('#s_name').value.trim() || 'Owner', pin = $('#s_pin').value;
  if (!store) return toast('Enter your store name', 'err');
  if (!/^\d{4,8}$/.test(pin)) return toast('PIN must be 4–8 digits', 'err');
  if (pin !== $('#s_pin2').value) return toast('PINs do not match', 'err');
  saveSettings({ store });
  const u = await Auth.build({ name, username: name, role: 'admin', pin });
  const id = uid(); DB.put('user', id, u);
  if ($('#s_sample').checked) {
    SAMPLE.forEach(([n, c, p, k, s, unit]) => {
      const pid = uid(); DB.put('product', pid, { name: n, category: c, price: p, cost: k, unit, minStock: 5, barcode: '', expiry: '', active: true });
      DB.put('move', uid(), { pid, qty: s, reason: 'initial', by: id, t: Date.now() });
    });
  }
  await Auth.login(id, pin); applyTheme(); renderApp();
};

ACT['cloud-connect'] = () => {
  const c = Sync.cfg() || {};
  modal(`<div class="mh"><h3>Connect to cloud</h3><button class="x" data-act="mclose">✕</button></div>
  <p class="muted">Use the same details on every device so they share one stock and sales record.</p>
  <label>Supabase project URL<input name="url" class="input" placeholder="https://xxxx.supabase.co" value="${esc(c.url)}"></label>
  <label>Supabase anon (public) key<input name="key" class="input" value="${esc(c.key)}"></label>
  <label>Store code (any secret word, same on all devices)<input name="store" class="input" value="${esc(c.store)}"></label>
  <div class="row end mt"><button class="btn cancel" data-act="mclose">Cancel</button><button class="btn primary" data-act="cloud-save">Connect</button></div>`);
};
ACT['cloud-save'] = async (a) => {
  const c = fd(); c.url = c.url.trim(); c.key = c.key.trim(); c.store = c.store.trim();
  if (!c.url || !c.key || !c.store) return toast('Fill in all three fields', 'err');
  a.disabled = true; a.textContent = 'Connecting…';
  try { await Sync.test(c) } catch (e) { a.disabled = false; a.textContent = 'Connect'; return toast(String(e.message).slice(0, 120), 'err') }
  Sync.setCfg(c);
  for (let i = 0; i < 40 && Sync.busy; i++) await new Promise(r => setTimeout(r, 150));
  await Sync.run();
  closeModal(); toast('Connected', 'ok');
  if (S.screen === 'setup' || S.screen === 'login') route(); else if (S.view === 'set') VIEWS.set();
};

function screenLogin(sel) {
  S.screen = 'login'; S.pin = '';
  const us = DB.all('user').filter(u => u.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  if (sel === undefined && us.length === 1) sel = us[0].id;
  S.sel = sel || null;
  const s = settings(), u = sel && DB.get('user', sel);
  let body;
  if (!u) {
    body = `<p class="muted">Who's working?</p><div class="ugrid">${us.map(x => `<button class="ucard" data-act="pick" data-id="${x.id}"><span class="av">${esc(x.name[0].toUpperCase())}</span><b>${esc(x.name)}</b><small>${x.role}</small></button>`).join('')}</div>`;
  } else {
    body = `<div class="av" style="margin:6px auto;width:52px;height:52px;font-size:1.4em">${esc(u.name[0].toUpperCase())}</div><b>${esc(u.name)}</b>
    <div id="dots" class="dots"></div><div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button data-act="key" data-k="${k}">${k}</button>`).join('')}<button data-act="key" data-k="back">⌫</button><button data-act="key" data-k="0">0</button><button data-act="key" data-k="go">✓</button></div>
    ${us.length > 1 ? `<button class="btn ghost block" data-act="switch-user">Switch user</button>` : ''}`;
  }
  $('#root').innerHTML = `<div class="auth"><div class="acard"><div class="logo big">${esc((s.store || 'P')[0].toUpperCase())}</div><h2>${esc(s.store)}</h2>${body}<button class="btn ghost sm" style="margin-top:10px" data-act="cloud-connect">☁ Cloud settings</button></div></div>`;
  drawDots();
}
function drawDots() { const d = $('#dots'); if (d) d.innerHTML = Array.from({ length: Math.max(4, S.pin.length) }, (_, i) => `<i class="${i < S.pin.length ? 'f' : ''}"></i>`).join('') }
ACT.pick = a => screenLogin(a.dataset.id);
ACT['switch-user'] = () => screenLogin(null);
ACT.key = async a => pressKey(a.dataset.k);
async function pressKey(k) {
  if (!S.sel) return;
  if (k === 'back') S.pin = S.pin.slice(0, -1);
  else if (k === 'go') return tryLogin(true);
  else if (S.pin.length < 8) S.pin += k;
  drawDots();
  if (S.pin.length >= 4 && k !== 'back') tryLogin(false);
}
async function tryLogin(final) {
  const pin = S.pin;
  if (await Auth.login(S.sel, pin)) { S.view = 'pos'; S.q = ''; S.cat = 'All'; renderApp(); return }
  if (pin !== S.pin) return;
  if (final || pin.length >= 8) { const d = $('#dots'); d && d.classList.add('shake'); toast('Wrong PIN', 'err'); S.pin = ''; setTimeout(drawDots, 300) }
}
document.addEventListener('keydown', e => {
  if (S.screen === 'login' && S.sel && !$('#modal').innerHTML) {
    if (/^\d$/.test(e.key)) { e.preventDefault(); pressKey(e.key) } else if (e.key === 'Backspace') { e.preventDefault(); pressKey('back') } else if (e.key === 'Enter') { e.preventDefault(); pressKey('go') }
  }
});

function route() {
  applyTheme();
  if (!DB.all('user').length) return screenSetup();
  if (Auth.user || Auth.restore()) return renderApp();
  screenLogin();
}
ACT.lock = () => { Auth.logout(); closeModal(); screenLogin() };

/* ============ app shell ============ */
function renderApp() {
  S.screen = 'app';
  const s = settings(), u = Auth.user, adm = Auth.isAdmin();
  const nav = [['pos', '🛒', 'POS'], ['inv', '📦', 'Stock'], ['sales', '🧾', 'Sales']];
  if (adm) nav.push(['rep', '📊', 'Reports'], ['set', '⚙️', 'Settings']);
  if (!nav.find(n => n[0] === S.view)) S.view = 'pos';
  $('#root').innerHTML = `<div class="app"><nav class="rail"><div class="logo">${esc((s.store || 'P')[0].toUpperCase())}</div>${nav.map(n => `<button class="nv ${S.view === n[0] ? 'on' : ''}" data-act="nav" data-v="${n[0]}"><i>${n[1]}</i><b>${n[2]}</b></button>`).join('')}<span class="grow"></span><button class="nv" data-act="lock"><i>🔒</i><b>Lock</b></button></nav>
  <div class="main"><header class="top"><div class="ttl">${esc(s.store)}<small>${esc(u.name)} · ${u.role}</small></div><span class="grow"></span><span id="syncDot" class="sync" data-s="${Sync.status}"><i></i><em></em></span></header><main id="view"></main></div></div>`;
  Sync.setStatus(Sync.status);
  VIEWS[S.view]();
}
ACT.nav = a => { S.view = a.dataset.v; renderApp() };
ACT['go-inv'] = () => { S.view = 'inv'; renderApp() };

/* ============ cart ============ */
const Cart = {
  items: [], disc: { t: '%', v: 0 }, cust: '',
  load() { try { const o = JSON.parse(localStorage.getItem('pos.cart')); if (o) Object.assign(this, o) } catch { } },
  save() { localStorage.setItem('pos.cart', JSON.stringify({ items: this.items, disc: this.disc, cust: this.cust })) },
  add(p, q = 1) {
    const i = this.items.find(x => x.pid === p.id);
    if (i) i.qty = r2(i.qty + q); else this.items.push({ pid: p.id, name: p.name, price: p.price, cost: p.cost || 0, cat: p.category || '', qty: q });
    this.save();
  },
  clear() { this.items = []; this.disc = { t: '%', v: 0 }; this.cust = ''; this.save() },
  calc() {
    const s = settings();
    const sub = r2(this.items.reduce((a, i) => a + i.price * i.qty, 0));
    const d = this.disc.t === '%' ? r2(sub * Math.min(100, num(this.disc.v)) / 100) : Math.min(sub, r2(num(this.disc.v)));
    const total = r2(sub - d);
    const vat = s.vat === 'inclusive' ? r2(total - total / (1 + s.vatRate / 100)) : 0;
    return { sub, disc: d, total, vat, count: r2(this.items.reduce((a, i) => a + i.qty, 0)) };
  }
};
Cart.load();
const held = () => { try { return JSON.parse(localStorage.getItem('pos.held')) || [] } catch { return [] } };

/* ============ POS view ============ */
let _pop = { v: -1, m: {} };
function popular() {
  if (_pop.v !== DB.ver) {
    const m = {}, since = Date.now() - 30 * DAY;
    for (const s of DB.all('sale')) { if (s.status === 'void' || s.t < since) continue; for (const i of s.items) m[i.pid] = (m[i.pid] || 0) + i.qty }
    _pop = { v: DB.ver, m };
  }
  return _pop.m;
}
function findProducts(q, cat) {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean), pop = popular();
  let l = products();
  if (cat && cat !== 'All') l = l.filter(p => p.category === cat);
  if (toks.length) l = l.filter(p => { const h = (p.name + ' ' + (p.barcode || '') + ' ' + (p.category || '')).toLowerCase(); return toks.every(t => h.includes(t)) });
  return l.sort((a, b) => (pop[b.id] || 0) - (pop[a.id] || 0) || a.name.localeCompare(b.name));
}

VIEWS.pos = function () {
  $('#view').innerHTML = `<div class="pos" id="pos"><section class="catalog"><div class="bar"><input id="q" class="input" placeholder="Search product or scan barcode…  (F2)" autocomplete="off" value="${esc(S.q)}"><button class="btn info" data-act="held">Held</button></div><div id="cats" class="cats"></div><div id="grid" class="grid"></div></section><aside class="cart" id="cart"></aside></div><button class="cartbar" id="cartbar" data-act="cart-toggle"></button>`;
  const q = $('#q');
  q.oninput = e => { S.q = e.target.value; renderGrid() };
  q.onkeydown = e => {
    if (e.key !== 'Enter') return;
    const v = q.value.trim(); if (!v) return;
    const l = findProducts(v, 'All'), ex = l.find(p => p.barcode && p.barcode === v);
    const p = ex || l[0]; if (p) { addToCart(p.id); q.value = ''; S.q = ''; renderGrid() } else toast('No match', 'err');
  };
  if (matchMedia('(pointer:fine)').matches) q.focus();
  VIEWS.pos.update();
};
VIEWS.pos.update = function () { if (!$('#grid')) return; renderCats(); renderGrid(); renderCart() };

function renderCats() {
  const s = settings(), cnt = {}; products().forEach(p => cnt[p.category] = (cnt[p.category] || 0) + 1);
  const names = [...new Set([...s.cats.map(c => c.n), ...Object.keys(cnt)])].filter(n => cnt[n]);
  $('#cats').innerHTML = ['All', ...names].map(n => `<button class="chip ${S.cat === n ? 'on' : ''}" data-act="cat" data-c="${esc(n)}">${n === 'All' ? 'All' : (s.emoji ? catInfo(n).e + ' ' : '') + esc(n)}</button>`).join('');
}
ACT.cat = a => { S.cat = a.dataset.c; renderCats(); renderGrid() };

function renderGrid() {
  const s = settings(), st = stock(), l = findProducts(S.q, S.cat);
  $('#grid').innerHTML = l.slice(0, 240).map(p => {
    const c = catInfo(p.category), q = st[p.id] || 0, min = num(p.minStock) || s.lowStock;
    const cls = q <= 0 ? 'out' : q <= min ? 'low' : '';
    const ph = p.img ? `<span class="tph"><img src="${p.img}" alt="" loading="lazy"></span>` : `<span class="tph ph"><i>${s.emoji ? c.e : esc(p.name[0])}</i></span>`;
    return `<button class="tile" style="--c:${c.c}" data-act="add" data-id="${p.id}">${ph}<span class="tb"><span class="tn">${esc(p.name)}</span><span class="tf"><span class="tp">${money(p.price)}</span><span class="ts ${cls}">${qtyFmt(q)} ${esc(p.unit || 'pc')}${q <= 0 ? ' · out' : ''}</span></span></span></button>`;
  }).join('') + (l.length > 240 ? `<div class="empty">Showing 240 of ${l.length}. Type to narrow down.</div>` : '') ||
    `<div class="empty">No products found.${Auth.isAdmin() ? '<br><br><button class="btn primary" data-act="go-inv">Add products</button>' : ''}</div>`;
}

function addToCart(id, q = 1) {
  const p = DB.get('product', id); if (!p) return;
  const s = settings(), have = stock()[id] || 0, inCart = (Cart.items.find(i => i.pid === id) || { qty: 0 }).qty;
  if (!s.allowNegative && have < inCart + q) return toast('Not enough stock (' + qtyFmt(have) + ' left)', 'err');
  Cart.add(p, q); navigator.vibrate && navigator.vibrate(8);
  if (s.allowNegative && have - inCart - q < 0 && have >= 0) toast('Heads up: stock will go below zero', '');
  renderCart();
}
ACT.add = a => addToCart(a.dataset.id);

function renderCart() {
  const c = Cart.calc(), s = settings();
  $('#cart').innerHTML = `<div class="ch"><b>Current order</b><span class="muted">${qtyFmt(c.count)} item${c.count === 1 ? '' : 's'}</span><span class="grow"></span><button class="btn sm info" data-act="held">Held${held().length ? ' (' + held().length + ')' : ''}</button><button class="btn sm ghost mclose" data-act="cart-toggle">✕</button></div>
  <div class="cl">${Cart.items.map((i, n) => `<div class="ln">${thumb(i.pid)}<div class="li"><b>${esc(i.name)}</b><small>${money(i.price)} each</small></div><div class="qt"><button data-act="dec" data-n="${n}">−</button><button class="qv" data-act="setq" data-n="${n}">${qtyFmt(i.qty)}</button><button data-act="inc" data-n="${n}">+</button></div><div class="lt">${money(r2(i.price * i.qty))}</div></div>`).join('') || '<div class="empty">Tap a product to add it</div>'}</div>
  <div class="cf"><div class="tr"><span>Subtotal</span><span>${money(c.sub)}</span></div>
  ${c.disc > 0 ? `<div class="tr"><span>Discount <a href="#" data-act="disc" style="color:var(--accent)">edit</a></span><span>−${money(c.disc)}</span></div>` : (s.discounts && Cart.items.length ? `<div class="tr"><span>Discount</span><a href="#" data-act="disc" style="color:var(--accent)">+ Add</a></div>` : '')}
  ${c.vat > 0 ? `<div class="tr"><span>incl. VAT ${s.vatRate}%</span><span>${money(c.vat)}</span></div>` : ''}
  <div class="tr big"><span>Total</span><span>${money(c.total)}</span></div>
  <div class="cbtns"><button class="btn warn" data-act="hold" ${Cart.items.length ? '' : 'disabled'}>Hold</button><button class="btn danger" data-act="clear" ${Cart.items.length ? '' : 'disabled'}>Clear</button><button class="btn primary lg" data-act="charge" ${Cart.items.length ? '' : 'disabled'}>Charge ${money(c.total)}</button></div></div>`;
  if (!Cart.items.length && $('#pos')) $('#pos').classList.remove('cart-open'); // phone: drop the drawer once the order is empty
  const bar = $('#cartbar');
  if (bar) { bar.innerHTML = `<span>🛒 ${qtyFmt(c.count)} item${c.count === 1 ? '' : 's'}</span><span>${money(c.total)} ›</span>`; bar.classList.toggle('show', Cart.items.length > 0 && !$('#pos').classList.contains('cart-open')) }
}
ACT['cart-toggle'] = () => { $('#pos').classList.toggle('cart-open'); renderCart() };
ACT.inc = a => { const i = Cart.items[a.dataset.n]; if (i) { addToCart(i.pid) } };
ACT.dec = a => { const n = +a.dataset.n, i = Cart.items[n]; if (!i) return; i.qty = r2(i.qty - 1); if (i.qty <= 0) Cart.items.splice(n, 1); Cart.save(); renderCart() };
ACT.setq = async a => {
  const n = +a.dataset.n, i = Cart.items[n]; if (!i) return;
  const v = await ask({ title: i.name, msg: 'Quantity (decimals OK for kg items)', input: 'Quantity', value: i.qty, ok: 'Set', type: 'number' });
  if (v === null) return; const q = num(v);
  if (q <= 0) Cart.items.splice(n, 1); else i.qty = r2(q);
  Cart.save(); renderCart();
};
ACT.clear = async () => { if (await ask({ title: 'Clear order?', msg: 'Remove all items from the current order.', ok: 'Clear', danger: true })) { Cart.clear(); renderCart() } };
ACT.disc = async () => {
  const s = settings(); if (!s.discounts) return;
  modal(`<div class="mh"><h3>Discount</h3><button class="x" data-act="mclose">✕</button></div>
  <div class="seg" id="dt"><button class="${Cart.disc.t === '%' ? 'on' : ''}" data-act="dtype" data-t="%">Percent %</button><button class="${Cart.disc.t === '₱' ? 'on' : ''}" data-act="dtype" data-t="₱">Amount ${esc(s.currency)}</button></div>
  <label style="margin-top:10px">Value<input id="dv" class="input lg" inputmode="decimal" value="${Cart.disc.v || ''}"></label>
  ${Auth.isAdmin() ? '' : `<small>Cashiers can give up to ${s.maxCashierDisc}% off.</small>`}
  <div class="quick">${[5, 10, 20].map(x => `<button class="btn sm" data-act="dquick" data-v="${x}">${x}%</button>`).join('')}</div>
  <div class="row end mt"><button class="btn danger" data-act="dremove">Remove</button><button class="btn primary" data-act="dsave">Apply</button></div>`);
  S._dt = Cart.disc.t; setTimeout(() => $('#dv') && $('#dv').focus(), 50);
};
ACT.dtype = a => { S._dt = a.dataset.t; $$('#dt button').forEach(b => b.classList.toggle('on', b.dataset.t === S._dt)) };
ACT.dquick = a => { S._dt = '%'; $$('#dt button').forEach(b => b.classList.toggle('on', b.dataset.t === '%')); $('#dv').value = a.dataset.v };
ACT.dremove = () => { Cart.disc = { t: '%', v: 0 }; Cart.save(); closeModal(); renderCart() };
ACT.dsave = () => {
  const v = num($('#dv').value), sub = Cart.calc().sub, s = settings();
  const pct = S._dt === '%' ? v : (sub ? v / sub * 100 : 0);
  if (v < 0 || pct > 100) return toast('Invalid discount', 'err');
  if (!Auth.isAdmin() && pct > s.maxCashierDisc + 0.001) return toast('Max discount for cashiers is ' + s.maxCashierDisc + '%', 'err');
  Cart.disc = { t: S._dt, v }; Cart.save(); closeModal(); renderCart();
};

/* held orders */
ACT.hold = () => {
  if (!Cart.items.length) return;
  const h = held(); h.push({ id: uid(), t: Date.now(), by: Auth.user.name, items: Cart.items, disc: Cart.disc, cust: Cart.cust });
  localStorage.setItem('pos.held', JSON.stringify(h)); Cart.clear(); renderCart(); toast('Order held', 'ok');
};
ACT.held = () => {
  const h = held();
  modal(`<div class="mh"><h3>Held orders</h3><button class="x" data-act="mclose">✕</button></div>${h.map(o => `<div class="ucardrow" style="margin-bottom:8px"><div style="flex:1"><b>${o.items.length} item${o.items.length === 1 ? '' : 's'} · ${money(r2(o.items.reduce((a, i) => a + i.price * i.qty, 0)))}</b><br><small>${fmtDT(o.t)} · ${esc(o.by)}</small></div><button class="btn sm primary" data-act="resume" data-id="${o.id}">Resume</button><button class="btn sm danger" data-act="held-del" data-id="${o.id}">✕</button></div>`).join('') || '<div class="empty">No held orders.</div>'}`);
};
ACT.resume = async a => {
  const h = held(), o = h.find(x => x.id === a.dataset.id); if (!o) return;
  if (Cart.items.length && !await ask({ title: 'Replace current order?', msg: 'The current order will be replaced.', ok: 'Replace' })) return;
  Cart.items = o.items; Cart.disc = o.disc; Cart.cust = o.cust || ''; Cart.save();
  localStorage.setItem('pos.held', JSON.stringify(h.filter(x => x.id !== o.id)));
  closeModal(); if (S.view === 'pos') VIEWS.pos.update();
};
ACT['held-del'] = a => { localStorage.setItem('pos.held', JSON.stringify(held().filter(x => x.id !== a.dataset.id))); ACT.held(); if (S.view === 'pos') renderCart() };

/* ============ checkout ============ */
ACT.charge = () => openCheckout();
function openCheckout() {
  const c = Cart.calc(), s = settings(); if (!Cart.items.length) return;
  const methods = (s.utang ? s.payments : s.payments.filter(m => m !== 'Utang'));
  S.pay = { m: methods[0] || 'Cash', methods };
  modal(`<div class="mh"><h3>Charge</h3><button class="x" data-act="mclose">✕</button></div><div class="total big">${money(c.total)}</div>
  <div class="seg" id="pm">${methods.map(m => `<button data-act="pm" data-m="${esc(m)}" class="${m === S.pay.m ? 'on' : ''}">${esc(m)}</button>`).join('')}</div>
  <div id="payBody"></div>
  <div class="row end mt"><button class="btn cancel" data-act="mclose">Back</button><button class="btn primary lg" id="payOk" data-act="pay-ok">Complete sale</button></div>`);
  renderPayBody();
}
ACT.pm = a => { S.pay.m = a.dataset.m; $$('#pm button').forEach(b => b.classList.toggle('on', b.dataset.m === S.pay.m)); renderPayBody() };
function renderPayBody() {
  const c = Cart.calc(), m = S.pay.m, cash = m === 'Cash';
  let h = '';
  if (cash) {
    const q = [...new Set([c.total, ...[20, 50, 100, 200, 500, 1000].filter(x => x >= c.total).slice(0, 3)])];
    if (q.length < 2) q.push(Math.ceil(c.total / 1000) * 1000 + 1000);
    h += `<label style="margin-top:12px">Cash received<input id="tend" class="input lg" inputmode="decimal" placeholder="${c.total}"></label><div class="quick">${q.map((x, i) => `<button class="btn sm" data-act="tquick" data-v="${x}">${i === 0 ? 'Exact' : money(x).replace('.00', '')}</button>`).join('')}</div><div class="chg" id="chg"></div>`;
  } else if (m === 'Utang') {
    h += `<p class="muted" style="margin:10px 0 0">Sale will be recorded as unpaid until you mark it paid in Sales.</p>`;
  } else {
    h += `<label style="margin-top:12px">Reference no. (optional)<input id="pref" class="input"></label>`;
  }
  h += `<label style="margin-top:8px">Customer name${m === 'Utang' ? ' (required)' : ' (optional)'}<input id="cust" class="input" value="${esc(Cart.cust)}"></label>`;
  $('#payBody').innerHTML = h;
  const t = $('#tend'); if (t) { t.oninput = updChange; t.onkeydown = e => { if (e.key === 'Enter') ACT['pay-ok']() }; t.focus() }
  updChange();
}
ACT.tquick = a => { $('#tend').value = a.dataset.v; updChange() };
function updChange() {
  if (S.pay.m !== 'Cash') { $('#payOk').disabled = false; return }
  const c = Cart.calc(), v = num($('#tend').value), ch = r2(v - c.total);
  $('#chg').innerHTML = !$('#tend').value ? '<span class="muted">Enter amount received</span>' : ch >= 0 ? `Change: <span style="color:var(--accent)">${money(ch)}</span>` : `<span style="color:var(--danger)">Short by ${money(-ch)}</span>`;
  $('#payOk').disabled = ch < 0 && !!$('#tend').value;
}
ACT['pay-ok'] = () => {
  const c = Cart.calc(), m = S.pay.m, cust = ($('#cust').value || '').trim();
  const ex = { customer: cust };
  if (m === 'Cash') { const v = $('#tend').value ? num($('#tend').value) : c.total; if (v < c.total) return toast('Cash is less than the total', 'err'); ex.tendered = v; ex.change = r2(v - c.total) }
  else if (m === 'Utang') { if (!cust) return toast('Enter the customer name for utang', 'err') }
  else ex.ref = ($('#pref') ? $('#pref').value : '').trim();
  const sale = finishSale(m, ex); closeModal(); showReceipt(sale, true);
};
function saleNo(now) { const d = new Date(now); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase() }
function finishSale(method, ex) {
  const c = Cart.calc(), u = Auth.user, now = Date.now(), id = uid();
  const sale = DB.put('sale', id, {
    no: saleNo(now), t: now, items: Cart.items.map(i => ({ pid: i.pid, name: i.name, price: i.price, cost: i.cost, cat: i.cat, qty: i.qty })),
    sub: c.sub, disc: c.disc, total: c.total, vat: c.vat, method, tendered: ex.tendered || 0, change: ex.change || 0, ref: ex.ref || '', customer: ex.customer || '',
    cashier: u.id, cashierName: u.name, status: method === 'Utang' ? 'unpaid' : 'paid'
  });
  sale.items.forEach(i => addMove(i.pid, -i.qty, 'sale', { ref: id, t: now }));
  Cart.clear(); if (S.view === 'pos') renderCart();
  return sale;
}

/* ============ receipt ============ */
function receiptHTML(s) {
  const st = settings();
  return `<div class="rcpt w${st.paper}"><div class="rc"><b style="font-size:1.2em">${esc(st.store)}</b>${st.address ? `<div>${esc(st.address)}</div>` : ''}${st.phone ? `<div>${esc(st.phone)}</div>` : ''}</div><hr>
  <div class="rl"><span>#${esc(s.no)}</span><span>${fmtDT(s.t)}</span></div><div>Cashier: ${esc(s.cashierName || '')}</div>${s.customer ? `<div>Customer: ${esc(s.customer)}</div>` : ''}<hr>
  ${s.items.map(i => `<div>${esc(i.name)}</div><div class="rl"><span>${qtyFmt(i.qty)} × ${money(i.price)}</span><span>${money(r2(i.qty * i.price))}</span></div>`).join('')}<hr>
  <div class="rl"><span>Subtotal</span><span>${money(s.sub)}</span></div>${s.disc > 0 ? `<div class="rl"><span>Discount</span><span>−${money(s.disc)}</span></div>` : ''}
  <div class="rl rb"><span>TOTAL</span><span>${money(s.total)}</span></div>${s.vat > 0 ? `<div class="rl"><span>incl. VAT</span><span>${money(s.vat)}</span></div>` : ''}
  <div class="rl"><span>${esc(s.method)}${s.status === 'unpaid' ? ' (UNPAID)' : ''}</span><span>${s.method === 'Cash' ? money(s.tendered) : ''}</span></div>${s.method === 'Cash' ? `<div class="rl"><span>Change</span><span>${money(s.change)}</span></div>` : ''}
  ${s.status === 'void' ? '<div class="rc rb">*** VOID ***</div>' : ''}<hr><div class="rc">${esc(settings().footer)}</div></div>`;
}
function showReceipt(s, after) {
  modal(`<div class="mh"><h3>${after ? '✅ Sale complete' : 'Receipt'}</h3><button class="x" data-act="mclose">✕</button></div>
  ${after && s.method === 'Cash' ? `<div class="total big" style="margin:0 0 8px">Change ${money(s.change)}</div>` : ''}${receiptHTML(s)}
  <div class="row end mt"><button class="btn info" data-act="print" data-id="${s.id}">🖨 Print</button><button class="btn primary" data-act="mclose">${after ? 'New sale' : 'Close'}</button></div>`);
}
ACT.print = a => { const s = DB.get('sale', a.dataset.id); if (!s) return; $('#printArea').innerHTML = receiptHTML(s); window.print() };

/* shortcuts */
document.addEventListener('keydown', e => {
  if (S.screen !== 'app' || S.view !== 'pos' || $('#modal').innerHTML || $('#dialog').innerHTML) return;
  if (e.key === 'F2') { e.preventDefault(); $('#q') && $('#q').focus() }
  else if (e.key === 'F9') { e.preventDefault(); Cart.items.length && openCheckout() }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) $('#q') && $('#q').focus();
});
