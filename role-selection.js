(() => {
  'use strict';

  // Signup role is chosen once, at account creation. There is no post-login role picker.
  let selectedRole = 'teacher';

  const style = document.createElement('style');
  style.textContent = `
    .signup-role-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .signup-role{min-height:118px;padding:15px;border:2px solid var(--b);border-radius:16px;background:#fff;text-align:left;cursor:pointer}
    .signup-role.active{border-color:var(--p);background:#f8f7ff;box-shadow:0 0 0 1px var(--p)}
    .signup-role .role-icon{font-size:25px;display:block}
    .signup-role strong{display:block;margin-top:7px;font-size:14px}
    .signup-role span:last-child{display:block;margin-top:4px;color:var(--m);font-size:11px;line-height:1.35}
    .loading-line{display:none!important}
    @media(max-width:430px){.signup-role-grid{grid-template-columns:1fr}.signup-role{min-height:auto}}
  `;
  document.head.appendChild(style);

  function renderRoleChoice() {
    const name = document.getElementById('name');
    const form = document.getElementById('f');
    const old = document.getElementById('tc');
    if (!name || !form || !old || document.getElementById('signup-role-grid')) return;

    selectedRole = 'teacher';
    const grid = document.createElement('div');
    grid.id = 'signup-role-grid';
    grid.className = 'signup-role-grid';
    grid.innerHTML = `
      <button type="button" class="signup-role active" data-role="teacher">
        <span class="role-icon">👨‍🏫</span>
        <strong>Soy profesor</strong>
        <span>Crear clases, tareas y evaluaciones.</span>
      </button>
      <button type="button" class="signup-role" data-role="student">
        <span class="role-icon">🎓</span>
        <strong>Soy estudiante</strong>
        <span>Unirme a clases y completar actividades.</span>
      </button>`;

    old.replaceWith(grid);
    grid.querySelectorAll('[data-role]').forEach(button => {
      button.addEventListener('click', () => {
        selectedRole = button.dataset.role;
        grid.querySelectorAll('[data-role]').forEach(b => b.classList.toggle('active', b === button));
      });
    });
  }

  async function handleSignupCapture(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'f') return;
    if (!document.getElementById('name') || !document.getElementById('signup-role-grid')) return;
    if (!window.docenciaSupabase) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const go = document.getElementById('go');
    const msg = document.getElementById('msg');
    if (!go || !msg) return;
    go.disabled = true;
    msg.hidden = true;

    try {
      const fullName = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('pass').value;
      const isTeacher = selectedRole === 'teacher';

      const result = await window.docenciaSupabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, is_teacher: isTeacher } }
      });
      if (result.error) throw result.error;

      // The database trigger creates the profile with exactly one role.
      if (!result.data.session) {
        throw new Error('La cuenta fue creada, pero el acceso directo no está habilitado. Desactiva "Confirm email" en Supabase Authentication → Providers → Email.');
      }

      msg.hidden = false;
      msg.className = 'msg success';
      msg.textContent = 'Cuenta creada correctamente. Preparando tu espacio…';
      setTimeout(() => location.reload(), 250);
    } catch (error) {
      msg.hidden = false;
      msg.className = 'msg error';
      msg.textContent = error?.message || 'No se pudo crear la cuenta.';
      go.disabled = false;
    }
  }

  document.addEventListener('click', () => setTimeout(renderRoleChoice, 0));
  document.addEventListener('DOMContentLoaded', renderRoleChoice);
  document.addEventListener('submit', handleSignupCapture, true);
  setInterval(renderRoleChoice, 400);
})();
