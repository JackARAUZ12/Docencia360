(() => {
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
  });
  // The premium teacher shell loads before class modules to prevent the legacy dashboard from taking over.
  load('./teacher-dashboard-v2.js')
    .then(() => load('./classes-core-v2.js'))
    .then(() => load('./role-selection.js'))
    .catch((error) => console.error('Docencia360 modules failed to load:', error));
})();
