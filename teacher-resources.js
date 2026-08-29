(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { workspace: null, classId: null, className: '' };
  const sb = () => window.docenciaSupabase;
  const MAX_MB = 25;

  const style = document.createElement('style');
  style.textContent = `
    .rc-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}
    .rc-add{border:0;background:#5b4ce2;color:#fff;border-radius:10px;padding:10px 14px;font-size:11px;font-weight:850;cursor:pointer}
    .rc-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:11px;margin-top:14px}
    .rc-card{background:#fff;border:1px solid #e8e9ef;border-radius:15px;padding:15px;display:flex;flex-direction:column;gap:9px}
    .rc-icon{width:38px;height:38px;border-radius:11px;background:#f0edff;color:#5645d5;display:grid;place-items:center;font-size:17px}
    .rc-title{font-weight:850;font-size:12.5px}
    .rc-desc{font-size:10.5px;color:#8b92a0;line-height:1.4}
    .rc-meta{font-size:9px;color:#9aa0aa}
    .rc-actions{display:flex;gap:7px;margin-top:auto}
    .rc-actions a,.rc-actions button{flex:1;text-align:center;border:1px solid #e2e3e9;background:#fff;border-radius:9px;padding:8px;font-size:10px;font-weight:800;cursor:pointer;text-decoration:none;color:#171827}
    .rc-actions .rc-del{color:#b42318;border-color:#ffd9d5}
    .rc-modal-body .field{display:flex;flex-direction:column;gap:5px;margin-bottom:11px}
    .rc-modal-body label{font-size:10px;font-weight:800;color:#5a6272}
    .rc-modal-body input[type=text],.rc-modal-body input[type=url],.rc-modal-body textarea{border:1px solid #e2e3e9;border-radius:9px;padding:9px 10px;font-size:11px;font-family:inherit;width:100%}
    .rc-kind-tabs{display:flex;background:#f3f1ff;border-radius:9px;padding:2px;margin-bottom:14px}
    .rc-kind-tabs button{flex:1;border:0;background:transparent;padding:8px;border-radius:7px;font-size:10.5px;font-weight:800;color:#5645d5;cursor:pointer}
    .rc-kind-tabs button.active{background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.06)}
    .rc-file-drop{border:1.5px dashed #d6d0ff;border-radius:12px;padding:20px;text-align:center;font-size:11px;color:#7d8492;cursor:pointer}
    .rc-file-drop.has-file{border-color:#5b4ce2;color:#5645d5;font-weight:800}
    html.d360-dark .rc-card{background:#151728;color:#f4f5fb;border-color:#292b40}
    html.d360-dark .rc-desc,html.d360-dark .rc-meta{color:#9ea5ba}
    html.d360-dark .rc-actions a,html.d360-dark .rc-actions button{background:#191b2d;color:#f4f5fb;border-color:#303247}
    html.d360-dark .rc-modal-body input,html.d360-dark .rc-modal-body textarea{background:#191b2d;color:#f4f5fb;border-color:#303247}
    html.d360-dark .rc-file-drop{background:#191b2d}
  `;
  document.head.appendChild(style);

  function iconFor(r) {
    if (r.link_url) return '🔗';
    const t = (r.file_type || '').toLowerCase();
    if (t.includes('pdf')) return '📄';
    if (t.includes('image')) return '🖼️';
    if (t.includes('video')) return '🎬';
    if (t.includes('audio')) return '🎵';
    if (t.includes('presentation') || t.includes('powerpoint')) return '📊';
    if (t.includes('word') || t.includes('document')) return '📝';
    if (t.includes('sheet') || t.includes('excel')) return '📈';
    return '📁';
  }
  function fmtSize(bytes) { if (!bytes) return ''; const kb = bytes / 1024; return kb < 1024 ? Math.round(kb) + ' KB' : (kb / 1024).toFixed(1) + ' MB'; }

  async function identify() {
    const ws = document.getElementById('d360-class-workspace');
    if (!ws || !sb()) return false;
    state.workspace = ws;
    if (!ws.dataset.classId) throw new Error('No pudimos identificar la clase.');
    state.classId = ws.dataset.classId; state.className = ws.dataset.className || '';
    return true;
  }

  function main() { return state.workspace?.querySelector('.cw-main'); }

  async function showResources() {
    const m = main(); if (!m) return;
    m.innerHTML = `<div class="cw-top"><div><div class="cw-kicker">Recursos</div><h1 class="cw-title">${esc(state.className)}</h1><div class="cw-meta">Materiales y enlaces para tus estudiantes</div></div></div>
      <div class="rc-head"><div></div><button class="rc-add" id="rc-add">＋ Agregar recurso</button></div>
      <div class="rc-list" id="rc-list">${window.D360 ? window.D360.skeletonList(3) : 'Cargando…'}</div>`;
    m.querySelector('#rc-add').onclick = openAddModal;
    await renderList();
  }

  async function renderList() {
    const host = document.getElementById('rc-list'); if (!host) return;
    const r = await sb().from('class_resources').select('*').eq('class_id', state.classId).order('created_at', { ascending: false });
    if (r.error) { host.innerHTML = `<div class="cw-empty">No pudimos cargar los recursos. ${esc(r.error.message)}</div>`; return; }
    const items = r.data || [];
    if (!items.length) { host.innerHTML = '<div class="cw-empty">Todavía no has compartido materiales en esta clase.</div>'; return; }
    host.innerHTML = items.map(r => {
      const url = r.link_url || sb().storage.from('class-resources').getPublicUrl(r.file_path).data.publicUrl;
      return `<div class="rc-card" data-id="${r.id}"><div class="rc-icon">${iconFor(r)}</div><div class="rc-title">${esc(r.title)}</div>${r.description ? `<div class="rc-desc">${esc(r.description)}</div>` : ''}<div class="rc-meta">${r.link_url ? 'Enlace' : fmtSize(r.file_size)} · ${new Date(r.created_at).toLocaleDateString('es-NI')}</div><div class="rc-actions"><a href="${esc(url)}" target="_blank" rel="noopener">${r.link_url ? 'Abrir' : 'Descargar'}</a><button class="rc-del" data-del="${r.id}" data-path="${esc(r.file_path || '')}">Eliminar</button></div></div>`;
    }).join('');
    host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteResource(b.dataset.del, b.dataset.path));
  }

  async function deleteResource(id, path) {
    const ok = window.D360 ? await window.D360.confirm('¿Eliminar este recurso? Esta acción no se puede deshacer.') : confirm('¿Eliminar este recurso?');
    if (!ok) return;
    if (path) await sb().storage.from('class-resources').remove([path]);
    const r = await sb().from('class_resources').delete().eq('id', id);
    if (r.error) { window.D360?.toast(r.error.message, 'error'); return; }
    window.D360?.toast('Recurso eliminado.', 'success');
    renderList();
  }

  function openAddModal() {
    const back = document.createElement('div'); back.className = 'ta-modal-back';
    back.innerHTML = `<section class="ta-modal"><h2>Agregar recurso</h2>
      <div class="rc-kind-tabs"><button type="button" class="active" data-kind="file">📁 Subir archivo</button><button type="button" data-kind="link">🔗 Enlace</button></div>
      <div class="rc-modal-body">
        <div class="field"><label>Título</label><input type="text" id="rc-title" placeholder="Ej. Guía de fracciones" maxlength="160"></div>
        <div class="field"><label>Descripción (opcional)</label><textarea id="rc-desc" rows="2" placeholder="Breve descripción"></textarea></div>
        <div id="rc-kind-body"></div>
        <div id="rc-msg"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px"><button class="ta-ghost" id="rc-cancel" style="flex:1">Cancelar</button><button class="ta-save" id="rc-save" style="flex:1">Guardar</button></div>
    </section>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    back.querySelector('#rc-cancel').onclick = () => back.remove();
    let kind = 'file', pickedFile = null;
    const kindBody = back.querySelector('#rc-kind-body');
    function renderKindBody() {
      kindBody.innerHTML = kind === 'file'
        ? `<div class="field"><label>Archivo (máx. ${MAX_MB} MB)</label><div class="rc-file-drop" id="rc-drop">Toca para elegir un archivo<input type="file" id="rc-file" style="display:none"></div></div>`
        : `<div class="field"><label>URL del enlace</label><input type="url" id="rc-link" placeholder="https://..."></div>`;
      if (kind === 'file') {
        const drop = kindBody.querySelector('#rc-drop'); const input = kindBody.querySelector('#rc-file');
        drop.onclick = () => input.click();
        input.onchange = () => { pickedFile = input.files[0] || null; if (pickedFile) { drop.textContent = `✓ ${pickedFile.name}`; drop.classList.add('has-file'); } };
      }
    }
    renderKindBody();
    back.querySelectorAll('.rc-kind-tabs button').forEach(b => b.onclick = () => { kind = b.dataset.kind; back.querySelectorAll('.rc-kind-tabs button').forEach(x => x.classList.remove('active')); b.classList.add('active'); pickedFile = null; renderKindBody(); });

    back.querySelector('#rc-save').onclick = async () => {
      const title = back.querySelector('#rc-title').value.trim();
      const msg = back.querySelector('#rc-msg');
      if (!title) { msg.innerHTML = '<div class="ta-msg ta-error">Escribe un título.</div>'; return; }
      const btn = back.querySelector('#rc-save'); btn.disabled = true; msg.innerHTML = '';
      try {
        const { data: { user } } = await sb().auth.getUser();
        const description = back.querySelector('#rc-desc').value.trim() || null;
        if (kind === 'link') {
          const link = back.querySelector('#rc-link').value.trim();
          if (!/^https?:\/\//i.test(link)) throw new Error('Escribe una URL válida (debe empezar con http:// o https://).');
          const ins = await sb().from('class_resources').insert({ class_id: state.classId, teacher_id: user.id, title, description, link_url: link, file_path: '', file_name: '' });
          if (ins.error) throw ins.error;
        } else {
          if (!pickedFile) throw new Error('Elige un archivo.');
          if (pickedFile.size > MAX_MB * 1024 * 1024) throw new Error(`El archivo supera ${MAX_MB} MB.`);
          const path = `${user.id}/${state.classId}/${Date.now()}-${pickedFile.name}`;
          const up = await sb().storage.from('class-resources').upload(path, pickedFile);
          if (up.error) throw up.error;
          const ins = await sb().from('class_resources').insert({ class_id: state.classId, teacher_id: user.id, title, description, file_path: path, file_name: pickedFile.name, file_type: pickedFile.type, file_size: pickedFile.size });
          if (ins.error) throw ins.error;
        }
        back.remove();
        window.D360?.toast('Recurso agregado.', 'success');
        renderList();
      } catch (err) {
        msg.innerHTML = `<div class="ta-msg ta-error">${esc(err.message || 'No se pudo guardar.')}</div>`;
        btn.disabled = false;
      }
    };
  }

  async function bind() {
    const ws = document.getElementById('d360-class-workspace');
    if (!ws || ws === state.workspace || !sb()) return;
    try {
      await identify();
      const nav = [...ws.querySelectorAll('.cw-nav button')].find(b => b.textContent.includes('Recursos'));
      if (nav) nav.onclick = showResources;
    } catch (e) { console.error('teacher-resources bind failed', e); }
  }
  const watch = () => { bind().finally(() => setTimeout(watch, 500)); };
  watch();
})();
