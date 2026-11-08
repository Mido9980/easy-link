/* EASY LINK — URL shortener with pluggable storage (EASY CODE) */
const CLOUD = 'https://shark-vision-labs.base44.app/functions/elApi';
const CFG_KEY = 'easylink.cfg';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------------- storage adapters ---------------- */
const DEFAULT_CFG = { mode: 'cloud' };
let CFG = readCfg();

function readCfg() {
  try { return { ...DEFAULT_CFG, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }; }
  catch { return { ...DEFAULT_CFG }; }
}
function saveCfg(c) { CFG = { ...DEFAULT_CFG, ...c }; localStorage.setItem(CFG_KEY, JSON.stringify(CFG)); }

const shortFor = code => `${location.origin}${location.pathname}?c=${code}`;

/* ---- localStorage adapter (works with no internet at all) ---- */
const localDB = {
  key: 'easylink.links',
  all() { return JSON.parse(localStorage.getItem(this.key) || '[]'); },
  save(l) { localStorage.setItem(this.key, JSON.stringify(l)); },
  async list() {
    const l = this.all();
    return { total_links: l.length, total_clicks: l.reduce((n, x) => n + (x.clicks || 0), 0), links: l };
  },
  async create({ url, code }) {
    const l = this.all();
    if (l.some(x => x.code === code)) throw new Error('الاسم محجوز');
    const rec = { code, url, clicks: 0, active: true, created: new Date().toISOString(), short: shortFor(code) };
    l.unshift(rec); this.save(l);
    return { ok: true, ...rec };
  },
  async resolve(code) {
    const x = this.all().find(i => i.code === code);
    if (!x || x.active === false) return null;
    x.clicks = (x.clicks || 0) + 1; this.save(this.all()); return x;
  },
  async toggle(code) {
    const l = this.all(); const x = l.find(i => i.code === code);
    if (!x) return { ok: false }; x.active = !x.active; this.save(l); return { ok: true, active: x.active };
  },
  async remove(code) { this.save(this.all().filter(i => i.code !== code)); return { ok: true }; },
};

/* ---- Supabase adapter (REST API, no SDK needed) ---- */
const supa = {
  base() {
    const u = (CFG.sbUrl || '').replace(/\/+$/, '');
    const t = CFG.sbTable || 'links';
    return { url: `${u}/rest/v1/${t}`, headers: { apikey: CFG.sbKey, Authorization: `Bearer ${CFG.sbKey}`, 'Content-Type': 'application/json' } };
  },
  async list() {
    const { url, headers } = this.base();
    const rows = await (await fetch(`${url}?select=*&order=created_at.desc&limit=200`, { headers })).json();
    if (!Array.isArray(rows)) throw new Error(rows.message || 'تعذر قراءة الجدول');
    return {
      total_links: rows.length,
      total_clicks: rows.reduce((n, r) => n + (r.clicks || 0), 0),
      links: rows.map(r => ({ code: r.code, url: r.url, clicks: r.clicks || 0, active: r.active !== false, short: shortFor(r.code), created: r.created_at })),
    };
  },
  async create({ url: target, code }) {
    const { url, headers } = this.base();
    const res = await fetch(url, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify([{ code, url: target, clicks: 0, active: true }]) });
    if (!res.ok) throw new Error((await res.text()).slice(0, 140));
    return { ok: true, code, url: target, short: shortFor(code), clicks: 0 };
  },
  async resolve(code) {
    const { url, headers } = this.base();
    const rows = await (await fetch(`${url}?code=eq.${encodeURIComponent(code)}&select=*`, { headers })).json();
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r || r.active === false) return null;
    fetch(`${url}?code=eq.${encodeURIComponent(code)}`, { method: 'PATCH', headers, body: JSON.stringify({ clicks: (r.clicks || 0) + 1 }) }).catch(() => {});
    return r;
  },
  async toggle(code) {
    const { url, headers } = this.base();
    const rows = await (await fetch(`${url}?code=eq.${encodeURIComponent(code)}&select=*`, { headers })).json();
    const r = rows && rows[0]; if (!r) return { ok: false };
    await fetch(`${url}?code=eq.${encodeURIComponent(code)}`, { method: 'PATCH', headers, body: JSON.stringify({ active: r.active === false }) });
    return { ok: true, active: r.active === false };
  },
  async remove(code) {
    const { url, headers } = this.base();
    await fetch(`${url}?code=eq.${encodeURIComponent(code)}`, { method: 'DELETE', headers });
    return { ok: true };
  },
};

/* ---- custom REST adapter (your own API) ---- */
const custom = {
  async list() {
    const r = await (await fetch(CFG.cApiList)).json();
    const links = (r.links || r.data || r || []).map(x => ({ ...x, short: x.short || shortFor(x.code) }));
    return { total_links: links.length, total_clicks: links.reduce((n, x) => n + (x.clicks || 0), 0), links };
  },
  async create({ url, code }) {
    const r = await (await fetch(CFG.cApiCreate, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, url }) })).json();
    if (r.error) throw new Error(r.error);
    return { ok: true, code, url, short: shortFor(code) };
  },
  async resolve(code) {
    const u = CFG.cApiGet.replace('{code}', encodeURIComponent(code));
    return await (await fetch(u)).json();
  },
  async toggle(code) { await fetch(CFG.cApiToggle, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }); return { ok: true }; },
  async remove(code) { await fetch(CFG.cApiDelete, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }); return { ok: true }; },
};

/* ---- EASY CODE cloud adapter (default, shared database) ---- */
const cloud = {
  async list() {
    const r = await (await fetch(CLOUD)).json();
    return { ...r, links: (r.links || []).map(l => ({ ...l, short: shortFor(l.code) })) };
  },
  async create({ url, code }) {
    const r = await (await fetch(CLOUD, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', url, slug: code }) })).json();
    if (!r.ok) throw new Error(r.error || 'فشل الحفظ');
    return { ...r, short: shortFor(r.code) };
  },
  async resolve(code) {
    const r = await (await fetch(`${CLOUD}?c=${encodeURIComponent(code)}`)).json();
    if (!r.ok) return null;
    fetch(CLOUD, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'touch', code }) }).catch(() => {});
    return { ...r, url: r.url };
  },
  async toggle(code) {
    const r = await (await fetch(CLOUD, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle', code }) })).json();
    return r;
  },
  async remove(code) {
    await fetch(CLOUD, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', code }) });
    return { ok: true };
  },
};

const DB = () => ({ cloud, supabase: supa, custom, local: localDB })[CFG.mode] || cloud;

/* ---------------- redirect handler ---------------- */
async function handleRedirect() {
  const code = new URLSearchParams(location.search).get('c');
  if (!code) return false;
  try {
    const hit = await DB().resolve(code);
    if (hit && hit.url) { location.replace(hit.url); return true; }
    document.body.innerHTML = `<div class="deadend"><h2>الرابط غير موجود</h2><p>يمكن اتحذف أو اتوقف.</p><a href="./">رجوع لأداة الاختصار</a></div>`;
    return true;
  } catch (e) {
    document.body.innerHTML = `<div class="deadend"><h2>تعذر فتح الرابط</h2><p>${esc(e.message)}</p><a href="./">رجوع</a></div>`;
    return true;
  }
}

/* ---------------- ui helpers ---------------- */
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2000); }
function copy(txt) {
  if (!txt) return toast('مفيش حاجة تنسخها');
  navigator.clipboard?.writeText(txt).then(() => toast('اتنسخ ✓')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove(); toast('اتنسخ ✓');
  });
}
const rand = (n = 6) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); };

/* ---------------- create ---------------- */
$('#go').onclick = create;
$('#long').addEventListener('keydown', e => { if (e.key === 'Enter') create(); });

async function create() {
  let url = $('#long').value.trim();
  if (!url) return toast('الصق اللينك الأول');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const btn = $('#go'); btn.disabled = true; btn.textContent = '...';
  try {
    const code = rand(6);
    const r = await DB().create({ url, code });
    showResult({ ...r, short: r.short || shortFor(r.code) });
    $('#long').value = '';
    loadList();
  } catch (e) { toast(e.message || 'فشل، جرّب تاني'); }
  finally { btn.disabled = false; btn.textContent = 'اختصر الرابط'; }
}

function showResult(r) {
  const box = $('#result'); box.classList.remove('hidden');
  box.innerHTML = `<div class="lbl">لينكك القصير</div>
    <span class="short">${esc(r.short)}</span>
    <div class="actions">
      <button class="mini" data-copy="${esc(r.short)}" type="button">نسخ</button>
      <button class="mini" data-open="${esc(r.short)}" type="button">فتح</button>
      <button class="mini" data-qr="${esc(r.short)}" data-code="${esc(r.code)}" type="button">QR</button>
      <button class="mini" data-share="${esc(r.short)}" type="button">مشاركة</button>
    </div>`;
  bindActions(box);
}

/* ---------------- list ---------------- */
async function loadList() {
  $('#modeTag').textContent = ({ cloud: 'سحابة EASY CODE', supabase: 'Supabase', custom: 'API خاص', local: 'على الجهاز' })[CFG.mode];
  try {
    const r = await DB().list();
    $('#statsPill').textContent = `${r.total_links || 0} رابط · ${r.total_clicks || 0} نقرة`;
    const list = r.links || [];
    $('#list').innerHTML = list.length ? list.map(l => `<div class="item">
      <div class="top"><span class="code">?c=${esc(l.code)}</span><span class="clicks">${l.clicks || 0} نقرة ${l.active === false ? '· موقوف' : ''}</span></div>
      <div class="dest">${esc(l.url)}</div>
      <div class="row">
        <button class="mini" data-copy="${esc(l.short)}" type="button">نسخ</button>
        <button class="mini" data-open="${esc(l.short)}" type="button">فتح</button>
        <button class="mini" data-qr="${esc(l.short)}" data-code="${esc(l.code)}" type="button">QR</button>
        <button class="mini" data-share="${esc(l.short)}" type="button">مشاركة</button>
        <button class="mini" data-toggle="${esc(l.code)}" type="button">${l.active === false ? 'تشغيل' : 'إيقاف'}</button>
        <button class="mini danger" data-del="${esc(l.code)}" type="button">حذف</button>
      </div></div>`).join('') : '<p class="hint">لسه مفيش روابط.</p>';
    bindActions($('#list'));
  } catch (e) {
    $('#list').innerHTML = `<p class="hint">${esc(e.message || 'مش قادر أجيب القائمة')} — راجع إعدادات قاعدة البيانات.</p>`;
  }
}

function bindActions(root) {
  root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy));
  root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => window.open(b.dataset.open, '_blank'));
  root.querySelectorAll('[data-qr]').forEach(b => b.onclick = () => showQr(b.dataset.qr, b.dataset.code));
  root.querySelectorAll('[data-share]').forEach(b => b.onclick = async () => {
    if (navigator.share) { try { await navigator.share({ text: b.dataset.share }); } catch (e) {} } else copy(b.dataset.share);
  });
  root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => { await DB().toggle(b.dataset.toggle); loadList(); });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('تحذف الرابط نهائي؟')) return;
    await DB().remove(b.dataset.del); loadList();
  });
}

/* ---------------- qr ---------------- */
function showQr(short, code) {
  $('#qrTitle').textContent = '?c=' + code;
  $('#qrShort').textContent = short;
  $('#qrImg').src = 'https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=10&data=' + encodeURIComponent(short);
  $('#qrSheet').classList.add('on');
}
$('#qrClose').onclick = () => $('#qrSheet').classList.remove('on');
$('#qrSheet').onclick = e => { if (e.target.id === 'qrSheet') $('#qrSheet').classList.remove('on'); };

/* ---------------- settings ---------------- */
$('#btnSettings').onclick = () => {
  $('#setMode').value = CFG.mode;
  $('#sbUrl').value = CFG.sbUrl || ''; $('#sbKey').value = CFG.sbKey || ''; $('#sbTable').value = CFG.sbTable || 'links';
  $('#cCreate').value = CFG.cApiCreate || ''; $('#cList').value = CFG.cApiList || '';
  $('#cGet').value = CFG.cApiGet || ''; $('#cToggle').value = CFG.cApiToggle || ''; $('#cDelete').value = CFG.cApiDelete || '';
  showPanels(); $('#setSheet').classList.add('on');
};
$('#setMode').onchange = showPanels;
function showPanels() {
  const m = $('#setMode').value;
  $('#panSupa').classList.toggle('hidden', m !== 'supabase');
  $('#panCustom').classList.toggle('hidden', m !== 'custom');
  $('#panLocal').classList.toggle('hidden', m !== 'local');
  $('#panCloud').classList.toggle('hidden', m !== 'cloud');
}
$('#setSave').onclick = () => {
  saveCfg({
    mode: $('#setMode').value,
    sbUrl: $('#sbUrl').value.trim(), sbKey: $('#sbKey').value.trim(), sbTable: $('#sbTable').value.trim() || 'links',
    cApiCreate: $('#cCreate').value.trim(), cApiList: $('#cList').value.trim(),
    cApiGet: $('#cGet').value.trim(), cApiToggle: $('#cToggle').value.trim(), cApiDelete: $('#cDelete').value.trim(),
  });
  $('#setSheet').classList.remove('on');
  toast('اتحفظ ✓'); loadList();
};
$('#setClose').onclick = () => $('#setSheet').classList.remove('on');
$('#copySql').onclick = () => copy(`create table if not exists links (
  id bigint generated by default as identity primary key,
  code text unique not null,
  url text not null,
  clicks int default 0,
  active boolean default true,
  created_at timestamptz default now()
);
alter table links enable row level security;
create policy "public read" on links for select using (true);
create policy "public insert" on links for insert with check (true);
create policy "public update" on links for update using (true);`);

/* ---------------- boot ---------------- */
(async () => {
  if (await handleRedirect()) return;
  loadList();
})();
