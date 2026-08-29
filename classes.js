(() => {
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
  });
  load('./classes-core-v2.js')
    .then(() => load('./teacher-class-workspace.js'))
    .then(() => load('./teacher-roster.js'))
    .then(() => load('./teacher-activities.js'))
    .then(() => load('./teacher-grades.js'))
    .then(() => load('./teacher-attendance.js'))
    .then(() => load('./teacher-resources.js'))
    .then(() => load('./student-join.js'))
    .catch((error) => console.error('Docencia360 classes module failed to load:', error));
})();
