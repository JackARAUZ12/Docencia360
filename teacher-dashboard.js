(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const style = document.createElement('style');
  style.textContent = `
    .teacher-dashboard{display:grid;gap:20px}
    .teacher-welcome{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}
    .teacher-welcome h1{margin:0;font-size:clamp(25px,4vw,34px);letter-spacing:-.035em}
    .teacher-welcome p{margin:7px 0 0;color:var(--m);font-size:14px}
    .teacher-actions{display:flex;gap:9px;flex-wrap:wrap}
    .dash-btn{min-height:44px;border:1px solid var(--b);background:#fff;border-radius:12px;padding:0 14px;font-weight:800;font-size:13px}
    .dash-btn.primary{background:var(--p);border-color:var(--p);color:#fff}
    .stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .stat{background:#fff;border:1px solid var(--b);border-radius:18px;padding:16px}
    .stat-label{font-size:12px;color:var(--m);font-weight:700}
    .stat-value{font-size:28px;font-weight:900;letter-spacing:-.03em;margin-top:6px}
    .dashboard-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(260px,1fr);gap:16px}
    .dash-panel{background:#fff;border:1px solid var(--b);border-radius:20px;padding:18px}
    .dash-panel h2{margin:0;font-size:17px}.dash-panel p{color:var(--m);font-size:13px;line-height:1.5}
    .quick-list{display:grid;gap:9px;margin-top:14px}
    .quick{display:flex;align-items:center;gap:12px;padding:13px;border:1px solid var(--b);border-radius:14px;background:#fff;text-align:left}
    .quick-icon{width:38px;height:38px;border-radius:11px;background:#f1efff;display:grid;place-items:center;font-size:18px;flex:none}
    .quick strong{display:block;font-size:13px}.quick span{display:block;margin-top:2px;color:var(--m);font-size:11px}
    .classes-anchor{scroll-margin-top:20px}
    @media(max-width:760px){.teacher-welcome{align-items:stretch;flex-direction:column}.teacher-actions{display:grid;grid-template-columns:1fr 1fr}.dash-btn{width:100%}.stats-grid{grid-template-columns:1fr 1fr}.stats-grid .stat:last-child{grid-column:1/-1}.dashboard-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  window.mountTeacherDashboard = async function(user, profile) {
    const content = document.querySelector('.content');
    if (!content || document.getElementById('teacher-dashboard')) return;

    content.innerHTML = `
      <div id="teacher-dashboard" class="teacher-dashboard">
        <section class="teacher-welcome">
          <div><h1>Hola, ${esc((profile.full_name || 'Profesor').split(' ')[0])} 👋</h1><p>Este es tu espacio docente. Aquí organizas todo lo relacionado con tus clases.</p></div>
          <div class="teacher-actions"><button class="dash-btn primary" id="dash-new-class">+ Nueva clase</button><button class="dash-btn" id="dash-scroll-classes">Mis clases</button></div>
        </section>
        <section class="stats-grid" id="teacher-stats">
          <article class="stat"><div class="stat-label">Clases</div><div class="stat-value">—</div></article>
          <article class="stat"><div class="stat-label">Estudiantes</div><div class="stat-value">—</div></article>
          <article class="stat"><div class="stat-label">Actividades</div><div class="stat-value">0</div></article>
        </section>
        <div class="dashboard-grid">
          <section class="dash-panel"><h2>Tu actividad</h2><p>Pronto aquí verás tareas por revisar, exámenes pendientes y avisos de tus clases.</p><div class="quick-list"><button class="quick" id="quick-class"><span class="quick-icon">📚</span><span><strong>Crear una clase</strong><span>Organiza un nuevo grupo de estudiantes.</span></span></button><button class="quick" disabled><span class="quick-icon">📝</span><span><strong>Crear tarea</strong><span>Disponible cuando tengas una clase.</span></span></button><button class="quick" disabled><span class="quick-icon">🧪</span><span><strong>Crear examen</strong><span>Construye evaluaciones para tus alumnos.</span></span></button></div></section>
          <section class="dash-panel"><h2>Próximamente</h2><p>El espacio docente crecerá alrededor de tus clases.</p><div class="quick-list"><div class="quick"><span class="quick-icon">📋</span><span><strong>Asistencia</strong><span>Control rápido por clase.</span></span></div><div class="quick"><span class="quick-icon">📊</span><span><strong>Calificaciones</strong><span>Notas y promedios.</span></span></div><div class="quick"><span class="quick-icon">📢</span><span><strong>Avisos</strong><span>Comunicación con estudiantes.</span></span></div></div></section>
        </div>
        <section id="teacher-classes-anchor" class="classes-anchor"></section>
      </div>`;

    const stats = document.getElementById('teacher-stats');
    const { data, error } = await window.docenciaSupabase.rpc('get_my_teacher_classes');
    if (!error && data) {
      const classCount = data.length;
      const studentCount = data.reduce((sum, c) => sum + Number(c.student_count || 0), 0);
      stats.querySelectorAll('.stat-value')[0].textContent = classCount;
      stats.querySelectorAll('.stat-value')[1].textContent = studentCount;
    } else {
      stats.querySelectorAll('.stat-value')[0].textContent = '0';
      stats.querySelectorAll('.stat-value')[1].textContent = '0';
    }

    const create = () => {
      const btn = document.getElementById('new-class');
      if (btn) btn.click();
      else window.mountClasses?.(user);
    };
    document.getElementById('dash-new-class').onclick = create;
    document.getElementById('quick-class').onclick = create;
    document.getElementById('dash-scroll-classes').onclick = () => document.getElementById('classes-section')?.scrollIntoView({ behavior:'smooth', block:'start' });

    const anchor = document.getElementById('teacher-classes-anchor');
    const classesHost = document.createElement('div');
    classesHost.id = 'teacher-classes-container';
    anchor.replaceWith(classesHost);
    window.mountClasses?.(user);
  };
})();
