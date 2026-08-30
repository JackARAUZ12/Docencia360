(() => {
  const V = (document.currentScript && document.currentScript.src.split('v=')[1]) || Date.now();
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src + '?v=' + V; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
  });
  load('./classes-core-v2.js')
    .then(() => load('./teacher-class-workspace.js'))
    .then(() => load('./teacher-roster.js'))
    .then(() => load('./teacher-activities.js'))
    .then(() => load('./teacher-grades.js'))
    .then(() => load('./teacher-attendance.js'))
    .then(() => load('./teacher-resources.js'))
    .then(() => load('./teacher-announcements.js'))
    .then(() => load('./teacher-planning.js'))
    .then(() => load('./student-join.js'))
    .catch((error) => console.error('Docencia360 classes module failed to load:', error));
})();
