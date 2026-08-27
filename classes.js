(() => {
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  load('./classes-core-v2.js')
    .catch((error) => console.error('Docencia360 classes module failed to load:', error));
})();
