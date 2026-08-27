(() => {
  const style = document.createElement('style');
  style.id='d360-theme-style';
  style.textContent=`
    html.d360-dark,html.d360-dark body{background:#0f1020!important;color:#f4f5fb!important}
    html.d360-dark .app,html.d360-dark .content{background:#0f1020!important;color:#f4f5fb!important}
    html.d360-dark .top{background:#141526!important;border-color:#292b40!important;color:#f4f5fb!important}
    html.d360-dark .top .brandname{color:#9b8cff!important}
    html.d360-dark .logout{background:#1b1d30!important;color:#f4f5fb!important;border-color:#34364b!important}
    .d360-dark .d360{background:#0f1020!important}
    .d360-dark .d360-side{background:#141526!important;border-color:#292b40!important}
    .d360-dark .d360-brand,.d360-dark .d360-profile strong{color:#f4f5fb!important}
    .d360-dark .d360-nav button{color:#aeb3c5!important}
    .d360-dark .d360-nav button.active,.d360-dark .d360-nav button:hover{background:#252044!important;color:#b4a9ff!important}
    .d360-dark .d360-main{background:#0f1020!important}
    .d360-dark .d360-search,.d360-dark .d360-bell,.d360-dark .d360-user{background:#191b2d!important;color:#f4f5fb!important;border-color:#303247!important}
    .d360-dark .d360-stat,.d360-dark .d360-panel,.d360-dark .d360 .class-card{background:#151728!important;color:#f4f5fb!important;border-color:#292b40!important;box-shadow:0 8px 24px rgba(0,0,0,.18)!important}
    .d360-dark .d360-label,.d360-dark .d360-panel-head span,.d360-dark .d360-action small,.d360-dark .d360-tip p,.d360-dark .d360 .class-meta{color:#9ea5ba!important}
    .d360-dark .d360-action{background:#151728!important;color:#f4f5fb!important}
    .d360-dark .d360-action:hover{background:#1d2034!important}
    .d360-dark .d360-tip{background:#1c1a31!important;border-color:#343052!important}
    .d360-dark .d360-tabs{background:#151728!important;border-color:#292b40!important}
    .d360-dark .d360-tabs button{color:#9ea5ba!important}
    .d360-dark .d360-tabs .active{background:#282347!important;color:#b8adff!important}
    .d360-dark .d360-classes-head h2,.d360-dark .d360-class-head h2{color:#f4f5fb!important}
    .d360-dark .d360 .join-code{background:#211e3a!important;color:#c4bcff!important}
    .d360-dark .d360-plan{box-shadow:0 10px 25px rgba(0,0,0,.22)}

    /* Contraste de iconos en modo oscuro */
    .d360-dark .d360-stat-icon{color:#5141d0!important;background:#eeebff!important;text-shadow:none!important}
    .d360-dark .d360-stat:nth-child(2) .d360-stat-icon{color:#5746d6!important;background:#eeeaff!important}
    .d360-dark .d360-stat:nth-child(3) .d360-stat-icon{color:#197a61!important;background:#e7f7f0!important}
    .d360-dark .d360-stat:nth-child(4) .d360-stat-icon{color:#d13e69!important;background:#ffeaf0!important}
    .d360-dark .d360-action-icon{color:#5141d0!important;background:#eeebff!important;text-shadow:none!important}
    .d360-dark .d360-action:nth-child(2) .d360-action-icon{color:#d13e69!important;background:#ffeaf0!important}
    .d360-dark .d360-action:nth-child(3) .d360-action-icon{color:#197a61!important;background:#e7f7f0!important}
    .d360-dark .d360-action:nth-child(4) .d360-action-icon{color:#3e6fb8!important;background:#e9f1ff!important}
    .d360-dark .d360-nav i{color:#a99cff!important}
    .d360-dark .d360-action:disabled .d360-action-icon{opacity:.82!important}

    #d360-theme-toggle{width:40px;height:40px;border:1px solid #e6e7ec;background:#fff;border-radius:10px;display:grid;place-items:center;font-size:17px;cursor:pointer;margin-left:2px}
    .d360-dark #d360-theme-toggle{background:#191b2d;color:#fff;border-color:#303247}
    @media(max-width:620px){#d360-theme-toggle{width:36px;height:36px}}
  `;
  document.head.appendChild(style);
  const apply=()=>{const dark=localStorage.getItem('d360-theme')==='dark';document.documentElement.classList.toggle('d360-dark',dark);const b=document.getElementById('d360-theme-toggle');if(b){b.textContent=dark?'☀️':'🌙';b.title=dark?'Cambiar a modo claro':'Cambiar a modo oscuro'}};
  const mount=()=>{const top=document.querySelector('.d360-top');if(!top)return setTimeout(mount,100);if(!document.getElementById('d360-theme-toggle')){const b=document.createElement('button');b.id='d360-theme-toggle';b.type='button';b.onclick=()=>{localStorage.setItem('d360-theme',document.documentElement.classList.contains('d360-dark')?'light':'dark');apply()};const user=document.querySelector('.d360-user');top.insertBefore(b,user||null)}apply()};
  mount();
})();
