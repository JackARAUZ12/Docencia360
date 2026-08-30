(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { workspace: null, classId: null, className: '', classInfo: null };
  const sb = () => window.docenciaSupabase;

  const STATUS = {
    planned: { label: 'Planificada', color: '#5645d5', bg: '#f0edff' },
    in_progress: { label: 'En curso', color: '#0a6cd9', bg: '#e8f3ff' },
    done: { label: 'Realizada', color: '#087443', bg: '#ecfdf3' },
    rescheduled: { label: 'Reprogramada', color: '#a15c00', bg: '#fff7df' },
    cancelled: { label: 'Cancelada', color: '#b42318', bg: '#fff0ef' },
    not_done: { label: 'No realizada', color: '#6b7280', bg: '#f1f2f5' }
  };
  const METHODS = ['Exposición', 'Aprendizaje colaborativo', 'Resolución de problemas', 'Aprendizaje basado en proyectos', 'Debate', 'Práctica guiada', 'Trabajo individual', 'Trabajo grupal', 'Otro'];

  const style = document.createElement('style');
  style.textContent = `
    .pl-tabs{display:flex;background:#fff;border:1px solid #e8e9ef;border-radius:9px;padding:2px;width:fit-content;margin-top:16px}
    .pl-tabs button{border:0;background:transparent;padding:8px 13px;border-radius:7px;color:#858c99;font-size:10.5px;font-weight:800;cursor:pointer}
    .pl-tabs button.active{background:#f0edff;color:#5848d8}
    .pl-body{margin-top:14px}
    .pl-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
    .pl-stat{background:#fff;border:1px solid #e8e9ef;border-radius:13px;padding:13px;text-align:center}
    .pl-stat span{font-size:8.5px;color:#8b92a0;font-weight:750;text-transform:uppercase}
    .pl-stat strong{display:block;font-size:19px;margin-top:3px}
    .pl-toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px}
    .pl-btn{border:0;background:#5b4ce2;color:#fff;border-radius:9px;padding:9px 13px;font-size:10.5px;font-weight:850;cursor:pointer}
    .pl-btn.ghost{background:#f0edff;color:#5645d5}
    .pl-day-group{margin-bottom:10px}
    .pl-day-label{font-size:9.5px;font-weight:850;color:#9aa0aa;text-transform:uppercase;margin-bottom:6px}
    .pl-session{background:#fff;border:1px solid #e8e9ef;border-radius:13px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;margin-bottom:7px}
    .pl-session:hover{border-color:#c9c2ff}
    .pl-session-title{font-weight:800;font-size:12px}
    .pl-session-sub{font-size:9.5px;color:#9aa0aa;margin-top:2px}
    .pl-badge{font-size:9px;font-weight:850;padding:5px 9px;border-radius:999px;white-space:nowrap}
    .pl-units{display:flex;flex-direction:column;gap:10px}
    .pl-unit{background:#fff;border:1px solid #e8e9ef;border-radius:14px;padding:15px}
    .pl-unit-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
    .pl-unit-title{font-weight:850;font-size:13px}
    .pl-unit-dates{font-size:9.5px;color:#9aa0aa}
    .pl-bar{height:7px;border-radius:99px;background:#eef0f5;overflow:hidden;margin-top:9px}
    .pl-bar-fill{height:100%;background:#5b4ce2}
    .pl-unit-pct{font-size:10px;font-weight:850;color:#5645d5;margin-top:5px}
    .pl-modal-body .field{display:flex;flex-direction:column;gap:5px;margin-bottom:11px}
    .pl-modal-body label{font-size:10px;font-weight:800;color:#5a6272}
    .pl-modal-body input,.pl-modal-body textarea,.pl-modal-body select{border:1px solid #e2e3e9;border-radius:9px;padding:9px 10px;font-size:11px;font-family:inherit;width:100%}
    .pl-modal-body textarea{min-height:60px}
    .pl-chips{display:flex;flex-wrap:wrap;gap:6px}
    .pl-chip{border:1.5px solid #e2e3e9;background:#fff;border-radius:999px;padding:6px 11px;font-size:10px;font-weight:750;cursor:pointer}
    .pl-chip.active{background:#5b4ce2;color:#fff;border-color:#5b4ce2}
    .pl-list-add{display:flex;gap:6px;margin-bottom:6px}
    .pl-list-add input{flex:1}
    .pl-tag-row{display:flex;justify-content:space-between;align-items:center;background:#f7f7fb;border-radius:8px;padding:7px 10px;font-size:11px;margin-bottom:6px}
    .pl-tag-row button{border:0;background:none;color:#b42318;font-weight:900;cursor:pointer}
    .pl-status-row{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 14px}
    .pl-status-chip{border:1.5px solid #e2e3e9;border-radius:999px;padding:7px 11px;font-size:9.5px;font-weight:800;cursor:pointer;background:#fff}
    .pl-status-chip.active{border-color:transparent}
    .pl-section-title{font-size:10px;font-weight:850;color:#5a6272;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.03em}
    html.d360-dark .pl-tabs,html.d360-dark .pl-stat,html.d360-dark .pl-session,html.d360-dark .pl-unit{background:#151728;color:#f4f5fb;border-color:#292b40}
    html.d360-dark .pl-modal-body input,html.d360-dark .pl-modal-body textarea,html.d360-dark .pl-modal-body select,html.d360-dark .pl-chip,html.d360-dark .pl-status-chip,html.d360-dark .pl-btn.ghost{background:#191b2d;color:#f4f5fb;border-color:#303247}
    html.d360-dark .pl-tag-row{background:#191b2d}
    html.d360-dark .pl-bar{background:#292b40}
    @media(max-width:620px){.pl-stats{grid-template-columns:1fr 1fr}.pl-stats .pl-stat:nth-child(3){grid-column:1/-1}.pl-session{flex-direction:column;align-items:flex-start}}
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

  async function showPlanning() {
    const m = main(); if (!m) return;
    m.innerHTML = `<div class="cw-top"><div><div class="cw-kicker">Planificación docente</div><h1 class="cw-title">${esc(state.className)}</h1><div class="cw-meta" id="pl-period"></div></div></div>
      <div class="pl-tabs"><button class="active" data-tab="sesiones">Sesiones</button><button data-tab="unidades">Unidades</button></div>
      <div class="pl-body">${window.D360 ? window.D360.skeletonList(3) : 'Cargando…'}</div>`;
    m.querySelectorAll('.pl-tabs button').forEach(b => b.onclick = () => {
      m.querySelectorAll('.pl-tabs button').forEach(x => x.classList.remove('active')); b.classList.add('active');
      b.dataset.tab === 'sesiones' ? renderSessionsTab() : renderUnitsTab();
    });
    const cls = await sb().rpc('get_my_teacher_class', { p_class_id: state.classId });
    state.classInfo = cls.error ? null : (Array.isArray(cls.data) ? cls.data[0] : cls.data);
    const periodEl = document.getElementById('pl-period');
    if (periodEl && state.classInfo?.start_date) {
      periodEl.textContent = `${new Date(state.classInfo.start_date + 'T00:00:00').toLocaleDateString('es-NI', { day: 'numeric', month: 'long' })} – ${new Date(state.classInfo.end_date + 'T00:00:00').toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }
    renderSessionsTab();
  }

  async function renderSessionsTab() {
    const body = document.querySelector('.pl-body'); if (!body) return;
    body.innerHTML = window.D360 ? window.D360.skeletonList(3) : 'Cargando…';
    if (!state.classInfo?.start_date) {
      body.innerHTML = `<div class="cw-empty">Esta clase no tiene período ni horario configurado (fue creada antes de este módulo). Crea una clase nueva con período y horario para usar la planificación automática.</div>`;
      return;
    }
    const ov = await sb().rpc('get_planning_overview', { p_class_id: state.classId });
    const sess = await sb().rpc('get_class_sessions', { p_class_id: state.classId });
    const o = ov.error ? {} : (Array.isArray(ov.data) ? ov.data[0] : ov.data) || {};
    const sessions = sess.error ? [] : (sess.data || []);
    body.innerHTML = `
      <section class="pl-stats">
        <div class="pl-stat"><span>Sesiones</span><strong>${o.total_sessions ?? 0}</strong></div>
        <div class="pl-stat"><span>Realizadas</span><strong>${o.done_sessions ?? 0} / ${o.total_sessions ?? 0}</strong></div>
        <div class="pl-stat"><span>Avance</span><strong>${o.progress_pct != null ? o.progress_pct + '%' : '—'}</strong></div>
      </section>
      <div class="pl-toolbar"><button class="pl-btn ghost" id="pl-regen">Regenerar sesiones</button></div>
      <div id="pl-sessions-list">${sessions.length ? '' : '<div class="cw-empty">Todavía no hay sesiones. Pulsa "Regenerar sesiones".</div>'}</div>
    `;
    document.getElementById('pl-regen').onclick = async () => {
      const r = await sb().rpc('generate_class_sessions', { p_class_id: state.classId });
      if (r.error) { window.D360?.toast(translateErr(r.error.message), 'error'); return; }
      window.D360?.toast(`${r.data} sesión(es) nuevas generadas.`, 'success');
      renderSessionsTab();
    };
    const listHost = document.getElementById('pl-sessions-list');
    const groups = {};
    sessions.forEach(s => { const key = new Date(s.session_date + 'T00:00:00').toLocaleDateString('es-NI', { month: 'long', year: 'numeric' }); (groups[key] ||= []).push(s); });
    listHost.innerHTML = Object.entries(groups).map(([label, items]) => `<div class="pl-day-group"><div class="pl-day-label">${esc(label)}</div>${items.map(s => sessionRow(s)).join('')}</div>`).join('');
    listHost.querySelectorAll('[data-session]').forEach(row => row.onclick = () => openSessionModal(row.dataset.session));
  }

  function sessionRow(s) {
    const st = STATUS[s.status] || STATUS.planned;
    const d = new Date(s.session_date + 'T00:00:00').toLocaleDateString('es-NI', { weekday: 'short', day: 'numeric' });
    return `<div class="pl-session" data-session="${s.id}"><div><div class="pl-session-title">${d} · Sesión ${s.sequence_number}${s.topic ? ' — ' + esc(s.topic) : ''}</div><div class="pl-session-sub">${s.unit_title ? esc(s.unit_title) : 'Sin unidad'}${s.original_date ? ' · reprogramada' : ''}</div></div><span class="pl-badge" style="background:${st.bg};color:${st.color}">${st.label}</span></div>`;
  }

  function translateErr(msg) {
    const map = { class_has_no_period: 'Esta clase no tiene período configurado.', class_has_no_schedule: 'Esta clase no tiene horario configurado.', class_not_found: 'No pudimos identificar la clase.' };
    return map[msg] || msg;
  }

  async function openSessionModal(sessionId) {
    const back = document.createElement('div'); back.className = 'ta-modal-back';
    back.innerHTML = `<section class="ta-modal">${window.D360 ? window.D360.skeletonList(3) : 'Cargando…'}</section>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    const [detail, units, activities] = await Promise.all([
      sb().rpc('get_session_detail', { p_session_id: sessionId }),
      sb().from('planning_units').select('id,title').eq('class_id', state.classId).order('position'),
      sb().from('activities').select('id,title,activity_type,session_id').eq('class_id', state.classId)
    ]);
    if (detail.error) { back.querySelector('.ta-modal').innerHTML = `<h2>No se pudo abrir</h2><p>${esc(detail.error.message)}</p>`; return; }
    const s = Array.isArray(detail.data) ? detail.data[0] : detail.data;
    const unitOptions = units.data || [];
    const linked = (activities.data || []).filter(a => a.session_id === sessionId);
    const linkable = (activities.data || []).filter(a => !a.session_id || a.session_id === sessionId);
    let objectives = Array.isArray(s.objectives) ? [...s.objectives] : [];
    let competencies = Array.isArray(s.competencies) ? [...s.competencies] : [];
    let methodology = Array.isArray(s.methodology) ? [...s.methodology] : [];

    back.querySelector('.ta-modal').innerHTML = `<h2>Sesión ${s.sequence_number} · ${new Date(s.session_date + 'T00:00:00').toLocaleDateString('es-NI', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
      <div class="pl-status-row" id="pl-status-row">${Object.entries(STATUS).map(([k, v]) => `<button type="button" class="pl-status-chip ${s.status === k ? 'active' : ''}" data-status="${k}" style="${s.status === k ? `background:${v.bg};color:${v.color};border-color:${v.color}` : ''}">${v.label}</button>`).join('')}<button type="button" class="pl-status-chip" id="pl-reprogramar">📅 Reprogramar</button><button type="button" class="pl-status-chip" id="pl-asistencia">✓ Tomar asistencia</button></div>
      <div class="pl-modal-body">
        <div class="field"><label>Tema</label><input type="text" id="pl-topic" value="${esc(s.topic || '')}" placeholder="Ej. Introducción a las fracciones"></div>
        <div class="field"><label>Unidad</label><select id="pl-unit"><option value="">Sin unidad</option>${unitOptions.map(u => `<option value="${u.id}" ${s.unit_id === u.id ? 'selected' : ''}>${esc(u.title)}</option>`).join('')}</select></div>
        <div class="field"><label>Duración (minutos)</label><input type="number" id="pl-duration" min="1" value="${s.duration_minutes || ''}" placeholder="60"></div>

        <div class="pl-section-title">Objetivos de aprendizaje</div>
        <div id="pl-objectives"></div>
        <div class="pl-list-add"><input type="text" id="pl-obj-input" placeholder="Escribe un objetivo"><button type="button" class="pl-btn ghost" id="pl-obj-add">＋</button></div>

        <div class="pl-section-title">Competencias (opcional)</div>
        <div id="pl-competencies"></div>
        <div class="pl-list-add"><input type="text" id="pl-comp-input" placeholder="Ej. Pensamiento lógico"><button type="button" class="pl-btn ghost" id="pl-comp-add">＋</button></div>

        <div class="pl-section-title">Contenidos (opcional)</div>
        <div class="field"><label>Conceptual</label><textarea id="pl-c1">${esc(s.content_conceptual || '')}</textarea></div>
        <div class="field"><label>Procedimental</label><textarea id="pl-c2">${esc(s.content_procedural || '')}</textarea></div>
        <div class="field"><label>Actitudinal</label><textarea id="pl-c3">${esc(s.content_attitudinal || '')}</textarea></div>

        <div class="pl-section-title">Estrategia metodológica</div>
        <div class="pl-chips" id="pl-methods">${METHODS.map(m => `<button type="button" class="pl-chip ${methodology.includes(m) ? 'active' : ''}" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>

        <div class="pl-section-title">Actividades / tareas / exámenes vinculados</div>
        <div id="pl-linked">${linked.length ? linked.map(a => `<div class="pl-tag-row"><span>${esc(a.title)}</span><button type="button" data-unlink="${a.id}">Quitar</button></div>`).join('') : '<p style="font-size:10.5px;color:#9aa0aa">Ninguno todavía.</p>'}</div>
        <select id="pl-link-select"><option value="">＋ Vincular actividad existente…</option>${linkable.filter(a => !a.session_id).map(a => `<option value="${a.id}">${esc(a.title)}</option>`).join('')}</select>

        <div class="pl-section-title">Notas privadas (no visibles para estudiantes)</div>
        <div class="field"><textarea id="pl-notes" placeholder="Ej. La mayoría comprendió el procedimiento, pero algunos necesitan refuerzo.">${esc(s.private_notes || '')}</textarea></div>
        <div id="pl-msg"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px"><button class="ta-ghost" id="pl-close" style="flex:1">Cerrar</button><button class="ta-save" id="pl-save" style="flex:1">Guardar planificación</button></div>`;

    function repaintObj() {
      const host = back.querySelector('#pl-objectives');
      host.innerHTML = objectives.length ? objectives.map((t, i) => `<div class="pl-tag-row"><span>${esc(t)}</span><button type="button" data-i="${i}">✕</button></div>`).join('') : '';
      host.querySelectorAll('button').forEach(b => b.onclick = () => { objectives.splice(Number(b.dataset.i), 1); repaintObj(); });
    }
    function repaintComp() {
      const host = back.querySelector('#pl-competencies');
      host.innerHTML = competencies.length ? competencies.map((t, i) => `<div class="pl-tag-row"><span>${esc(t)}</span><button type="button" data-i="${i}">✕</button></div>`).join('') : '';
      host.querySelectorAll('button').forEach(b => b.onclick = () => { competencies.splice(Number(b.dataset.i), 1); repaintComp(); });
    }
    repaintObj(); repaintComp();
    back.querySelector('#pl-obj-add').onclick = () => { const inp = back.querySelector('#pl-obj-input'); if (inp.value.trim()) { objectives.push(inp.value.trim()); inp.value = ''; repaintObj(); } };
    back.querySelector('#pl-comp-add').onclick = () => { const inp = back.querySelector('#pl-comp-input'); if (inp.value.trim()) { competencies.push(inp.value.trim()); inp.value = ''; repaintComp(); } };
    back.querySelectorAll('#pl-methods .pl-chip').forEach(chip => chip.onclick = () => { const m = chip.dataset.m; if (methodology.includes(m)) { methodology = methodology.filter(x => x !== m); chip.classList.remove('active'); } else { methodology.push(m); chip.classList.add('active'); } });
    back.querySelectorAll('[data-unlink]').forEach(b => b.onclick = async () => { await sb().from('activities').update({ session_id: null }).eq('id', b.dataset.unlink); back.remove(); openSessionModal(sessionId); });
    back.querySelector('#pl-link-select').onchange = async e => { if (!e.target.value) return; await sb().from('activities').update({ session_id: sessionId }).eq('id', e.target.value); back.remove(); openSessionModal(sessionId); };
    back.querySelectorAll('[data-status]').forEach(b => b.onclick = async () => {
      const r = await sb().rpc('set_session_status', { p_session_id: sessionId, p_status: b.dataset.status, p_private_notes: null });
      if (r.error) { window.D360?.toast(r.error.message, 'error'); return; }
      window.D360?.toast('Estado actualizado.', 'success');
      back.querySelectorAll('[data-status]').forEach(x => { x.classList.remove('active'); x.style.cssText = ''; });
      const st = STATUS[b.dataset.status]; b.classList.add('active'); b.style.cssText = `background:${st.bg};color:${st.color};border-color:${st.color}`;
    });
    back.querySelector('#pl-reprogramar').onclick = () => openReprogramModal(sessionId, s.session_date, back);
    back.querySelector('#pl-asistencia').onclick = () => { const date = s.session_date; back.remove(); document.getElementById('d360-class-workspace') && window.docenciaOpenAttendanceForDate && window.docenciaOpenAttendanceForDate(date); };
    back.querySelector('#pl-close').onclick = () => back.remove();
    back.querySelector('#pl-save').onclick = async () => {
      const btn = back.querySelector('#pl-save'); btn.disabled = true;
      const r = await sb().rpc('save_lesson_plan', {
        p_session_id: sessionId,
        p_unit_id: back.querySelector('#pl-unit').value || null,
        p_topic: back.querySelector('#pl-topic').value.trim() || null,
        p_objectives: objectives, p_competencies: competencies,
        p_content_conceptual: back.querySelector('#pl-c1').value.trim() || null,
        p_content_procedural: back.querySelector('#pl-c2').value.trim() || null,
        p_content_attitudinal: back.querySelector('#pl-c3').value.trim() || null,
        p_methodology: methodology,
        p_duration_minutes: back.querySelector('#pl-duration').value ? Number(back.querySelector('#pl-duration').value) : null
      });
      const notesR = await sb().rpc('set_session_status', { p_session_id: sessionId, p_status: s.status, p_private_notes: back.querySelector('#pl-notes').value.trim() || null });
      if (r.error || notesR.error) { back.querySelector('#pl-msg').innerHTML = `<div class="ta-msg ta-error">${esc((r.error || notesR.error).message)}</div>`; btn.disabled = false; return; }
      window.D360?.toast('Planificación guardada.', 'success');
      back.remove();
      renderSessionsTab();
    };
  }

  function openReprogramModal(sessionId, currentDate, parentBack) {
    const back = document.createElement('div'); back.className = 'ta-modal-back';
    back.innerHTML = `<section class="ta-modal" style="width:min(360px,100%)"><h2>Reprogramar sesión</h2><p style="font-size:11px;color:#8b92a0">Fecha actual: ${new Date(currentDate + 'T00:00:00').toLocaleDateString('es-NI')}</p><div class="field"><label>Nueva fecha</label><input type="date" id="pl-new-date" min="${currentDate}"></div><div id="pl-rp-msg"></div><div style="display:flex;gap:8px;margin-top:8px"><button class="ta-ghost" id="pl-rp-cancel" style="flex:1">Cancelar</button><button class="ta-save" id="pl-rp-save" style="flex:1">Confirmar</button></div></section>`;
    document.body.appendChild(back);
    back.querySelector('#pl-rp-cancel').onclick = () => back.remove();
    back.querySelector('#pl-rp-save').onclick = async () => {
      const val = back.querySelector('#pl-new-date').value;
      if (!val) return;
      const r = await sb().rpc('reschedule_session', { p_session_id: sessionId, p_new_date: val });
      const msg = back.querySelector('#pl-rp-msg');
      if (r.error) { msg.innerHTML = `<div class="ta-msg ta-error">${r.error.message === 'date_already_has_a_session' ? 'Ya existe una sesión en esa fecha.' : esc(r.error.message)}</div>`; return; }
      window.D360?.toast('Sesión reprogramada.', 'success');
      back.remove(); parentBack?.remove();
      renderSessionsTab();
    };
  }

  async function renderUnitsTab() {
    const body = document.querySelector('.pl-body'); if (!body) return;
    body.innerHTML = window.D360 ? window.D360.skeletonList(3) : 'Cargando…';
    const [unitsR, sessR] = await Promise.all([
      sb().from('planning_units').select('*').eq('class_id', state.classId).order('position'),
      sb().rpc('get_class_sessions', { p_class_id: state.classId })
    ]);
    const units = unitsR.error ? [] : (unitsR.data || []);
    const sessions = sessR.error ? [] : (sessR.data || []);
    body.innerHTML = `<div class="pl-toolbar"><button class="pl-btn" id="pl-new-unit">＋ Crear unidad</button></div><div class="pl-units" id="pl-units-list">${units.length ? '' : '<div class="cw-empty">Todavía no has creado unidades para esta clase.</div>'}</div>`;
    document.getElementById('pl-new-unit').onclick = () => openUnitModal(null);
    const host = document.getElementById('pl-units-list');
    host.innerHTML = units.map(u => {
      const forUnit = sessions.filter(s => s.unit_id === u.id);
      const done = forUnit.filter(s => s.status === 'done').length;
      const pct = forUnit.length ? Math.round((done / forUnit.length) * 100) : 0;
      return `<div class="pl-unit" data-id="${u.id}"><div class="pl-unit-top"><div><div class="pl-unit-title">${esc(u.title)}</div><div class="pl-unit-dates">${u.start_date ? new Date(u.start_date + 'T00:00:00').toLocaleDateString('es-NI', { day: 'numeric', month: 'short' }) + ' – ' + new Date(u.end_date + 'T00:00:00').toLocaleDateString('es-NI', { day: 'numeric', month: 'short' }) : 'Sin fechas'} · ${forUnit.length} sesión${forUnit.length === 1 ? '' : 'es'}</div></div><button class="pl-btn ghost" data-edit="${u.id}">Editar</button></div><div class="pl-bar"><div class="pl-bar-fill" style="width:${pct}%"></div></div><div class="pl-unit-pct">${pct}% completado</div></div>`;
    }).join('');
    host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openUnitModal(units.find(u => u.id === b.dataset.edit)));
  }

  function openUnitModal(existing) {
    const editing = !!existing;
    const back = document.createElement('div'); back.className = 'ta-modal-back';
    back.innerHTML = `<section class="ta-modal"><h2>${editing ? 'Editar unidad' : 'Nueva unidad'}</h2>
      <div class="pl-modal-body">
        <div class="field"><label>Título</label><input type="text" id="pl-u-title" value="${esc(existing?.title || '')}" placeholder="Ej. Unidad 1 — Números racionales"></div>
        <div class="field"><label>Fecha de inicio</label><input type="date" id="pl-u-start" value="${existing?.start_date || ''}"></div>
        <div class="field"><label>Fecha de fin</label><input type="date" id="pl-u-end" value="${existing?.end_date || ''}"></div>
        <div class="field"><label>Objetivos (opcional)</label><textarea id="pl-u-obj">${esc(existing?.objectives || '')}</textarea></div>
        <div class="field"><label>Competencias (opcional)</label><textarea id="pl-u-comp">${esc(existing?.competencies || '')}</textarea></div>
        <div id="pl-u-msg"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px">${editing ? '<button class="ta-ghost" id="pl-u-del" style="flex:1;color:#b42318">Eliminar</button>' : ''}<button class="ta-ghost" id="pl-u-cancel" style="flex:1">Cancelar</button><button class="ta-save" id="pl-u-save" style="flex:1">Guardar</button></div>
    </section>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    back.querySelector('#pl-u-cancel').onclick = () => back.remove();
    back.querySelector('#pl-u-del')?.addEventListener('click', async () => {
      const ok = window.D360 ? await window.D360.confirm('¿Eliminar esta unidad? Las sesiones no se eliminan, solo quedan sin unidad.') : confirm('¿Eliminar unidad?');
      if (!ok) return;
      await sb().from('planning_units').delete().eq('id', existing.id);
      back.remove(); window.D360?.toast('Unidad eliminada.', 'success'); renderUnitsTab();
    });
    back.querySelector('#pl-u-save').onclick = async () => {
      const title = back.querySelector('#pl-u-title').value.trim();
      const msg = back.querySelector('#pl-u-msg');
      if (!title) { msg.innerHTML = '<div class="ta-msg ta-error">Escribe un título.</div>'; return; }
      const payload = { class_id: state.classId, title, start_date: back.querySelector('#pl-u-start').value || null, end_date: back.querySelector('#pl-u-end').value || null, objectives: back.querySelector('#pl-u-obj').value.trim() || null, competencies: back.querySelector('#pl-u-comp').value.trim() || null };
      const r = editing ? await sb().from('planning_units').update(payload).eq('id', existing.id) : await sb().from('planning_units').insert({ ...payload, teacher_id: (await sb().auth.getUser()).data.user.id });
      if (r.error) { msg.innerHTML = `<div class="ta-msg ta-error">${esc(r.error.message)}</div>`; return; }
      back.remove(); window.D360?.toast(editing ? 'Unidad actualizada.' : 'Unidad creada.', 'success'); renderUnitsTab();
    };
  }

  async function bind() {
    const ws = document.getElementById('d360-class-workspace');
    if (!ws || ws === state.workspace || !sb()) return;
    try {
      await identify();
      const nav = [...ws.querySelectorAll('.cw-nav button')].find(b => b.textContent.includes('Planificación'));
      if (nav) nav.onclick = showPlanning;
    } catch (e) { console.error('teacher-planning bind failed', e); }
  }
  const watch = () => { bind().finally(() => setTimeout(watch, 500)); };
  watch();
})();
