(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initials = name => String(name || 'E').trim().split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'E';
  const state = { workspace:null, summary:null, classId:null, className:'', students:[], filtered:[] };
  const style = document.createElement('style');
  style.textContent = `
    .cw-students{display:grid;gap:16px}.cw-student-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px}.cw-student-count{font-size:13px;color:#7d8492}.cw-student-search{width:min(360px,100%);height:42px;border:1px solid #e4e5eb;border-radius:11px;background:#fff;padding:0 13px;outline:none;font-size:12px}.cw-student-search:focus{border-color:#5b4ce2;box-shadow:0 0 0 3px #5b4ce21f}.cw-student-list{display:grid;gap:8px}.cw-student-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:13px 15px;border:1px solid #e7e8ee;border-radius:13px;background:#fff}.cw-student-avatar{width:42px;height:42px;border-radius:12px;background:#eeebff;color:#5746d5;display:grid;place-items:center;font-size:12px;font-weight:900}.cw-student-name{font-size:12px;font-weight:850}.cw-student-meta{margin-top:3px;color:#9299a6;font-size:9px}.cw-student-status{font-size:9px;font-weight:800;color:#087443;background:#ecfdf3;padding:5px 8px;border-radius:999px}.cw-student-empty{border:1px dashed #dcdde5;border-radius:14px;background:#fff;padding:45px 20px;text-align:center;color:#858c9a;font-size:11px;line-height:1.55}.cw-student-empty strong{display:block;color:#171827;font-size:15px;margin-bottom:5px}.cw-student-back{border:0;background:#f3f1ff;color:#5746d5;border-radius:9px;padding:8px 11px;font-size:10px;font-weight:850}.cw-student-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px}.cw-student-head h2{margin:0;font-size:22px}.cw-student-head p{margin:5px 0 0;color:#7d8492;font-size:11px}.cw-dark .cw-student-search,.cw-dark .cw-student-row,.cw-dark .cw-student-empty{background:#151728;color:#f4f5fb;border-color:#292b40}.cw-dark .cw-student-meta,.cw-dark .cw-student-count,.cw-dark .cw-student-head p{color:#9ea5ba}.cw-dark .cw-student-empty strong{color:#f4f5fb}.cw-dark .cw-student-avatar{background:#282347;color:#c4bcff}.cw-dark .cw-student-status{background:#17382b;color:#71d9a4}.cw-dark .cw-student-back{background:#252044;color:#b8adff}
    @media(max-width:650px){.cw-student-toolbar,.cw-student-head{display:grid}.cw-student-search{width:100%}.cw-student-row{grid-template-columns:auto minmax(0,1fr)}.cw-student-status{grid-column:2;justify-self:start}.cw-student-head h2{font-size:20px}}
  `;
  document.head.appendChild(style);

  async function findClass(){
    if(!window.docenciaSupabase || !window.__docenciaCurrentUser) throw new Error('Sesión no disponible.');
    const code = state.workspace?.querySelector('.cw-code')?.textContent?.replace(/^.*Código:\s*/,'').replace(/Copiar.*$/,'').trim();
    const r = await window.docenciaSupabase.rpc('get_my_teacher_classes');
    if(r.error) throw r.error;
    const list = r.data || [];
    const c = code ? list.find(x => String(x.join_code).toUpperCase() === code.toUpperCase()) : null;
    if(!c) throw new Error('No pudimos identificar la clase.');
    return c;
  }

  async function loadStudents(){
    const host = document.getElementById('cw-students-view');
    if(!host) return;
    host.innerHTML = '<div class="cw-student-empty">Cargando estudiantes…</div>';
    try{
      const r = await window.docenciaSupabase.rpc('get_my_teacher_class_students',{p_class_id:state.classId});
      if(r.error) throw r.error;
      state.students = r.data || [];
      state.filtered = state.students.slice();
      renderStudents();
    }catch(e){
      host.innerHTML = `<div class="cw-student-empty"><strong>No pudimos cargar los estudiantes</strong>${esc(e.message || 'Intenta nuevamente.')}</div>`;
    }
  }

  function renderStudents(){
    const host = document.getElementById('cw-students-view'); if(!host) return;
    const q = document.getElementById('cw-student-search')?.value.trim().toLowerCase() || '';
    state.filtered = state.students.filter(s => String(s.full_name || '').toLowerCase().includes(q));
    const count = document.getElementById('cw-student-count'); if(count) count.textContent = `${state.filtered.length}${q ? ` de ${state.students.length}` : ''} estudiante${state.filtered.length === 1 ? '' : 's'}`;
    if(!state.filtered.length){
      host.innerHTML = `<div class="cw-student-empty"><strong>${q ? 'No encontramos coincidencias' : 'Aún no hay estudiantes'}</strong>${q ? 'Prueba con otro nombre.' : 'Comparte el código de esta clase para que tus estudiantes puedan unirse.'}</div>`;
      return;
    }
    host.innerHTML = `<div class="cw-student-list">${state.filtered.map(s => `<article class="cw-student-row"><div class="cw-student-avatar">${esc(initials(s.full_name))}</div><div><div class="cw-student-name">${esc(s.full_name || 'Estudiante')}</div><div class="cw-student-meta">Se unió ${formatDate(s.joined_at)}</div></div><span class="cw-student-status">Activo</span></article>`).join('')}</div>`;
  }
  function formatDate(v){if(!v)return 'recientemente';const d=new Date(v);if(Number.isNaN(d.getTime()))return 'recientemente';return new Intl.DateTimeFormat('es-NI',{day:'2-digit',month:'short',year:'numeric'}).format(d)}

  function restoreSummary(){
    const main=state.workspace?.querySelector('.cw-main'); if(!main || !state.summary) return;
    main.innerHTML=state.summary;
    bindWorkspace();
  }

  function showStudents(){
    state.workspace=document.getElementById('d360-class-workspace');
    const main=state.workspace?.querySelector('.cw-main'); if(!main)return;
    if(!state.summary) state.summary=main.innerHTML;
    const title=state.workspace.querySelector('.cw-title')?.textContent?.trim() || 'Clase';
    const meta=state.workspace.querySelector('.cw-meta')?.textContent?.trim() || '';
    main.innerHTML=`<div class="cw-top"><div><div class="cw-kicker">Espacio de clase</div><h1 class="cw-title">${esc(title)}</h1><div class="cw-meta">${esc(meta)}</div></div><button class="cw-student-back" id="cw-student-back">← Volver al resumen</button></div><div class="cw-students"><div class="cw-student-head"><div><h2>Estudiantes</h2><p>Administra y consulta los alumnos inscritos en esta clase.</p></div><div class="cw-code">Código: ${esc(state.workspace.querySelector('.cw-code')?.textContent?.replace(/^.*Código:\s*/,'').replace(/Copiar.*$/,'').trim() || '')}</div></div><div class="cw-student-toolbar"><span id="cw-student-count" class="cw-student-count">Cargando…</span><input id="cw-student-search" class="cw-student-search" placeholder="🔍  Buscar estudiante…" autocomplete="off"></div><div id="cw-students-view"></div></div>`;
    state.workspace.querySelector('#cw-student-back').onclick=restoreSummary;
    state.workspace.querySelector('#cw-student-search').oninput=renderStudents;
    markActive();
    loadStudents();
  }

  function markActive(){
    const ws=state.workspace;if(!ws)return;
    ws.querySelectorAll('.cw-nav button,.cw-tabs button').forEach(b=>b.classList.remove('active'));
    [...ws.querySelectorAll('.cw-nav button')].find(b=>b.textContent.includes('Estudiantes'))?.classList.add('active');
    [...ws.querySelectorAll('.cw-tabs button')].find(b=>b.textContent.trim()==='Estudiantes')?.classList.add('active');
  }

  async function bindWorkspace(){
    const ws=document.getElementById('d360-class-workspace'); if(!ws)return;
    state.workspace=ws;
    const studentsButtons=[...ws.querySelectorAll('.cw-nav button,.cw-tabs button')].filter(b=>b.textContent.includes('Estudiantes'));
    studentsButtons.forEach(b=>{b.onclick=async()=>{try{const c=await findClass();state.classId=c.id;state.className=c.name;showStudents()}catch(e){alert(e.message||'No se pudo abrir estudiantes.')}}});
  }

  function watch(){
    const ws=document.getElementById('d360-class-workspace');
    if(ws && ws!==state.workspace){state.workspace=ws;state.summary=null;bindWorkspace();}
    setTimeout(watch,500);
  }
  watch();
})();
