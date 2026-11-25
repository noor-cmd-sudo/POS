'use strict';
const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
function rangeOf(k) {
  const d = startOfDay(), m = new Date(); m.setDate(1); m.setHours(0, 0, 0, 0);
  return ({ today: [d, Infinity], yesterday: [d - DAY, d], '7d': [d - 6 * DAY, Infinity], '30d': [d - 29 * DAY, Infinity], month: [m.getTime(), Infinity], all: [0, Infinity] })[k] || [d, Infinity];
}
const RANGE_LABELS = { today: 'Today', yesterday: 'Yesterday', '7d': '7 days', '30d': '30 days', month: 'This month', all: 'All time' };
const segHTML = (opts, cur, act, key) => `<div class="seg">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="${act}" data-k="${key || ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
function expState(p) {
  if (!p.expiry) return null;
  const d = Math.ceil((new Date(p.expiry + 'T23:59:59') - Date.now()) / DAY);
  return d < 0 ? { t: 'Expired', c: 'bad', d } : d <= settings().expiryDays ? { t: d + 'd left', c: 'warn', d } : null;
}
function stockState(p) {
  const q = stock()[p.id] || 0, min = num(p.minStock) || settings().lowStock;
  return q <= 0 ? { c: 'bad', t: 'Out', q } : q <= min ? { c: 'warn', t: 'Low', q } : { c: 'ok', t: 'OK', q };
}

/* ============ INVENTORY ============ */
S.ifil = 'all'; S.iq = ''; S.icat = 'All';
VIEWS.inv = function () {
  const adm = Auth.isAdmin(), s = settings();
  $('#view').innerHTML = `<div class="page"><div class="toolbar"><input id="iq" class="input" placeholder="Search stock…" value="${esc(S.iq)}"><select id="icat" class="input" style="max-width:190px;flex:none"><option>All</option>${s.cats.map(c => `<option ${S.icat === c.n ? 'selected' : ''}>${esc(c.n)}</option>`).join('')}</select>
  ${adm ? `<button class="btn primary" data-act="prod-new">+ Product</button><button class="btn info" data-act="csv-in">Import CSV</button><button class="btn violet" data-act="csv-out">Export</button><input type="file" id="csvf" accept=".csv,text/csv" class="hide">` : ''}</div>
  <div class="tabs" id="ifil"></div><div class="wrap"><table class="tbl"><thead><tr><th>Product</th><th class="hm">Category</th><th class="r">Price</th>${adm ? '<th class="r hm">Cost</th>' : ''}<th class="r">Stock</th><th class="hm">Expiry</th>${adm ? '<th></th>' : ''}</tr></thead><tbody id="ibody"></tbody></table></div><p id="isum" class="muted"></p></div>`;
  $('#iq').oninput = e => { S.iq = e.target.value; VIEWS.inv.update() };
  $('#icat').onchange = e => { S.icat = e.target.value; VIEWS.inv.update() };
  const f = $('#csvf'); if (f) f.onchange = () => f.files[0] && importCSV(f.files[0]).then(() => f.value = '');
  VIEWS.inv.update();
};
VIEWS.inv.update = function () {
  if (!$('#ibody')) return;
  const adm = Auth.isAdmin(), st = stock(), toks = S.iq.toLowerCase().split(/\s+/).filter(Boolean);
  const all = products(true);
  const cnt = { all: all.filter(p => p.active !== false).length, low: 0, out: 0, exp: 0, off: all.filter(p => p.active === false).length };
  all.forEach(p => { if (p.active === false) return; const q = stockState(p); if (q.c === 'warn') cnt.low++; if (q.c === 'bad') cnt.out++; if (expState(p)) cnt.exp++ });
  $('#ifil').innerHTML = [['all', 'All'], ['low', 'Low stock'], ['out', 'Out'], ['exp', 'Expiring'], ['off', 'Inactive']].map(([k, l]) => `<button class="chip ${S.ifil === k ? 'on' : ''}" data-act="ifil" data-k="${k}">${l} (${cnt[k]})</button>`).join('');
  let l = all.filter(p => (S.ifil === 'off') === (p.active === false));
  if (S.icat !== 'All') l = l.filter(p => p.category === S.icat);
  if (toks.length) l = l.filter(p => { const h = (p.name + ' ' + (p.barcode || '')).toLowerCase(); return toks.every(t => h.includes(t)) });
  if (S.ifil === 'low') l = l.filter(p => stockState(p).c === 'warn'); else if (S.ifil === 'out') l = l.filter(p => stockState(p).c === 'bad'); else if (S.ifil === 'exp') l = l.filter(p => expState(p));
  l.sort((a, b) => a.name.localeCompare(b.name));
  $('#ibody').innerHTML = l.slice(0, 400).map(p => {
    const ss = stockState(p), ex = expState(p);
    return `<tr><td><div class="nm">${thumb(p.id)}<div><b>${esc(p.name)}</b>${p.barcode ? `<br><small>${esc(p.barcode)}</small>` : ''}</div></div></td><td class="hm">${esc(p.category || '')}</td><td class="r">${money(p.price)}</td>${adm ? `<td class="r hm">${money(p.cost || 0)}</td>` : ''}<td class="r"><span class="badge ${ss.c}">${qtyFmt(ss.q)} ${esc(p.unit || '')}</span></td><td class="hm">${p.expiry ? `<small>${esc(p.expiry)}</small> ${ex ? `<span class="badge ${ex.c}">${ex.t}</span>` : ''}` : ''}</td>${adm ? `<td class="r" style="white-space:nowrap"><button class="btn sm violet" data-act="adj" data-id="${p.id}">± Stock</button> <button class="btn sm info" data-act="prod-edit" data-id="${p.id}">Edit</button></td>` : ''}</tr>`;
  }).join('') || `<tr><td colspan="7" class="empty">Nothing here.</td></tr>`;
  const live = all.filter(p => p.active !== false);
  $('#isum').innerHTML = `${l.length} shown · ${live.length} products` + (adm ? ` · Stock value at cost <b>${money(r2(sum(live, p => Math.max(0, st[p.id] || 0) * (p.cost || 0))))}</b> · at retail <b>${money(r2(sum(live, p => Math.max(0, st[p.id] || 0) * p.price)))}</b>` : '');
};
ACT.ifil = a => { S.ifil = a.dataset.k; VIEWS.inv.update() };
ACT['csv-in'] = () => $('#csvf').click();
ACT['csv-out'] = () => {
  const st = stock(), rows = [['name', 'barcode', 'category', 'price', 'cost', 'stock', 'unit', 'minStock', 'expiry']];
  products(true).sort((a, b) => a.name.localeCompare(b.name)).forEach(p => rows.push([p.name, p.barcode || '', p.category || '', p.price, p.cost || 0, st[p.id] || 0, p.unit || '', p.minStock || '', p.expiry || '']));
  download('products-' + dayKey(Date.now()) + '.csv', rows.map(r => r.map(csvEsc).join(',')).join('\n'));
};

function ensureCategory(name) {
  if (!name) return; const s = settings();
  if (!s.cats.find(c => c.n.toLowerCase() === name.toLowerCase())) saveSettings({ cats: [...s.cats, { n: name, e: '🛒', c: '#94a3b8' }] });
}
async function importCSV(file) {
  const rows = parseCSV(await file.text());
  if (rows.length < 2) return toast('That file is empty', 'err');
  const h = rows[0].map(x => x.trim().toLowerCase());
  const col = (...n) => h.findIndex(x => n.includes(x));
  const C = { name: col('name', 'product', 'item', 'description'), barcode: col('barcode', 'sku', 'code'), category: col('category', 'cat'), price: col('price', 'srp', 'selling price'), cost: col('cost', 'capital', 'unit cost'), stock: col('stock', 'qty', 'quantity', 'on hand'), unit: col('unit', 'uom'), min: col('minstock', 'min', 'reorder'), expiry: col('expiry', 'expiration', 'exp') };
  if (C.name < 0 || C.price < 0) return toast('CSV needs at least "name" and "price" columns', 'err');
  const exist = products(true), st = stock(); let made = 0, upd = 0, skip = 0;
  for (const r of rows.slice(1)) {
    const g = i => i >= 0 ? (r[i] || '').trim() : '';
    const name = g(C.name), price = num(g(C.price)); if (!name || !(price >= 0)) { skip++; continue }
    const bc = g(C.barcode), cat = g(C.category) || 'Others'; ensureCategory(cat);
    const ex = exist.find(p => (bc && p.barcode === bc) || (!bc && p.name.toLowerCase() === name.toLowerCase()));
    const data = { name, barcode: bc, category: cat, price, cost: num(g(C.cost)), unit: g(C.unit) || 'pc', minStock: g(C.min) ? num(g(C.min)) : '', expiry: g(C.expiry), active: true };
    const stk = g(C.stock) !== '' ? num(g(C.stock)) : null;
    if (ex) { DB.put('product', ex.id, { ...ex, ...data }); if (stk !== null && stk !== (st[ex.id] || 0)) addMove(ex.id, stk - (st[ex.id] || 0), 'adjust', { note: 'CSV import' }); upd++ }
    else { const id = uid(); DB.put('product', id, data); if (stk) addMove(id, stk, 'initial'); made++ }
  }
  toast(`Imported: ${made} new, ${upd} updated${skip ? ', ' + skip + ' skipped' : ''}`, 'ok');
}

const UNITS = ['pc', 'pack', 'kg', 'g', 'L', 'ml', 'box', 'bottle', 'can', 'sachet', 'dozen'];
function productModal(id) {
  const p = id ? DB.get('product', id) : null, s = settings(), cats = s.cats.map(c => c.n);
  S.pimg = (p && p.img) || '';
  if (p && p.category && !cats.includes(p.category)) cats.push(p.category);
  modal(`<div class="mh"><h3>${p ? 'Edit product' : 'New product'}</h3><button class="x" data-act="mclose">✕</button></div><div class="form">
  <div class="f2 pedit"><div class="pprev" id="pprev">${pprevHTML()}</div><div><div class="pbtns"><button class="btn info" data-act="pcam">📷 Take photo</button><button class="btn violet" data-act="pup">🖼 Upload</button><button class="btn danger sm" data-act="prem">Remove</button></div><small style="display:block;margin-top:8px">A clear, bright photo makes products faster to spot at the counter.</small><input type="file" id="pcam" accept="image/*" capture="environment" class="hide"><input type="file" id="pup" accept="image/*" class="hide"></div></div>
  <label class="f2">Product name<input name="name" class="input" value="${esc(p && p.name)}"></label>
  <label>Barcode / SKU<input name="barcode" class="input" value="${esc(p && p.barcode)}"></label>
  <label>Category<select name="category" class="input">${cats.map(c => `<option ${p && p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
  <label>Selling price<input name="price" class="input" inputmode="decimal" value="${p ? p.price : ''}"></label>
  <label>Cost price<input name="cost" class="input" inputmode="decimal" value="${p ? p.cost || 0 : ''}"></label>
  ${p ? '' : '<label>Starting stock<input name="stock" class="input" inputmode="decimal" value="0"></label>'}
  <label>Unit<select name="unit" class="input">${UNITS.map(u => `<option ${(p ? p.unit : 'pc') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
  <label>Low-stock alert at<input name="minStock" class="input" inputmode="decimal" placeholder="${s.lowStock}" value="${p && p.minStock ? p.minStock : ''}"></label>
  <label>Expiry date<input name="expiry" type="date" class="input" value="${esc(p && p.expiry)}"></label>
  <label class="chk f2"><input type="checkbox" name="active" ${p && p.active === false ? '' : 'checked'}> Active (show in POS)</label></div>
  <div class="row mt">${p ? `<button class="btn danger" data-act="prod-del" data-id="${p.id}">Delete</button>` : ''}<span class="grow"></span><button class="btn cancel" data-act="mclose">Cancel</button><button class="btn primary" data-act="prod-save" data-id="${p ? p.id : ''}">Save</button></div>`);
  $('#pcam').onchange = e => gotPhoto(e.target.files[0]); $('#pup').onchange = e => gotPhoto(e.target.files[0]);
  setTimeout(() => $('#modal [name=name]') && !p && $('#modal [name=name]').focus(), 50);
}
function pprevHTML() { return S.pimg ? `<img src="${S.pimg}" alt="">` : '<span>📷<small>No photo</small></span>' }
async function gotPhoto(f) { if (!f) return; try { S.pimg = await resizeImage(f); $('#pprev').innerHTML = pprevHTML() } catch { toast('Could not read that photo', 'err') } }
ACT.pcam = () => $('#pcam').click(); ACT.pup = () => $('#pup').click();
ACT.prem = () => { S.pimg = ''; $('#pprev').innerHTML = pprevHTML() };
ACT['prod-new'] = () => productModal(); ACT['prod-edit'] = a => productModal(a.dataset.id);
ACT['prod-save'] = a => {
  const f = fd(), id = a.dataset.id, name = f.name.trim(), price = num(f.price);
  if (!name) return toast('Enter a product name', 'err');
  if (!(price > 0)) return toast('Enter a selling price', 'err');
  const bc = f.barcode.trim();
  if (bc && products(true).find(p => p.barcode === bc && p.id !== id)) return toast('Another product already uses that barcode', 'err');
  const old = id ? DB.get('product', id) : {};
  const data = { ...old, name, barcode: bc, category: f.category, price, cost: num(f.cost), unit: f.unit, minStock: f.minStock ? num(f.minStock) : '', expiry: f.expiry, active: f.active, img: S.pimg || '' };
  const pid = id || uid(); DB.put('product', pid, data);
  if (!id && num(f.stock) > 0) addMove(pid, num(f.stock), 'initial');
  closeModal(); toast('Saved', 'ok');
};
ACT['prod-del'] = async a => {
  if (!await ask({ title: 'Delete product?', msg: 'Past sales keep their records. This hides the product everywhere.', ok: 'Delete', danger: true })) return;
  DB.del('product', a.dataset.id); closeModal(); toast('Deleted');
};
ACT.adj = a => {
  const p = DB.get('product', a.dataset.id), q = stock()[p.id] || 0; S.adj = { id: p.id, t: 'in' };
  modal(`<div class="mh"><h3>Adjust stock</h3><button class="x" data-act="mclose">✕</button></div><p><b>${esc(p.name)}</b><br><span class="muted">On hand: ${qtyFmt(q)} ${esc(p.unit || '')}</span></p>
  <div class="seg" id="at"><button class="on" data-act="adjt" data-t="in">＋ Receive</button><button data-act="adjt" data-t="out">− Remove</button><button data-act="adjt" data-t="set">＝ Set count</button></div>
  <label style="margin-top:10px"><span id="alab">Quantity received</span><input id="aq" class="input lg" inputmode="decimal"></label>
  <label style="margin-top:8px">Note (optional)<input id="an" class="input" placeholder="e.g. delivery from supplier, damaged, expired"></label>
  <div class="row end mt"><button class="btn cancel" data-act="mclose">Cancel</button><button class="btn primary" data-act="adj-save">Save</button></div>`);
  setTimeout(() => $('#aq').focus(), 50);
};
ACT.adjt = a => { S.adj.t = a.dataset.t; $$('#at button').forEach(b => b.classList.toggle('on', b.dataset.t === S.adj.t)); $('#alab').textContent = { in: 'Quantity received', out: 'Quantity to remove', set: 'Counted quantity' }[S.adj.t] };
ACT['adj-save'] = () => {
  const v = $('#aq').value; if (v === '' || isNaN(num(v))) return toast('Enter a quantity', 'err');
  const q = num(v), cur = stock()[S.adj.id] || 0, t = S.adj.t, note = $('#an').value.trim();
  const delta = t === 'in' ? q : t === 'out' ? -q : q - cur;
  if (!delta) return toast('No change', 'err');
  addMove(S.adj.id, delta, t === 'in' ? 'receive' : t === 'out' ? 'remove' : 'count', { note });
  closeModal(); toast('Stock updated', 'ok');
};

/* ============ SALES ============ */
S.srange = 'today'; S.sstat = 'all'; S.sq = '';
VIEWS.sales = function () {
  const adm = Auth.isAdmin(), opts = adm ? Object.entries(RANGE_LABELS) : [['today', 'Today'], ['yesterday', 'Yesterday']];
  if (!adm && !['today', 'yesterday'].includes(S.srange)) S.srange = 'today';
  $('#view').innerHTML = `<div class="page"><div class="toolbar">${segHTML(opts, S.srange, 'srange')}<input id="sq" class="input" placeholder="Search receipt # or customer" value="${esc(S.sq)}"></div><div class="tabs" id="sfil"></div><div class="kpis" id="skp"></div><div class="wrap"><table class="tbl"><thead><tr><th>Receipt</th><th>Time</th><th class="hm">Cashier</th><th class="hm">Customer</th><th>Paid by</th><th class="r">Total</th><th></th></tr></thead><tbody id="sbody"></tbody></table></div></div>`;
  $('#sq').oninput = e => { S.sq = e.target.value; VIEWS.sales.update() };
  VIEWS.sales.update();
};
ACT.srange = a => { S.srange = a.dataset.v; VIEWS.sales() };
VIEWS.sales.update = function () {
  if (!$('#sbody')) return;
  const adm = Auth.isAdmin(), [from, to] = rangeOf(S.srange), q = S.sq.toLowerCase().trim();
  let all = DB.all('sale').filter(s => s.t >= from && s.t < to && (adm || s.cashier === Auth.user.id));
  const live = all.filter(s => s.status !== 'void');
  const by = {}; live.forEach(s => { by[s.method] = by[s.method] || { n: 0, t: 0 }; by[s.method].n++; by[s.method].t += s.total });
  $('#skp').innerHTML = `<div class="kpi"><small>Sales</small><b class="pos">${money(r2(sum(live, s => s.total)))}</b><small>${live.length} receipts</small></div>` + Object.entries(by).map(([m, v]) => `<div class="kpi"><small>${esc(m)}</small><b>${money(r2(v.t))}</b><small>${v.n} receipts</small></div>`).join('');
  $('#sfil').innerHTML = [['all', 'All'], ['unpaid', 'Unpaid (utang)'], ['void', 'Voided']].map(([k, l]) => `<button class="chip ${S.sstat === k ? 'on' : ''}" data-act="sstat" data-k="${k}">${l}</button>`).join('');
  if (S.sstat !== 'all') all = all.filter(s => s.status === S.sstat);
  if (q) all = all.filter(s => (s.no + ' ' + (s.customer || '')).toLowerCase().includes(q));
  all.sort((a, b) => b.t - a.t);
  $('#sbody').innerHTML = all.slice(0, 300).map(s => `<tr class="click" data-act="sale-open" data-id="${s.id}"><td><b>#${esc(s.no)}</b></td><td>${fmtDT(s.t)}</td><td class="hm">${esc(s.cashierName || '')}</td><td class="hm">${esc(s.customer || '')}</td><td>${esc(s.method)}</td><td class="r"><b>${money(s.total)}</b></td><td>${s.status === 'void' ? '<span class="badge bad">Void</span>' : s.status === 'unpaid' ? '<span class="badge warn">Unpaid</span>' : '<span class="badge ok">Paid</span>'}</td></tr>`).join('') || `<tr><td colspan="7" class="empty">No sales here yet.</td></tr>`;
};
ACT.sstat = a => { S.sstat = a.dataset.k; VIEWS.sales.update() };
ACT['sale-open'] = a => {
  const s = DB.get('sale', a.dataset.id); if (!s) return; const adm = Auth.isAdmin();
  modal(`<div class="mh"><h3>Receipt #${esc(s.no)}</h3><button class="x" data-act="mclose">✕</button></div>${receiptHTML(s)}
  ${s.status === 'unpaid' ? `<p class="muted" style="text-align:center">Unpaid utang${s.customer ? ' — ' + esc(s.customer) : ''}</p>` : ''}
  <div class="row end mt"><button class="btn info" data-act="print" data-id="${s.id}">🖨 Print</button>${s.status === 'unpaid' ? `<button class="btn primary" data-act="sale-paid" data-id="${s.id}">Mark paid</button>` : ''}${adm && s.status !== 'void' ? `<button class="btn danger" data-act="sale-void" data-id="${s.id}">Void sale</button>` : ''}</div>`);
};
ACT['sale-paid'] = a => {
  const ms = settings().payments.filter(m => m !== 'Utang');
  modal(`<div class="mh"><h3>Payment received via</h3><button class="x" data-act="mclose">✕</button></div><div class="quick">${ms.map(m => `<button class="btn" data-act="sale-paid-go" data-id="${a.dataset.id}" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>`);
};
ACT['sale-paid-go'] = a => { const s = DB.get('sale', a.dataset.id); DB.put('sale', s.id, { ...s, status: 'paid', paidAt: Date.now(), paidMethod: a.dataset.m }); closeModal(); toast('Marked as paid', 'ok') };
ACT['sale-void'] = async a => {
  const s = DB.get('sale', a.dataset.id); if (!s || s.status === 'void') return;
  if (!await ask({ title: 'Void this sale?', msg: 'Items go back into stock and the sale is removed from reports.', ok: 'Void sale', danger: true })) return;
  DB.put('sale', s.id, { ...s, status: 'void', voidBy: Auth.user.name, voidAt: Date.now() });
  s.items.forEach(i => addMove(i.pid, i.qty, 'void', { ref: s.id }));
  closeModal(); toast('Sale voided');
};

/* ============ REPORTS ============ */
S.rrange = '7d';
function barChart(vals, labels, fmt = money) {
  const W = 600, H = 150, max = Math.max(...vals, 1), bw = W / vals.length, step = Math.ceil(vals.length / 8);
  return `<svg viewBox="0 0 ${W} ${H + 20}" class="chart">${vals.map((v, i) => { const bh = Math.max(v ? 2 : 0, Math.round(v / max * H)); return `<rect x="${(i * bw + bw * 0.14).toFixed(1)}" y="${H - bh}" width="${(bw * 0.72).toFixed(1)}" height="${bh}" rx="3" class="bar"><title>${esc(labels[i])}: ${esc(fmt(v))}</title></rect>` }).join('')}${labels.map((l, i) => i % step === 0 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H + 15}" text-anchor="middle" class="ax">${esc(l)}</text>` : '').join('')}</svg>`;
}
function hbars(rows) {
  const max = Math.max(...rows.map(r => r[1]), 1);
  return rows.map(([l, v, t]) => `<div class="hb"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l)}">${esc(l)}</span><div class="tk"><i style="width:${Math.max(2, v / max * 100)}%"></i></div><b>${t}</b></div>`).join('') || '<div class="muted">No data yet.</div>';
}
VIEWS.rep = function () {
  const k = S.rrange, [from, to] = rangeOf(k);
  const sales = DB.all('sale').filter(s => s.status !== 'void' && s.t >= from && s.t < to);
  const rev = r2(sum(sales, s => s.total)), cogs = r2(sum(sales, s => sum(s.items, i => i.cost * i.qty))), profit = r2(rev - cogs);
  const itemsN = r2(sum(sales, s => sum(s.items, i => i.qty)));
  const day0 = startOfDay(), vals = [], labels = [];
  if (k === 'today' || k === 'yesterday') {
    const base = k === 'today' ? day0 : day0 - DAY;
    for (let h = 0; h < 24; h++) { vals.push(r2(sum(sales.filter(s => s.t >= base + h * 36e5 && s.t < base + (h + 1) * 36e5), s => s.total))); labels.push((h % 12 || 12) + (h < 12 ? 'a' : 'p')) }
  } else {
    const n = k === '7d' ? 7 : k === 'month' ? new Date().getDate() : 30;
    for (let i = n - 1; i >= 0; i--) { const b = day0 - i * DAY; vals.push(r2(sum(sales.filter(s => s.t >= b && s.t < b + DAY), s => s.total))); labels.push(fmtDay(b)) }
  }
  const hours = Array(24).fill(0); sales.forEach(s => hours[new Date(s.t).getHours()]++);
  const tp = {}; sales.forEach(s => s.items.forEach(i => { const o = tp[i.pid] = tp[i.pid] || { n: i.name, q: 0, r: 0, p: 0 }; o.q += i.qty; o.r += i.price * i.qty; o.p += (i.price - i.cost) * i.qty }));
  const top = Object.values(tp).sort((a, b) => b.r - a.r).slice(0, 8);
  const cat = {}; sales.forEach(s => s.items.forEach(i => { const c = i.cat || 'Others'; cat[c] = (cat[c] || 0) + i.price * i.qty }));
  const pm = {}; sales.forEach(s => pm[s.method] = (pm[s.method] || 0) + s.total);
  const unpaid = DB.all('sale').filter(s => s.status === 'unpaid'), owed = r2(sum(unpaid, s => s.total));
  const st = stock(), live = products();
  const low = live.filter(p => stockState(p).c !== 'ok').sort((a, b) => (st[a.id] || 0) - (st[b.id] || 0)).slice(0, 8);
  const exp = live.filter(p => expState(p)).sort((a, b) => expState(a).d - expState(b).d).slice(0, 8);
  const peakH = hours.indexOf(Math.max(...hours));
  $('#view').innerHTML = `<div class="page"><div class="toolbar"><h2 style="margin:0">Reports</h2><span class="grow"></span>${segHTML(Object.entries(RANGE_LABELS), k, 'rrange')}</div>
  <div class="kpis"><div class="kpi"><small>Sales</small><b class="pos">${money(rev)}</b></div><div class="kpi"><small>Profit</small><b>${money(profit)}</b><small>${rev ? Math.round(profit / rev * 100) : 0}% margin</small></div><div class="kpi"><small>Receipts</small><b>${sales.length}</b><small>avg ${money(sales.length ? r2(rev / sales.length) : 0)}</small></div><div class="kpi"><small>Items sold</small><b>${qtyFmt(itemsN)}</b></div><div class="kpi"><small>Utang owed</small><b style="color:${owed ? 'var(--warn)' : 'inherit'}">${money(owed)}</b><small>${unpaid.length} unpaid</small></div></div>
  <div class="cols"><div class="card"><h3>${k === 'today' || k === 'yesterday' ? 'Sales by hour' : 'Sales per day'}</h3>${barChart(vals, labels)}</div><div class="card"><h3>Busiest hours <small>${sales.length ? '· peak ' + ((peakH % 12 || 12) + (peakH < 12 ? ' AM' : ' PM')) : ''}</small></h3>${barChart(hours, hours.map((_, h) => (h % 12 || 12) + (h < 12 ? 'a' : 'p')), v => v + ' receipts')}</div></div>
  <div class="cols"><div class="card"><h3>Top products</h3>${hbars(top.map(t => [t.n, t.r, money(r2(t.r))]))}</div><div class="card"><h3>By category</h3>${hbars(Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, v]) => [n, v, money(r2(v))]))}<h3 style="margin-top:14px">Payment methods</h3>${hbars(Object.entries(pm).sort((a, b) => b[1] - a[1]).map(([n, v]) => [n, v, money(r2(v))]))}</div></div>
  <div class="cols"><div class="card"><h3>⚠ Restock soon</h3>${low.map(p => `<div class="hb" style="grid-template-columns:1fr auto"><span>${esc(p.name)}</span><span class="badge ${stockState(p).c}">${qtyFmt(st[p.id] || 0)} ${esc(p.unit || '')}</span></div>`).join('') || '<div class="muted">Everything is stocked.</div>'}</div><div class="card"><h3>⏳ Expiring</h3>${exp.map(p => `<div class="hb" style="grid-template-columns:1fr auto"><span>${esc(p.name)}</span><span class="badge ${expState(p).c}">${expState(p).t}</span></div>`).join('') || '<div class="muted">Nothing close to expiry.</div>'}</div></div></div>`;
};
VIEWS.rep.update = () => VIEWS.rep();
ACT.rrange = a => { S.rrange = a.dataset.v; VIEWS.rep() };

/* ============ SETTINGS (the “tools” to modify the app) ============ */
const ACCENTS = ['#d4af37', '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#eab308'];
const THEMES = [['onyx', 'Onyx'], ['midnight', 'Midnight'], ['charcoal', 'Charcoal'], ['light', 'Light'], ['cream', 'Cream']];
const sw = (k, on) => `<div class="sw ${on ? 'on' : ''}" data-act="tog" data-k="${k}"></div>`;
const trow = (label, hint, ctl) => `<div class="setrow"><label>${label}${hint ? `<small style="font-weight:400">${hint}</small>` : ''}</label>${ctl}</div>`;
VIEWS.set = function () {
  const tabs = [['store', 'Store'], ['look', 'Look & feel'], ['cats', 'Categories'], ['team', 'Team'], ['sync', 'Devices & cloud'], ['data', 'Data']];
  $('#view').innerHTML = `<div class="page"><div class="tabs">${tabs.map(([k, l]) => `<button class="chip ${S.stab === k ? 'on' : ''}" data-act="stab" data-k="${k}">${l}</button>`).join('')}</div><div class="set" id="stab"></div></div>`;
  SETTABS[S.stab]();
};
ACT.stab = a => { S.stab = a.dataset.k; VIEWS.set() };
const SETTABS = {
  store() {
    const s = settings();
    $('#stab').innerHTML = `<div class="card form">
    <label class="f2">Store name<input class="input" data-set="store" value="${esc(s.store)}"></label>
    <label>Address (on receipt)<input class="input" data-set="address" value="${esc(s.address)}"></label>
    <label>Phone (on receipt)<input class="input" data-set="phone" value="${esc(s.phone)}"></label>
    <label>Currency symbol<input class="input" data-set="currency" value="${esc(s.currency)}" maxlength="3"></label>
    <label>Receipt paper<select class="input" data-set="paper"><option value="58" ${s.paper === '58' ? 'selected' : ''}>58 mm (small)</option><option value="80" ${s.paper === '80' ? 'selected' : ''}>80 mm</option></select></label>
    <label class="f2">Receipt footer<input class="input" data-set="footer" value="${esc(s.footer)}"></label></div>
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
    ${trow('Show VAT on receipts', 'Prices already include VAT', segHTML([['off', 'Off'], ['inclusive', 'On']], s.vat, 'setv', 'vat'))}
    ${trow('VAT rate %', '', `<input class="input" style="width:90px" data-set="vatRate" data-n="1" value="${s.vatRate}">`)}
    ${trow('Allow selling below zero stock', 'Turn off to block sales when stock runs out', sw('allowNegative', s.allowNegative))}
    ${trow('Default low-stock level', 'Used when a product has no alert level', `<input class="input" style="width:90px" data-set="lowStock" data-n="1" value="${s.lowStock}">`)}
    ${trow('Expiry warning (days)', '', `<input class="input" style="width:90px" data-set="expiryDays" data-n="1" value="${s.expiryDays}">`)}
    ${trow('Allow discounts', '', sw('discounts', s.discounts))}
    ${trow('Max cashier discount %', 'Owners are not limited', `<input class="input" style="width:90px" data-set="maxCashierDisc" data-n="1" value="${s.maxCashierDisc}">`)}
    ${trow('Allow utang (credit)', 'Track unpaid sales per customer', sw('utang', s.utang))}
    <label>Payment methods (comma separated)<input class="input" data-set="payments" data-list="1" value="${esc(s.payments.join(', '))}"></label></div>`;
  },
  look() {
    const s = settings();
    $('#stab').innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:14px">
    <div><label>Theme</label><div class="seg" style="margin-top:6px">${THEMES.map(([k, l]) => `<button class="${s.theme === k ? 'on' : ''}" data-act="setv" data-k="theme" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div><label>Accent color</label><div class="swatches" style="margin-top:6px">${ACCENTS.map(c => `<div class="swatch ${s.accent === c ? 'on' : ''}" style="background:${c}" data-act="setv" data-k="accent" data-v="${c}"></div>`).join('')}<input type="color" value="${s.accent}" data-set="accent" data-live="accent" title="Custom color"></div></div>
    ${trow('Density', '', segHTML([['comfortable', 'Comfortable'], ['compact', 'Compact']], s.density, 'setv', 'density'))}
    ${trow('Product tile size', '', segHTML([['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']], s.tile, 'setv', 'tile'))}
    <div><label>Corner roundness: ${s.radius}px</label><input type="range" min="2" max="24" value="${s.radius}" data-set="radius" data-live="radius"></div>
    <div><label>Text size: ${s.font}%</label><input type="range" min="85" max="125" step="5" value="${s.font}" data-set="font" data-live="font"></div>
    ${trow('Show category emoji on tiles', '', sw('emoji', s.emoji))}</div>
    <small class="muted">Appearance is saved for the whole store and shows on every device.</small>`;
  },
  cats() {
    const s = settings();
    $('#stab').innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:8px"><small class="muted">Renaming a category also updates its products.</small>${s.cats.map((c, i) => `<div class="catrow"><input class="input" data-ci="${i}" data-cf="e" value="${esc(c.e)}" maxlength="4" style="text-align:center"><input class="input" data-ci="${i}" data-cf="n" value="${esc(c.n)}"><input type="color" data-ci="${i}" data-cf="c" value="${c.c}"><button class="btn sm danger" data-act="cat-del" data-i="${i}">✕</button></div>`).join('')}<button class="btn primary" data-act="cat-add">+ Add category</button></div>`;
  },
  team() {
    const us = DB.all('user').sort((a, b) => a.name.localeCompare(b.name));
    $('#stab').innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:8px">${us.map(u => `<div class="ucardrow"><span class="av">${esc(u.name[0].toUpperCase())}</span><div style="flex:1"><b>${esc(u.name)}</b> ${u.id === Auth.user.id ? '<span class="badge">you</span>' : ''}<br><small>${u.role === 'admin' ? 'Owner / Admin' : 'Cashier'}${u.active === false ? ' · disabled' : ''}</small></div><button class="btn sm info" data-act="user-edit" data-id="${u.id}">Edit</button></div>`).join('')}<button class="btn primary" data-act="user-new">+ Add team member</button></div><small class="muted">Cashiers can sell, see their own sales and view stock. Only owners see costs, profit, reports and settings.</small>`;
  },
  sync() {
    const c = Sync.cfg();
    if (c && c.auto) {
      $('#stab').innerHTML = `<div class="card"><h3>🏪 Connected to the shop PC</h3>
      <p class="muted">Every phone or PC on the shop Wi-Fi that opens the address shown by GroceryPOS.exe shares these accounts, products and stock automatically. Nothing goes online and no account is needed.<br><br>Status: ${esc({ ok: 'synced', syncing: 'syncing…', offline: 'offline (sales are kept here and sent when it reconnects)', error: 'error — ' + Sync.err, local: 'idle' }[Sync.status])}</p>
      <div class="row"><button class="btn info" data-act="sync-now">Sync now</button><button class="btn warn" data-act="sync-resend">Re-send all data from this device</button><button class="btn danger" data-act="sync-off">Disconnect</button></div></div>
      <small class="muted">The shop PC keeps its copy in a file (shown when GroceryPOS.exe starts). Use "Re-send" if that file was ever deleted or replaced. Want to sync over the internet instead? Disconnect, then use Connect to cloud.</small>
      <div class="row"><button class="btn" data-act="cloud-connect">Use an online cloud instead…</button></div>`;
      return;
    }
    $('#stab').innerHTML = `<div class="card"><h3>${c ? '☁ Connected' : 'This device only'}</h3>
    <p class="muted">${c ? `Store code <b>${esc(c.store)}</b> · ${esc(c.url)}<br>Status: ${esc({ ok: 'synced', syncing: 'syncing…', offline: 'offline', error: 'error — ' + Sync.err, local: 'idle' }[Sync.status])}` : 'To use several phones/PCs on the same stock, connect a free Supabase project. Takes about 5 minutes.'}</p>
    <div class="row"><button class="btn primary" data-act="cloud-connect">${c ? 'Change connection' : 'Connect to cloud'}</button>${c ? '<button class="btn info" data-act="sync-now">Sync now</button><button class="btn violet" data-act="join-link">🔗 Link for other devices</button><button class="btn danger" data-act="sync-off">Disconnect</button>' : ''}</div></div>
    <div class="card"><h3>Setup steps</h3><ol class="muted" style="padding-left:18px;margin:0;line-height:1.7"><li>Create a free project at supabase.com.</li><li>Open <b>SQL Editor</b>, paste the SQL below, press <b>Run</b>.</li><li>Open <b>Project Settings → API</b>. Copy the <b>Project URL</b> and the <b>anon public</b> key.</li><li>Tap <b>Connect to cloud</b> here, paste them, and pick a long secret <b>store code</b>.</li><li>On every other device, open the app and choose <b>Connect</b> with the same three values.</li></ol>
    <pre class="sql" id="sqlbox">${esc(SYNC_SQL)}</pre><button class="btn sm info" data-act="sql-copy">Copy SQL</button></div>`;
  },
  data() {
    $('#stab').innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:10px"><h3>Backup &amp; export</h3><div class="row"><button class="btn primary" data-act="backup">Download full backup</button><button class="btn warn" data-act="restore">Restore from backup</button><input type="file" id="rf" accept=".json" class="hide"></div><div class="row"><button class="btn violet" data-act="csv-out">Export products (CSV)</button><button class="btn violet" data-act="csv-sales">Export sales (CSV)</button></div>
    ${S.installEv ? '<button class="btn" data-act="install">📲 Install this app on this device</button>' : '<small class="muted">Tip: in Chrome/Edge use the install icon in the address bar (or menu → Install app). On Android, menu → Add to Home screen.</small>'}</div>
    <div class="card"><h3>Reset this device</h3><p class="muted">Clears the data stored on this device. If cloud sync is on, it downloads again on next sync.</p><button class="btn danger" data-act="wipe">Erase local data…</button></div>`;
    $('#rf').onchange = e => e.target.files[0] && restoreBackup(e.target.files[0]);
  }
};
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.set) {
    let v; if (el.type === 'range' || el.dataset.n) v = num(el.value); else if (el.dataset.list) v = el.value.split(',').map(x => x.trim()).filter(Boolean); else v = el.value;
    saveSettings({ [el.dataset.set]: v }); applyTheme(); if (el.type === 'range' || el.type === 'color') SETTABS[S.stab]();
  } else if (el.dataset.ci !== undefined) {
    const s = settings(), cats = s.cats.map(c => ({ ...c })), i = +el.dataset.ci, f = el.dataset.cf, old = cats[i].n;
    cats[i][f] = el.value.trim() || cats[i][f];
    if (f === 'n' && cats[i].n !== old) products(true).filter(p => p.category === old).forEach(p => DB.put('product', p.id, { ...p, category: cats[i].n }));
    saveSettings({ cats });
  }
});
document.addEventListener('input', e => { const el = e.target; if (el.dataset.live) applyTheme({ ...settings(), [el.dataset.live]: el.type === 'range' ? num(el.value) : el.value }) });
ACT.tog = a => { const k = a.dataset.k; saveSettings({ [k]: !settings()[k] }); applyTheme(); SETTABS[S.stab]() };
ACT.setv = a => { saveSettings({ [a.dataset.k]: a.dataset.v }); applyTheme(); SETTABS[S.stab]() };
ACT['cat-add'] = () => { const s = settings(); saveSettings({ cats: [...s.cats, { n: 'New category', e: '🛒', c: '#94a3b8' }] }); SETTABS.cats() };
ACT['cat-del'] = async a => {
  const s = settings(), c = s.cats[+a.dataset.i];
  if (!await ask({ title: 'Delete "' + c.n + '"?', msg: 'Products in this category keep their name but lose the colour/emoji.', ok: 'Delete', danger: true })) return;
  saveSettings({ cats: s.cats.filter((_, i) => i !== +a.dataset.i) }); SETTABS.cats();
};
/* team */
function userModal(id) {
  const u = id ? DB.get('user', id) : null;
  modal(`<div class="mh"><h3>${u ? 'Edit member' : 'New team member'}</h3><button class="x" data-act="mclose">✕</button></div><div class="form">
  <label class="f2">Name<input name="name" class="input" value="${esc(u && u.name)}"></label>
  <label>Role<select name="role" class="input"><option value="cashier" ${u && u.role === 'cashier' ? 'selected' : ''}>Cashier</option><option value="admin" ${u && u.role === 'admin' ? 'selected' : ''}>Owner / Admin</option></select></label>
  <label>${u ? 'New PIN (leave blank to keep)' : 'PIN (4–8 digits)'}<input name="pin" class="input" inputmode="numeric" maxlength="8" type="password"></label>
  ${u ? '<label class="chk f2"><input type="checkbox" name="active" ' + (u.active === false ? '' : 'checked') + '> Active</label>' : ''}</div>
  <div class="row end mt"><button class="btn cancel" data-act="mclose">Cancel</button><button class="btn primary" data-act="user-save" data-id="${u ? u.id : ''}">Save</button></div>`);
}
ACT['user-new'] = () => userModal(); ACT['user-edit'] = a => userModal(a.dataset.id);
ACT['user-save'] = async a => {
  const f = fd(), id = a.dataset.id, old = id ? DB.get('user', id) : null, name = f.name.trim();
  if (!name) return toast('Enter a name', 'err');
  if (f.pin && !/^\d{4,8}$/.test(f.pin)) return toast('PIN must be 4–8 digits', 'err');
  if (!old && !f.pin) return toast('Set a PIN', 'err');
  const active = old ? f.active : true, admins = DB.all('user').filter(u => u.role === 'admin' && u.active !== false && u.id !== id);
  if (old && !admins.length && (f.role !== 'admin' || !active)) return toast('Keep at least one active owner', 'err');
  if (old && old.id === Auth.user.id && !active) return toast("You can't disable yourself", 'err');
  let rec;
  if (f.pin) rec = await Auth.build({ name, username: name, role: f.role, pin: f.pin }); else rec = { ...old, name, username: name, role: f.role };
  rec.active = active; DB.put('user', id || uid(), rec);
  if (old && old.id === Auth.user.id) Auth.user = { ...rec, id: old.id };
  closeModal(); toast('Saved', 'ok'); SETTABS.team();
};
/* sync buttons */
ACT['sync-now'] = async () => { await Sync.run(); toast(Sync.status === 'ok' ? 'Synced' : 'Sync problem: ' + Sync.err, Sync.status === 'ok' ? 'ok' : 'err'); SETTABS.sync() };
ACT['sync-off'] = async () => { if (await ask({ title: 'Disconnect?', msg: 'This device keeps its data but stops syncing with other devices.', ok: 'Disconnect', danger: true })) { localStorage.setItem('pos.noauto', '1'); Sync.setCfg(null); SETTABS.sync() } };
ACT['join-link'] = async () => {
  const c = Sync.cfg(); if (!c || c.auto) return;
  let base = await ask({ title: 'Link for your tablet or phone', msg: 'Paste the web address where the app is hosted (for example your GitHub Pages link). Anyone opening the link joins your store, so only send it to people you trust.', input: 'https://yourname.github.io/pos/', value: /^https:/.test(location.href) ? location.origin + location.pathname : '', ok: 'Copy link' });
  if (!base) return; base = base.trim().split('#')[0];
  if (!/^https?:\/\//.test(base)) return toast('Enter the full address starting with https://', 'err');
  const link = base + '#join=' + btoa(unescape(encodeURIComponent(JSON.stringify({ url: c.url, key: c.key, store: c.store }))));
  try { await navigator.clipboard.writeText(link); toast('Link copied. Open it on the other device.', 'ok') }
  catch { await ask({ title: 'Copy this link', msg: '<span style="word-break:break-all;user-select:all">' + esc(link) + '</span>', ok: 'Done' }) }
};
ACT['sync-resend'] = async () => {
  for (const r of DB.cache.values()) { r.dirty = 1; DB.save(r) }
  await Sync.run(); toast(Sync.status === 'ok' ? 'Everything re-sent' : 'Sync problem: ' + Sync.err, Sync.status === 'ok' ? 'ok' : 'err');
};
ACT['sql-copy'] = () => { (navigator.clipboard ? navigator.clipboard.writeText(SYNC_SQL) : Promise.reject()).then(() => toast('SQL copied', 'ok'), () => { const r = document.createRange(); r.selectNodeContents($('#sqlbox')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Selected — press Ctrl+C') }) };
/* data */
ACT.backup = () => {
  const docs = [...DB.cache.values()].map(r => ({ kind: r.kind, id: r.id, d: r.d }));
  download('pos-backup-' + dayKey(Date.now()) + '.json', JSON.stringify({ v: 1, docs }), 'application/json'); toast('Backup downloaded', 'ok');
};
ACT.restore = () => $('#rf').click();
async function restoreBackup(file) {
  let j; try { j = JSON.parse(await file.text()) } catch { return toast('Not a valid backup file', 'err') }
  if (!j.docs || !Array.isArray(j.docs)) return toast('Not a valid backup file', 'err');
  if (!await ask({ title: 'Restore backup?', msg: j.docs.length + ' records will be merged into this device.', ok: 'Restore' })) return;
  j.docs.forEach(r => DB.put(r.kind, r.id, r.d)); toast('Backup restored', 'ok');
}
ACT['csv-sales'] = () => {
  const rows = [['receipt', 'date', 'time', 'cashier', 'customer', 'method', 'status', 'subtotal', 'discount', 'total', 'items']];
  DB.all('sale').sort((a, b) => a.t - b.t).forEach(s => { const d = new Date(s.t); rows.push([s.no, dayKey(s.t), d.toLocaleTimeString('en-PH'), s.cashierName, s.customer, s.method, s.status, s.sub, s.disc, s.total, s.items.map(i => qtyFmt(i.qty) + 'x ' + i.name).join('; ')]) });
  download('sales-' + dayKey(Date.now()) + '.csv', rows.map(r => r.map(csvEsc).join(',')).join('\n'));
};
ACT.wipe = async () => {
  const v = await ask({ title: 'Erase local data?', msg: 'Type <b>ERASE</b> to confirm.', input: 'ERASE', ok: 'Erase', danger: true });
  if (v !== 'ERASE') return;
  await DB.wipe(); localStorage.removeItem('pos.lastPull'); Auth.logout(); Cart.clear(); location.reload();
};
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEv = e });
ACT.install = () => { S.installEv && S.installEv.prompt() };

/* ============ boot ============ */
function onData() {
  applyTheme();
  if (S.screen === 'setup' && DB.all('user').length) return route();
  if (S.screen !== 'app') return;
  if (Auth.user) { const u = DB.get('user', Auth.user.id); if (!u || u.active === false) { ACT.lock(); return } Auth.user = u }
  const v = VIEWS[S.view]; if (v && v.update) v.update();
}
// Opening a "link for other devices" connects this device to the same cloud store.
function joinFromHash() {
  const m = location.hash.match(/^#join=(.+)$/); if (!m || Sync.cfg()) return;
  try {
    const c = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    if (c.url && c.key && c.store) { localStorage.setItem('pos.sync', JSON.stringify({ url: c.url, key: c.key, store: c.store })); localStorage.removeItem('pos.lastPull'); localStorage.removeItem('pos.noauto') }
  } catch { }
  history.replaceState(null, '', location.pathname + location.search);
}
// When the app is served by GroceryPOS.exe, connect to that PC automatically: no setup, no accounts.
async function autoLocalSync() {
  if (Sync.cfg() || localStorage.getItem('pos.noauto') || !location.protocol.startsWith('http')) return;
  try {
    const r = await fetch('/__gpos', { cache: 'no-store' });
    if (!r.ok || !(await r.text()).startsWith('GroceryPOS')) return;
    localStorage.setItem('pos.sync', JSON.stringify({ url: location.origin, key: 'local', store: 'shop', auto: true }));
  } catch { }
}
(async () => {
  try { await DB.open() } catch (e) { document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">This browser blocked local storage. Open the app in a normal (non-private) window.</p>'; return }
  applyTheme();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
  DB.on(onData); joinFromHash(); await autoLocalSync(); Sync.start();
  if (Sync.cfg()) for (let i = 0; i < 30 && Sync.busy; i++) await new Promise(r => setTimeout(r, 100)); // let the first download finish so a new device lands on the login screen
  route();
})();
