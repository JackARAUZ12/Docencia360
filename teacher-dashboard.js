(() => {
  // Compatibility bridge. The premium teacher dashboard owns the visual shell.
  window.mountTeacherDashboard = function(user, profile) {
    window.__docenciaCurrentUser = user;
    window.__docenciaProfile = profile;
    const go = () => window.mountTeacherDashboardV2 ? window.mountTeacherDashboardV2(user, profile) : setTimeout(go, 50);
    go();
  };
})();
