(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { workspace: null, classId: null, className: '', date: todayStr() };
  const sb = () => window.docenciaSupabase;
  const STATUS = [
    { id: 'present', label: 'Presente', short: 'P', color: '#087443', bg: '#ecfdf3' },
    { id: 'absent', label: 'Ausente', short: 'A', color: '#b42318', bg: '#fff0ef' },
    { id: 'late', label: 'Tardanza', short: 'T', color: '#a15c00', bg: '#fff7df' },
    { id: 'excused', label: 'Justificado', short: 'J', color: '#5645d5', bg: '#f0edff' }
  ];

  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function fmtDate(d) { const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('es-NI', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function addDays(dateStr, n) { const dt = new Date(dateStr + 'T00:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); }

  const style = document.createElement('style');
  style.textContent = `
    .at-wrap{display:flex;flex-direction:column;gap:16px}
    .at-datebar{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e8e9ef;border-radius:14px;padding:11px 14px;flex-wrap:wrap}
    .at-nav-btn{width:32px;height:32px;border-radius:9px;border:1px solid #e2e3e9;background:#fff;font-weight:900;cursor:pointer}
    .at-date-label{font-weight:850;font-size:13px;text-transform:capitalize;flex:1}
    .at-date-input{border:1px solid #e2e3e9;border-radius:9px;padding:7px 9px;font-size:11px}
    .at-today-btn{border:0;background:#f0edff;color:#5645d5;border-radius:9px;padding:8px 12px;font-size:10.5px;font-weight:850;cursor:pointer}
    .at-bulk{display:flex;gap:7px;flex-wrap:wrap}
    .at-bulk button{border:1px solid #e2e3e9;background:#fff;border-radius:9px;padding:8px 12px;font-size:10px;font-weight:800;cursor:pointer}
    .at-list{display:flex;flex-direction:column;gap:8px}
    .at-row{background:#fff;border:1px solid #e8e9ef;border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .at-avatar{width:30px;height:30px;border-radius:50%;background:#f0edff;color:#5645d5;display:grid;place-items:center;font-size:10px;font-weight:900;flex:0 0 auto}
    .at-name{font-weight:800;font-size:12px;flex:1;min-width:120px}
    .at-chips{display:flex;gap:6px}
    .at-chip{width:36px;height:36px;border-radius:10px;border:1.5px solid #e2e3e9;background:#fff;font-weight:900;font-size:11px;cursor:pointer;color:#9aa0aa}
    .at-chip.active{border-color:transparent}
    .at-note{border:1px solid #e2e3e9;border-radius:8px;padding:6px 9px;font-size:10.5px;width:130px}
    .at-summary{border:1px solid #e8e9ef;border-radius:14px;background:#fff;padding:14px}
    .at-sum-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #f1f1f6}
    .at-sum-row:first-child{border-top:0}
    .at-sum-name{flex:1;font-size:11.5px;font-weight:750}
    .at-sum-bar{width:90px;height:6px;border-radius:99px;background:#eef0f5;overflow:hidden}
    .at-sum-fill{height:100%;background:#5b4ce2}
    .at-sum-pct{font-size:10.5px;font-weight:850;width:36px;text-align:right}
    .at-tabs{display:flex;background:#fff;border:1px solid #e8e9ef;border-radius:9px;padding:2px;width:fit-content}
    .at-tabs button{border:0;background:transparent;padding:7px 12px;border-radius:7px;color:#858c99;font-size:10px;font-weight:800;cursor:pointer}
    .at-tabs button.active{background:#f0edff;color:#5848d8}
    html.d360-dark .at-datebar,html.d360-dark .at-row,html.d360-dark .at-summary,html.d360-dark .at-tabs{background:#151728;color:#f4f5fb;border-color:#292b40}
    html.d360-dark .at-nav-btn,html.d360-dark .at-date-input,html.d360-dark .at-note,html.d360-dark .at-bulk button{background:#191b2d;color:#f4f5fb;border-color:#303247}
    html.d360-dark .at-sum-bar{background:#292b40}
    @media(max-width:620px){.at-row{flex-direction:column;align-items:stretch}.at-chips{justify-content:space-between}.at-note{width:100%}}
  `;
  document.head.appendChild(style);

  async function identify() {
    const ws = document.getElementById('d360-class-workspace');
    if (!ws || !sb()) return false;
    state.workspace = ws;
    if (!ws.dataset.classId) throw new Error('No pudimos identificar la clase.');
    state.classId = ws.dataset.classId; state.className = ws.dataset.className || '';
    return true;
  }

  function main() { return state.workspace?.querySelector('.cw-main'); }

  async function showAttendance() {
    const m = main(); if (!m) return;
    m.innerHTML = `<div class="cw-top"><div><div class="cw-kicker">Asistencia</div><h1 class="cw-title">${esc(state.className)}</h1><div class="cw-meta">Pasa lista por día y consulta el historial</div></div></div>
      <div class="at-tabs" style="margin-top:16px"><button class="active" data-tab="day">Por día</button><button data-tab="summary">Resumen</button></div>
      <div class="at-wrap" style="margin-top:14px">${window.D360 ? window.D360.skeletonList(3) : 'Cargando…'}</div>`;
    m.querySelectorAll('.at-tabs button').forEach(b => b.onclick = () => {
      m.querySelectorAll('.at-tabs button').forEach(x => x.classList.remove('active')); b.classList.add('active');
      b.dataset.tab === 'day' ? renderDay() : renderSummary();
    });
    renderDay();
  }

  async function renderDay() {
    const wrap = document.querySelector('.at-wrap'); if (!wrap) return;
    wrap.innerHTML = window.D360 ? window.D360.skeletonList(3) : 'Cargando…';
    const r = await sb().rpc('get_attendance_for_date', { p_class_id: state.classId, p_date: state.date });
    if (r.error) { wrap.innerHTML = `<div class="cw-empty">No pudimos cargar la asistencia. ${esc(r.error.message)}</div>`; return; }
    const students = r.data || [];
    const isFuture = state.date > todayStr();
    wrap.innerHTML = `
      <div class="at-datebar">
        <button class="at-nav-btn" id="at-prev">←</button>
        <div class="at-date-label">${fmtDate(state.date)}</div>
        <input type="date" class="at-date-input" id="at-date-pick" value="${state.date}" max="${todayStr()}">
        <button class="at-nav-btn" id="at-next" ${state.date >= todayStr() ? 'disabled' : ''}>→</button>
        ${state.date !== todayStr() ? '<button class="at-today-btn" id="at-today">Hoy</button>' : ''}
      </div>
      ${!students.length ? '<div class="cw-empty">Todavía no hay estudiantes en esta clase.</div>' : `
      <div class="at-bulk"><button data-all="present">✓ Marcar todos presentes</button><button data-all="absent">Marcar todos ausentes</button></div>
      <div class="at-list" id="at-list">${students.map(s => rowHtml(s)).join('')}</div>`}
    `;
    if (isFuture) { wrap.querySelector('.at-list')?.insertAdjacentHTML('beforebegin', '<div class="cw-empty">No puedes pasar asistencia de un día que aún no llega.</div>'); return; }
    wrap.querySelector('#at-prev').onclick = () => { state.date = addDays(state.date, -1); renderDay(); };
    wrap.querySelector('#at-next').onclick = () => { state.date = addDays(state.date, 1); renderDay(); };
    wrap.querySelector('#at-today')?.addEventListener('click', () => { state.date = todayStr(); renderDay(); });
    wrap.querySelector('#at-date-pick').onchange = e => { state.date = e.target.value; renderDay(); };
    wrap.querySelectorAll('[data-all]').forEach(b => b.onclick = () => {
      wrap.querySelectorAll('.at-row').forEach(row => setStatus(row, b.dataset.all));
      saveAll(students, wrap);
    });
    wrap.querySelectorAll('.at-chip').forEach(chip => chip.onclick = () => {
      const row = chip.closest('.at-row'); setStatus(row, chip.dataset.status);
      saveAll(students, wrap);
    });
    wrap.querySelectorAll('.at-note').forEach(input => input.addEventListener('change', () => saveAll(students, wrap)));
  }

  function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join(''); }

  function rowHtml(s) {
    return `<div class="at-row" data-roster="${esc(s.roster_id)}" data-status="${s.status || ''}"><span class="at-avatar">${esc(initials(s.full_name))}</span><span class="at-name">${esc(s.full_name)}</span><div class="at-chips">${STATUS.map(st => `<button type="button" class="at-chip ${s.status === st.id ? 'active' : ''}" data-status="${st.id}" style="${s.status === st.id ? `background:${st.bg};color:${st.color};border-color:${st.color}` : ''}" title="${st.label}">${st.short}</button>`).join('')}</div><input type="text" class="at-note" placeholder="Nota (opcional)" value="${esc(s.note || '')}"></div>`;
  }

  function setStatus(row, statusId) {
    const st = STATUS.find(x => x.id === statusId);
    row.querySelectorAll('.at-chip').forEach(c => {
      const active = c.dataset.status === statusId;
      c.classList.toggle('active', active);
      c.style.cssText = active ? `background:${st.bg};color:${st.color};border-color:${st.color}` : '';
    });
    row.dataset.status = statusId;
  }

  async function saveAll(students, wrap) {
    const records = [...wrap.querySelectorAll('.at-row')].map(row => ({
      roster_id: row.dataset.roster,
      status: row.dataset.status,
      note: row.querySelector('.at-note').value.trim()
    })).filter(r => r.status);
    if (!records.length) return;
    const r = await sb().rpc('save_attendance', { p_class_id: state.classId, p_date: state.date, p_records: records });
    if (r.error) { window.D360?.toast('No se pudo guardar: ' + r.error.message, 'error'); return; }
    window.D360?.toast('Asistencia guardada.', 'success');
  }

  async function renderSummary() {
    const wrap = document.querySelector('.at-wrap'); if (!wrap) return;
    wrap.innerHTML = window.D360 ? window.D360.skeletonList(3) : 'Cargando…';
    const r = await sb().rpc('get_attendance_summary', { p_class_id: state.classId });
    if (r.error) { wrap.innerHTML = `<div class="cw-empty">${esc(r.error.message)}</div>`; return; }
    const rows = r.data || [];
    if (!rows.length) { wrap.innerHTML = '<div class="cw-empty">Todavía no hay estudiantes en esta clase.</div>'; return; }
    const withData = rows.filter(s => s.total_sessions > 0);
    wrap.innerHTML = `<div class="at-summary">${!withData.length ? '<div class="cw-empty" style="border:0">Aún no has pasado asistencia en esta clase.</div>' : rows.map(s => `<div class="at-sum-row"><span class="at-sum-name">${esc(s.full_name)}</span><span style="font-size:9px;color:#9aa0aa">${s.total_sessions} día${s.total_sessions === 1 ? '' : 's'}</span><div class="at-sum-bar"><div class="at-sum-fill" style="width:${s.attendance_pct || 0}%"></div></div><span class="at-sum-pct">${s.attendance_pct != null ? s.attendance_pct + '%' : '—'}</span></div>`).join('')}</div>`;
  }

  async function bind() {
    const ws = document.getElementById('d360-class-workspace');
    if (!ws || ws === state.workspace || !sb()) return;
    try {
      await identify();
      const nav = [...ws.querySelectorAll('.cw-nav button')].find(b => b.textContent.includes('Asistencia'));
      if (nav) nav.onclick = showAttendance;
    } catch (e) { console.error('teacher-attendance bind failed', e); }
  }
  const watch = () => { bind().finally(() => setTimeout(watch, 500)); };
  watch();
})();
