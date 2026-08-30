(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const css = document.createElement('style');
  css.textContent = `
    .d360{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:calc(100vh - 68px);background:var(--d360-bg);margin:-28px -18px 0}
    .d360-side{background:var(--d360-navy);padding:20px 12px;display:flex;flex-direction:column;gap:16px;position:sticky;top:0;height:calc(100vh - 68px)}
    .d360-brand{display:flex;align-items:center;gap:9px;padding:3px 8px 12px;font-size:15px;font-weight:900;color:#fff}.d360-brand b{color:#b9a7ff}.d360-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,var(--d360-purple-2),var(--d360-purple));color:#fff;display:grid;place-items:center;box-shadow:0 6px 14px rgba(108,76,224,.4)}
    .d360-nav{display:grid;gap:2px}.d360-nav button{border:0;background:transparent;color:#9aa3c8;text-align:left;padding:10px 11px;border-radius:10px;font-size:11px;font-weight:750;display:flex;gap:10px;align-items:center;position:relative}
    .d360-nav button.active{background:rgba(255,255,255,.08);color:#fff}.d360-nav button:hover{background:rgba(255,255,255,.06);color:#fff}
    .d360-nav button.soon:after{content:"pronto";margin-left:auto;font-size:7px;background:rgba(255,255,255,.1);color:#c3c9e2;padding:2px 6px;border-radius:999px;font-weight:850}
    .d360-nav i{font-style:normal;width:17px;text-align:center;font-size:14px}
    .d360-bottom{margin-top:auto}.d360-plan{background:linear-gradient(145deg,var(--d360-purple-2),var(--d360-purple));color:#fff;border-radius:15px;padding:13px;box-shadow:0 10px 24px rgba(108,76,224,.3)}.d360-plan small{font-size:9px;opacity:.78}.d360-plan strong{display:block;font-size:12px;margin-top:4px}.d360-plan p{font-size:9px;line-height:1.4;opacity:.85;margin:5px 0 9px}.d360-plan button{width:100%;border:0;border-radius:8px;background:#fff;color:var(--d360-purple);padding:7px;font-size:9px;font-weight:850}
    .d360-profile{display:flex;align-items:center;gap:8px;border-top:1px solid rgba(255,255,255,.08);margin-top:12px;padding:12px 5px 0;cursor:pointer;border-radius:10px}.d360-profile:hover{background:rgba(255,255,255,.05)}.d360-avatar{width:30px;height:30px;border-radius:50%;background:var(--d360-purple-soft);color:var(--d360-purple);display:grid;place-items:center;font-size:11px;font-weight:900}.d360-profile strong{display:block;font-size:10px;color:#fff}.d360-profile span{font-size:8px;color:#9aa3c8}

    .d360-mobile-top{display:none}
    .d360-main{min-width:0;padding:20px clamp(16px,2.4vw,40px) 40px}
    .d360-top{height:36px;display:flex;justify-content:flex-end;align-items:center;gap:9px;margin-bottom:16px}.d360-search{width:210px;height:34px;border:1px solid #e6e7ec;border-radius:9px;background:var(--d360-card);color:var(--d360-text);padding:0 11px;font-size:10px;outline:none;transition:box-shadow .15s,border-color .15s}.d360-search:focus{border-color:var(--d360-purple-2);box-shadow:0 0 0 3px rgba(108,76,224,.15)}
    .d360-bell,.d360-user{height:34px;width:34px;border:1px solid #e6e7ec;background:var(--d360-card);border-radius:9px;display:grid;place-items:center;position:relative;cursor:pointer}.d360-user{border-radius:50%;background:var(--d360-purple-soft);color:var(--d360-purple);font-weight:900;font-size:11px}.d360-dot{position:absolute;width:6px;height:6px;background:#ef4d72;border-radius:50%;right:6px;top:5px}
    .d360-hero{position:relative;overflow:hidden;border-radius:20px;padding:clamp(20px,3vw,32px) clamp(20px,3.4vw,36px);min-height:150px;color:#fff;background:linear-gradient(120deg,var(--d360-navy),var(--d360-navy-3) 55%,var(--d360-purple));box-shadow:0 18px 38px rgba(20,28,54,.3);animation:d360-fade-in .3s ease}
    .d360-hero:after{content:"";position:absolute;width:300px;height:300px;border-radius:50%;right:-100px;top:-170px;background:rgba(124,92,255,.16)}
    .d360-kicker{font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:850;opacity:.8;position:relative;z-index:1}
    .d360-hero h1{font-size:clamp(24px,2.6vw,30px);letter-spacing:-.045em;margin:5px 0;position:relative;z-index:1}
    .d360-hero p{margin:0;max-width:480px;font-size:11.5px;line-height:1.55;color:rgba(255,255,255,.82);position:relative;z-index:1}
    .d360-hero-actions{display:flex;gap:9px;margin-top:16px;position:relative;z-index:2;flex-wrap:wrap}.d360-hero-actions button{height:36px;border-radius:10px;padding:0 15px;font-size:10.5px;font-weight:850}
    .d360-primary{border:0;background:#fff;color:var(--d360-purple)}.d360-primary:hover{background:#f4f2ff}
    .d360-secondary{border:1px solid rgba(255,255,255,.34);background:rgba(255,255,255,.1);color:#fff}.d360-secondary:hover{background:rgba(255,255,255,.18)}

    .d360-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin:14px 0}
    .d360-stat{background:var(--d360-card);border:1px solid rgba(120,120,160,.14);border-radius:16px;padding:16px 10px;text-align:center;animation:d360-fade-in .3s ease both}
    .d360-stat:nth-child(1){animation-delay:.02s}.d360-stat:nth-child(2){animation-delay:.07s}.d360-stat:nth-child(3){animation-delay:.12s}
    .d360-stat:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(20,20,45,.08)}
    .d360-label{font-size:8.5px;color:var(--d360-muted);font-weight:750;text-transform:uppercase;letter-spacing:.04em}.d360-value{font-size:24px;font-weight:900;margin-top:4px;line-height:1;color:var(--d360-text)}

    .d360-panels{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,.75fr);gap:11px;margin-bottom:18px}
    .d360-panel{background:var(--d360-card);border:1px solid rgba(120,120,160,.14);border-radius:16px;padding:16px;animation:d360-fade-in .3s ease .1s both}
    .d360-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}.d360-panel-head h2{font-size:12.5px;margin:0;color:var(--d360-text)}.d360-panel-head span{font-size:8px;color:var(--d360-muted)}
    .d360-empty-mini{font-size:10.5px;color:var(--d360-muted);padding:8px 2px}
    .d360-sessions{display:flex;flex-direction:column;gap:9px}
    .d360-sess-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid rgba(120,120,160,.12)}.d360-sess-row:first-child{border-top:0}
    .d360-sess-time{font-size:10px;font-weight:850;color:var(--d360-purple);width:52px;flex:0 0 auto}
    .d360-sess-row strong{display:block;font-size:11px;color:var(--d360-text)}.d360-sess-row span{font-size:9px;color:var(--d360-muted)}

    .d360-class-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px}.d360-class-head h2{font-size:15px;margin:0;color:var(--d360-text)}
    .d360-tools{display:flex;gap:6px;align-items:center}
    .d360-tabs{display:flex;background:var(--d360-card);border:1px solid rgba(120,120,160,.14);border-radius:9px;padding:2px}.d360-tabs button{border:0;background:transparent;padding:6px 9px;border-radius:7px;color:var(--d360-muted);font-size:8.5px;font-weight:750}.d360-tabs .active{background:var(--d360-purple-soft);color:var(--d360-purple)}
    .d360-new{border:0;background:var(--d360-purple);color:#fff;border-radius:9px;padding:8px 11px;font-size:8.5px;font-weight:850}

    .d360 .classes-section{margin-top:0}.d360 .section-head{display:none}.d360 .class-list{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:11px}
    .d360 .class-card{position:relative;min-height:132px;padding:16px;border:1px solid rgba(120,120,160,.14);border-radius:16px;background:var(--d360-card);box-shadow:0 5px 18px rgba(20,20,40,.035);overflow:hidden}
    .d360 .class-card:hover{box-shadow:0 12px 28px rgba(20,20,45,.09);transform:translateY(-2px)}
    .d360 .class-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(180deg,var(--d360-purple-2),var(--d360-purple))}.d360 .class-card:nth-child(2n):before{background:linear-gradient(180deg,#16a672,#57cda8)}.d360 .class-card:nth-child(3n):before{background:linear-gradient(180deg,#e08a2e,#e3a35d)}.d360 .class-card:nth-child(4n):before{background:linear-gradient(180deg,#3b82f6,#7db4fb)}
    .d360 .class-name{font-size:13px;font-weight:900;color:var(--d360-text)}.d360 .class-meta{font-size:9px;margin-top:5px;color:var(--d360-muted)}.d360 .join-code{margin-top:12px;padding:8px 9px;border-radius:9px;font-size:9px}.d360 .copy-btn{font-size:9px}

    @media(min-width:1400px){.d360-main{max-width:1360px;margin:0 auto}}
    @media(max-width:920px){.d360{grid-template-columns:72px minmax(0,1fr)}.d360-side{padding:18px 7px}.d360-brand span:not(.d360-logo),.d360-brand b,.d360-nav button span:not(.d360-icon),.d360-nav button.soon:after,.d360-plan,.d360-profile div:not(.d360-avatar){display:none}.d360-nav button{justify-content:center}.d360-profile{justify-content:center}.d360-panels{grid-template-columns:1fr}}
    @media(max-width:620px){
      .d360{display:block;margin:-28px -18px 0;background:var(--d360-bg)}
      .d360-side{display:none}
      .d360-mobile-top{display:block;background:var(--d360-navy);color:#fff;padding:16px 18px 22px;border-radius:0 0 22px 22px}
      .d360-mobile-top .row1{display:flex;justify-content:space-between;align-items:center;font-weight:900;font-size:13px;letter-spacing:.02em}
      .d360-mobile-top .row1 b{color:#b9a7ff}
      .d360-mobile-top .hi{font-size:20px;font-weight:900;margin-top:14px}
      .d360-mobile-top .date{font-size:10.5px;color:#aab1d6;margin-top:2px}
      .d360-main{padding:14px 14px 30px}
      .d360-top{display:none}
      .d360-hero{display:none}
      .d360-stats{margin-top:-34px;position:relative;z-index:5;background:var(--d360-card);border-radius:18px;padding:14px 6px;box-shadow:0 14px 30px rgba(20,20,45,.14);grid-template-columns:repeat(3,1fr);gap:4px;border:0}
      .d360-stats .d360-stat{border:0;box-shadow:none;padding:6px 4px}
      .d360-panels{grid-template-columns:1fr}
      .d360-class-head{align-items:flex-start;gap:7px}
      .d360-tools{flex-wrap:wrap;justify-content:flex-end}
      .d360 .class-list{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(css);

  const NOT_BUILT_MSG = 'Este módulo todavía no está disponible. Estamos construyéndolo.';
  const NAV_ACTIONS = {
    inicio: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    clases: () => jumpToClasses(),
    estudiantes: () => jumpToClasses('Abre una clase para ver y agregar sus estudiantes.'),
    actividades: () => jumpToClasses('Abre una clase para crear y administrar sus actividades.'),
    tareas: () => jumpToClasses('Abre una clase para crear y administrar sus tareas.'),
    examenes: () => jumpToClasses('Abre una clase para crear y administrar sus exámenes.'),
    calificaciones: () => toast(NOT_BUILT_MSG),
    mensajes: () => toast('Mensajería: próximamente.'),
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
    const todayStr = new Date().toLocaleDateString('es-NI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    outer.innerHTML = '<div id="teacher-dashboard" class="d360">'
      + '<aside class="d360-side">'
      + '<div class="d360-brand"><span class="d360-logo">D</span><span>Docencia<b>360</b></span></div>'
      + '<nav class="d360-nav">'
      + '<button class="active" data-route="inicio"><i>⌂</i><span>Inicio</span></button>'
      + '<button data-route="clases"><i>▣</i><span>Mis clases</span></button>'
      + '<button data-route="estudiantes"><i>♙</i><span>Estudiantes</span></button>'
      + '<button data-route="actividades"><i>◈</i><span>Actividades</span></button>'
      + '<button data-route="tareas"><i>▤</i><span>Tareas</span></button>'
      + '<button data-route="examenes"><i>✓</i><span>Exámenes</span></button>'
      + '<button data-route="calificaciones" class="soon"><i>▦</i><span>Calificaciones</span></button>'
      + '<button data-route="mensajes" class="soon"><i>◌</i><span>Mensajes</span></button>'
      + '<button data-route="recursos" class="soon"><i>▧</i><span>Recursos</span></button>'
      + '<button data-route="configuracion"><i>⚙</i><span>Configuración</span></button>'
      + '</nav>'
      + '<div class="d360-bottom"><div class="d360-plan"><small>Plan Pro</small><strong>Tu espacio docente</strong><p>Todo listo para organizar tus clases.</p><button type="button" id="d360-see-plan">Ver plan</button></div><div class="d360-profile" id="d360-profile-btn"><div class="d360-avatar">' + esc(initial) + '</div><div><strong>' + esc(first) + '</strong><span>Profesor</span></div></div></div>'
      + '</aside>'
      + '<main class="d360-main">'
      + '<div class="d360-mobile-top"><div class="row1"><span>DOCENCIA<b>360</b></span><span id="d360-m-menu">☰</span></div><div class="hi">¡Hola, Profe ' + esc(first) + '! 👋</div><div class="date">' + esc(todayStr.charAt(0).toUpperCase() + todayStr.slice(1)) + '</div></div>'
      + '<div class="d360-top"><input class="d360-search" placeholder="⌕  Buscar..." aria-label="Buscar"><button class="d360-bell" type="button" id="d360-bell">♧<i class="d360-dot"></i></button><div class="d360-user" id="d360-user-btn">' + esc(initial) + '</div></div>'
      + '<section class="d360-hero"><div class="d360-kicker">¡Bienvenido de vuelta!</div><h1>Hola, ' + esc(first) + ' 👋</h1><p>Organiza tus clases, crea actividades y acompaña a tus estudiantes desde un solo lugar.</p><div class="d360-hero-actions"><button class="d360-primary" id="d360-create" type="button">＋ Nueva clase</button><button class="d360-secondary" id="d360-view" type="button">Ver mis clases →</button></div></section>'
      + '<section class="d360-stats"><article class="d360-stat"><div class="d360-label">Clases hoy</div><div class="d360-value" id="d360-classes-today">—</div></article><article class="d360-stat"><div class="d360-label">Por revisar</div><div class="d360-value" id="d360-pending-review">—</div></article><article class="d360-stat"><div class="d360-label">Actividades activas</div><div class="d360-value" id="d360-active-activities">—</div></article></section>'
      + '<section class="d360-panels">'
      + '<div class="d360-panel"><div class="d360-panel-head"><h2>Próximas sesiones</h2><span id="d360-see-planning" style="cursor:pointer;color:var(--d360-purple);font-weight:800">Ver todo</span></div><div class="d360-sessions" id="d360-sessions-list"><div class="d360-empty-mini">Cargando…</div></div></div>'
      + '<div class="d360-panel"><div class="d360-panel-head"><h2>Consejo para ti</h2></div><div style="background:linear-gradient(160deg,var(--d360-purple-soft),var(--d360-card));border:1px solid rgba(120,120,160,.12);border-radius:13px;padding:13px">💡<strong style="display:block;font-size:10.5px;margin-top:5px;color:var(--d360-text)">Empieza por una clase</strong><p style="font-size:8.5px;color:var(--d360-muted);line-height:1.5;margin:5px 0 9px">Crea tu primer grupo, configura horario y periodo, y Docencia360 generará las sesiones automáticamente.</p><button id="d360-tip" type="button" style="border:0;background:var(--d360-purple);color:#fff;border-radius:8px;padding:8px 11px;font-size:8.5px;font-weight:850">Crear clase</button></div></div>'
      + '</section>'
      + '<section id="d360-class-section"><div class="d360-class-head"><h2>Mis clases</h2><div class="d360-tools"><div class="d360-tabs" id="d360-class-filter"><button class="active" data-f="todas" type="button">Todas</button><button data-f="activas" type="button">Activas</button><button data-f="archivadas" type="button">Archivadas</button></div><button class="d360-new" id="d360-new-bottom" type="button">＋ Nueva clase</button></div></div></section>'
      + '</main></div>';

    outer.querySelectorAll('.d360-nav button[data-route]').forEach(btn => {
      btn.addEventListener('click', () => {
        outer.querySelectorAll('.d360-nav button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        (NAV_ACTIONS[btn.dataset.route] || (() => {}))();
      });
    });

    const create = () => document.getElementById('new-class')?.click();
    ['d360-create', 'd360-tip', 'd360-new-bottom'].forEach(id => document.getElementById(id)?.addEventListener('click', create));
    document.getElementById('d360-view')?.addEventListener('click', () => jumpToClasses());
    document.getElementById('d360-profile-btn')?.addEventListener('click', () => NAV_ACTIONS.configuracion());
    document.getElementById('d360-user-btn')?.addEventListener('click', () => NAV_ACTIONS.configuracion());
    document.getElementById('d360-bell')?.addEventListener('click', () => toast('No tienes notificaciones nuevas.'));
    document.getElementById('d360-m-menu')?.addEventListener('click', () => NAV_ACTIONS.configuracion());
    document.getElementById('d360-see-planning')?.addEventListener('click', () => jumpToClasses('Abre una clase para ver su planificación completa.'));

    window.D360 && window.D360.mountBottomNav({
      active: 'home',
      onHome: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
      onClasses: () => jumpToClasses(),
      onCreate: create,
      onMore: () => NAV_ACTIONS.configuracion()
    });

    const classSection = document.getElementById('d360-class-section');
    const mountClassesWhenReady = () => {
      if (typeof window.mountClasses !== 'function') return setTimeout(mountClassesWhenReady, 80);
      window.mountClasses(user);
      const generated = document.getElementById('classes-section');
      const host = generated && generated.querySelector('#classes-host');
      if (host && classSection) { classSection.appendChild(host); generated.remove(); }
    };
    mountClassesWhenReady();

    document.querySelectorAll('#d360-class-filter button').forEach(b => b.onclick = () => {
      document.querySelectorAll('#d360-class-filter button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const host = document.getElementById('classes-host');
      if (!host) return;
      if (b.dataset.f === 'archivadas') host.innerHTML = '<div class="empty">Archivar clases estará disponible próximamente. Por ahora todas tus clases se muestran como activas.</div>';
      else window.docenciaReloadClasses ? window.docenciaReloadClasses() : null;
    });
    document.getElementById('d360-see-plan')?.addEventListener('click', () => toast('Por ahora Docencia360 tiene un solo plan, con todo incluido. Más opciones próximamente.'));

    if (window.docenciaSupabase) {
      window.docenciaSupabase.rpc('get_teacher_today_stats').then(({ data, error }) => {
        const s = error ? {} : (Array.isArray(data) ? data[0] : data) || {};
        document.getElementById('d360-classes-today').textContent = s.classes_today != null ? s.classes_today : 0;
        document.getElementById('d360-pending-review').textContent = s.pending_review != null ? s.pending_review : 0;
        document.getElementById('d360-active-activities').textContent = s.active_activities != null ? s.active_activities : 0;
      }).catch(() => {});

      window.docenciaSupabase.rpc('get_teacher_upcoming_sessions', { p_limit: 5 }).then(({ data, error }) => {
        const host = document.getElementById('d360-sessions-list'); if (!host) return;
        const items = error ? [] : (data || []);
        if (!items.length) { host.innerHTML = '<div class="d360-empty-mini">No hay sesiones próximas planificadas.</div>'; return; }
        host.innerHTML = items.map(s => '<div class="d360-sess-row"><div class="d360-sess-time">' + (s.start_time ? s.start_time.slice(0, 5) : '—') + '</div><div><strong>' + esc(s.class_name) + (s.topic ? ' — ' + esc(s.topic) : '') + '</strong><span>' + new Date(s.session_date + 'T00:00:00').toLocaleDateString('es-NI', { weekday: 'short', day: 'numeric', month: 'short' }) + '</span></div></div>').join('');
      }).catch(() => {});
    }
  };
})();
