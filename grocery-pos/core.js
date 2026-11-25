'use strict';
/* ============ helpers ============ */
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0 };
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
let CUR = '₱';
const money = n => CUR + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = n => Number.isInteger(n) ? String(n) : String(r2(n));
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() };
const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
const fmtDT = t => new Date(t).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtDay = t => new Date(t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const DAY = 864e5;

function parseCSV(t) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; r.push(f); f = ''; if (r.some(x => x !== '')) rows.push(r); r = [] }
    else f += c;
  }
  r.push(f); if (r.some(x => x !== '')) rows.push(r);
  return rows;
}
const csvEsc = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v };
function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([type === 'text/csv' ? '\ufeff' + text : text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/* ============ local database (IndexedDB + in-memory cache) ============ */
const DB = {
  db: null, cache: new Map(), ver: 0, subs: [],
  open() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('grocery-pos', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('docs', { keyPath: 'k' });
      rq.onsuccess = () => {
        this.db = rq.result;
        const g = this.db.transaction('docs').objectStore('docs').getAll();
        g.onsuccess = () => { g.result.forEach(r => this.cache.set(r.k, r)); res() };
        g.onerror = () => rej(g.error);
      };
      rq.onerror = () => rej(rq.error);
    });
  },
  save(rec) { try { this.db.transaction('docs', 'readwrite').objectStore('docs').put(rec) } catch (e) { console.error(e) } },
  get(kind, id) { const r = this.cache.get(kind + '/' + id); return r && !r.d._del ? r.d : null },
  all(kind) { const o = []; for (const r of this.cache.values()) if (r.kind === kind && !r.d._del) o.push(r.d); return o },
  put(kind, id, d) {
    d.id = id;
    const rec = { k: kind + '/' + id, kind, id, d, u: Date.now(), dirty: 1 };
    const old = this.cache.get(rec.k); if (old && rec.u <= old.u) rec.u = old.u + 1;
    this.cache.set(rec.k, rec); this.save(rec); this.ver++; this.emit(); Sync.soon();
    return d;
  },
  del(kind, id) { const o = this.get(kind, id); if (o) this.put(kind, id, { ...o, _del: true }) },
  merge(rows) {
    let ch = false;
    for (const r of rows) {
      const k = r.kind + '/' + r.id, l = this.cache.get(k);
      if (!l || r.u > l.u) { const rec = { k, kind: r.kind, id: r.id, d: r.data, u: r.u, dirty: 0 }; this.cache.set(k, rec); this.save(rec); ch = true }
    }
    if (ch) { this.ver++; this.emit() }
  },
  emit() { clearTimeout(this._t); this._t = setTimeout(() => this.subs.forEach(f => f()), 40) },
  on(f) { this.subs.push(f) },
  wipe() { return new Promise(r => { const tx = this.db.transaction('docs', 'readwrite'); tx.objectStore('docs').clear(); tx.oncomplete = () => { this.cache.clear(); this.ver++; r() } }) }
};

/* ============ cloud sync (Supabase REST, optional) ============ */
const SYNC_SQL = `create table if not exists docs(
  store text not null, kind text not null, id text not null,
  data jsonb not null, u bigint not null,
  synced_at timestamptz not null default now(),
  primary key (store, kind, id));
create index if not exists docs_sync on docs (store, synced_at);
create or replace function docs_touch() returns trigger as $$
begin new.synced_at = now(); return new; end $$ language plpgsql;
drop trigger if exists docs_touch on docs;
create trigger docs_touch before insert or update on docs
  for each row execute function docs_touch();
alter table docs enable row level security;
drop policy if exists pos_all on docs;
create policy pos_all on docs for all to anon using (true) with check (true);`;

const Sync = {
  status: 'local', timer: null, busy: false, err: '', lastOk: 0,
  cfg() { try { return JSON.parse(localStorage.getItem('pos.sync')) } catch { return null } },
  setCfg(c) {
    const old = this.cfg();
    if (c) {
      localStorage.setItem('pos.sync', JSON.stringify(c));
      // pointing at a different server/store: queue everything this device has so nothing is left behind
      if (!old || old.url !== c.url || old.store !== c.store) for (const r of DB.cache.values()) { r.dirty = 1; DB.save(r) }
    } else localStorage.removeItem('pos.sync');
    localStorage.removeItem('pos.lastPull'); this.start();
  },
  hdr(c) { return { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' } },
  base(c) { return c.url.replace(/\/+$/, '') + '/rest/v1/docs' },
  setStatus(s) {
    this.status = s;
    const el = $('#syncDot'); if (!el) return;
    el.dataset.s = s;
    const t = { ok: 'Synced', syncing: 'Syncing…', offline: 'Offline', error: 'Sync error', local: 'This device only' }[s];
    $('em', el).textContent = t; el.title = s === 'error' ? this.err : t;
  },
  soon() { if (!this.cfg()) return; clearTimeout(this._s); this._s = setTimeout(() => this.run(), 700) },
  start() {
    clearInterval(this.timer);
    if (!this.cfg()) { this.setStatus('local'); return }
    this.timer = setInterval(() => this.run(), 7000);
    window.addEventListener('online', () => this.run());
    this.run();
  },
  async run() {
    const c = this.cfg(); if (!c || this.busy) return;
    if (!navigator.onLine) { this.setStatus('offline'); return }
    this.busy = true; this.setStatus('syncing');
    try { await this.push(c); await this.pull(c); this.setStatus('ok'); this.lastOk = Date.now() }
    catch (e) { console.warn(e); this.err = String(e.message || e); this.setStatus(navigator.onLine ? 'error' : 'offline') }
    this.busy = false;
  },
  async push(c) {
    const dirty = [...DB.cache.values()].filter(r => r.dirty);
    for (let i = 0; i < dirty.length; i += 100) {
      const chunk = dirty.slice(i, i + 100);
      const body = chunk.map(r => ({ store: c.store, kind: r.kind, id: r.id, data: r.d, u: r.u }));
      const res = await fetch(this.base(c) + '?on_conflict=store,kind,id', { method: 'POST', headers: { ...this.hdr(c), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Push failed (' + res.status + '): ' + await res.text());
      chunk.forEach(r => { const cur = DB.cache.get(r.k); if (cur && cur.u === r.u) { cur.dirty = 0; DB.save(cur) } });
    }
  },
  async pull(c) {
    let last = localStorage.getItem('pos.lastPull') || '1970-01-01T00:00:00Z';
    for (;;) {
      const url = this.base(c) + '?store=eq.' + encodeURIComponent(c.store) + '&synced_at=gte.' + encodeURIComponent(last) + '&order=synced_at.asc&limit=500';
      const res = await fetch(url, { headers: this.hdr(c) });
      if (!res.ok) throw new Error('Pull failed (' + res.status + '): ' + await res.text());
      const rows = await res.json();
      if (!rows.length) break;
      DB.merge(rows);
      last = rows[rows.length - 1].synced_at; localStorage.setItem('pos.lastPull', last);
      if (rows.length < 500) break;
    }
  },
  async test(c) {
    const res = await fetch(this.base(c) + '?select=id&limit=1', { headers: this.hdr(c) });
    if (!res.ok) throw new Error(res.status === 404 ? 'Table "docs" not found. Run the SQL setup first.' : res.status + ' ' + await res.text());
    return true;
  }
};

/* ============ settings & theme ============ */
const DEFAULT_CATS = [
  { n: 'Beverages', e: '🥤', c: '#38bdf8' }, { n: 'Snacks', e: '🍿', c: '#f59e0b' }, { n: 'Canned Goods', e: '🥫', c: '#ef4444' },
  { n: 'Noodles & Pasta', e: '🍜', c: '#fb923c' }, { n: 'Rice & Grains', e: '🌾', c: '#eab308' }, { n: 'Condiments', e: '🧂', c: '#a3e635' },
  { n: 'Dairy & Eggs', e: '🥛', c: '#60a5fa' }, { n: 'Bread & Bakery', e: '🍞', c: '#d97706' }, { n: 'Frozen', e: '🧊', c: '#22d3ee' },
  { n: 'Meat & Fish', e: '🥩', c: '#f43f5e' }, { n: 'Fruits & Veg', e: '🥬', c: '#22c55e' }, { n: 'Coffee & Tea', e: '☕', c: '#b45309' },
  { n: 'Household', e: '🧴', c: '#a78bfa' }, { n: 'Personal Care', e: '🧼', c: '#f472b6' }, { n: 'Others', e: '🛒', c: '#94a3b8' }
];
const DEF = {
  store: 'My Grocery', address: '', phone: '', currency: '₱', footer: 'Thank you! Come again.', paper: '58',
  vat: 'off', vatRate: 12, lowStock: 5, expiryDays: 30, allowNegative: true,
  discounts: true, maxCashierDisc: 10, utang: true, payments: ['Cash', 'GCash', 'Maya', 'Card', 'Utang'],
  theme: 'onyx', accent: '#d4af37', density: 'comfortable', radius: 12, tile: 'md', font: 100, emoji: true,
  cats: DEFAULT_CATS
};
const settings = () => ({ ...DEF, ...(DB.get('setting', 'main') || {}) });
const saveSettings = p => DB.put('setting', 'main', { ...settings(), ...p });
const lum = hex => { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0'), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255 };
const THEME_BG = { onyx: '#09090b', midnight: '#070c18', charcoal: '#0f0f10', light: '#eef1f7', cream: '#f7f1e5' };
function applyTheme(o) {
  const s = o || settings(); CUR = s.currency || '₱';
  const r = document.documentElement;
  r.dataset.theme = s.theme; r.dataset.density = s.density; r.dataset.tile = s.tile;
  r.style.setProperty('--accent', s.accent);
  r.style.setProperty('--accent-ink', lum(s.accent) > 0.58 ? '#07120c' : '#ffffff');
  r.style.setProperty('--radius', s.radius + 'px');
  r.style.setProperty('--fs', (14 * s.font / 100).toFixed(1) + 'px');
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = THEME_BG[s.theme] || '#0a101d';
}
const catInfo = n => settings().cats.find(c => c.n === n) || { n, e: '🛒', c: '#94a3b8' };

/* ============ photos ============ */
function resizeImage(file, size = 360, q = 0.74) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const side = Math.min(im.width, im.height), sx = (im.width - side) / 2, sy = (im.height - side) / 2;
      const c = document.createElement('canvas'); c.width = c.height = Math.min(size, side);
      c.getContext('2d').drawImage(im, sx, sy, side, side, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')) };
    im.src = url;
  });
}
function thumb(pid) {
  const p = DB.get('product', pid);
  if (p && p.img) return `<div class="th"><img src="${p.img}" alt=""></div>`;
  const c = catInfo(p ? p.category : '');
  return `<div class="th ph" style="--c:${c.c}">${settings().emoji ? c.e : '•'}</div>`;
}

/* ============ stock (event-sourced: stock = sum of movements) ============ */
let _sm = { v: -1, m: {} };
function stock() {
  if (_sm.v !== DB.ver) { const m = {}; for (const x of DB.all('move')) m[x.pid] = r2((m[x.pid] || 0) + x.qty); _sm = { v: DB.ver, m } }
  return _sm.m;
}
const products = (all) => DB.all('product').filter(p => all || p.active !== false);
function addMove(pid, qty, reason, extra = {}) {
  if (!qty) return;
  DB.put('move', uid(), { pid, qty: r2(qty), reason, by: Auth.user ? Auth.user.id : '', t: Date.now(), ...extra });
}

/* ============ auth ============ */
async function sha(s) {
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  return sha256js(s); // same hash as crypto.subtle, so a PIN works on any device (even plain-HTTP LAN pages)
}
function sha256js(str) {
  const m = new TextEncoder().encode(str), K = [], H = [];
  const isP = x => { for (let i = 2; i * i <= x; i++) if (x % i === 0) return false; return true };
  for (let n = 2, c = 0; c < 64; n++) if (isP(n)) { if (c < 8) H[c] = (Math.sqrt(n) % 1) * 4294967296 | 0; K[c++] = (Math.cbrt(n) % 1) * 4294967296 | 0 }
  const l = m.length, w = [];
  for (let i = 0; i < l; i++) w[i >> 2] = (w[i >> 2] | 0) | (m[i] << (24 - (i % 4) * 8));
  w[l >> 2] = (w[l >> 2] | 0) | (0x80 << (24 - (l % 4) * 8));
  const total = (((l + 8) >> 6) + 1) << 4; w[total - 1] = l * 8;
  const W = new Array(64), h = H.slice();
  for (let j = 0; j < total; j += 16) {
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      if (i < 16) W[i] = w[j + i] | 0;
      else { const g0 = W[i - 15], g1 = W[i - 2]; W[i] = (W[i - 16] + (((g0 >>> 7) | (g0 << 25)) ^ ((g0 >>> 18) | (g0 << 14)) ^ (g0 >>> 3)) + W[i - 7] + (((g1 >>> 17) | (g1 << 15)) ^ ((g1 >>> 19) | (g1 << 13)) ^ (g1 >>> 10))) | 0 }
      const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
const Auth = {
  user: null,
  async login(userId, pin) {
    const u = DB.get('user', userId);
    if (!u || u.active === false) return false;
    if (await sha(u.salt + pin) !== u.hash) return false;
    this.user = u; localStorage.setItem('pos.session', u.id); return true;
  },
  restore() {
    const id = localStorage.getItem('pos.session'), u = id && DB.get('user', id);
    if (u && u.active !== false) { this.user = u; return true } return false;
  },
  logout() { this.user = null; localStorage.removeItem('pos.session') },
  isAdmin() { return !!this.user && this.user.role === 'admin' },
  async build({ name, username, role, pin }) { const salt = uid(); return { name, username: (username || name).trim(), role, salt, hash: await sha(salt + pin), active: true } }
};
