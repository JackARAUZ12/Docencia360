(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { workspace: null, classId: null, className: '', accessMode: null, current: null };

  const TYPES = {
    activity:   { label: 'Actividades', singular: 'Actividad', icon: '◈', tabText: 'Actividades' },
    assignment: { label: 'Tareas',      singular: 'Tarea',      icon: '▤', tabText: 'Tareas' },
    exam:       { label: 'Exámenes',    singular: 'Examen',     icon: '✓', tabText: 'Exámenes' }
  };
  const QTYPES = [
    { id: 'multiple_choice', label: 'Selección múltiple', options: 'single' },
    { id: 'true_false',      label: 'Verdadero / falso',  options: 'fixed'  },
    { id: 'short_answer',    label: 'Respuesta corta',    options: 'none'  },
    { id: 'long_answer',     label: 'Respuesta larga',    options: 'none'  },
    { id: 'fill_blank',      label: 'Completar',          options: 'none'  },
    { id: 'matching',        label: 'Relacionar',         options: 'pairs' },
    { id: 'image_choice',    label: 'Selección con imagen', options: 'single' }
  ];
  const qLabel = id => (QTYPES.find(q => q.id === id) || {}).label || id;
  const STATUS_LABEL = { draft: 'Borrador', published: 'Publicada', closed: 'Cerrada', archived: 'Archivada' };

  const style = document.createElement('style');
  style.textContent = `
    .ta-wrap{display:flex;flex-direction:column;gap:16px}
    .ta-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
    .ta-add{border:0;background:#5b4ce2;color:#fff;border-radius:10px;padding:10px 14px;font-size:11px;font-weight:850;cursor:pointer}
    .ta-ghost{border:1px solid #e2e3e9;background:#fff;color:#4b5160;border-radius:10px;padding:10px 14px;font-size:11px;font-weight:800;cursor:pointer}
    .ta-list{display:grid;gap:10px}
    .ta-card{border:1px solid #e7e8ee;border-radius:14px;padding:14px 16px;background:#fff;cursor:pointer;display:flex;justify-content:space-between;gap:10px;align-items:center}
    .ta-card:hover{border-color:#c9c2ff}
    .ta-card h3{margin:0;font-size:13px}
    .ta-card p{margin:4px 0 0;color:#8b92a0;font-size:10px}
    .ta-badge{font-size:9px;font-weight:850;padding:5px 9px;border-radius:999px;white-space:nowrap}
    .ta-badge.draft{background:#fff7df;color:#8a5b00}
    .ta-badge.published{background:#ecfdf3;color:#087443}
    .ta-badge.closed{background:#eef0f5;color:#5a6272}
    .ta-badge.archived{background:#f3f0ff;color:#6a5bd0}
    .ta-empty{border:1px dashed #dddfea;border-radius:14px;padding:30px;text-align:center;color:#858c9a;font-size:11px}
    .ta-back{border:0;background:#f3f1ff;color:#5746d5;border-radius:10px;padding:9px 13px;font-weight:800;font-size:11px;cursor:pointer}
    .ta-section{border:1px solid #e7e8ee;border-radius:16px;padding:18px;background:#fff}
    .ta-section h2{margin:0 0 4px;font-size:14px}
    .ta-section .ta-sub{margin:0 0 14px;color:#8b92a0;font-size:10px}
    .ta-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .ta-field{display:flex;flex-direction:column;gap:5px;margin-bottom:11px}
    .ta-field label{font-size:10px;font-weight:800;color:#5a6272}
    .ta-field input,.ta-field textarea,.ta-field select{border:1px solid #e2e3e9;border-radius:9px;padding:9px 10px;font-size:11px;font-family:inherit}
    .ta-field textarea{min-height:64px;resize:vertical}
    .ta-check{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:#4b5160;margin-bottom:9px}
    .ta-save{border:0;background:#5b4ce2;color:#fff;border-radius:10px;padding:10px 16px;font-weight:850;font-size:11px;cursor:pointer}
    .ta-qrow{border:1px solid #e7e8ee;border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
    .ta-qrow .qi{font-size:9px;font-weight:850;color:#7165d9;text-transform:uppercase;letter-spacing:.06em}
    .ta-qrow p{margin:3px 0 0;font-size:12px;font-weight:750}
    .ta-qactions{display:flex;gap:6px}
    .ta-icon-btn{border:1px solid #e2e3e9;background:#fff;border-radius:8px;width:32px;height:32px;cursor:pointer}
    .ta-modal-back{position:fixed;inset:0;background:rgba(12,14,22,.46);backdrop-filter:blur(3px);display:grid;place-items:center;padding:14px;z-index:1300;overflow:auto}
    .ta-modal{width:min(100%,640px);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.24)}
    .ta-modal h2{margin:0 0 14px;font-size:19px}
    .ta-opt-row{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin-bottom:7px}
    .ta-opt-row input[type=text]{border:1px solid #e2e3e9;border-radius:8px;padding:8px 9px;font-size:11px}
    .ta-msg{margin-top:10px;padding:10px 12px;border-radius:10px;font-size:11px}
    .ta-error{background:#fff0ef;color:#b42318}
    .ta-success{background:#ecfdf3;color:#087443}
    .ta-code-box{background:#f7f5ff;border:1px solid #ebe7ff;border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px}
    .ta-code-box .code{font-size:20px;font-weight:900;letter-spacing:.1em;color:#5544d4}
    @media(max-width:620px){.ta-grid2{grid-template-columns:1fr}.ta-card{flex-direction:column;align-items:flex-start}}
    html.d360-dark .ta-card,html.d360-dark .ta-section,html.d360-dark .ta-qrow,html.d360-dark .ta-modal,html.d360-dark .ta-icon-btn,html.d360-dark .ta-ghost{background:#151728!important;color:#f4f5fb!important;border-color:#292b40!important}
    html.d360-dark .ta-field input,html.d360-dark .ta-field textarea,html.d360-dark .ta-field select,html.d360-dark .ta-opt-row input{background:#191b2d!important;color:#f4f5fb!important;border-color:#303247!important}
    html.d360-dark .ta-card p,html.d360-dark .ta-section .ta-sub,html.d360-dark .ta-empty{color:#9ea5ba!important}
    html.d360-dark .ta-back{background:#252044!important;color:#b8adff!important}
    html.d360-dark .ta-code-box{background:#211e3a!important;border-color:#343052!important}
    html.d360-dark .ta-code-box .code{color:#c4bcff!important}
  `;
  document.head.appendChild(style);
  const sb = () => window.docenciaSupabase;

  async function identify() {
    const ws = document.getElementById('d360-class-workspace');
    if (!ws || !sb()) return false;
    state.workspace = ws;
    const code = ws.querySelector('.cw-code')?.textContent?.replace(/^.*Código:\s*/, '').replace(/Copiar.*$/, '').trim();
    const r = await sb().rpc('get_my_teacher_classes');
    if (r.error) throw r.error;
    const c = (r.data || []).find(x => String(x.join_code).toUpperCase() === String(code || '').toUpperCase());
    if (!c) throw new Error('No pudimos identificar la clase.');
    state.classId = c.id; state.className = c.name;
    if (state.accessMode === null) {
      const m = await sb().rpc('get_teacher_student_access_mode');
      state.accessMode = m.error ? 'accounts' : (m.data || 'accounts');
    }
    return true;
  }

  function main() { return state.workspace?.querySelector('.cw-main'); }

  // ---------- LIST VIEW ----------
  async function showList(type) {
    const m = main(); if (!m) return;
    const t = TYPES[type];
    m.innerHTML = `<div class="cw-top"><div><div class="cw-kicker">${esc(t.label)}</div><h1 class="cw-title">${esc(state.className)}</h1><div class="cw-meta">Gestiona ${esc(t.label.toLowerCase())} de esta clase</div></div><button class="ta-back" id="ta-out">← Volver a la clase</button></div><div class="ta-wrap" style="margin-top:18px"><div class="ta-head"><div></div><button class="ta-add" id="ta-new">＋ Crear ${esc(t.singular.toLowerCase())}</button></div><div id="ta-list" class="ta-list"><div class="ta-empty">Cargando…</div></div></div>`;
    m.querySelector('#ta-out').onclick = () => location.reload();
    m.querySelector('#ta-new').onclick = () => createFlow(type);
    await renderList(type);
  }

  async function renderList(type) {
    const host = document.getElementById('ta-list'); if (!host) return;
    const r = await sb().from('activities').select('id,title,status,total_points,due_at,max_attempts').eq('class_id', state.classId).eq('activity_type', type).order('created_at', { ascending: false });
    if (r.error) { host.innerHTML = `<div class="ta-empty">No pudimos cargar: ${esc(r.error.message)}</div>`; return; }
    const items = r.data || [];
    if (!items.length) { host.innerHTML = `<div class="ta-empty">Todavía no has creado ${esc(TYPES[type].label.toLowerCase())} en esta clase.</div>`; return; }
    const counts = await Promise.all(items.map(a => sb().from('activity_questions').select('id', { count: 'exact', head: true }).eq('activity_id', a.id)));
    host.innerHTML = items.map((a, i) => `<div class="ta-card" data-id="${a.id}"><div><h3>${esc(a.title)}</h3><p>${counts[i].count || 0} pregunta${(counts[i].count || 0) === 1 ? '' : 's'} · ${Number(a.total_points || 0)} pts${a.due_at ? ' · vence ' + new Date(a.due_at).toLocaleDateString('es-NI') : ''}</p></div><span class="ta-badge ${a.status}">${STATUS_LABEL[a.status] || a.status}</span></div>`).join('');
    host.querySelectorAll('.ta-card').forEach(card => card.onclick = () => openBuilder(items.find(x => x.id === card.dataset.id)));
  }

  // ---------- CREATE ----------
  function createFlow(type) {
    const t = TYPES[type];
    const back = document.createElement('div'); back.className = 'ta-modal-back';
    back.innerHTML = `<section class="ta-modal"><h2>Nueva ${esc(t.singular.toLowerCase())}</h2><div class="ta-field"><label>Título</label><input id="ta-new-title" placeholder="Ej. ${esc(t.singular)} de fracciones" maxlength="160"></div><div class="ta-field"><label>Descripción (opcional)</label><textarea id="ta-new-desc" placeholder="Breve descripción para tus estudiantes"></textarea></div><div id="ta-new-msg"></div><div style="display:flex;gap:8px;margin-top:8px"><button class="ta-ghost" id="ta-new-cancel" style="flex:1">Cancelar</button><button class="ta-save" id="ta-new-go" style="flex:1">Crear y continuar</button></div></section>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    back.querySelector('#ta-new-cancel').onclick = () => back.remove();
    back.querySelector('#ta-new-go').onclick = async () => {
      const title = back.querySelector('#ta-new-title').value.trim();
      const msg = back.querySelector('#ta-new-msg');
      if (!title) { msg.innerHTML = '<div class="ta-msg ta-error">Escribe un título.</div>'; return; }
      const btn = back.querySelector('#ta-new-go'); btn.disabled = true;
      const r = await sb().rpc('create_activity', { p_class_id: state.classId, p_title: title, p_activity_type: type, p_description: back.querySelector('#ta-new-desc').value.trim() || null });
      if (r.error) { msg.innerHTML = `<div class="ta-msg ta-error">${esc(r.error.message)}</div>`; btn.disabled = false; return; }
      back.remove();
      openBuilder(r.data);
    };
  }

  // ---------- BUILDER (info + questions + publish) ----------
  async function openBuilder(activityStub) {
    const m = main(); if (!m) return;
    const r = await sb().from('activities').select('*').eq('id', activityStub.id).single();
    if (r.error) { alert('No pudimos abrir la actividad: ' + r.error.message); return; }
    const a = r.data;
    state.current = a;
    const t = TYPES[a.activity_type];
    m.innerHTML = `<div class="cw-top"><div><div class="cw-kicker">${esc(t.singular)}</div><h1 class="cw-title">${esc(a.title)}</h1><div class="cw-meta">Estado: <span class="ta-badge ${a.status}" style="margin-left:4px">${STATUS_LABEL[a.status]}</span></div></div><button class="ta-back" id="ta-b-back">← Volver a ${esc(t.label.toLowerCase())}</button></div>
      <div class="ta-wrap" style="margin-top:18px">
        <section class="ta-section"><h2>Información y configuración</h2><p class="ta-sub">Estos datos son visibles para tus estudiantes al abrir la ${esc(t.singular.toLowerCase())}.</p><div id="ta-info"></div></section>
        <section class="ta-section"><h2>Preguntas</h2><p class="ta-sub">Agrega, edita o elimina las preguntas de esta ${esc(t.singular.toLowerCase())}.</p><div id="ta-questions"></div><button class="ta-add" id="ta-q-add">＋ Agregar pregunta</button></section>
        <section class="ta-section"><h2>Publicar</h2><p class="ta-sub">Cuando publiques, tus estudiantes podrán verla y responderla.</p><div id="ta-publish"></div></section>
      </div>`;
    m.querySelector('#ta-b-back').onclick = () => showList(a.activity_type);
    m.querySelector('#ta-q-add').onclick = () => openQuestionModal(null);
    renderInfoForm(a);
    renderQuestions(a.id);
    renderPublish(a);
  }

  function renderInfoForm(a) {
    const host = document.getElementById('ta-info'); if (!host) return;
    const dt = v => v ? new Date(v).toISOString().slice(0, 16) : '';
    host.innerHTML = `
      <div class="ta-field"><label>Título</label><input id="ta-f-title" value="${esc(a.title)}" maxlength="160"></div>
      <div class="ta-field"><label>Descripción</label><textarea id="ta-f-desc">${esc(a.description || '')}</textarea></div>
      <div class="ta-field"><label>Instrucciones para el estudiante</label><textarea id="ta-f-instr">${esc(a.instructions || '')}</textarea></div>
      <div class="ta-grid2">
        <div class="ta-field"><label>Fecha de inicio</label><input type="datetime-local" id="ta-f-from" value="${dt(a.available_from)}"></div>
        <div class="ta-field"><label>Fecha límite</label><input type="datetime-local" id="ta-f-due" value="${dt(a.due_at)}"></div>
        <div class="ta-field"><label>Tiempo máximo (minutos)</label><input type="number" min="1" max="1440" id="ta-f-time" value="${a.time_limit_minutes || ''}" placeholder="Sin límite"></div>
        <div class="ta-field"><label>Número de intentos</label><input type="number" min="1" max="20" id="ta-f-attempts" value="${a.max_attempts}"></div>
      </div>
      <label class="ta-check"><input type="checkbox" id="ta-f-shuffleq" ${a.shuffle_questions ? 'checked' : ''}> Mezclar preguntas</label>
      <label class="ta-check"><input type="checkbox" id="ta-f-shuffleo" ${a.shuffle_options ? 'checked' : ''}> Mezclar opciones</label>
      <label class="ta-check"><input type="checkbox" id="ta-f-results" ${a.show_results_immediately ? 'checked' : ''}> Mostrar resultados al entregar</label>
      <div id="ta-info-msg"></div>
      <button class="ta-save" id="ta-f-save">Guardar cambios</button>`;
    host.querySelector('#ta-f-save').onclick = async () => {
      const btn = host.querySelector('#ta-f-save'); btn.disabled = true;
      const title = host.querySelector('#ta-f-title').value.trim();
      const patch = {
        title: title || a.title,
        description: host.querySelector('#ta-f-desc').value.trim() || null,
        instructions: host.querySelector('#ta-f-instr').value.trim() || null,
        available_from: host.querySelector('#ta-f-from').value ? new Date(host.querySelector('#ta-f-from').value).toISOString() : null,
        due_at: host.querySelector('#ta-f-due').value ? new Date(host.querySelector('#ta-f-due').value).toISOString() : null,
        time_limit_minutes: host.querySelector('#ta-f-time').value ? Number(host.querySelector('#ta-f-time').value) : null,
        max_attempts: Number(host.querySelector('#ta-f-attempts').value) || 1,
        shuffle_questions: host.querySelector('#ta-f-shuffleq').checked,
        shuffle_options: host.querySelector('#ta-f-shuffleo').checked,
        show_results_immediately: host.querySelector('#ta-f-results').checked
      };
      const r = await sb().from('activities').update(patch).eq('id', a.id).select('*').single();
      const msg = host.querySelector('#ta-info-msg');
      if (r.error) { msg.innerHTML = `<div class="ta-msg ta-error">${esc(r.error.message)}</div>`; }
      else { Object.assign(a, r.data); state.current = a; msg.innerHTML = '<div class="ta-msg ta-success">Guardado.</div>'; document.querySelector('.cw-title').textContent = a.title; }
      btn.disabled = false;
    };
  }

  async function renderQuestions(activityId) {
    const host = document.getElementById('ta-questions'); if (!host) return;
    const r = await sb().from('activity_questions').select('id,position,question_type,prompt,points').eq('activity_id', activityId).order('position');
    if (r.error) { host.innerHTML = `<div class="ta-empty">${esc(r.error.message)}</div>`; return; }
    const qs = r.data || [];
    host.innerHTML = qs.length ? qs.map(q => `<div class="ta-qrow" data-id="${q.id}"><div><div class="qi">${esc(qLabel(q.question_type))} · ${q.points} pt${q.points === 1 ? '' : 's'}</div><p>${esc(q.prompt)}</p></div><div class="ta-qactions"><button class="ta-icon-btn" data-act="edit" title="Editar">✎</button><button class="ta-icon-btn" data-act="del" title="Eliminar">🗑</button></div></div>`).join('') : '<div class="ta-empty">Aún no hay preguntas.</div>';
    host.querySelectorAll('[data-act=edit]').forEach(b => b.onclick = () => openQuestionModal(qs.find(q => q.id === b.closest('.ta-qrow').dataset.id)));
    host.querySelectorAll('[data-act=del]').forEach(b => b.onclick = async () => {
      if (!confirm('¿Eliminar esta pregunta?')) return;
      const id = b.closest('.ta-qrow').dataset.id;
      const del = await sb().from('activity_questions').delete().eq('id', id);
      if (del.error) { alert(del.error.message); return; }
      renderQuestions(activityId);
      const upd = await sb().rpc('update_activity_total_points', { p_activity_id: activityId });
      if (!upd.error) renderPublish({ ...state.current, total_points: upd.data });
    });
  }

  function optionRow(text = '', correct = false, radioName = 'ta-correct') {
    const row = document.createElement('div'); row.className = 'ta-opt-row';
    row.innerHTML = `<input type="radio" name="${radioName}" ${correct ? 'checked' : ''}><input type="text" class="ta-opt-text" value="${esc(text)}" placeholder="Texto de la opción"><button type="button" class="ta-icon-btn ta-opt-del">✕</button>`;
    row.querySelector('.ta-opt-del').onclick = () => row.remove();
    return row;
  }
  function pairRow(left = '', right = '') {
    const row = document.createElement('div'); row.className = 'ta-opt-row';
    row.innerHTML = `<span style="font-size:10px;color:#8b92a0">↔</span><input type="text" class="ta-pair-left" value="${esc(left)}" placeholder="Elemento A" style="margin-right:6px"><input type="text" class="ta-pair-right" value="${esc(right)}" placeholder="Corresponde con…">`;
    return row;
  }

  function openQuestionModal(q) {
    const editing = !!q;
    const back = document.createElement('div'); back.className = 'ta-modal-back';
    back.innerHTML = `<section class="ta-modal"><h2>${editing ? 'Editar pregunta' : 'Nueva pregunta'}</h2>
      <div class="ta-field"><label>Tipo de pregunta</label><select id="ta-q-type">${QTYPES.map(qt => `<option value="${qt.id}" ${q?.question_type === qt.id ? 'selected' : ''}>${esc(qt.label)}</option>`).join('')}</select></div>
      <div class="ta-field"><label>Pregunta / enunciado</label><textarea id="ta-q-prompt" placeholder="Escribe la pregunta">${esc(q?.prompt || '')}</textarea></div>
      <div class="ta-grid2"><div class="ta-field"><label>Puntos</label><input type="number" min="0" step="0.5" id="ta-q-points" value="${q?.points ?? 1}"></div><div class="ta-field"><label>Obligatoria</label><select id="ta-q-required"><option value="1" ${q?.is_required !== false ? 'selected' : ''}>Sí</option><option value="0" ${q?.is_required === false ? 'selected' : ''}>No</option></select></div></div>
      <div id="ta-q-options"></div>
      <div class="ta-field"><label>Explicación (se muestra después de responder, opcional)</label><textarea id="ta-q-expl"></textarea></div>
      <div id="ta-q-msg"></div>
      <div style="display:flex;gap:8px;margin-top:6px"><button class="ta-ghost" id="ta-q-cancel" style="flex:1">Cancelar</button><button class="ta-save" id="ta-q-save" style="flex:1">Guardar pregunta</button></div>
      </section>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    back.querySelector('#ta-q-cancel').onclick = () => back.remove();

    const optHost = back.querySelector('#ta-q-options');
    async function loadExisting() {
      if (!editing) { renderOptionsFor(back.querySelector('#ta-q-type').value); return; }
      const r = await sb().from('activity_question_options').select('option_text,is_correct,metadata,position').eq('question_id', q.id).order('position');
      const opts = r.error ? [] : (r.data || []);
      const full = await sb().from('activity_questions').select('explanation').eq('id', q.id).single();
      if (!full.error) back.querySelector('#ta-q-expl').value = full.data.explanation || '';
      renderOptionsFor(back.querySelector('#ta-q-type').value, opts);
    }
    function renderOptionsFor(type, existing = []) {
      const def = QTYPES.find(x => x.id === type);
      optHost.innerHTML = '';
      if (def.options === 'none') { optHost.innerHTML = type === 'fill_blank' ? '<p class="ta-sub">Usa ___ (guion bajo) en el enunciado donde va la respuesta.</p>' : ''; return; }
      if (def.options === 'fixed') {
        optHost.innerHTML = '<div class="ta-field"><label>Respuesta correcta</label></div>';
        const trueCorrect = existing.find(o => /verdadero/i.test(o.option_text))?.is_correct;
        optHost.appendChild(optionRow('Verdadero', existing.length ? !!trueCorrect : true, 'ta-tf'));
        optHost.appendChild(optionRow('Falso', existing.length ? !trueCorrect : false, 'ta-tf'));
        return;
      }
      if (def.options === 'pairs') {
        optHost.innerHTML = '<div class="ta-field"><label>Pares a relacionar</label></div>';
        const pairs = existing.length ? existing.map(o => o.metadata || {}) : [{ left: '', right: '' }, { left: '', right: '' }];
        pairs.forEach(p => optHost.appendChild(pairRow(p.left || '', p.right || '')));
        const add = document.createElement('button'); add.type = 'button'; add.className = 'ta-ghost'; add.textContent = '＋ Agregar par'; add.style.marginTop = '4px';
        add.onclick = () => optHost.insertBefore(pairRow(), add);
        optHost.appendChild(add);
        return;
      }
      optHost.innerHTML = '<div class="ta-field"><label>Opciones (marca la correcta)</label></div>';
      const rows = existing.length ? existing : [{ option_text: '', is_correct: true }, { option_text: '', is_correct: false }];
      rows.forEach(o => optHost.appendChild(optionRow(o.option_text, o.is_correct, 'ta-mc')));
      const add = document.createElement('button'); add.type = 'button'; add.className = 'ta-ghost'; add.textContent = '＋ Agregar opción'; add.style.marginTop = '4px';
      add.onclick = () => optHost.insertBefore(optionRow('', false, 'ta-mc'), add);
      optHost.appendChild(add);
    }
    back.querySelector('#ta-q-type').onchange = e => renderOptionsFor(e.target.value);
    loadExisting();

    back.querySelector('#ta-q-save').onclick = async () => {
      const type = back.querySelector('#ta-q-type').value;
      const def = QTYPES.find(x => x.id === type);
      let options = [];
      if (def.options === 'fixed' || def.options === 'single') {
        options = [...optHost.querySelectorAll('.ta-opt-row')].map(row => ({ option_text: row.querySelector('.ta-opt-text').value.trim(), is_correct: row.querySelector('input[type=radio]').checked })).filter(o => o.option_text);
      } else if (def.options === 'pairs') {
        options = [...optHost.querySelectorAll('.ta-opt-row')].map(row => { const left = row.querySelector('.ta-pair-left').value.trim(), right = row.querySelector('.ta-pair-right').value.trim(); return left && right ? { option_text: `${left} → ${right}`, is_correct: true, metadata: { left, right } } : null; }).filter(Boolean);
      }
      const msg = back.querySelector('#ta-q-msg');
      const btn = back.querySelector('#ta-q-save'); btn.disabled = true;
      const r = await sb().rpc('save_activity_question', {
        p_activity_id: state.current.id,
        p_question_id: editing ? q.id : null,
        p_question_type: type,
        p_prompt: back.querySelector('#ta-q-prompt').value.trim(),
        p_points: Number(back.querySelector('#ta-q-points').value) || 0,
        p_is_required: back.querySelector('#ta-q-required').value === '1',
        p_explanation: back.querySelector('#ta-q-expl').value.trim() || null,
        p_options: options
      });
      if (r.error) { msg.innerHTML = `<div class="ta-msg ta-error">${esc(translateQError(r.error.message))}</div>`; btn.disabled = false; return; }
      back.remove();
      renderQuestions(state.current.id);
      const upd = await sb().rpc('update_activity_total_points', { p_activity_id: state.current.id });
      if (!upd.error) { state.current.total_points = upd.data; renderPublish(state.current); }
    };
  }

  function translateQError(msg) {
    const map = {
      question_prompt_required: 'Escribe el enunciado de la pregunta.',
      at_least_two_options_required: 'Agrega al menos dos opciones.',
      exactly_one_correct_option_required: 'Marca exactamente una opción como correcta.',
      one_correct_true_false_option_required: 'Marca si la respuesta correcta es Verdadero o Falso.',
      invalid_points: 'Los puntos deben ser un número igual o mayor a 0.'
    };
    return map[msg] || msg;
  }

  async function renderPublish(a) {
    const host = document.getElementById('ta-publish'); if (!host) return;
    const r = await sb().from('activity_questions').select('id', { count: 'exact', head: true }).eq('activity_id', a.id);
    const qCount = r.count || 0;
    const canPublish = a.status === 'draft' && qCount > 0;
    host.innerHTML = `<p class="ta-sub">${qCount} pregunta${qCount === 1 ? '' : 's'} · ${Number(a.total_points || 0)} puntos totales</p>
      ${a.status === 'draft' ? `<button class="ta-save" id="ta-pub-btn" ${canPublish ? '' : 'disabled'}>${qCount ? 'Publicar' : 'Agrega al menos una pregunta para publicar'}</button>` : `<p class="ta-msg ta-success" style="display:inline-block">Esta ${TYPES[a.activity_type].singular.toLowerCase()} ya está publicada.</p>`}
      <div id="ta-pub-msg"></div>
      <div id="ta-code-area" style="margin-top:12px"></div>`;
    if (a.status === 'draft' && canPublish) {
      host.querySelector('#ta-pub-btn').onclick = async () => {
        const btn = host.querySelector('#ta-pub-btn'); btn.disabled = true;
        const pr = await sb().rpc('publish_activity', { p_activity_id: a.id });
        if (pr.error) { host.querySelector('#ta-pub-msg').innerHTML = `<div class="ta-msg ta-error">${esc(pr.error.message)}</div>`; btn.disabled = false; return; }
        Object.assign(state.current, pr.data);
        document.querySelector('.ta-badge')?.replaceWith();
        openBuilder({ id: a.id });
      };
    }
    if (state.accessMode === 'codes') renderCodeArea(a);
  }

  async function renderCodeArea(a) {
    const area = document.getElementById('ta-code-area'); if (!area) return;
    const r = await sb().rpc('get_activity_access_codes', { p_activity_id: a.id });
    const codes = r.error ? [] : (r.data || []);
    const active = codes.find(c => c.is_active);
    area.innerHTML = active
      ? `<div class="ta-code-box"><div><div style="font-size:9px;color:#7165d9;font-weight:850">CÓDIGO DE ACCESO</div><div class="code">${esc(active.code)}</div></div><button class="ta-ghost" id="ta-code-copy">Copiar</button></div>`
      : `<button class="ta-ghost" id="ta-code-gen">Generar código de acceso</button>`;
    area.querySelector('#ta-code-copy')?.addEventListener('click', () => { navigator.clipboard.writeText(active.code); });
    area.querySelector('#ta-code-gen')?.addEventListener('click', async () => {
      const g = await sb().rpc('create_activity_access_code', { p_class_id: state.classId, p_activity_type: a.activity_type, p_activity_id: a.id });
      if (g.error) { area.innerHTML = `<div class="ta-msg ta-error">${esc(g.error.message)}</div>`; return; }
      renderCodeArea(a);
    });
  }

  // ---------- BIND TABS ----------
  async function bind() {
    const ws = document.getElementById('d360-class-workspace');
    if (!ws || ws === state.workspace || !sb()) return;
    try {
      await identify();
      const buttons = [...ws.querySelectorAll('.cw-nav button,.cw-tabs button')];
      Object.keys(TYPES).forEach(type => {
        buttons.filter(b => b.textContent.trim().replace(/^[^\wÁÉÍÓÚÑ]*/, '') === TYPES[type].tabText || b.textContent.includes(TYPES[type].tabText)).forEach(b => b.onclick = () => showList(type));
      });
    } catch (e) { console.error('teacher-activities bind failed', e); }
  }
  const watch = () => { bind().finally(() => setTimeout(watch, 500)); };
  watch();
})();
