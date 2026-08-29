(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { workspace: null, classId: null, className: '' };
  const sb = () => window.docenciaSupabase;

  const style = document.createElement('style');
  style.textContent = `
    .an-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}
    .an-add{border:0;background:#5b4ce2;color:#fff;border-radius:10px;padding:10px 14px;font-size:11px;font-weight:850;cursor:pointer}
    .an-list{display:flex;flex-direction:column;gap:10px;margin-top:14px}
    .an-card{background:#fff;border:1px solid #e8e9ef;border-radius:15px;padding:16px}
    .an-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
    .an-title{font-weight:850;font-size:13px}
    .an-date{font-size:9px;color:#9aa0aa;white-space:nowrap}
    .an-msg{font-size:11.5px;color:#4b5160;line-height:1.55;margin-top:7px;white-space:pre-wrap}
    .an-actions{display:flex;gap:6px;margin-top:11px}
    .an-actions button{border:1px solid #e2e3e9;background:#fff;border-radius:8px;padding:6px 11px;font-size:9.5px;font-weight:800;cursor:pointer}
    .an-actions .an-del{color:#b42318;border-color:#ffd9d5}
    .an-modal-body .field{display:flex;flex-direction:column;gap:5px;margin-bottom:11px}
    .an-modal-body label{font-size:10px;font-weight:800;color:#5a6272}
    .an-modal-body input,.an-modal-body textarea{border:1px solid #e2e3e9;border-radius:9px;padding:9px 10px;font-size:11px;font-family:inherit;width:100%}
    .an-modal-body textarea{min-height:90px}
    html.d360-dark .an-card{background:#151728;color:#f4f5fb;border-color:#292b40}
    html.d360-dark .an-msg{color:#c9cbdb}
    html.d360-dark .an-date{color:#9ea5ba}
    html.d360-dark .an-actions button{background:#191b2d;color:#f4f5fb;border-color:#303247}
    html.d360-dark .an-modal-body input,html.d360-dark .an-modal-body textarea{background:#191b2d;color:#f4f5fb;border-color:#303247}
  `;
  document.head.appendChild(style);

  async function identify() {
    const ws = document.getElementById('d360-class-workspace');
    if (!ws || !sb()) return false;
    state.workspace = ws;
    if (!ws.dataset.classId) throw new Error('No pudimos identificar la clase.');
    state.classId = ws.dataset.classId; state.className = ws.dataset.className || '';
    return true;
  }

  function main() { return state.workspace?.querySelector('.cw-main'); }

  async function showAnnouncements() {
    const m = main(); if (!m) return;
    m.innerHTML = `<div class="cw-top"><div><div class="cw-kicker">Avisos</div><h1 class="cw-title">${esc(state.className)}</h1><div class="cw-meta">Comunica novedades a tus estudiantes</div></div></div>
      <div class="an-head"><div></div><button class="an-add" id="an-add">＋ Nuevo aviso</button></div>
      <div class="an-list" id="an-list">${window.D360 ? window.D360.skeletonList(3) : 'Cargando…'}</div>`;
    m.querySelector('#an-add').onclick = () => openModal(null);
    await renderList();
  }

  async function renderList() {
    const host = document.getElementById('an-list'); if (!host) return;
    const r = await sb().from('class_announcements').select('*').eq('class_id', state.classId).order('created_at', { ascending: false });
    if (r.error) { host.innerHTML = `<div class="cw-empty">No pudimos cargar los avisos. ${esc(r.error.message)}</div>`; return; }
    const items = r.data || [];
    if (!items.length) { host.innerHTML = '<div class="cw-empty">Todavía no has publicado avisos en esta clase.</div>'; return; }
    host.innerHTML = items.map(a => `<div class="an-card" data-id="${a.id}"><div class="an-card-top"><div class="an-title">${esc(a.title)}</div><div class="an-date">${new Date(a.created_at).toLocaleString('es-NI', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div><div class="an-msg">${esc(a.message)}</div><div class="an-actions"><button data-edit="${a.id}">Editar</button><button class="an-del" data-del="${a.id}">Eliminar</button></div></div>`).join('');
    host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openModal(items.find(x => x.id === b.dataset.edit)));
    host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteAnnouncement(b.dataset.del));
  }

  async function deleteAnnouncement(id) {
    const ok = window.D360 ? await window.D360.confirm('¿Eliminar este aviso?') : confirm('¿Eliminar este aviso?');
    if (!ok) return;
    const r = await sb().from('class_announcements').delete().eq('id', id);
    if (r.error) { window.D360?.toast(r.error.message, 'error'); return; }
    window.D360?.toast('Aviso eliminado.', 'success');
    renderList();
  }

  function openModal(existing) {
    const editing = !!existing;
    const back = document.createElement('div'); back.className = 'ta-modal-back';
    back.innerHTML = `<section class="ta-modal"><h2>${editing ? 'Editar aviso' : 'Nuevo aviso'}</h2>
      <div class="an-modal-body">
        <div class="field"><label>Título</label><input type="text" id="an-title" maxlength="140" placeholder="Ej. Cambio de fecha del examen" value="${esc(existing?.title || '')}"></div>
        <div class="field"><label>Mensaje</label><textarea id="an-msg" placeholder="Escribe el aviso para tus estudiantes">${esc(existing?.message || '')}</textarea></div>
        <div id="an-form-msg"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px"><button class="ta-ghost" id="an-cancel" style="flex:1">Cancelar</button><button class="ta-save" id="an-save" style="flex:1">${editing ? 'Guardar cambios' : 'Publicar aviso'}</button></div>
    </section>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    back.querySelector('#an-cancel').onclick = () => back.remove();
    back.querySelector('#an-save').onclick = async () => {
      const title = back.querySelector('#an-title').value.trim();
      const message = back.querySelector('#an-msg').value.trim();
      const msg = back.querySelector('#an-form-msg');
      if (!title || !message) { msg.innerHTML = '<div class="ta-msg ta-error">Escribe un título y un mensaje.</div>'; return; }
      const btn = back.querySelector('#an-save'); btn.disabled = true;
      const r = editing
        ? await sb().from('class_announcements').update({ title, message, updated_at: new Date().toISOString() }).eq('id', existing.id)
        : await sb().from('class_announcements').insert({ class_id: state.classId, teacher_id: (await sb().auth.getUser()).data.user.id, title, message });
      if (r.error) { msg.innerHTML = `<div class="ta-msg ta-error">${esc(r.error.message)}</div>`; btn.disabled = false; return; }
      back.remove();
      window.D360?.toast(editing ? 'Aviso actualizado.' : 'Aviso publicado.', 'success');
      renderList();
    };
  }

  async function bind() {
    const ws = document.getElementById('d360-class-workspace');
    if (!ws || ws === state.workspace || !sb()) return;
    try {
      await identify();
      const nav = [...ws.querySelectorAll('.cw-nav button')].find(b => b.textContent.includes('Avisos'));
      if (nav) nav.onclick = showAnnouncements;
    } catch (e) { console.error('teacher-announcements bind failed', e); }
  }
  const watch = () => { bind().finally(() => setTimeout(watch, 500)); };
  watch();
})();
