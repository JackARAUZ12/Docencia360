(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const css = `
    #d360-class-workspace{position:fixed;inset:0;background:#f7f8fc;z-index:1000;overflow:auto;color:#171827;animation:d360-fade-in .2s ease}
    .cw-shell{min-height:100%;display:grid;grid-template-columns:236px minmax(0,1fr)}
    .cw-side{background:#fff;border-right:1px solid #e8e9ef;padding:20px 12px;display:flex;flex-direction:column;gap:14px;position:sticky;top:0;height:100vh}
    .cw-brand{font-weight:900;color:#27224a;font-size:15px;display:flex;gap:9px;align-items:center;padding:3px 8px 8px}
    .cw-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#5b4ce2,#7c6bf2);color:#fff;display:grid;place-items:center;flex:0 0 auto;box-shadow:0 6px 14px rgba(91,76,226,.28)}
    .cw-back{border:0;background:#f3f1ff;color:#5746d5;border-radius:10px;padding:10px;text-align:left;font-weight:800;font-size:11px}
    .cw-nav{display:grid;gap:2px}
    .cw-nav button{border:0;background:transparent;text-align:left;padding:10px 11px;border-radius:10px;color:#747b89;font-weight:750;font-size:11px;display:flex;align-items:center;gap:9px;position:relative}
    .cw-nav button.active{background:#f0edff;color:#5645d5}
    .cw-nav button:hover{background:#f5f3ff;color:#5645d5}
    .cw-nav button.soon:after{content:"pronto";margin-left:auto;font-size:7px;background:#f1f2f6;color:#9299a6;padding:2px 6px;border-radius:999px;font-weight:850}
    .cw-nav i{font-style:normal;width:16px;text-align:center;font-size:13px;flex:0 0 auto}
    .cw-main{min-width:0;padding:26px clamp(16px,3vw,48px) 60px}
    .cw-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
    .cw-kicker{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#7165d9;font-weight:900}
    .cw-title{font-size:clamp(22px,3vw,32px);letter-spacing:-.04em;margin:5px 0}
    .cw-meta{color:#7d8492;font-size:12px}
    .cw-code{background:#eeebff;color:#5544d4;border-radius:11px;padding:10px 13px;font-size:11px;font-weight:850;white-space:nowrap}
    .cw-code button{border:0;background:none;color:#5544d4;font-weight:900;margin-left:8px;cursor:pointer}
    .cw-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-top:20px}
    .cw-stat{background:#fff;border:1px solid #e8e9ef;border-radius:14px;padding:15px;transition:transform .15s,box-shadow .15s}
    .cw-stat:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(20,20,45,.07)}
    .cw-stat span{font-size:9px;color:#8b92a0;font-weight:750;text-transform:uppercase;letter-spacing:.03em}
    .cw-stat strong{display:block;font-size:22px;margin-top:5px}
    .cw-panels{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(240px,.8fr);gap:12px;margin-top:14px}
    .cw-panel{background:#fff;border:1px solid #e8e9ef;border-radius:15px;padding:17px}
    .cw-panel h2{font-size:13px;margin:0}
    .cw-muted{color:#9097a4;font-size:10px;line-height:1.5}
    .cw-empty{margin-top:13px;border:1px dashed #dddfea;border-radius:12px;padding:26px;text-align:center;color:#858c9a;font-size:11px}
    .cw-action{margin-top:10px;border:0;background:#5b4ce2;color:#fff;border-radius:9px;padding:9px 13px;font-weight:850;font-size:10px;cursor:pointer}
    .cw-recent{display:grid;gap:8px;margin-top:10px}
    .cw-recent-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border:1px solid #eceeF4;border-radius:11px;cursor:pointer}
    .cw-recent-row:hover{border-color:#d6d0ff;background:#faf9ff}
    .cw-recent-row strong{font-size:11px;display:block}
    .cw-recent-row span{font-size:9px;color:#9097a4}
    .cw-badge{font-size:8px;font-weight:850;padding:4px 8px;border-radius:999px;white-space:nowrap}
    .cw-badge.draft{background:#fff7df;color:#8a5b00}.cw-badge.published{background:#ecfdf3;color:#087443}

    @media(min-width:1500px){.cw-main{max-width:1360px;margin:0 auto}}
    @media(max-width:1024px){.cw-panels{grid-template-columns:1fr}}
    @media(max-width:920px){
      .cw-shell{grid-template-columns:72px minmax(0,1fr)}
      .cw-side{padding:18px 6px}
      .cw-brand span,.cw-back span,.cw-nav button span,.cw-nav button.soon:after{display:none}
      .cw-back{display:grid;place-items:center;padding:10px}
      .cw-nav button{justify-content:center}
      .cw-grid{grid-template-columns:1fr 1fr}
    }
    @media(max-width:620px){
      #d360-class-workspace{overflow:visible}
      .cw-shell{display:block}
      .cw-side{position:sticky;top:0;z-index:20;height:auto;flex-direction:row;align-items:center;padding:8px;border-right:0;border-bottom:1px solid #e8e9ef;gap:8px}
      .cw-brand{display:none}
      .cw-back{flex:0 0 auto;padding:9px}
      .cw-nav{display:flex;overflow:auto;flex:1;gap:2px}
      .cw-nav button{flex:0 0 auto;padding:8px 10px}
      .cw-main{padding:16px 14px 40px}
      .cw-code{width:100%}
      .cw-grid{grid-template-columns:1fr 1fr}
    }
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const sb = () => window.docenciaSupabase;
  let classesCache = [];
  let current = null;

  async function open(card) {
    if (!sb() || !window.__docenciaCurrentUser) return;
    const id = card.dataset.id;
    const name = card.querySelector('.class-name')?.textContent?.trim();
    const all = classesCache.length ? classesCache : (await sb().rpc('get_my_teacher_classes')).data || [];
    classesCache = all;
    let c = id ? all.find(x => x.id === id) : null;
    if (!c) { const idx = [...document.querySelectorAll('#classes-host .class-card')].indexOf(card); c = all.find(x => x.name === name) || all[idx]; }
    if (!c?.id) return;
    const { data, error } = await sb().rpc('get_my_teacher_class', { p_class_id: c.id });
    const cls = error ? c : (Array.isArray(data) ? data[0] : data) || c;
    mount(cls);
  }

  const NAV = [
    { id: 'resumen', label: 'Resumen', icon: '⌂' },
    { id: 'estudiantes', label: 'Estudiantes', icon: '♙' },
    { id: 'actividades', label: 'Actividades', icon: '◈' },
    { id: 'tareas', label: 'Tareas', icon: '▤' },
    { id: 'examenes', label: 'Exámenes', icon: '✓' },
    { id: 'calificaciones', label: 'Calificaciones', icon: '▦', soon: true },
    { id: 'asistencia', label: 'Asistencia', icon: '◷', soon: true },
    { id: 'recursos', label: 'Recursos', icon: '▧', soon: true },
    { id: 'avisos', label: 'Avisos', icon: '◌', soon: true }
  ];
  const TYPE_LABEL = { activity: 'Actividades', assignment: 'Tareas', exam: 'Exámenes' };

  function mount(c) {
    document.getElementById('d360-class-workspace')?.remove();
    current = c;
    const el = document.createElement('div'); el.id = 'd360-class-workspace';
    el.innerHTML = `<div class="cw-shell">
      <aside class="cw-side">
        <div class="cw-brand"><span class="cw-logo">D</span><span>Docencia360</span></div>
        <button class="cw-back" id="cw-back">← <span>Volver a mis clases</span></button>
        <nav class="cw-nav">${NAV.map((n, i) => `<button data-id="${n.id}" class="${i === 0 ? 'active' : ''} ${n.soon ? 'soon' : ''}"><i>${n.icon}</i><span>${esc(n.label)}</span></button>`).join('')}</nav>
      </aside>
      <main class="cw-main"></main>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('#cw-back').onclick = () => el.remove();

    // Visual "active" state tracking is independent of whichever module (roster, activities…)
    // takes over the click for a given tab, so the sidebar always reflects where you are.
    el.querySelectorAll('.cw-nav button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('soon')) { window.D360?.toast('Este módulo está en camino.'); return; }
        el.querySelectorAll('.cw-nav button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    el.querySelector('.cw-nav button[data-id="resumen"]').addEventListener('click', () => renderSummary(current));

    // Exposed so other modules (roster, activities) can return here without a full page reload.
    window.docenciaShowClassSummary = () => {
      el.querySelectorAll('.cw-nav button').forEach(b => b.classList.remove('active'));
      el.querySelector('.cw-nav button[data-id="resumen"]')?.classList.add('active');
      renderSummary(current);
    };

    renderSummary(c);
  }

  function clickTabAndThen(label, after) {
    const btn = [...document.querySelectorAll('.cw-nav button')].find(b => b.textContent.includes(label));
    if (!btn) return;
    btn.click();
    if (!after) return;
    let tries = 0;
    const tryAfter = () => { const el = after(); if (el) { el.click(); return; } if (tries++ < 10) setTimeout(tryAfter, 200); };
    setTimeout(tryAfter, 200);
  }

  async function renderSummary(c) {
    const main = document.querySelector('#d360-class-workspace .cw-main'); if (!main) return;
    main.innerHTML = `<div class="cw-top"><div><div class="cw-kicker">Espacio de clase</div><h1 class="cw-title">${esc(c.name)}</h1><div class="cw-meta">${esc(c.subject_name || 'Sin materia')}${c.grade ? ' · ' + esc(c.grade) : ''}${c.group_name ? ' · ' + esc(c.group_name) : ''}</div></div><div class="cw-code">Código: ${esc(c.join_code)} <button id="cw-copy">Copiar</button></div></div>
      <section class="cw-grid"><article class="cw-stat"><span>Estudiantes</span><strong>${Number(c.student_count || 0)}</strong></article><article class="cw-stat"><span>Actividades</span><strong id="cw-n-activity">—</strong></article><article class="cw-stat"><span>Tareas</span><strong id="cw-n-assignment">—</strong></article><article class="cw-stat"><span>Exámenes</span><strong id="cw-n-exam">—</strong></article></section>
      <section class="cw-panels">
        <article class="cw-panel"><h2>Actividad reciente</h2><div id="cw-recent"><div class="cw-muted" style="margin-top:10px">Cargando…</div></div></article>
        <article class="cw-panel"><h2>Acciones rápidas</h2><p class="cw-muted">Desde aquí podrás administrar el trabajo de tus estudiantes.</p><button class="cw-action" id="cw-q-activity" type="button">＋ Nueva actividad</button><button class="cw-action" id="cw-q-task" type="button" style="margin-left:6px">＋ Nueva tarea</button><button class="cw-action" id="cw-q-exam" type="button" style="margin-left:6px">＋ Nuevo examen</button></article>
      </section>`;
    main.querySelector('#cw-copy').onclick = async () => { try { await navigator.clipboard.writeText(c.join_code); window.D360?.toast('Código copiado.', 'success'); } catch {} };
    main.querySelector('#cw-q-activity').onclick = () => clickTabAndThen('Actividades', () => document.getElementById('ta-new'));
    main.querySelector('#cw-q-task').onclick = () => clickTabAndThen('Tareas', () => document.getElementById('ta-new'));
    main.querySelector('#cw-q-exam').onclick = () => clickTabAndThen('Exámenes', () => document.getElementById('ta-new'));

    if (!sb()) return;
    const r = await sb().from('activities').select('id,title,activity_type,status,created_at').eq('class_id', c.id).order('created_at', { ascending: false });
    const items = r.error ? [] : (r.data || []);
    ['activity', 'assignment', 'exam'].forEach(t => { const n = document.getElementById('cw-n-' + t); if (n) n.textContent = items.filter(a => a.activity_type === t).length; });
    const recent = document.getElementById('cw-recent'); if (!recent) return;
    if (!items.length) {
      recent.innerHTML = '<div class="cw-empty">Todavía no hay actividad en esta clase.<br><button class="cw-action" id="cw-first">Crear primera actividad</button></div>';
      recent.querySelector('#cw-first').onclick = () => clickTabAndThen('Actividades', () => document.getElementById('ta-new'));
    } else {
      recent.innerHTML = '<div class="cw-recent">' + items.slice(0, 5).map(a => `<div class="cw-recent-row" data-type="${a.activity_type}"><div><strong>${esc(a.title)}</strong><span>${esc(TYPE_LABEL[a.activity_type] || a.activity_type)}</span></div><span class="cw-badge ${a.status}">${a.status === 'published' ? 'Publicada' : 'Borrador'}</span></div>`).join('') + '</div>';
      recent.querySelectorAll('.cw-recent-row').forEach(row => row.onclick = () => clickTabAndThen(TYPE_LABEL[row.dataset.type], null));
    }
  }

  const bind = () => { const host = document.getElementById('classes-host'); if (!host) return setTimeout(bind, 200); host.addEventListener('click', e => { const card = e.target.closest('.class-card'); if (card && !e.target.closest('[data-copy]')) open(card); }); };
  bind();
})();
