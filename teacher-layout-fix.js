(() => {
  const apply = () => {
    const content = document.querySelector('.content');
    const dashboard = document.getElementById('teacher-dashboard');
    if (!content || !dashboard) return setTimeout(apply, 100);
    if (document.getElementById('teacher-layout-fix-style')) return;

    const style = document.createElement('style');
    style.id = 'teacher-layout-fix-style';
    style.textContent = `
      /* ===== BASE: dashboard realmente a pantalla completa ===== */
      html,body,#app,.app{width:100%!important;max-width:none!important;margin:0!important}
      .content{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
      .d360{width:100%!important;max-width:none!important;margin:0!important;grid-template-columns:280px minmax(0,1fr)!important}
      .d360-main{width:100%!important;max-width:none!important;min-width:0!important;padding:24px 38px 45px!important}
      .d360-side{width:280px!important;padding:24px 16px!important}

      /* ===== ESCRITORIO GRANDE: aumentar lectura y proporciones ===== */
      @media(min-width:1400px){
        .d360{grid-template-columns:300px minmax(0,1fr)!important}
        .d360-side{width:300px!important;padding:28px 18px!important}
        .d360-brand{font-size:18px!important;gap:11px!important;padding:4px 10px 15px!important}
        .d360-logo{width:38px!important;height:38px!important;border-radius:12px!important;font-size:17px!important}
        .d360-nav{gap:5px!important}
        .d360-nav button{padding:13px 13px!important;font-size:13px!important;gap:12px!important}
        .d360-nav i{width:20px!important;font-size:16px!important}
        .d360-plan{padding:17px!important;border-radius:17px!important}
        .d360-plan small{font-size:10px!important}
        .d360-plan strong{font-size:14px!important;margin-top:5px!important}
        .d360-plan p{font-size:10px!important;margin:6px 0 11px!important}
        .d360-plan button{padding:9px!important;font-size:10px!important}
        .d360-avatar{width:36px!important;height:36px!important;font-size:13px!important}
        .d360-profile strong{font-size:12px!important}
        .d360-profile span{font-size:10px!important}

        .d360-main{padding:24px 46px 50px!important}
        .d360-top{height:42px!important;gap:11px!important;margin-bottom:17px!important}
        .d360-search{width:240px!important;height:40px!important;font-size:12px!important;padding:0 13px!important}
        .d360-bell,.d360-user{width:40px!important;height:40px!important;font-size:13px!important}
        .d360-dot{width:7px!important;height:7px!important;right:7px!important;top:6px!important}

        .d360-hero{border-radius:20px!important;padding:30px 34px!important;min-height:185px!important}
        .d360-kicker{font-size:11px!important}
        .d360-hero h1{font-size:34px!important;margin:7px 0!important}
        .d360-hero p{max-width:650px!important;font-size:13px!important;line-height:1.55!important}
        .d360-hero-actions{gap:10px!important;margin-top:18px!important}
        .d360-hero-actions button{height:42px!important;padding:0 17px!important;font-size:12px!important;border-radius:10px!important}

        .d360-stats{gap:14px!important;margin:14px 0!important}
        .d360-stat{border-radius:15px!important;padding:16px 17px!important;gap:12px!important}
        .d360-stat-icon{width:42px!important;height:42px!important;border-radius:12px!important;font-size:17px!important}
        .d360-label{font-size:10px!important}
        .d360-value{font-size:22px!important;margin-top:3px!important}

        .d360-panels{gap:14px!important;margin-bottom:20px!important}
        .d360-panel{border-radius:16px!important;padding:18px!important}
        .d360-panel-head{margin-bottom:13px!important}
        .d360-panel-head h2{font-size:14px!important}
        .d360-panel-head span{font-size:10px!important}
        .d360-actions{gap:8px!important}
        .d360-action{padding:10px 6px!important;border-radius:11px!important}
        .d360-action-icon{width:38px!important;height:38px!important;border-radius:11px!important;margin-bottom:7px!important;font-size:16px!important}
        .d360-action strong{font-size:10px!important}
        .d360-action small{font-size:9px!important;line-height:1.4!important;margin-top:4px!important}
        .d360-tip{border-radius:12px!important;padding:14px!important}
        .d360-tip strong{font-size:12px!important;margin-top:5px!important}
        .d360-tip p{font-size:10px!important;line-height:1.5!important;margin:5px 0 10px!important}
        .d360-tip button{padding:8px 12px!important;font-size:10px!important}

        .d360-class-head{margin-bottom:12px!important}
        .d360-class-head h2{font-size:18px!important}
        .d360-tabs button{padding:7px 10px!important;font-size:10px!important}
        .d360-new{padding:9px 12px!important;font-size:10px!important}
        .d360 .class-list{gap:13px!important;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))!important}
        .d360 .class-card{min-height:155px!important;padding:18px!important;border-radius:16px!important}
        .d360 .class-name{font-size:15px!important}
        .d360 .class-meta{font-size:10px!important;margin-top:6px!important}
        .d360 .join-code{margin-top:14px!important;padding:10px!important;font-size:10px!important}
        .d360 .copy-btn{font-size:10px!important}
      }

      /* ===== MONITORES MUY GRANDES ===== */
      @media(min-width:1800px){
        .d360-side{width:320px!important}
        .d360{grid-template-columns:320px minmax(0,1fr)!important}
        .d360-main{padding-left:52px!important;padding-right:52px!important}
        .d360-hero{min-height:205px!important;padding:34px 40px!important}
        .d360-hero h1{font-size:38px!important}
        .d360-hero p{font-size:14px!important}
        .d360-stat{padding:18px 20px!important}
        .d360-value{font-size:24px!important}
      }

      /* ===== TABLET ===== */
      @media(max-width:1100px){
        .d360{grid-template-columns:240px minmax(0,1fr)!important}
        .d360-side{width:240px!important}
        .d360-main{padding:20px 24px 38px!important}
      }
      @media(max-width:920px){
        .d360{grid-template-columns:76px minmax(0,1fr)!important}
        .d360-side{width:76px!important;padding:18px 7px!important}
        .d360-brand span:not(.d360-logo),.d360-brand b,.d360-nav button span:not(.d360-icon),.d360-plan,.d360-profile div:not(.d360-avatar){display:none!important}
        .d360-nav button{justify-content:center!important}
        .d360-profile{justify-content:center!important}
        .d360-panels{grid-template-columns:1fr!important}
      }

      /* ===== MÓVIL ===== */
      @media(max-width:620px){
        .d360{display:block!important;width:100%!important;margin:0!important}
        .d360-side{width:100%!important;height:auto!important;position:sticky!important;top:0!important;z-index:30;border-right:0!important;border-bottom:1px solid #e8e9ef!important;padding:7px 8px!important}
        .d360-brand{display:none!important}
        .d360-nav{display:flex!important;overflow-x:auto!important;gap:2px!important}
        .d360-nav button{white-space:nowrap!important;padding:9px 10px!important;font-size:11px!important}
        .d360-nav button span:not(.d360-icon){display:inline!important}
        .d360-bottom{display:none!important}
        .d360-main{width:100%!important;padding:13px 12px 30px!important}
        .d360-top{height:38px!important;margin-bottom:12px!important}
        .d360-search{width:min(170px,55vw)!important;height:36px!important;font-size:11px!important}
        .d360-bell,.d360-user{width:36px!important;height:36px!important}
        .d360-hero{padding:21px 18px!important;min-height:170px!important}
        .d360-hero h1{font-size:25px!important}
        .d360-hero p{font-size:11px!important}
        .d360-hero-actions{flex-wrap:wrap!important}
        .d360-stats{grid-template-columns:1fr 1fr!important}
        .d360-stat:nth-child(4){grid-column:1/-1!important}
        .d360-panels{grid-template-columns:1fr!important}
        .d360-actions{grid-template-columns:1fr 1fr!important}
        .d360-class-head{align-items:flex-start!important;gap:8px!important}
        .d360-tools{flex-wrap:wrap!important;justify-content:flex-end!important}
        .d360 .class-list{grid-template-columns:1fr!important}
      }
    `;
    document.head.appendChild(style);
  };
  apply();
})();
