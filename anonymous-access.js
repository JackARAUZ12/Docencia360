(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TYPE_LABEL = { activity: 'actividad', assignment: 'tarea', exam: 'examen' };
  let resolved = null, candidates = [], picked = null;

  const style = document.createElement('style');
  style.textContent = `.aa-link{border:0;background:none;color:#5b4ce2;font-weight:800;cursor:pointer}
    .aa-picked{padding:11px 13px;background:#f7f5ff;border:1px solid #ebe7ff;border-radius:11px;font-size:12px;font-weight:850}
    .aa-list{display:grid;gap:7px;margin-top:13px}
    .aa-student{border:1px solid #e4e5eb;background:#fff;border-radius:11px;padding:11px 13px;text-align:left;font-size:12px;font-weight:800}
    .aa-student:hover{border-color:#5b4ce2;background:#f8f7ff}
    .aa-success{text-align:center;padding:8px 0}
    .aa-success .aa-check{width:52px;height:52px;border-radius:50%;background:#ecfdf3;color:#087443;display:grid;place-items:center;font-size:24px;margin:0 auto 14px}
    html.d360-dark .aa-student{background:#191b2d;color:#f4f5fb;border-color:#303247}
    html.d360-dark .aa-picked{background:#211e3a;border-color:#343052;color:#f4f5fb}`;
  document.head.appendChild(style);

  function open(prefillCode) {
    document.getElementById('sj-modal')?.remove();
    resolved = null; candidates = []; picked = null;
    const el = document.createElement('div'); el.id = 'sj-modal'; el.className = 'sj-modal-back';
    el.innerHTML = `<section class="sj-modal"><h2>Entrar sin cuenta</h2><p>Escribe el código de la actividad, tarea o examen que te dio tu profesor.</p><form id="aa-code-form" class="form"><label class="field">Código<input id="aa-code" class="sj-code" maxlength="32" required placeholder="EX-XXXXXXXX" value="${esc(prefillCode || '')}"></label><div id="sj-msg" hidden></div><div class="sj-actions"><button type="button" class="sj-cancel" id="aa-close">Cancelar</button><button class="sj-primary" type="submit">Continuar</button></div></form></section>`;
    document.body.appendChild(el);
    el.querySelector('#aa-close').onclick = () => el.remove();
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
    el.querySelector('#aa-code-form').onsubmit = lookupCode;
    setTimeout(() => el.querySelector('#aa-code').focus(), 20);
    if (prefillCode) lookupCode({ preventDefault() {} });
  }

  async function lookupCode(e) {
    e.preventDefault();
    const el = document.getElementById('sj-modal'); if (!el) return;
    const code = el.querySelector('#aa-code').value.trim().toUpperCase();
    const b = el.querySelector('.sj-primary'); if (!b) return;
    b.disabled = true; hideMsg();
    try {
      if (!window.docenciaSupabase) throw new Error('La aplicación todavía está cargando. Intenta de nuevo en un segundo.');
      const r = await window.docenciaSupabase.rpc('resolve_activity_access_code', { p_code: code });
      if (r.error) throw r.error;
      if (!r.data?.length) throw new Error('Código inválido, vencido o desactivado.');
      resolved = r.data[0];
      const c = await window.docenciaSupabase.rpc('get_anonymous_attempt_candidates', { p_code: code });
      if (c.error) throw c.error;
      candidates = c.data || [];
      if (!candidates.length) throw new Error('No hay estudiantes precargados para esta clase. Pídele a tu profesor que te agregue primero.');
      renderCandidates(code);
    } catch (err) { showMsg(err.message || 'No pudimos validar el código.', 'error'); }
    finally { if (b) b.disabled = false; }
  }

  function renderCandidates(code) {
    const el = document.getElementById('sj-modal'); if (!el) return;
    el.querySelector('.sj-modal').innerHTML = `<h2>¿Cuál eres?</h2><p>${esc(resolved.class_name)} · ${esc(TYPE_LABEL[resolved.activity_type] || resolved.activity_type)}</p><div class="aa-list">${candidates.map(s => `<button type="button" class="aa-student" data-id="${esc(s.roster_id)}">${esc(s.full_name)}</button>`).join('')}</div><div id="sj-msg" hidden></div><div class="sj-actions"><button type="button" class="sj-cancel" id="aa-close2">Cancelar</button></div>`;
    el.querySelector('#aa-close2').onclick = () => el.remove();
    el.querySelectorAll('.aa-student').forEach(btn => btn.onclick = () => { picked = candidates.find(x => String(x.roster_id) === btn.dataset.id); startAttempt(code); });
  }

  async function startAttempt(code) {
    const el = document.getElementById('sj-modal'); if (!el) return;
    el.querySelector('.sj-modal').innerHTML = `<div class="aa-success"><p>Iniciando…</p></div>`;
    try {
      const a = await window.docenciaSupabase.rpc('start_anonymous_activity_attempt', { p_code: code, p_roster_id: picked.roster_id });
      if (a.error) throw a.error;
      el.querySelector('.sj-modal').innerHTML = `<div class="aa-success"><div class="aa-check">✓</div><h2>¡Listo, ${esc(picked.full_name)}!</h2><p>Quedaste registrado en <b>${esc(resolved.class_name)}</b>.</p><div class="aa-picked" style="margin-top:10px">Tu profesor te dirá cuándo empezar a responder desde este mismo dispositivo.</div></div><div class="sj-actions" style="margin-top:16px"><button class="sj-primary" id="aa-done" style="width:100%">Entendido</button></div>`;
      el.querySelector('#aa-done').onclick = () => el.remove();
    } catch (err) {
      el.querySelector('.sj-modal').innerHTML = `<h2>No pudimos registrarte</h2><p>${esc(err.message || 'Intenta de nuevo.')}</p><div class="sj-actions"><button class="sj-primary" id="aa-retry" style="width:100%">Cerrar</button></div>`;
      el.querySelector('#aa-retry').onclick = () => el.remove();
    }
  }

  function showMsg(text, type) { const m = document.getElementById('sj-msg'); if (!m) return; m.hidden = false; m.className = 'sj-msg ' + (type === 'error' ? 'sj-error' : 'sj-success'); m.textContent = text; }
  function hideMsg() { const m = document.getElementById('sj-msg'); if (m) m.hidden = true; }

  function injectLogin() {
    const card = document.querySelector('.card'); if (!card || document.getElementById('aa-entry')) return;
    const sw = card.querySelector('.switch'); if (!sw) return;
    const div = document.createElement('div'); div.id = 'aa-entry'; div.className = 'switch';
    div.innerHTML = '¿Tienes un código de actividad? <button type="button" class="aa-link">Entrar sin cuenta</button>';
    div.querySelector('button').onclick = () => open();
    card.appendChild(div);
    const url = new URL(location.href); const code = url.searchParams.get('code');
    if (code && !document.getElementById('sj-modal')) { open(code.toUpperCase()); url.searchParams.delete('code'); history.replaceState({}, '', url); }
  }
  setInterval(injectLogin, 400);
  window.docencia360OpenAnonymousAccess = () => open();
})();
