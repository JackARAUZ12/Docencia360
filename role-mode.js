(() => {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let activeRole = null;
  let profile = null;
  let user = null;

  async function getContext() {
    if (!window.docenciaSupabase) return false;
    const auth = await window.docenciaSupabase.auth.getUser();
    user = auth.data?.user;
    if (!user) return false;
    const result = await window.docenciaSupabase.from('profiles').select('full_name,is_teacher,is_student').eq('id', user.id).maybeSingle();
    if (result.error || !result.data) return false;
    profile = result.data;
    return true;
  }

  function hasBoth() { return !!(profile?.is_teacher && profile?.is_student); }

  function clearSpaces() {
    document.getElementById('classes-section')?.remove();
    document.getElementById('student-classes-section')?.remove();
  }

  function mount(role) {
    if (!profile || !user) return;
    activeRole = role;
    clearSpaces();
    if (role === 'teacher' && profile.is_teacher && window.mountClasses) window.mountClasses(user);
    if (role === 'student' && profile.is_student && window.mountStudentClasses) window.mountStudentClasses(user);
    updateSwitcher();
  }

  function updateSwitcher() {
    const top = document.querySelector('.top');
    if (!top || !hasBoth()) return;
    let box = document.getElementById('role-switcher');
    if (!box) {
      box = document.createElement('div');
      box.id = 'role-switcher';
      box.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:auto;margin-right:10px;padding:4px;border:1px solid var(--b);border-radius:12px;background:#f7f8fb;';
      top.querySelector('.top .brand')?.after(box);
      if (!box.parentNode) top.prepend(box);
    }
    box.innerHTML = `
      <button type="button" data-role="teacher" style="border:0;border-radius:9px;padding:7px 10px;background:${activeRole==='teacher'?'var(--p)':'transparent'};color:${activeRole==='teacher'?'#fff':'var(--t)'};font-size:12px;font-weight:800;">👨‍🏫 Profesor</button>
      <button type="button" data-role="student" style="border:0;border-radius:9px;padding:7px 10px;background:${activeRole==='student'?'var(--p)':'transparent'};color:${activeRole==='student'?'#fff':'var(--t)'};font-size:12px;font-weight:800;">🎓 Estudiante</button>`;
    box.querySelectorAll('[data-role]').forEach(btn => btn.onclick = () => mount(btn.dataset.role));
  }

  async function boot() {
    const content = document.querySelector('.content');
    if (!content || !window.docenciaSupabase) return;
    if (!(await getContext())) return;

    if (hasBoth()) {
      if (!activeRole) activeRole = 'teacher';
      mount(activeRole);
      return;
    }

    if (profile.is_teacher) {
      activeRole = 'teacher';
      if (!document.getElementById('classes-section') && window.mountClasses) window.mountClasses(user);
    } else if (profile.is_student) {
      activeRole = 'student';
      if (!document.getElementById('student-classes-section') && window.mountStudentClasses) window.mountStudentClasses(user);
    }
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector('.content')) boot();
  });
  observer.observe(document.body, { childList:true, subtree:true });
  setTimeout(boot, 250);
  setTimeout(boot, 1000);
})();
