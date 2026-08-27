(() => {
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  load('./classes-core-v2.js')
    .then(() => load('./teacher-ui.js'))
    .catch((error) => console.error('Docencia360 modules failed to load:', error));
})();
