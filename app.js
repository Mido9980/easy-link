/* EASY LINK — URL shortener front end (EASY CODE) */
const API = 'https://shark-vision-labs.base44.app/functions/elApi';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let toastT;
function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2000);
}
function copy(txt) {
  if (!txt) return toast('مفيش حاجة تنسخها');
  navigator.clipboard?.writeText(txt).then(() => toast('اتنسخ ✓')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove(); toast('اتنسخ ✓');
  });
}

/* ---------- create ---------- */
$('#go').onclick = create;
$('#long').addEventListener('keydown', e => { if (e.key === 'Enter') create(); });

async function create() {
  const url = $('#long').value.trim();
  if (!url) return toast('اكتب الرابط الأول');
  const btn = $('#go'); btn.disabled = true; btn.textContent = '...';
  try {
    const r = await (await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', url })
    })).json();
    if (!r.ok) { toast(r.error || 'فشل'); return; }
    showResult(r);
    $('#long').value = '';
    loadList();
  } catch (e) { toast('مشكلة اتصال، جرّب تاني'); }
  finally { btn.disabled = false; btn.textContent = 'اختصر الرابط'; }
}

function showResult(r) {
  const box = $('#result'); box.classList.remove('hidden');
  box.innerHTML = `<div class="lbl">الرابط القصير</div>
    <span class="short">${esc(r.short)}</span>
    <div class="actions">
      <button class="mini" data-copy="${esc(r.short)}" type="button">نسخ</button>
      <button class="mini" data-open="${esc(r.short)}" type="button">فتح</button>
      <button class="mini" data-qr="${esc(r.short)}" data-code="${esc(r.code)}" type="button">QR</button>
      <button class="mini" data-share="${esc(r.short)}" type="button">مشاركة</button>
    </div>`;
  bindActions(box);
}

/* ---------- list ---------- */
async function loadList() {
  try {
    const r = await (await fetch(API)).json();
    $('#statsPill').textContent = `${r.total_links} رابط · ${r.total_clicks} نقرة`;
    const list = r.links || [];
    $('#list').innerHTML = list.length ? list.map(l => `<div class="item">
      <div class="top">
        <span class="code">/${esc(l.code)}</span>
        <span class="clicks">${l.clicks} نقرة ${l.active ? '' : '· موقوف'}</span>
      </div>
      <div class="dest">${esc(l.url)}</div>
      <div class="row">
        <button class="mini" data-copy="${esc(l.short)}" type="button">نسخ</button>
        <button class="mini" data-open="${esc(l.short)}" type="button">فتح</button>
        <button class="mini" data-qr="${esc(l.short)}" data-code="${esc(l.code)}" type="button">QR</button>
        <button class="mini" data-share="${esc(l.short)}" type="button">مشاركة</button>
        <button class="mini" data-toggle="${esc(l.code)}" type="button">${l.active ? 'إيقاف' : 'تشغيل'}</button>
        <button class="mini danger" data-del="${esc(l.code)}" type="button">حذف</button>
      </div></div>`).join('') : '<p class="hint">لسه مفيش روابط. اختصر أول رابط من فوق.</p>';
    bindActions($('#list'));
  } catch (e) {
    $('#list').innerHTML = '<p class="hint">مش قادر أجيب القائمة. اتأكد من النت وجرب "تحديث".</p>';
  }
}

function bindActions(root) {
  root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy));
  root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => window.open(b.dataset.open, '_blank'));
  root.querySelectorAll('[data-qr]').forEach(b => b.onclick = () => showQr(b.dataset.qr, b.dataset.code));
  root.querySelectorAll('[data-share]').forEach(b => b.onclick = async () => {
    const data = { title: 'EASY LINK', text: b.dataset.share, url: b.dataset.share };
    if (navigator.share) { try { await navigator.share(data); } catch (e) {} } else copy(b.dataset.share);
  });
  root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
    const r = await (await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', code: b.dataset.toggle })
    })).json();
    toast(r.ok ? (r.active ? 'اتشغّل' : 'اتوقف') : 'فشل'); loadList();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('تحذف الرابط ده نهائي؟')) return;
    const r = await (await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', code: b.dataset.del })
    })).json();
    toast(r.ok ? 'اتحذف' : 'فشل'); loadList();
  });
}

/* ---------- qr ---------- */
function showQr(short, code) {
  $('#qrTitle').textContent = '/' + code;
  $('#qrShort').textContent = short;
  $('#qrImg').src = 'https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=10&data=' + encodeURIComponent(short);
  $('#qrSheet').classList.add('on');
}
$('#qrClose').onclick = () => $('#qrSheet').classList.remove('on');
$('#qrSheet').onclick = e => { if (e.target.id === 'qrSheet') $('#qrSheet').classList.remove('on'); };

$('#refresh').onclick = loadList;

/* ---------- boot ---------- */
loadList();
