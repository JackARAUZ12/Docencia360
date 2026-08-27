(() => {
  const css=document.createElement('style');css.textContent=`.tam-back{position:fixed;inset:0;background:rgba(8,10,18,.55);backdrop-filter:blur(5px);display:grid;place-items:center;padding:18px;z-index:99999}.tam-modal{width:min(760px,100%);background:#fff;border-radius:28px;padding:32px;box-shadow:0 30px 100px rgba(0,0,0,.28);font-family:Inter,system-ui,sans-serif;color:#17181c;position:relative}.tam-head{display:flex;gap:15px;align-items:flex-start}.tam-badge{width:50px;height:50px;border-radius:16px;background:#f0efff;color:#5b4ce2;display:grid;place-items:center;font-size:25px;flex:0 0 auto}.tam-modal h2{margin:0;font-size:26px;letter-spacing:-.03em}.tam-modal .tam-sub{margin:7px 0 24px;color:#687080;font-size:14px;line-height:1.5}.tam-options{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tam-option{border:2px solid #e5e7eb;background:#fff;border-radius:19px;padding:19px;text-align:left;cursor:pointer;transition:.18s;position:relative}.tam-option:hover{border-color:#bbb6f7;transform:translateY(-1px)}.tam-option.current{border-color:#5b4ce2;background:#faf9ff}.tam-option strong{display:block;font-size:15px}.tam-option .ti{font-size:27px;display:block;margin-bottom:11px}.tam-option small{display:block;color:#687080;font-size:11px;line-height:1.55;margin-top:7px}.tam-option .tag{display:inline-block;margin-top:12px;padding:5px 8px;border-radius:999px;background:#f4f3ff;color:#5b4ce2;font-size:9px;font-weight:850}.tam-option .now{position:absolute;top:14px;right:14px;font-size:8px;font-weight:900;color:#fff;background:#5b4ce2;padding:4px 8px;border-radius:999px}.tam-foot{margin-top:18px;padding-top:15px;border-top:1px solid #eee;font-size:10px;color:#8a909b}.tam-x{position:absolute;top:18px;right:18px;border:0;background:#f3f1ff;color:#5746d5;width:32px;height:32px;border-radius:9px;font-weight:900;cursor:pointer}@media(max-width:620px){.tam-modal{padding:23px;border-radius:22px}.tam-options{grid-template-columns:1fr}.tam-modal h2{font-size:22px}}`;document.head.appendChild(css);
  let checking=false;
  async function check(){if(checking||!window.docenciaSupabase)return;checking=true;try{const {data:{user}}=await window.docenciaSupabase.auth.getUser();if(!user)return;const {data:p,error:pe}=await window.docenciaSupabase.from('profiles').select('is_teacher').eq('id',user.id).maybeSingle();if(pe||!p?.is_teacher)return;const {data:mode,error}=await window.docenciaSupabase.rpc('get_teacher_student_access_mode');if(error){console.error('student access mode check failed',error);return}if(!mode)open()}finally{checking=false}}
  async function open(){
    if(document.getElementById('tam'))return;
    let current=null;
    if(window.docenciaSupabase){const r=await window.docenciaSupabase.rpc('get_teacher_student_access_mode');if(!r.error)current=r.data||null}
    const x=document.createElement('div');x.id='tam';x.className='tam-back';
    x.innerHTML=`<section class="tam-modal" role="dialog" aria-modal="true" aria-labelledby="tam-title">${current?'<button class="tam-x" id="tam-close" type="button" title="Cerrar">✕</button>':''}<div class="tam-head"><div class="tam-badge">🎓</div><div><h2 id="tam-title">${current?'Acceso de tus estudiantes':'Configuremos el acceso de tus estudiantes'}</h2><p class="tam-sub">${current?'Este es el modo actual. Puedes cambiarlo cuando quieras; se aplica a partir de ahora, no borra nada de lo que ya creaste.':'Esta es una nueva configuración de Docencia360. Elige cómo quieres que participen tus estudiantes. Puedes cambiarlo después desde Configuración.'}</p></div></div><div class="tam-options"><button class="tam-option ${current==='accounts'?'current':''}" data-mode="accounts">${current==='accounts'?'<span class="now">ACTUAL</span>':''}<span class="ti">👤</span><strong>Estudiantes con su propia cuenta</strong><small>Cada estudiante inicia sesión y entra directo a sus clases con el código de clase. No se usan códigos de actividad.</small><span class="tag">SEGUIMIENTO COMPLETO</span></button><button class="tam-option ${current==='codes'?'current':''}" data-mode="codes">${current==='codes'?'<span class="now">ACTUAL</span>':''}<span class="ti">⚡</span><strong>Acceso sin cuenta</strong><small>No se usa código de clase. Tus estudiantes entran directo a cada actividad, tarea o examen con su propio código. No necesitan correo ni contraseña.</small><span class="tag">IDEAL PARA ACTIVIDADES</span></button></div><div class="tam-foot">${current?'Cambiar el modo no elimina estudiantes, actividades ni códigos ya creados.':'Podrás usar códigos específicos para cada actividad o examen cuando el acceso sea sin cuenta.'}</div></section>`;
    document.body.appendChild(x);
    x.querySelector('#tam-close')?.addEventListener('click',()=>x.remove());
    if(current)x.addEventListener('click',e=>{if(e.target===x)x.remove()});
    x.querySelectorAll('[data-mode]').forEach(b=>b.onclick=async()=>{
      if(b.dataset.mode===current){x.remove();return}
      x.querySelectorAll('button').forEach(z=>z.disabled=true);
      try{
        const r=await window.docenciaSupabase.rpc('set_teacher_student_access_mode',{p_mode:b.dataset.mode});
        if(r.error)throw r.error;
        x.remove();
        const label=b.dataset.mode==='codes'?'Acceso sin cuenta':'Estudiantes con su propia cuenta';
        window.D360?window.D360.toast(`Modo actualizado: ${label}.`,'success'):null;
        window.dispatchEvent(new CustomEvent('docencia360:student-access-mode',{detail:{mode:b.dataset.mode}}));
      }catch(e){
        console.error(e);
        window.D360?window.D360.toast(e.message||'No se pudo cambiar el modo.','error'):alert(e.message||'No se pudo cambiar el modo.');
        x.querySelectorAll('button').forEach(z=>z.disabled=false);
      }
    });
  }
  setTimeout(check,700);window.addEventListener('docencia360:teacher-ready',check);window.addEventListener('focus',check);window.docenciaOpenAccessMode=()=>open();
})();
