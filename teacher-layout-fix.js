(() => {
  const apply = () => {
    const content = document.querySelector('.content');
    const dashboard = document.getElementById('teacher-dashboard') || document.getElementById('teacher-dashboard-v2');
    if (!content || !dashboard) return setTimeout(apply, 100);
    if (document.getElementById('teacher-layout-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'teacher-layout-fix-style';
    style.textContent = `
      html,body,#app,.app{width:100%!important;min-width:320px!important;max-width:none!important;margin:0!important;padding:0!important;overflow-x:hidden!important}
      .top{width:100%!important;max-width:none!important}
      .content{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
      #teacher-dashboard,#teacher-dashboard-v2,.d360{display:grid!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important;grid-template-columns:250px minmax(0,1fr)!important}
      #teacher-dashboard .d360-main,#teacher-dashboard-v2 .d360-main,.d360-main{width:100%!important;max-width:none!important;min-width:0!important;box-sizing:border-box!important}
      #teacher-dashboard .d360-side,#teacher-dashboard-v2 .d360-side,.d360-side{width:250px!important;box-sizing:border-box!important}
      @media(max-width:1100px){#teacher-dashboard,#teacher-dashboard-v2,.d360{grid-template-columns:220px minmax(0,1fr)!important}#teacher-dashboard .d360-side,#teacher-dashboard-v2 .d360-side,.d360-side{width:220px!important}}
      @media(max-width:760px){#teacher-dashboard,#teacher-dashboard-v2,.d360{display:block!important;width:100%!important}.d360-side{width:100%!important;height:auto!important;position:sticky!important;top:0!important}.d360-main{width:100%!important;padding:11px!important}}
    `;
    document.head.appendChild(style);
  };
  apply();
})();
