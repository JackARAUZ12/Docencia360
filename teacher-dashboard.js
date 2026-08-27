(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const css = document.createElement('style');
  css.textContent = `
    .d360{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:calc(100vh - 68px);background:#f6f7fb;margin:-28px -18px 0}
    .d360-side{background:#fff;border-right:1px solid #e8e9ef;padding:20px 12px;display:flex;flex-direction:column;gap:16px;position:sticky;top:0;height:calc(100vh - 68px)}
    .d360-brand{display:flex;align-items:center;gap:9px;padding:3px 8px 12px;font-size:15px;font-weight:900;color:#27224a}.d360-brand b{color:#5b4ce2}.d360-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#5b4ce2,#7c6bf2);color:#fff;display:grid;place-items:center;box-shadow:0 6px 14px rgba(91,76,226,.28)}
    .d360-nav{display:grid;gap:2px}.d360-nav button{border:0;background:transparent;color:#737b89;text-align:left;padding:10px 11px;border-radius:10px;font-size:11px;font-weight:750;display:flex;gap:10px;align-items:center;position:relative}
    .d360-nav button.active{background:#f0edff;color:#5645d5}.d360-nav button:hover{background:#f5f3ff;color:#5645d5}
    .d360-nav button.soon:after{content:"pronto";margin-left:auto;font-size:7px;background:#f1f2f6;color:#9299a6;padding:2px 6px;border-radius:999px;font-weight:850}
    .d360-nav i{font-style:normal;width:17px;text-align:center;font-size:14px}
    .d360-bottom{margin-top:auto}.d360-plan{background:linear-gradient(145deg,#5544dc,#7565ed);color:#fff;border-radius:15px;padding:13px;box-shadow:0 10px 24px rgba(85,68,220,.25)}.d360-plan small{font-size:9px;opacity:.78}.d360-plan strong{display:block;font-size:12px;margin-top:4px}.d360-plan p{font-size:9px;line-height:1.4;opacity:.82;margin:5px 0 9px}.d360-plan button{width:100%;border:0;border-radius:8px;background:#fff;color:#5141d0;padding:7px;font-size:9px;font-weight:850}
    .d360-profile{display:flex;align-items:center;gap:8px;border-top:1px solid #eeeef2;margin-top:12px;padding:12px 5px 0;cursor:pointer;border-radius:10px}.d360-profile:hover{background:#faf9ff}.d360-avatar{width:30px;height:30px;border-radius:50%;background:#eeeafd;color:#5141d0;display:grid;place-items:center;font-size:11px;font-weight:900}.d360-profile strong{display:block;font-size:10px}.d360-profile span{font-size:8px;color:#9299a6}
    .d360-main{min-width:0;padding:20px clamp(16px,2.4vw,40px) 40px}
    .d360-top{height:36px;display:flex;justify-content:flex-end;align-items:center;gap:9px;margin-bottom:16px}.d360-search{width:210px;height:34px;border:1px solid #e6e7ec;border-radius:9px;background:#fff;padding:0 11px;font-size:10px;outline:none;transition:box-shadow .15s,border-color .15s}.d360-search:focus{border-color:#b7aefb;box-shadow:0 0 0 3px rgba(91,76,226,.12)}
    .d360-bell,.d360-user{height:34px;width:34px;border:1px solid #e6e7ec;background:#fff;border-radius:9px;display:grid;place-items:center;position:relative;cursor:pointer}.d360-user{border-radius:50%;background:#e9e2da;font-weight:900;font-size:11px}.d360-dot{position:absolute;width:6px;height:6px;background:#ef4d72;border-radius:50%;right:6px;top:5px}
    .d360-hero{position:relative;overflow:hidden;border-radius:20px;padding:clamp(20px,3vw,32px) clamp(20px,3.4vw,36px);min-height:150px;color:#fff;background:linear-gradient(115deg,#5a44df,#7255ed 60%,#8f6ff2);box-shadow:0 18px 38px rgba(91,76,226,.22);animation:d360-fade-in .3s ease}
    .d360-hero:after{content:"";position:absolute;width:300px;height:300px;border-radius:50%;right:-100px;top:-170px;background:rgba(255,255,255,.09)}
    .d360-hero:before{content:"";position:absolute;width:180px;height:180px;border-radius:50%;left:-60px;bottom:-110px;background:rgba(255,255,255,.06)}
    .d360-kicker{font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:850;opacity:.8;position:relative;z-index:1}
    .d360-hero h1{font-size:clamp(24px,2.6vw,30px);letter-spacing:-.045em;margin:5px 0;position:relative;z-index:1}
    .d360-hero p{margin:0;max-width:480px;font-size:11.5px;line-height:1.55;color:rgba(255,255,255,.85);position:relative;z-index:1}
    .d360-hero-actions{display:flex;gap:9px;margin-top:16px;position:relative;z-index:2;flex-wrap:wrap}.d360-hero-actions button{height:36px;border-radius:10px;padding:0 15px;font-size:10.5px;font-weight:850}
    .d360-primary{border:0;background:#fff;color:#5141d0}.d360-primary:hover{background:#f4f2ff}
    .d360-secondary{border:1px solid rgba(255,255,255,.34);background:rgba(255,255,255,.1);color:#fff}.d360-secondary:hover{background:rgba(255,255,255,.18)}

    .d360-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:14px 0}
    .d360-stat{background:#fff;border:1px solid #e8e9ef;border-radius:14px;padding:13px 14px;display:flex;align-items:center;gap:10px;animation:d360-fade-in .3s ease both}
    .d360-stat:nth-child(1){animation-delay:.02s}.d360-stat:nth-child(2){animation-delay:.07s}.d360-stat:nth-child(3){animation-delay:.12s}.d360-stat:nth-child(4){animation-delay:.17s}
    .d360-stat:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(20,20,45,.08)}
    .d360-stat-icon{width:36px;height:36px;border-radius:11px;background:#f0edff;display:grid;place-items:center;font-size:15px;flex:0 0 auto}
    .d360-stat:nth-child(2) .d360-stat-icon{background:#fff0f4}.d360-stat:nth-child(3) .d360-stat-icon{background:#eaf8ef}.d360-stat:nth-child(4) .d360-stat-icon{background:#edf4ff}
    .d360-label{font-size:8.5px;color:#8b92a0;font-weight:750;text-transform:uppercase;letter-spacing:.04em}.d360-value{font-size:19px;font-weight:900;margin-top:2px;line-height:1}

    .d360-panels{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(240px,.7fr);gap:11px;margin-bottom:18px}
    .d360-panel{background:#fff;border:1px solid #e8e9ef;border-radius:16px;padding:16px;animation:d360-fade-in .3s ease .1s both}
    .d360-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}.d360-panel-head h2{font-size:12.5px;margin:0}.d360-panel-head span{font-size:8px;color:#9aa0aa}
    .d360-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
    .d360-action{border:1px solid transparent;background:#fff;border-radius:12px;padding:10px 6px;text-align:center}
    .d360-action:hover{background:#faf9ff;border-color:#ece9ff;transform:translateY(-2px)}
    .d360-action-icon{width:33px;height:33px;border-radius:11px;background:#efedff;display:grid;place-items:center;margin:auto auto 6px;font-size:15px}
    .d360-action:nth-child(2) .d360-action-icon{background:#fff0f3}.d360-action:nth-child(3) .d360-action-icon{background:#eaf8ef}.d360-action:nth-child(4) .d360-action-icon{background:#edf4ff}
    .d360-action strong{display:block;font-size:8.5px}.d360-action small{display:block;color:#969daa;font-size:7.2px;line-height:1.35;margin-top:3px}
    .d360-tip{background:linear-gradient(160deg,#faf9ff,#f3f1ff);border:1px solid #eeecff;border-radius:13px;padding:13px}.d360-tip strong{display:block;font-size:10.5px;margin-top:5px}.d360-tip p{font-size:8.5px;color:#7d8592;line-height:1.5;margin:5px 0 9px}.d360-tip button{border:0;background:#5b4ce2;color:#fff;border-radius:8px;padding:8px 11px;font-size:8.5px;font-weight:850}

    .d360-class-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px}.d360-class-head h2{font-size:15px;margin:0}
    .d360-tools{display:flex;gap:6px;align-items:center}
    .d360-tabs{display:flex;background:#fff;border:1px solid #e8e9ef;border-radius:9px;padding:2px}.d360-tabs button{border:0;background:transparent;padding:6px 9px;border-radius:7px;color:#858c99;font-size:8.5px;font-weight:750}.d360-tabs .active{background:#f0edff;color:#5848d8}
    .d360-new{border:0;background:#5b4ce2;color:#fff;border-radius:9px;padding:8px 11px;font-size:8.5px;font-weight:850}

    .d360 .classes-section{margin-top:0}.d360 .section-head{display:none}.d360 .class-list{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:11px}
    .d360 .class-card{position:relative;min-height:132px;padding:16px;border:1px solid #e8e9ef;border-radius:16px;background:#fff;box-shadow:0 5px 18px rgba(20,20,40,.035);overflow:hidden}
    .d360 .class-card:hover{box-shadow:0 12px 28px rgba(20,20,45,.09);transform:translateY(-2px)}
    .d360 .class-card:after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#5b4ce2,#8d7df5)}.d360 .class-card:nth-child(2n):after{background:linear-gradient(90deg,#0fa979,#57cda8)}.d360 .class-card:nth-child(3n):after{background:linear-gradient(90deg,#b66b25,#e3a35d)}
    .d360 .class-name{font-size:13px;font-weight:900}.d360 .class-meta{font-size:9px;margin-top:5px}.d360 .join-code{margin-top:12px;padding:8px 9px;border-radius:9px;font-size:9px}.d360 .copy-btn{font-size:9px}

    @media(min-width:1400px){.d360-main{max-width:1360px;margin:0 auto}}
    @media(max-width:920px){.d360{grid-template-columns:72px minmax(0,1fr)}.d360-side{padding:18px 7px}.d360-brand span:not(.d360-logo),.d360-brand b,.d360-nav button span:not(.d360-icon),.d360-nav button.soon:after,.d360-plan,.d360-profile div:not(.d360-avatar){display:none}.d360-nav button{justify-content:center}.d360-profile{justify-content:center}.d360-panels{grid-template-columns:1fr}}
    @media(max-width:620px){.d360{display:block;margin:-28px -18px 0}.d360-side{height:auto;position:sticky;top:0;z-index:30;border-right:0;border-bottom:1px solid #e8e9ef;padding:6px 8px}.d360-brand{display:none}.d360-nav{display:flex;overflow:auto}.d360-nav button{white-space:nowrap;padding:8px 9px}.d360-nav button span:not(.d360-icon){display:inline}.d360-bottom{display:none}.d360-main{padding:12px 12px 30px}.d360-search{width:150px}.d360-hero{padding:20px 17px;min-height:165px}.d360-hero h1{font-size:24px}.d360-stats{grid-template-columns:1fr 1fr}.d360-stat:nth-child(4){grid-column:1/-1}.d360-panels{grid-template-columns:1fr}.d360-actions{grid-template-columns:1fr 1fr}.d360-class-head{align-items:flex-start;gap:7px}.d360-tools{flex-wrap:wrap;justify-content:flex-end}.d360 .class-list{grid-template-columns:1fr}}

    html.d360-dark .d360-search{background:#191b2d;color:#f4f5fb;border-color:#303247}
    html.d360-dark .d360-hero{box-shadow:0 18px 38px rgba(20,15,50,.4)}
  `;
  document.head.appendChild(css);

  // Routes for nav items that don't have a dedicated global module yet: they guide
  // the teacher to the right place instead of doing nothing.
  const NOT_BUILT_MSG = 'Este módulo todavía no está disponible. Estamos construyéndolo.';
  const NAV_ACTIONS = {
    inicio: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    clases: () => jumpToClasses(),
    estudiantes: () => jumpToClasses('Abre una clase para ver y agregar sus estudiantes.'),
    actividades: () => jumpToClasses('Abre una clase para crear y administrar sus actividades.'),
    tareas: () => jumpToClasses('Abre una clase para crear y administrar sus tareas.'),
    examenes: () => jumpToClasses('Abre una clase para crear y administrar sus exámenes.'),
    calificaciones: () => toast(NOT_BUILT_MSG),
    mensajes: () => toast(NOT_BUILT_MSG),
    recursos: () => toast(NOT_BUILT_MSG),
    configuracion: () => { if (typeof window.docenciaOpenAccessMode === 'function') window.docenciaOpenAccessMode(); else toast(NOT_BUILT_MSG); }
  };
  function toast(msg, tone = 'info') { window.D360 ? window.D360.toast(msg, tone) : alert(msg); }
  function jumpToClasses(hint) {
    document.getElementById('d360-class-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (hint) setTimeout(() => toast(hint), 350);
  }

  window.mountTeacherDashboard = function(user, profile) {
    profile = profile || {};
    window.__docenciaCurrentUser = user || null;
    window.__docenciaProfile = profile;
    const outer = document.querySelector('.content');
    if (!outer || !user || profile.is_teacher !== true) return;
    if (document.getElementById('teacher-dashboard')) return;

    const first = String(profile.full_name || 'Profesor').trim().split(/\s+/)[0] || 'Profesor';
    const initial = first.charAt(0).toUpperCase() || 'P';

    outer.innerHTML = `<div id="teacher-dashboard" class="d360">
      <aside class="d360-side">
        <div class="d360-brand"><span class="d360-logo">D</span><span>Docencia<b>360</b></span></div>
        <nav class="d360-nav">
          <button class="active" data-route="inicio"><i>⌂</i><span>Inicio</span></button>
          <button data-route="clases"><i>▣</i><span>Mis clases</span></button>
          <button data-route="estudiantes"><i>♙</i><span>Estudiantes</span></button>
          <button data-route="actividades"><i>◈</i><span>Actividades</span></button>
          <button data-route="tareas"><i>▤</i><span>Tareas</span></button>
          <button data-route="examenes"><i>✓</i><span>Exámenes</span></button>
          <button data-route="calificaciones" class="soon"><i>▦</i><span>Calificaciones</span></button>
          <button data-route="mensajes" class="soon"><i>◌</i><span>Mensajes</span></button>
          <button data-route="recursos" class="soon"><i>▧</i><span>Recursos</span></button>
          <button data-route="configuracion"><i>⚙</i><span>Configuración</span></button>
        </nav>
        <div class="d360-bottom"><div class="d360-plan"><small>Plan Pro</small><strong>Tu espacio docente</strong><p>Todo listo para organizar tus clases.</p><button type="button">Ver plan</button></div><div class="d360-profile" id="d360-profile-btn"><div class="d360-avatar">${esc(initial)}</div><div><strong>${esc(first)}</strong><span>Profesor</span></div></div></div>
      </aside>
      <main class="d360-main">
        <div class="d360-top"><input class="d360-search" placeholder="⌕  Buscar..." aria-label="Buscar"><button class="d360-bell" type="button" id="d360-bell">♧<i class="d360-dot"></i></button><div class="d360-user" id="d360-user-btn">${esc(initial)}</div></div>
        <section class="d360-hero"><div class="d360-kicker">¡Bienvenido de vuelta!</div><h1>Hola, ${esc(first)} 👋</h1><p>Organiza tus clases, crea actividades y acompaña a tus estudiantes desde un solo lugar.</p><div class="d360-hero-actions"><button class="d360-primary" id="d360-create" type="button">＋ Nueva clase</button><button class="d360-secondary" id="d360-view" type="button">Ver mis clases →</button></div></section>
        <section class="d360-stats"><article class="d360-stat"><div class="d360-stat-icon">▣</div><div><div class="d360-label">Mis clases</div><div class="d360-value" id="d360-count">—</div></div></article><article class="d360-stat"><div class="d360-stat-icon">♟</div><div><div class="d360-label">Estudiantes</div><div class="d360-value" id="d360-students">—</div></div></article><article class="d360-stat"><div class="d360-stat-icon">◈</div><div><div class="d360-label">Actividades</div><div class="d360-value" id="d360-activities">—</div></div></article><article class="d360-stat"><div class="d360-stat-icon">▤</div><div><div class="d360-label">Publicadas</div><div class="d360-value" id="d360-published">—</div></div></article></section>
        <section class="d360-panels"><div class="d360-panel"><div class="d360-panel-head"><h2>Acciones rápidas</h2><span>Tu día, más sencillo</span></div><div class="d360-actions"><button class="d360-action" id="d360-q-class" type="button"><div class="d360-action-icon">✓</div><strong>Nueva clase</strong><small>Crea un grupo y comparte el código.</small></button><button class="d360-action" id="d360-q-activity" type="button"><div class="d360-action-icon">▤</div><strong>Nueva actividad</strong><small>Ábrela dentro de tu clase.</small></button><button class="d360-action" id="d360-q-exam" type="button"><div class="d360-action-icon">⌘</div><strong>Nuevo examen</strong><small>Ábrelo dentro de tu clase.</small></button><button class="d360-action" id="d360-q-settings" type="button"><div class="d360-action-icon">⚙</div><strong>Modo de acceso</strong><small>Configura cómo entran tus estudiantes.</small></button></div></div><div class="d360-panel"><div class="d360-panel-head"><h2>Consejo para ti</h2></div><div class="d360-tip">💡<strong>Empieza por una clase</strong><p>Crea tu primer grupo y comparte el código. Después podrás agregar actividades, tareas, exámenes y más.</p><button id="d360-tip" type="button">Crear clase</button></div></div></section>
        <section id="d360-class-section"><div class="d360-class-head"><h2>Mis clases</h2><div class="d360-tools"><div class="d360-tabs"><button class="active" type="button">Todas</button><button type="button">Activas</button><button type="button">Archivadas</button></div><button class="d360-new" id="d360-new-bottom" type="button">＋ Nueva clase</button></div></div></section>
      </main>
    </div>`;

    // Sidebar navigation: every button has a real destination.
    outer.querySelectorAll('.d360-nav button[data-route]').forEach(btn => {
      btn.addEventListener('click', () => {
        outer.querySelectorAll('.d360-nav button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        (NAV_ACTIONS[btn.dataset.route] || (() => {}))();
      });
    });

    const create = () => document.getElementById('new-class')?.click();
    ['d360-create', 'd360-q-class', 'd360-tip', 'd360-new-bottom'].forEach(id => document.getElementById(id)?.addEventListener('click', create));
    document.getElementById('d360-view')?.addEventListener('click', () => jumpToClasses());
    document.getElementById('d360-q-activity')?.addEventListener('click', () => jumpToClasses('Abre la clase donde quieres crear la actividad, luego ve a la pestaña "Actividades".'));
    document.getElementById('d360-q-exam')?.addEventListener('click', () => jumpToClasses('Abre la clase donde quieres crear el examen, luego ve a la pestaña "Exámenes".'));
    document.getElementById('d360-q-settings')?.addEventListener('click', () => NAV_ACTIONS.configuracion());
    document.getElementById('d360-profile-btn')?.addEventListener('click', () => NAV_ACTIONS.configuracion());
    document.getElementById('d360-user-btn')?.addEventListener('click', () => NAV_ACTIONS.configuracion());
    document.getElementById('d360-bell')?.addEventListener('click', () => toast('No tienes notificaciones nuevas.'));

    const classSection = document.getElementById('d360-class-section');
    const mountClassesWhenReady = () => {
      if (typeof window.mountClasses !== 'function') return setTimeout(mountClassesWhenReady, 80);
      window.mountClasses(user);
      const generated = document.getElementById('classes-section');
      if (generated && classSection) classSection.replaceWith(generated);
    };
    mountClassesWhenReady();

    if (window.docenciaSupabase) {
      window.docenciaSupabase.rpc('get_my_teacher_classes').then(({ data, error }) => {
        const classes = !error && Array.isArray(data) ? data : [];
        document.getElementById('d360-count').textContent = classes.length;
        document.getElementById('d360-students').textContent = classes.reduce((n, c) => n + Number(c.student_count || 0), 0);
        if (!classes.length) { document.getElementById('d360-activities').textContent = '0'; document.getElementById('d360-published').textContent = '0'; return; }
        Promise.all(classes.map(c => window.docenciaSupabase.from('activities').select('id,status').eq('class_id', c.id))).then(results => {
          const all = results.flatMap(r => r.data || []);
          document.getElementById('d360-activities').textContent = all.length;
          document.getElementById('d360-published').textContent = all.filter(a => a.status === 'published').length;
        }).catch(() => { document.getElementById('d360-activities').textContent = '0'; document.getElementById('d360-published').textContent = '0'; });
      }).catch(() => {
        document.getElementById('d360-count').textContent = '0';
        document.getElementById('d360-students').textContent = '0';
        document.getElementById('d360-activities').textContent = '0';
        document.getElementById('d360-published').textContent = '0';
      });
    }
  };
})();
