(() => {
  const style = document.createElement('style');
  style.id='d360-theme-style';
  style.textContent=`
    /* CLARO: colores originales, sin herencia blanca */
    html:not(.d360-dark) .d360-stat-icon{color:#5141d0!important;background:#f0edff!important}
    html:not(.d360-dark) .d360-stat:nth-child(2) .d360-stat-icon{color:#5746d6!important;background:#f0edff!important}
    html:not(.d360-dark) .d360-stat:nth-child(3) .d360-stat-icon{color:#197a61!important;background:#eaf8ef!important}
    html:not(.d360-dark) .d360-stat:nth-child(4) .d360-stat-icon{color:#d13e69!important;background:#fff0f4!important}
    html:not(.d360-dark) .d360-action-icon{color:#5141d0!important;background:#efedff!important}
    html:not(.d360-dark) .d360-action:nth-child(2) .d360-action-icon{color:#d13e69!important;background:#fff0f3!important}
    html:not(.d360-dark) .d360-action:nth-child(3) .d360-action-icon{color:#197a61!important;background:#eaf8ef!important}
    html:not(.d360-dark) .d360-action:nth-child(4) .d360-action-icon{color:#3e6fb8!important;background:#edf4ff!important}

    /* OSCURO */
    html.d360-dark,html.d360-dark body{background:#0f1020!important;color:#f4f5fb!important}
    html.d360-dark .app,html.d360-dark .content{background:#0f1020!important;color:#f4f5fb!important}
    html.d360-dark .top{background:#141526!important;border-color:#292b40!important;color:#f4f5fb!important}
    html.d360-dark .top .brandname{color:#9b8cff!important}
    html.d360-dark .logout{background:#1b1d30!important;color:#f4f5fb!important;border-color:#34364b!important}
    html.d360-dark .d360{background:#0f1020!important}
    html.d360-dark .d360-side{background:#141526!important;border-color:#292b40!important}
    html.d360-dark .d360-brand,html.d360-dark .d360-profile strong{color:#f4f5fb!important}
    html.d360-dark .d360-nav button{color:#aeb3c5!important}
    html.d360-dark .d360-nav button.active,html.d360-dark .d360-nav button:hover{background:#252044!important;color:#b4a9ff!important}
    html.d360-dark .d360-main{background:#0f1020!important}
    html.d360-dark .d360-search,html.d360-dark .d360-bell,html.d360-dark .d360-user{background:#191b2d!important;color:#f4f5fb!important;border-color:#303247!important}
    html.d360-dark .d360-stat,html.d360-dark .d360-panel,html.d360-dark .d360 .class-card{background:#151728!important;color:#f4f5fb!important;border-color:#292b40!important;box-shadow:0 8px 24px rgba(0,0,0,.18)!important}
    html.d360-dark .d360-label,html.d360-dark .d360-panel-head span,html.d360-dark .d360-action small,html.d360-dark .d360-tip p,html.d360-dark .d360 .class-meta{color:#9ea5ba!important}
    html.d360-dark .d360-action{background:#151728!important;color:#f4f5fb!important}
    html.d360-dark .d360-action:hover{background:#1d2034!important}
    html.d360-dark .d360-tip{background:#1c1a31!important;border-color:#343052!important}
    html.d360-dark .d360-tabs{background:#151728!important;border-color:#292b40!important}
    html.d360-dark .d360-tabs button{color:#9ea5ba!important}
    html.d360-dark .d360-tabs .active{background:#282347!important;color:#b8adff!important}
    html.d360-dark .d360-classes-head h2,html.d360-dark .d360-class-head h2{color:#f4f5fb!important}
    html.d360-dark .d360 .join-code{background:#211e3a!important;color:#c4bcff!important}
    html.d360-dark .d360-plan{box-shadow:0 10px 25px rgba(0,0,0,.22)}

    /* Los iconos cambian de paleta en oscuro: no son blancos sobre blanco */
    html.d360-dark .d360-stat-icon{color:#a99cff!important;background:#29244c!important}
    html.d360-dark .d360-stat:nth-child(2) .d360-stat-icon{color:#b8adff!important;background:#29244c!important}
    html.d360-dark .d360-stat:nth-child(3) .d360-stat-icon{color:#67d8b2!important;background:#173a31!important}
    html.d360-dark .d360-stat:nth-child(4) .d360-stat-icon{color:#ff8eaa!important;background:#402330!important}
    html.d360-dark .d360-action-icon{color:#a99cff!important;background:#29244c!important}
    html.d360-dark .d360-action:nth-child(2) .d360-action-icon{color:#ff8eaa!important;background:#402330!important}
    html.d360-dark .d360-action:nth-child(3) .d360-action-icon{color:#67d8b2!important;background:#173a31!important}
    html.d360-dark .d360-action:nth-child(4) .d360-action-icon{color:#82b5ff!important;background:#1e304b!important}
    html.d360-dark .d360-nav i{color:#b2a7ff!important}
    html.d360-dark .d360-action:disabled .d360-action-icon{opacity:1!important}

    #d360-theme-toggle{width:40px;height:40px;border:1px solid #e6e7ec;background:#fff;border-radius:10px;display:grid;place-items:center;font-size:17px;cursor:pointer;margin-left:2px}
    html.d360-dark #d360-theme-toggle{background:#191b2d;color:#fff;border-color:#303247}
    @media(max-width:620px){#d360-theme-toggle{width:36px;height:36px}}

    /* Espacio de clase (teacher-class-workspace.js): el CSS .cw-dark ya existía pero nada lo activaba */
    html.d360-dark #d360-class-workspace{background:#0f1020!important;color:#f4f5fb!important}
    html.d360-dark .cw-side,html.d360-dark .cw-panel,html.d360-dark .cw-stat,html.d360-dark .cw-tabs button{background:#151728!important;color:#f4f5fb!important;border-color:#292b40!important}
    html.d360-dark .cw-meta,html.d360-dark .cw-muted{color:#9ea5ba!important}
    html.d360-dark .cw-back{background:#252044!important;color:#b8adff!important}
    html.d360-dark .cw-nav button{color:#aeb3c5!important}
    html.d360-dark .cw-nav button.active{background:#252044!important;color:#b8adff!important}
    html.d360-dark .cw-code{background:#282347!important;color:#c4bcff!important}
    html.d360-dark .cw-tabs button.active{background:#5b4ce2!important;color:#fff!important;border-color:#5b4ce2!important}

    /* Modal de lista de estudiantes (teacher-roster.js): nunca tuvo variante oscura */
    html.d360-dark .tr-modal,html.d360-dark .tr-row,html.d360-dark .tr-cancel,html.d360-dark .tr-remove{background:#151728!important;color:#f4f5fb!important;border-color:#292b40!important}
    html.d360-dark .tr-help{background:#1c1a31!important;color:#c8c2e6!important;border-color:#343052!important}
    html.d360-dark .tr-email{color:#9ea5ba!important}
    html.d360-dark .tr-input-row input{background:#191b2d!important;color:#f4f5fb!important;border-color:#303247!important}

    /* Modal de unirse a clase (student-join.js): nunca tuvo variante oscura */
    html.d360-dark .sj-modal,html.d360-dark .sj-student,html.d360-dark .sj-cancel,html.d360-dark .sj-dashboard{background:#151728!important;color:#f4f5fb!important;border-color:#292b40!important}
    html.d360-dark .sj-picked{background:#1c1a31!important;border-color:#343052!important;color:#f4f5fb!important}
    html.d360-dark .sj-small,html.d360-dark .sj-modal p{color:#9ea5ba!important}

    /* Modal de modo de acceso (teacher-access-mode.js): nunca tuvo variante oscura */
    html.d360-dark .tam-modal{background:#151728!important;color:#f4f5fb!important}
    html.d360-dark .tam-option{background:#191b2d!important;border-color:#303247!important}
    html.d360-dark .tam-modal .tam-sub,html.d360-dark .tam-option small{color:#9ea5ba!important}
    html.d360-dark .tam-foot{border-color:#292b40!important;color:#9ea5ba!important}

    /* Selector de rol en el signup (role-selection.js): nunca tuvo variante oscura */
    html.d360-dark .signup-role{background:#151728!important;color:#f4f5fb!important;border-color:#292b40!important}
    html.d360-dark .signup-role.active{background:#211e3a!important}
    html.d360-dark .signup-role span:last-child{color:#9ea5ba!important}
  `;
  document.head.appendChild(style);
  const apply=()=>{const dark=localStorage.getItem('d360-theme')==='dark';document.documentElement.classList.toggle('d360-dark',dark);const b=document.getElementById('d360-theme-toggle');if(b){b.textContent=dark?'☀️':'🌙';b.title=dark?'Cambiar a modo claro':'Cambiar a modo oscuro'}};
  apply();
  const mount=()=>{const top=document.querySelector('.d360-top');if(!top)return setTimeout(mount,100);if(!document.getElementById('d360-theme-toggle')){const b=document.createElement('button');b.id='d360-theme-toggle';b.type='button';b.onclick=()=>{localStorage.setItem('d360-theme',document.documentElement.classList.contains('d360-dark')?'light':'dark');apply()};const user=document.querySelector('.d360-user');top.insertBefore(b,user||null)}apply()};
  mount();
})();
