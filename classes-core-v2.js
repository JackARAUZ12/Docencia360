(() => {
  const style = document.createElement('style');
  style.textContent = `
    .classes-section{margin-top:24px}.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}.section-head h2{margin:0;font-size:22px}.section-sub{margin:5px 0 0;color:var(--m);font-size:13px}.small-btn{border:0;border-radius:12px;padding:10px 14px;background:var(--p);color:#fff;font-weight:800;font-size:13px}.class-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.class-card{padding:18px;border:1px solid var(--b);border-radius:20px;background:#fff;box-shadow:0 4px 16px rgba(20,20,40,.035);transition:transform .15s,box-shadow .15s}.class-card:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(20,20,40,.07)}.class-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.class-name{font-weight:850;font-size:17px}.class-meta{margin-top:6px;color:var(--m);font-size:13px;line-height:1.4}.join-code{margin-top:15px;padding:11px 12px;border-radius:12px;background:#f6f5ff;display:flex;justify-content:space-between;gap:10px;align-items:center}.join-code strong{color:var(--p)}.copy-btn{border:0;background:none;color:var(--p);font-weight:800;font-size:12px}.empty{padding:22px;border:1px dashed var(--b);border-radius:18px;background:#fff;color:var(--m);font-size:14px;line-height:1.5}.modal-backdrop{position:fixed;inset:0;background:rgba(12,14,22,.46);backdrop-filter:blur(3px);display:grid;place-items:end center;padding:12px;z-index:20}.modal{width:min(100%,500px);max-height:92vh;overflow:auto;background:#fff;border-radius:26px 26px 18px 18px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.24)}.modal h2{margin:0;font-size:23px}.modal .sub{margin-bottom:20px}.modal-actions{display:flex;gap:10px;margin-top:20px;position:sticky;bottom:-24px;background:#fff;padding:14px 0 20px;margin-bottom:-24px;border-top:1px solid var(--b);z-index:5}.secondary{flex:1;min-height:48px;border:1px solid var(--b);border-radius:13px;background:#fff;font-weight:800}.modal-actions .primary{flex:1}.field select{width:100%;min-height:48px;padding:12px 14px;border:1px solid var(--b);border-radius:13px;background:#fff}.loading-line{color:var(--m);font-size:13px;padding:10px 0}.subject-row{display:flex;gap:8px}.subject-row select{flex:1}.new-subject{flex:0 0 auto;min-height:48px;border:1px solid var(--b);border-radius:13px;background:#fff;color:var(--p);font-weight:800;padding:0 13px}.subject-create{margin-top:8px;padding:12px;border:1px solid var(--b);border-radius:13px;background:#fafaff}.subject-create-row{display:flex;gap:8px}.subject-create-row input{flex:1;min-width:0;min-height:44px;padding:10px 12px;border:1px solid var(--b);border-radius:11px}.subject-create-row button{min-height:44px;border:0;border-radius:11px;padding:0 13px;background:var(--p);color:#fff;font-weight:800}.student-classes{margin-top:18px}.student-join{padding:18px;border:1px solid var(--b);border-radius:18px;background:#fff}.student-join h2{margin:0;font-size:20px}.join-form{display:flex;gap:10px;margin-top:14px}.join-form input{flex:1;min-width:0;min-height:48px;padding:12px 14px;border:1px solid var(--b);border-radius:13px;text-transform:uppercase;letter-spacing:.08em}.join-form button{min-height:48px;border:0;border-radius:13px;padding:0 16px;background:var(--p);color:#fff;font-weight:800}.student-list{display:grid;gap:12px;margin-top:14px}
    .sched-block select,.sched-block input{min-height:44px;border:1px solid var(--b);border-radius:11px;padding:0 10px;background:#fff;font-size:13px}
    .period-row{display:grid;grid-template-columns:1fr;gap:12px}
    @media(min-width:560px){.period-row{grid-template-columns:1fr 1fr}}
    #class-modal,#class-modal *{max-width:100%}
    #class-modal input[type=date],#class-modal input[type=time]{width:100%;min-width:0}
    @media(max-width:520px){.section-head{align-items:stretch}.section-head .small-btn{white-space:nowrap}.class-list{grid-template-columns:1fr}.join-form{display:grid}.join-form button{width:100%}.subject-create-row{display:grid}.sched-block{flex-direction:column;align-items:stretch!important}.sched-block .sb-day,.sched-block .sb-from,.sched-block .sb-to{width:100%}.sched-block .sb-del{align-self:flex-end}.modal{border-radius:20px 20px 0 0}}
    @media(min-width:700px){.modal-backdrop{place-items:center}.modal{border-radius:26px}}
    html.d360-dark .class-card,html.d360-dark .empty,html.d360-dark .modal,html.d360-dark .student-join{background:#151728!important;color:#f4f5fb!important;border-color:#292b40!important}
    html.d360-dark .class-meta,html.d360-dark .loading-line{color:#9ea5ba!important}
    html.d360-dark .join-code{background:#211e3a!important}
    html.d360-dark .field input,html.d360-dark .field select,html.d360-dark .sched-block select,html.d360-dark .sched-block input,html.d360-dark .subject-create-row input,html.d360-dark .join-form input{background:#191b2d!important;color:#f4f5fb!important;border-color:#303247!important}
    html.d360-dark .new-subject,html.d360-dark .secondary{background:#191b2d!important;color:#f4f5fb!important;border-color:#303247!important}
    html.d360-dark .subject-create{background:#191b2d!important;border-color:#303247!important}
    html.d360-dark .modal-actions{background:#151728!important;border-color:#292b40!important}
    html.d360-dark .msg{background:#191b2d!important;color:#c9cbdb!important}
  `;
  document.head.appendChild(style);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={user:null,subjects:[]};

  async function loadSubjects(select){
    const {data,error}=await window.docenciaSupabase.from('subjects').select('id,name').eq('teacher_id',state.user.id).order('name');
    if(error) throw error;
    state.subjects=data||[];
    select.innerHTML='<option value="">Sin especificar</option>';
    state.subjects.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;select.appendChild(o)});
  }

  let cachedAccessMode=null;
  async function loadClasses(){
    const host=document.getElementById('classes-host');if(!host||!window.docenciaSupabase)return;
    if(cachedAccessMode===null){const m=await window.docenciaSupabase.rpc('get_teacher_student_access_mode');cachedAccessMode=m.error?'accounts':(m.data||'accounts')}
    const {data,error}=await window.docenciaSupabase.rpc('get_my_teacher_classes');
    if(error){host.innerHTML='<div class="empty">No pudimos cargar tus clases. '+esc(error.message)+'</div>';return}
    if(!data?.length){host.innerHTML='<div class="empty"><strong>Aún no tienes clases</strong><br>Tu primera clase puede quedar lista en unos segundos. Crea una, personalízala y comparte el código con tus estudiantes.</div>';return}
    host.innerHTML='<div class="class-list">'+data.map(c=>`<article class="class-card" data-id="${esc(c.id)}"><div class="class-card-top"><div><div class="class-name">${esc(c.name)}</div><div class="class-meta">${esc(c.subject_name||'Sin materia')}${c.grade?' · '+esc(c.grade):''}${c.group_name?' · '+esc(c.group_name):''} · ${c.student_count||0} estudiante${Number(c.student_count)===1?'':'s'}</div></div></div>${cachedAccessMode==='codes'?'<div class="join-code" style="background:#f3f1ff"><span style="color:#5544d4;font-weight:800">⚡ Acceso sin cuenta — usa los códigos de cada actividad</span></div>':`<div class="join-code"><span><strong>Código:</strong> ${esc(c.join_code)}</span><button class="copy-btn" data-copy="${esc(c.join_code)}">Copiar</button></div>`}</article>`).join('')+'</div>';
    host.querySelectorAll('[data-copy]').forEach(btn=>btn.onclick=async()=>{try{await navigator.clipboard.writeText(btn.dataset.copy);btn.textContent='Copiado ✓';setTimeout(()=>btn.textContent='Copiar',1200)}catch{btn.textContent=btn.dataset.copy}});
  }
  window.addEventListener('docencia360:student-access-mode',e=>{cachedAccessMode=e.detail.mode;loadClasses()});

  function modal(){
    if(document.getElementById('class-modal'))return;
    const el=document.createElement('div');el.id='class-modal';el.className='ta-modal-back';
    el.innerHTML=`<section class="ta-modal" role="dialog" aria-modal="true" aria-labelledby="class-title"><h2 id="class-title">Crear nueva clase</h2><p class="sub">Organiza una clase en segundos. El código para tus estudiantes se generará automáticamente.</p><form id="class-form" class="form"><label class="field">Nombre de la clase<input id="cn" required maxlength="80" placeholder="Ej. Matemáticas 7.º A"></label><label class="field">Materia<div class="subject-row"><select id="cs"><option value="">Sin especificar</option></select><button type="button" class="new-subject" id="ns">+ Crear</button></div><div id="subject-create" class="subject-create" hidden><div class="subject-create-row"><input id="sn" maxlength="60" placeholder="Nombre de la materia, ej. Matemáticas"><button type="button" id="save-subject">Guardar</button></div><div id="sm" class="msg" hidden></div></div></label><div class="choices"><label class="field">Grado<input id="cg" maxlength="40" placeholder="Ej. 7.º"></label><label class="field">Grupo<input id="cgr" maxlength="40" placeholder="Ej. A"></label></div><label class="field">Descripción <span style="font-weight:400;color:var(--m)">(opcional)</span><input id="cd" maxlength="180" placeholder="Información de la clase"></label>
      <div class="field"><label style="font-weight:700">📅 Período de la clase</label><div class="period-row"><label class="field">Fecha de inicio<input type="date" id="cp-start" required></label><label class="field">Fecha de finalización<input type="date" id="cp-end" required></label></div></div>
      <div class="field"><label style="font-weight:700">🗓 Horario</label><p class="sub" style="margin:2px 0 8px">Agrega uno o varios bloques. No todas las clases son de lunes a viernes.</p><div id="cp-blocks"></div><button type="button" class="new-subject" id="cp-add-block">＋ Agregar horario</button></div>
      <div id="cm" class="msg" hidden></div><div class="modal-actions"><button type="button" class="secondary" id="cc">Cancelar</button><button class="primary" id="cb">Crear clase</button></div></form></section>`;
    document.body.appendChild(el);
    const select=el.querySelector('#cs');
    loadSubjects(select).catch(e=>{select.innerHTML='<option value="">No se pudieron cargar tus materias</option>';});
    el.querySelector('#ns').onclick=()=>{const box=el.querySelector('#subject-create');box.hidden=!box.hidden;if(!box.hidden)setTimeout(()=>el.querySelector('#sn').focus(),20)};
    el.querySelector('#save-subject').onclick=async()=>{const input=el.querySelector('#sn'),m=el.querySelector('#sm'),name=input.value.trim();if(!name){m.hidden=false;m.className='msg error';m.textContent='Escribe el nombre de la materia.';return}const b=el.querySelector('#save-subject');b.disabled=true;m.hidden=true;try{const {data,error}=await window.docenciaSupabase.from('subjects').insert({name,teacher_id:state.user.id}).select('id,name').single();if(error)throw error;await loadSubjects(select);select.value=data.id;input.value='';el.querySelector('#subject-create').hidden=true}catch(e){m.hidden=false;m.className='msg error';m.textContent=e.code==='23505'?'Ya tienes una materia con ese nombre.':(e.message||'No se pudo crear la materia.')}finally{b.disabled=false}};
    el.querySelector('#cc').onclick=()=>el.remove();el.addEventListener('click',e=>{if(e.target===el)el.remove()});
    const DOW=[['1','Lunes'],['2','Martes'],['3','Miércoles'],['4','Jueves'],['5','Viernes'],['6','Sábado'],['0','Domingo']];
    const blocksHost=el.querySelector('#cp-blocks');
    function addBlock(day,from,to){
      const row=document.createElement('div');row.className='sched-block';row.style.cssText='display:flex;gap:6px;align-items:center;margin-bottom:7px;flex-wrap:wrap';
      row.innerHTML=`<select class="sb-day" style="flex:1;min-width:110px">${DOW.map(([v,l])=>`<option value="${v}" ${v===day?'selected':''}>${l}</option>`).join('')}</select><input type="time" class="sb-from" value="${from||'07:00'}"><span style="font-size:11px;color:var(--m)">a</span><input type="time" class="sb-to" value="${to||'08:00'}"><button type="button" class="sb-del" style="border:0;background:none;color:#b42318;font-weight:900;cursor:pointer">✕</button>`;
      row.querySelector('.sb-del').onclick=()=>row.remove();
      blocksHost.appendChild(row);
    }
    addBlock('1');
    el.querySelector('#cp-add-block').onclick=()=>addBlock('3');
    el.querySelector('#class-form').onsubmit=async e=>{
      e.preventDefault();const b=el.querySelector('#cb'),m=el.querySelector('#cm');b.disabled=true;m.hidden=true;
      try{
        const startDate=el.querySelector('#cp-start').value, endDate=el.querySelector('#cp-end').value;
        if(!startDate||!endDate) throw new Error('Indica el período de la clase (inicio y fin).');
        if(endDate<startDate) throw new Error('La fecha final no puede ser anterior a la inicial.');
        const blocks=[...blocksHost.querySelectorAll('.sched-block')].map(row=>({day_of_week:Number(row.querySelector('.sb-day').value),start_time:row.querySelector('.sb-from').value,end_time:row.querySelector('.sb-to').value}));
        if(!blocks.length) throw new Error('Agrega al menos un horario.');
        if(blocks.some(bl=>bl.end_time<=bl.start_time)) throw new Error('La hora final debe ser posterior a la hora de inicio en cada bloque.');
        const {data,error}=await window.docenciaSupabase.from('classes').insert({teacher_id:state.user.id,name:el.querySelector('#cn').value.trim(),subject_id:select.value||null,grade:el.querySelector('#cg').value.trim()||null,group_name:el.querySelector('#cgr').value.trim()||null,description:el.querySelector('#cd').value.trim()||null,start_date:startDate,end_date:endDate}).select('id').single();
        if(error)throw error;
        if(!data?.id)throw new Error('La clase no devolvió un identificador válido.');
        const sched=await window.docenciaSupabase.from('class_schedules').insert(blocks.map(bl=>({class_id:data.id,...bl})));
        if(sched.error)throw sched.error;
        const gen=await window.docenciaSupabase.rpc('generate_class_sessions',{p_class_id:data.id});
        if(gen.error) console.error('No se pudieron generar las sesiones automáticamente:',gen.error.message);
        el.remove();window.D360?.toast('Clase creada. '+(gen.error?'':`${gen.data} sesiones generadas.`),'success');await loadClasses()
      }catch(e){m.hidden=false;m.className='msg error';m.textContent=e.message||'No se pudo crear la clase.'}finally{b.disabled=false}
    };
    setTimeout(()=>el.querySelector('#cn').focus(),30);
  }

  window.mountClasses=function(user){state.user=user;const content=document.querySelector('.content');if(!content||document.getElementById('classes-section'))return;const section=document.createElement('section');section.id='classes-section';section.className='classes-section';section.innerHTML='<div class="section-head"><div><h2>Mis clases</h2><p class="section-sub">Tus espacios de enseñanza, organizados en un solo lugar.</p></div><button class="small-btn" id="new-class">+ Nueva clase</button></div><div id="classes-host"></div>';content.appendChild(section);document.getElementById('new-class').onclick=modal;loadClasses()};

  function mountStudentClasses(user){const content=document.querySelector('.content');if(!content||document.getElementById('student-classes-section'))return;const section=document.createElement('section');section.id='student-classes-section';section.className='student-classes';content.appendChild(section)}
  window.mountStudentClasses=mountStudentClasses;
  window.docenciaReloadClasses=()=>loadClasses();
})();
