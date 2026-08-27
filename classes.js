(() => {
  const style = document.createElement('style');
  style.textContent = `
    .classes-section{margin-top:18px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.section-head h2{margin:0;font-size:20px}.small-btn{border:0;border-radius:11px;padding:9px 12px;background:var(--p);color:#fff;font-weight:800;font-size:13px}.class-list{display:grid;gap:12px}.class-card{padding:16px;border:1px solid var(--b);border-radius:18px;background:#fff}.class-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.class-name{font-weight:850;font-size:16px}.class-meta{margin-top:5px;color:var(--m);font-size:13px}.join-code{margin-top:12px;padding:10px 12px;border-radius:11px;background:#f4f5f8;font-size:13px;display:flex;justify-content:space-between;gap:10px;align-items:center}.copy-btn{border:0;background:none;color:var(--p);font-weight:800;font-size:12px}.empty{padding:18px;border:1px dashed var(--b);border-radius:18px;background:#fff;color:var(--m);font-size:14px}.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.38);display:grid;place-items:end center;padding:12px;z-index:20}.modal{width:min(100%,480px);background:#fff;border-radius:24px 24px 18px 18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.2)}.modal h2{margin:0;font-size:22px}.modal .sub{margin-bottom:18px}.modal-actions{display:flex;gap:10px;margin-top:18px}.secondary{flex:1;min-height:46px;border:1px solid var(--b);border-radius:12px;background:#fff;font-weight:800}.modal .primary{flex:1}.field select{width:100%;min-height:48px;padding:12px 14px;border:1px solid var(--b);border-radius:13px;background:#fff}.loading-line{color:var(--m);font-size:13px;padding:8px 0}.student-classes{margin-top:18px}.student-join{padding:18px;border:1px solid var(--b);border-radius:18px;background:#fff}.student-join h2{margin:0;font-size:20px}.join-form{display:flex;gap:10px;margin-top:14px}.join-form input{flex:1;min-width:0;min-height:48px;padding:12px 14px;border:1px solid var(--b);border-radius:13px;text-transform:uppercase;letter-spacing:.08em}.join-form button{min-height:48px;border:0;border-radius:13px;padding:0 16px;background:var(--p);color:#fff;font-weight:800}.student-list{display:grid;gap:12px;margin-top:14px}@media(max-width:520px){.join-form{display:grid}.join-form button{width:100%}}@media(min-width:700px){.modal-backdrop{place-items:center}.modal{border-radius:24px}}
  `;
  document.head.appendChild(style);

  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { user:null };

  async function loadClasses() {
    const host = document.getElementById('classes-host');
    if (!host || !window.docenciaSupabase) return;
    host.innerHTML = '<div class="loading-line">Cargando clases…</div>';
    const { data, error } = await window.docenciaSupabase
      .from('classes')
      .select('id,name,grade,group_name,join_code,description,subjects(name),class_members(count)')
      .eq('teacher_id', state.user.id)
      .eq('is_active', true)
      .order('created_at', { ascending:false });
    if (error) {
      host.innerHTML = '<div class="empty">No pudimos cargar tus clases. '+esc(error.message)+'</div>';
      return;
    }
    if (!data.length) {
      host.innerHTML = '<div class="empty">Todavía no tienes clases. Crea tu primera clase y comparte el código con tus estudiantes.</div>';
      return;
    }
    host.innerHTML = '<div class="class-list">'+data.map(c => {
      const subject = c.subjects?.name || 'Sin materia';
      const count = c.class_members?.[0]?.count ?? 0;
      return `<article class="class-card"><div class="class-card-top"><div><div class="class-name">${esc(c.name)}</div><div class="class-meta">${esc(subject)}${c.grade?' · '+esc(c.grade):''}${c.group_name?' · '+esc(c.group_name):''} · ${count} estudiante${count===1?'':'s'}</div></div></div><div class="join-code"><span><strong>Código:</strong> ${esc(c.join_code)}</span><button class="copy-btn" data-copy="${esc(c.join_code)}">Copiar</button></div></article>`;
    }).join('')+'</div>';
    host.querySelectorAll('[data-copy]').forEach(btn=>btn.onclick=async()=>{try{await navigator.clipboard.writeText(btn.dataset.copy);btn.textContent='Copiado ✓';setTimeout(()=>btn.textContent='Copiar',1200)}catch{btn.textContent=btn.dataset.copy}});
  }

  function modal() {
    if (document.getElementById('class-modal')) return;
    const el = document.createElement('div');
    el.id='class-modal'; el.className='modal-backdrop';
    el.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="class-title"><h2 id="class-title">Nueva clase</h2><p class="sub">Crea una clase en unos segundos. Docencia360 generará automáticamente el código para tus estudiantes.</p><form id="class-form" class="form"><label class="field">Nombre de la clase<input id="cn" required maxlength="80" placeholder="Ej. Matemáticas 7.º A"></label><label class="field">Materia<select id="cs"><option value="">Sin especificar</option></select></label><div class="choices"><label class="field">Grado<input id="cg" maxlength="40" placeholder="Ej. 7.º"></label><label class="field">Grupo<input id="cgr" maxlength="40" placeholder="Ej. A"></label></div><label class="field">Descripción <span style="font-weight:400;color:var(--m)">(opcional)</span><input id="cd" maxlength="180" placeholder="Información de la clase"></label><div id="cm" class="msg" hidden></div><div class="modal-actions"><button type="button" class="secondary" id="cc">Cancelar</button><button class="primary" id="cb">Crear clase</button></div></form></section>`;
    document.body.appendChild(el);
    const select=el.querySelector('#cs');
    window.docenciaSupabase.from('subjects').select('id,name').order('name').then(({data})=>{if(data) data.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;select.appendChild(o)})});
    el.querySelector('#cc').onclick=()=>el.remove();
    el.addEventListener('click',e=>{if(e.target===el)el.remove()});
    el.querySelector('#class-form').onsubmit=async e=>{
      e.preventDefault();
      const b=el.querySelector('#cb'),m=el.querySelector('#cm'); b.disabled=true;m.hidden=true;
      try{
        const {error}=await window.docenciaSupabase.from('classes').insert({teacher_id:state.user.id,name:el.querySelector('#cn').value.trim(),subject_id:select.value||null,grade:el.querySelector('#cg').value.trim()||null,group_name:el.querySelector('#cgr').value.trim()||null,description:el.querySelector('#cd').value.trim()||null,join_code:null}).select().single();
        if(error) throw error;
        el.remove(); await loadClasses();
      }catch(e){m.hidden=false;m.className='msg error';m.textContent=e.message||'No se pudo crear la clase.'}finally{b.disabled=false}
    };
    setTimeout(()=>el.querySelector('#cn').focus(),30);
  }

  window.mountClasses = function(user) {
    state.user=user;
    const content=document.querySelector('.content');
    if(!content || document.getElementById('classes-section')) return;
    const section=document.createElement('section');
    section.id='classes-section'; section.className='classes-section';
    section.innerHTML='<div class="section-head"><h2>Mis clases</h2><button class="small-btn" id="new-class">+ Nueva clase</button></div><div id="classes-host"></div>';
    content.appendChild(section);
    document.getElementById('new-class').onclick=modal;
    loadClasses();
  };

  async function loadStudentClasses(user) {
    const host=document.getElementById('student-class-list');
    if(!host || !window.docenciaSupabase) return;
    host.innerHTML='<div class="loading-line">Cargando tus clases…</div>';
    const {data,error}=await window.docenciaSupabase.from('class_members').select('joined_at,classes(id,name,grade,group_name,description,subjects(name),profiles!classes_teacher_id_fkey(full_name))').eq('student_id',user.id).order('joined_at',{ascending:false});
    if(error){host.innerHTML='<div class="empty">No pudimos cargar tus clases. '+esc(error.message)+'</div>';return;}
    if(!data?.length){host.innerHTML='<div class="empty">Todavía no estás inscrito en ninguna clase. Pídele a tu profesor el código de su clase.</div>';return;}
    host.innerHTML='<div class="student-list">'+data.map(m=>{const c=m.classes; if(!c)return ''; const subject=c.subjects?.name||'Sin materia'; const teacher=c.profiles?.full_name||'Profesor'; return `<article class="class-card"><div class="class-name">${esc(c.name)}</div><div class="class-meta">${esc(subject)}${c.grade?' · '+esc(c.grade):''}${c.group_name?' · '+esc(c.group_name):''}</div><div class="class-meta">👨‍🏫 ${esc(teacher)}</div></article>`}).join('')+'</div>';
  }

  function mountStudentClasses(user){
    const content=document.querySelector('.content');
    if(!content || document.getElementById('student-classes-section')) return;
    const section=document.createElement('section');
    section.id='student-classes-section'; section.className='student-classes';
    section.innerHTML='<div class="student-join"><h2>Mis clases</h2><p class="sub" style="margin-bottom:0">Únete a una clase usando el código que te dio tu profesor.</p><form id="join-form" class="join-form"><input id="join-code" maxlength="32" placeholder="Código de clase" autocomplete="off" required><button id="join-btn">Unirme a la clase</button></form><div id="join-msg" class="msg" hidden></div><div id="student-class-list"></div></div>';
    content.appendChild(section);
    document.getElementById('join-form').onsubmit=async e=>{
      e.preventDefault();
      const b=document.getElementById('join-btn'),m=document.getElementById('join-msg');b.disabled=true;m.hidden=true;
      try{const code=document.getElementById('join-code').value.trim().toUpperCase();const r=await window.docenciaSupabase.rpc('join_class',{p_join_code:code});if(r.error)throw r.error;m.hidden=false;m.className='msg success';m.textContent='Te uniste correctamente a la clase.';document.getElementById('join-code').value='';await loadStudentClasses(user)}catch(e){m.hidden=false;m.className='msg error';const msg=e.message||'';m.textContent=msg==='invalid_join_code'?'El código de clase no es válido o la clase ya no está activa.':msg==='only_students_can_join'?'Esta cuenta no está configurada como estudiante.':'No se pudo unir a la clase. Intenta nuevamente.'}finally{b.disabled=false}
    };
    loadStudentClasses(user);
  }

  window.mountStudentClasses=mountStudentClasses;

  const boot=()=>{
    if(!window.docenciaSupabase) return;
    const content=document.querySelector('.content');
    if(!content) return;
    window.docenciaSupabase.auth.getUser().then(async ({data})=>{
      if(!data?.user)return;
      const {data:p}=await window.docenciaSupabase.from('profiles').select('is_teacher,is_student').eq('id',data.user.id).maybeSingle();
      if(p?.is_student) mountStudentClasses(data.user);
    });
  };
  const observer=new MutationObserver(boot); observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(boot,1000);
})();