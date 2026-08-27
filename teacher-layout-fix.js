(() => {
  const apply = () => {
    const content = document.querySelector('.content');
    const dashboard = document.getElementById('teacher-dashboard-v2');
    if (!content || !dashboard) return setTimeout(apply, 100);
    if (document.getElementById('teacher-layout-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'teacher-layout-fix-style';
    style.textContent = `
      html,body,#app,.app{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
      .content{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
      .d360{width:100%!important;max-width:none!important;margin:0!important;grid-template-columns:250px minmax(0,1fr)!important}
      .d360-main{width:100%!important;max-width:none!important}
      @media(max-width:1100px){.d360{grid-template-columns:220px minmax(0,1fr)!important}}
      @media(max-width:760px){.d360{display:block!important;margin:0!important}.d360-side{top:64px!important}.d360-main{width:100%!important}}
    `;
    document.head.appendChild(style);
  };
  apply();
})();
