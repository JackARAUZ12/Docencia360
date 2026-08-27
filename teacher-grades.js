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
    const code = ws.querySelector('.cw-code')?.textContent?.replace(/^.*Código:\s*/, '').replace(/Copiar.*$/, '').trim();
    const r = await sb().rpc('get_my_teacher_classes');
    if (r.error) throw r.error;
    const c = (r.data || []).find(x => String(x.join_code).toUpperCase() === String(code || '').toUpperCase());
    if (!c) throw new Error('No pudimos identificar la clase.');
    state.classId = c.id; state.className = c.name;
    return true;
  }

  function main() { return state.workspace?.querySelector('.cw-main'); }

  async function showGrades() {
    const m = main(); if (!m) return;
    m.innerHTML = `<div class="cw-top"><div><div class="cw-kicker">Calificaciones</div><h1 class="cw-title">${esc(state.className)}</h1><div class="cw-meta">Resultados de actividades, tareas y exámenes</div></div></div><div class="gr-wrap" style="margin-top:18px">${window.D360 ? window.D360.skeletonList(3) : 'Cargando…'}</div>`;
    const [accountRes, anonRes] = await Promise.all([
      sb().rpc('get_teacher_activity_results', { p_class_id: state.classId }),
      sb().rpc('get_my_anonymous_activity_results', { p_class_id: state.classId })
    ]);
    const rows = (accountRes.error ? [] : (accountRes.data || [])).map(r => ({
      student: r.participant_name, activity: r.activity_title, type: r.activity_type,
      status: r.status, score: r.score, pct: r.percentage, when: r.submitted_at || r.started_at
    }));
    const anonRows = (anonRes.error ? [] : (anonRes.data || [])).map(r => ({
      student: r.student_name, activity: '(acceso por código)', type: r.activity_type,
      status: r.submitted_at ? 'submitted' : 'in_progress', score: r.score, pct: null,
      when: r.submitted_at || r.started_at
    }));
    const all = [...rows, ...anonRows].sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0));
    renderGrades(all);
  }

  function renderGrades(all) {
    const wrap = document.querySelector('.gr-wrap'); if (!wrap) return;
    if (!all.length) {
      wrap.innerHTML = `<div class="gr-empty">Todavía no hay resultados en esta clase.<br>Aparecerán aquí en cuanto tus estudiantes respondan una actividad, tarea o examen publicado.</div>`;
      return;
    }
    const graded = all.filter(r => r.pct != null);
    const avg = graded.length ? Math.round(graded.reduce((s, r) => s + Number(r.pct), 0) / graded.length) : null;
    const types = ['Todas', ...new Set(all.map(r => TYPE_LABEL[r.type] || r.type))];
    wrap.innerHTML = `
      <section class="gr-stats">
        <div class="gr-stat"><span>Entregas</span><strong>${all.length}</strong></div>
        <div class="gr-stat"><span>Promedio general</span><strong>${avg != null ? avg + '%' : '—'}</strong></div>
        <div class="gr-stat"><span>Estudiantes distintos</span><strong>${new Set(all.map(r => r.student)).size}</strong></div>
      </section>
      <div class="gr-tools">
        <select id="gr-type">${types.map(t => `<option>${esc(t)}</option>`).join('')}</select>
        <input id="gr-search" placeholder="Buscar estudiante…">
      </div>
      <div class="gr-table-wrap"><table class="gr-table"><thead><tr><th>Estudiante</th><th>Actividad</th><th>Tipo</th><th>Estado</th><th>Puntaje</th><th>%</th><th>Fecha</th></tr></thead><tbody id="gr-rows"></tbody></table></div>`;
    const paint = () => {
      const type = document.getElementById('gr-type').value;
      const q = document.getElementById('gr-search').value.trim().toLowerCase();
      const filtered = all.filter(r => (type === 'Todas' || (TYPE_LABEL[r.type] || r.type) === type) && (!q || String(r.student || '').toLowerCase().includes(q)));
      document.getElementById('gr-rows').innerHTML = filtered.length ? filtered.map(r => `<tr><td>${esc(r.student || 'Estudiante')}</td><td>${esc(r.activity || '—')}</td><td>${esc(TYPE_LABEL[r.type] || r.type)}</td><td><span class="gr-badge ${r.status}">${esc(STATUS_LABEL[r.status] || r.status)}</span></td><td>${r.score != null ? r.score : '—'}</td><td>${r.pct != null ? r.pct + '%' : '—'}</td><td>${r.when ? new Date(r.when).toLocaleDateString('es-NI') : '—'}</td></tr>`).join('') : `<tr><td colspan="7" style="text-align:center;color:#9097a4;padding:22px">Sin coincidencias.</td></tr>`;
    };
    document.getElementById('gr-type').onchange = paint;
    document.getElementById('gr-search').oninput = paint;
    paint();
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
