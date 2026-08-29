(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { workspace: null, classId: null, className: '' };
  const TYPE_LABEL = { activity: 'Actividad', assignment: 'Tarea', exam: 'Examen' };
  const STATUS_LABEL = { in_progress: 'En progreso', submitted: 'Entregado', graded: 'Calificado', expired: 'Vencido', cancelled: 'Cancelado' };
  const sb = () => window.docenciaSupabase;

  const style = document.createElement('style');
  style.textContent = `
    .gr-wrap{display:flex;flex-direction:column;gap:14px}
    .gr-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}
    .gr-stat{background:#fff;border:1px solid #e8e9ef;border-radius:14px;padding:14px}
    .gr-stat span{font-size:9px;color:#8b92a0;font-weight:750;text-transform:uppercase}
    .gr-stat strong{display:block;font-size:20px;margin-top:4px}
    .gr-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .gr-tools select,.gr-tools input{border:1px solid #e2e3e9;border-radius:9px;padding:8px 10px;font-size:11px;background:#fff}
    .gr-table-wrap{border:1px solid #e8e9ef;border-radius:14px;overflow:auto;background:#fff}
    table.gr-table{width:100%;border-collapse:collapse;font-size:11px;min-width:640px}
    .gr-table th{text-align:left;padding:11px 13px;background:#faf9ff;color:#7d8492;font-size:9px;text-transform:uppercase;font-weight:800;white-space:nowrap}
    .gr-table td{padding:11px 13px;border-top:1px solid #f1f1f6;white-space:nowrap}
    .gr-table tr:hover td{background:#faf9ff}
    .gr-badge{font-size:9px;font-weight:850;padding:4px 9px;border-radius:999px}
    .gr-badge.graded,.gr-badge.submitted{background:#ecfdf3;color:#087443}
    .gr-badge.in_progress{background:#fff7df;color:#8a5b00}
    .gr-badge.expired,.gr-badge.cancelled{background:#eef0f5;color:#5a6272}
    .gr-empty{border:1px dashed #dddfea;border-radius:14px;padding:34px 20px;text-align:center;color:#858c9a;font-size:11.5px;line-height:1.6}
    .gr-student{display:flex;align-items:center;gap:8px}
    .gr-avatar{width:24px;height:24px;border-radius:50%;background:#f0edff;color:#5645d5;display:grid;place-items:center;font-size:9px;font-weight:900;flex:0 0 auto}
    .gr-pct-wrap{display:flex;align-items:center;gap:7px}
    .gr-pct-bar{width:52px;height:5px;border-radius:99px;background:#eef0f5;overflow:hidden}
    .gr-pct-fill{height:100%;background:#5b4ce2}
    .gr-review-btn{border:0;background:#5b4ce2;color:#fff;border-radius:8px;padding:6px 11px;font-size:9.5px;font-weight:850;cursor:pointer}
    .gr-review-btn.done{background:#f0edff;color:#5645d5}
    .gr-badge.review{background:#fff0e0;color:#a15c00}
    .gr-detail-back{position:fixed;inset:0;background:rgba(12,14,22,.46);backdrop-filter:blur(3px);display:grid;place-items:center;padding:14px;z-index:1400;overflow:auto}
    .gr-detail{width:min(680px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.24)}
    .gr-detail h2{margin:0 0 3px;font-size:18px}
    .gr-detail .gr-sub{color:#8b92a0;font-size:11px;margin-bottom:16px}
    .gr-dq{border:1px solid #e7e8ee;border-radius:13px;padding:14px;margin-bottom:11px}
    .gr-dq .qi{font-size:9px;font-weight:850;color:#7165d9;text-transform:uppercase}
    .gr-dq p.prompt{font-weight:800;font-size:12.5px;margin:4px 0 9px}
    .gr-answer-box{background:#f7f7fb;border-radius:10px;padding:10px 12px;font-size:11.5px;margin-bottom:9px;white-space:pre-wrap}
    .gr-auto{font-size:10.5px;font-weight:850;padding:4px 9px;border-radius:999px;display:inline-block}
    .gr-auto.correct{background:#ecfdf3;color:#087443}.gr-auto.incorrect{background:#fff0ef;color:#b42318}
    .gr-grade-row{display:flex;align-items:center;gap:8px}
    .gr-grade-row input{width:70px;border:1px solid #e2e3e9;border-radius:8px;padding:7px 9px;font-size:11px}
    .gr-grade-row button{border:0;background:#5b4ce2;color:#fff;border-radius:8px;padding:8px 13px;font-size:10.5px;font-weight:850;cursor:pointer}
    .gr-graded-tag{font-size:10px;font-weight:850;color:#087443}
    html.d360-dark .gr-detail,html.d360-dark .gr-dq{background:#151728!important;color:#f4f5fb!important;border-color:#292b40!important}
    html.d360-dark .gr-answer-box{background:#191b2d!important;color:#f4f5fb!important}
    html.d360-dark .gr-detail .gr-sub{color:#9ea5ba!important}
    html.d360-dark .gr-grade-row input{background:#191b2d!important;color:#f4f5fb!important;border-color:#303247!important}
    html.d360-dark .gr-pct-bar{background:#292b40!important}
    html.d360-dark .gr-stat,html.d360-dark .gr-table-wrap,html.d360-dark .gr-tools select,html.d360-dark .gr-tools input{background:#151728!important;color:#f4f5fb!important;border-color:#292b40!important}
    html.d360-dark .gr-table th{background:#191b2d!important;color:#9ea5ba!important}
    html.d360-dark .gr-table td{border-color:#292b40!important}
    html.d360-dark .gr-table tr:hover td{background:#1d2034!important}
    html.d360-dark .gr-empty{color:#9ea5ba!important}
    @media(max-width:620px){.gr-stats{grid-template-columns:1fr 1fr}.gr-stats .gr-stat:nth-child(3){grid-column:1/-1}}
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

  async function showGrades() {
    const m = main(); if (!m) return;
    m.innerHTML = `<div class="cw-top"><div><div class="cw-kicker">Calificaciones</div><h1 class="cw-title">${esc(state.className)}</h1><div class="cw-meta">Resultados de actividades, tareas y exámenes</div></div></div><div class="gr-wrap" style="margin-top:18px">${window.D360 ? window.D360.skeletonList(3) : 'Cargando…'}</div>`;
    const [accountRes, anonRes] = await Promise.all([
      sb().rpc('get_teacher_account_results', { p_class_id: state.classId }),
      sb().rpc('get_teacher_anonymous_results', { p_class_id: state.classId })
    ]);
    const rows = (accountRes.error ? [] : (accountRes.data || [])).map(r => ({
      student: r.student_name, activity: r.activity_title, type: r.activity_type,
      status: r.submitted_at ? (r.needs_review ? 'submitted' : 'graded') : 'in_progress',
      score: r.score, total: r.total_points,
      pct: (r.submitted_at && r.total_points > 0) ? Math.round((Number(r.score) / Number(r.total_points)) * 100) : null,
      when: r.submitted_at || r.started_at, needsReview: !!r.needs_review, attemptId: r.attempt_id, kind: 'account'
    }));
    const anonRows = (anonRes.error ? [] : (anonRes.data || [])).map(r => ({
      student: r.student_name, activity: r.activity_title || '(actividad eliminada)', type: r.activity_type,
      status: r.submitted_at ? 'submitted' : 'in_progress', score: r.score, total: r.total_points,
      pct: (r.submitted_at && r.total_points > 0) ? Math.round((Number(r.score) / Number(r.total_points)) * 100) : null,
      when: r.submitted_at || r.started_at, needsReview: !!r.needs_review, attemptId: r.attempt_id, kind: 'anon'
    }));
    const all = [...rows, ...anonRows].sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0));
    renderGrades(all);
  }

  function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join(''); }

  function renderGrades(all) {
    const wrap = document.querySelector('.gr-wrap'); if (!wrap) return;
    if (!all.length) {
      wrap.innerHTML = `<div class="gr-empty">Todavía no hay resultados en esta clase.<br>Aparecerán aquí en cuanto tus estudiantes respondan una actividad, tarea o examen publicado.</div>`;
      return;
    }
    const graded = all.filter(r => r.pct != null);
    const avg = graded.length ? Math.round(graded.reduce((s, r) => s + Number(r.pct), 0) / graded.length) : null;
    const pending = all.filter(r => r.needsReview).length;
    const types = ['Todas', ...new Set(all.map(r => TYPE_LABEL[r.type] || r.type))];
    wrap.innerHTML = `
      <section class="gr-stats">
        <div class="gr-stat"><span>Entregas</span><strong>${all.length}</strong></div>
        <div class="gr-stat"><span>Promedio general</span><strong>${avg != null ? avg + '%' : '—'}</strong></div>
        <div class="gr-stat"><span>${pending ? 'Pendientes de revisar' : 'Estudiantes distintos'}</span><strong style="${pending ? 'color:#a15c00' : ''}">${pending || new Set(all.map(r => r.student)).size}</strong></div>
      </section>
      <div class="gr-tools">
        <select id="gr-type">${types.map(t => `<option>${esc(t)}</option>`).join('')}</select>
        <input id="gr-search" placeholder="Buscar estudiante…">
      </div>
      <div class="gr-table-wrap"><table class="gr-table"><thead><tr><th>Estudiante</th><th>Actividad</th><th>Tipo</th><th>Estado</th><th>Puntaje</th><th>%</th><th>Fecha</th><th></th></tr></thead><tbody id="gr-rows"></tbody></table></div>`;
    const paint = () => {
      const type = document.getElementById('gr-type').value;
      const q = document.getElementById('gr-search').value.trim().toLowerCase();
      const filtered = all.filter(r => (type === 'Todas' || (TYPE_LABEL[r.type] || r.type) === type) && (!q || String(r.student || '').toLowerCase().includes(q)));
      document.getElementById('gr-rows').innerHTML = filtered.length ? filtered.map(r => `<tr data-attempt="${r.attemptId || ''}"><td><div class="gr-student"><span class="gr-avatar">${esc(initials(r.student))}</span>${esc(r.student || 'Estudiante')}</div></td><td>${esc(r.activity || '—')}</td><td>${esc(TYPE_LABEL[r.type] || r.type)}</td><td>${r.needsReview ? '<span class="gr-badge review">Pendiente de revisar</span>' : `<span class="gr-badge ${r.status}">${esc(STATUS_LABEL[r.status] || r.status)}</span>`}</td><td>${r.score != null ? r.score + (r.total != null ? ' / ' + r.total : '') : '—'}</td><td>${r.pct != null ? `<div class="gr-pct-wrap"><div class="gr-pct-bar"><div class="gr-pct-fill" style="width:${r.pct}%"></div></div>${r.pct}%</div>` : '—'}</td><td>${r.when ? new Date(r.when).toLocaleDateString('es-NI') : '—'}</td><td>${r.attemptId ? `<button class="gr-review-btn ${r.needsReview ? '' : 'done'}" data-open="${r.attemptId}" data-kind="${r.kind}">${r.needsReview ? 'Revisar' : 'Ver'}</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="8" style="text-align:center;color:#9097a4;padding:22px">Sin coincidencias.</td></tr>`;
      document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openDetail(b.dataset.open, b.dataset.kind));
    };
    document.getElementById('gr-type').onchange = paint;
    document.getElementById('gr-search').oninput = paint;
    paint();
  }

  async function openDetail(attemptId, kind) {
    const detailFn = kind === 'account' ? 'get_account_attempt_detail_for_grading' : 'get_attempt_detail_for_grading';
    const gradeFn = kind === 'account' ? 'grade_account_attempt_answer' : 'grade_attempt_answer';
    const back = document.createElement('div'); back.className = 'gr-detail-back';
    back.innerHTML = `<section class="gr-detail">${window.D360 ? window.D360.skeletonList(3) : 'Cargando…'}</section>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    const r = await sb().rpc(detailFn, { p_attempt_id: attemptId });
    if (r.error) { back.querySelector('.gr-detail').innerHTML = `<h2>No pudimos abrir esta entrega</h2><p class="gr-sub">${esc(r.error.message)}</p><button class="gr-review-btn" id="gr-close">Cerrar</button>`; back.querySelector('#gr-close').onclick = () => back.remove(); return; }
    const qs = r.data || [];
    back.querySelector('.gr-detail').innerHTML = `<h2>Revisar respuestas</h2><p class="gr-sub">Califica manualmente las preguntas abiertas. Las de opción múltiple ya se calificaron solas.</p>${qs.map(q => questionBlock(q)).join('')}<button class="gr-review-btn" id="gr-close" style="margin-top:6px">Cerrar</button>`;
    back.querySelector('#gr-close').onclick = () => { back.remove(); showGrades(); };
    qs.filter(q => q.is_manual).forEach(q => {
      const row = back.querySelector(`[data-grade-q="${q.question_id}"]`); if (!row) return;
      row.querySelector('button').onclick = async () => {
        const input = row.querySelector('input');
        const points = Number(input.value);
        if (isNaN(points) || points < 0 || points > q.points) { window.D360?.toast(`Ingresa un número entre 0 y ${q.points}.`, 'error'); return; }
        const btn = row.querySelector('button'); btn.disabled = true;
        const g = await sb().rpc(gradeFn, { p_attempt_id: attemptId, p_question_id: q.question_id, p_points: points });
        if (g.error) { window.D360?.toast(g.error.message, 'error'); btn.disabled = false; return; }
        window.D360?.toast('Calificación guardada.', 'success');
        row.outerHTML = `<span class="gr-graded-tag">✓ Calificado: ${points} / ${q.points} pts</span>`;
      };
    });
  }

  function questionBlock(q) {
    const answer = q.question_type === 'matching'
      ? (Array.isArray(q.student_answer) ? q.student_answer.map(p => esc(p.value || '(sin responder)')).join(', ') : '(sin responder)')
      : (q.student_answer == null ? '(sin responder)' : esc(typeof q.student_answer === 'string' ? q.student_answer.replace(/^"|"$/g, '') : JSON.stringify(q.student_answer)));
    const auto = q.is_auto_correct === true ? '<span class="gr-auto correct">✓ Correcta</span>' : q.is_auto_correct === false ? '<span class="gr-auto incorrect">✕ Incorrecta</span>' : '';
    const grading = q.is_manual
      ? (q.manual_points != null
          ? `<span class="gr-graded-tag">✓ Calificado: ${q.manual_points} / ${q.points} pts</span>`
          : `<div class="gr-grade-row" data-grade-q="${q.question_id}"><input type="number" min="0" max="${q.points}" step="0.5" placeholder="0–${q.points}"><button type="button">Guardar puntos</button></div>`)
      : '';
    return `<div class="gr-dq"><div class="qi">${esc(q.question_type)}</div><p class="prompt">${esc(q.prompt)}</p><div class="gr-answer-box">${answer}</div>${auto}${grading}</div>`;
  }

  async function bind() {
    const ws = document.getElementById('d360-class-workspace');
    if (!ws || ws === state.workspace || !sb()) return;
    try {
      await identify();
      const nav = [...ws.querySelectorAll('.cw-nav button')].find(b => b.textContent.includes('Calificaciones'));
      if (nav) nav.onclick = showGrades;
    } catch (e) { console.error('teacher-grades bind failed', e); }
  }
  const watch = () => { bind().finally(() => setTimeout(watch, 500)); };
  watch();
})();
