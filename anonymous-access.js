(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TYPE_LABEL = { activity: 'actividad', assignment: 'tarea', exam: 'examen' };
  const QTYPE_HINT = { fill_blank: 'Escribe la respuesta que va en el espacio.', short_answer: 'Respuesta corta.', long_answer: 'Puedes escribir varias líneas.' };
  let resolved = null, candidates = [], picked = null, attemptId = null, activityMeta = null, questions = [];

  const style = document.createElement('style');
  style.textContent = `.aa-link{border:0;background:none;color:#5b4ce2;font-weight:800;cursor:pointer}
    .aa-picked{padding:11px 13px;background:#f7f5ff;border:1px solid #ebe7ff;border-radius:11px;font-size:12px;font-weight:850}
    .aa-list{display:grid;gap:7px;margin-top:13px}
    .aa-student{border:1px solid #e4e5eb;background:#fff;border-radius:11px;padding:11px 13px;text-align:left;font-size:12px;font-weight:800}
    .aa-student:hover{border-color:#5b4ce2;background:#f8f7ff}
    .aa-success{text-align:center;padding:8px 0}
    .aa-success .aa-check{width:52px;height:52px;border-radius:50%;background:#ecfdf3;color:#087443;display:grid;place-items:center;font-size:24px;margin:0 auto 14px}
    .aa-quiz-modal{width:min(680px,100%)}
    .aa-qhead{position:sticky;top:0;background:#fff;padding-bottom:10px;margin-bottom:4px;border-bottom:1px solid #f0f0f5}
    .aa-progress{height:5px;background:#f0edff;border-radius:99px;overflow:hidden;margin-top:8px}
    .aa-progress-bar{height:100%;background:#5b4ce2;transition:width .2s ease}
    .aa-q{border:1px solid #e7e8ee;border-radius:14px;padding:16px;margin-top:14px}
    .aa-q p.aa-qtext{font-weight:800;font-size:13px;margin:0 0 12px}
    .aa-opt{display:flex;align-items:center;gap:9px;border:1px solid #e4e5eb;border-radius:11px;padding:10px 12px;margin-bottom:7px;cursor:pointer;font-size:12px}
    .aa-opt:hover{border-color:#c9c2ff}
    .aa-opt input{accent-color:#5b4ce2}
    .aa-q textarea,.aa-q input[type=text]{width:100%;border:1px solid #e2e3e9;border-radius:9px;padding:9px 10px;font-size:12px;font-family:inherit}
    .aa-q textarea{min-height:70px}
    .aa-pair{display:flex;gap:8px;align-items:center;margin-bottom:7px;font-size:12px}
    .aa-pair span{flex:0 0 40%;font-weight:750}
    .aa-result-score{font-size:34px;font-weight:900;color:#5544d4;margin:6px 0}
    html.d360-dark .aa-student,html.d360-dark .aa-q,html.d360-dark .aa-opt,html.d360-dark .aa-q textarea,html.d360-dark .aa-q input[type=text]{background:#191b2d;color:#f4f5fb;border-color:#303247}
    html.d360-dark .aa-picked{background:#211e3a;border-color:#343052;color:#f4f5fb}
    html.d360-dark .aa-qhead{background:#151728;border-color:#292b40}
    @media(max-width:620px){.aa-quiz-modal{width:100%}}`;
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
      if (!resolved.activity_id) throw new Error('Este código no está vinculado a una actividad específica. Pídele a tu profesor un código válido.');
      const a = await window.docenciaSupabase.rpc('start_anonymous_activity_attempt', { p_code: code, p_roster_id: picked.roster_id });
      if (a.error) throw a.error;
      attemptId = a.data;
      const [meta, qs] = await Promise.all([
        window.docenciaSupabase.rpc('get_activity_for_student', { p_activity_id: resolved.activity_id }),
        window.docenciaSupabase.rpc('get_activity_questions_for_student', { p_activity_id: resolved.activity_id })
      ]);
      if (meta.error) throw meta.error;
      if (qs.error) throw qs.error;
      activityMeta = Array.isArray(meta.data) ? meta.data[0] : meta.data;
      questions = qs.data || [];
      if (!activityMeta || !questions.length) throw new Error('Esta actividad todavía no tiene preguntas listas. Avísale a tu profesor.');
      if (activityMeta.shuffle_questions) questions = shuffle(questions);
      renderIntro(el);
    } catch (err) {
      el.querySelector('.sj-modal').innerHTML = `<h2>No pudimos empezar</h2><p>${esc(err.message || 'Intenta de nuevo.')}</p><div class="sj-actions"><button class="sj-primary" id="aa-retry" style="width:100%">Cerrar</button></div>`;
      el.querySelector('#aa-retry').onclick = () => el.remove();
    }
  }

  function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function renderIntro(el) {
    el.querySelector('.sj-modal').classList.add('aa-quiz-modal');
    el.querySelector('.sj-modal').innerHTML = `<div class="aa-success"><div class="aa-check">✓</div><h2>¡Listo, ${esc(picked.full_name)}!</h2><p>${esc(activityMeta.title)} · ${esc(resolved.class_name)}</p>${activityMeta.description ? `<p style="margin-top:6px">${esc(activityMeta.description)}</p>` : ''}${activityMeta.instructions ? `<div class="aa-picked" style="margin-top:10px;text-align:left">${esc(activityMeta.instructions)}</div>` : ''}<p style="margin-top:10px;color:#8b92a0;font-size:11px">${questions.length} pregunta${questions.length === 1 ? '' : 's'}${activityMeta.time_limit_minutes ? ' · ' + activityMeta.time_limit_minutes + ' min' : ''}</p></div><div class="sj-actions" style="margin-top:16px"><button class="sj-primary" id="aa-start" style="width:100%">Empezar</button></div>`;
    el.querySelector('#aa-start').onclick = () => renderQuiz(el);
  }

  function renderQuiz(el) {
    el.querySelector('.sj-modal').innerHTML = `<div class="aa-qhead"><h2 style="margin:0">${esc(activityMeta.title)}</h2><div class="aa-progress"><div class="aa-progress-bar" id="aa-bar" style="width:0%"></div></div></div><form id="aa-answers">${questions.map((q, i) => questionHtml(q, i)).join('')}<div id="sj-msg" hidden></div><div class="sj-actions" style="margin-top:14px;position:sticky;bottom:0;background:#fff;padding-top:10px"><button type="submit" class="sj-primary" style="width:100%">Entregar</button></div></form>`;
    const form = el.querySelector('#aa-answers');
    const updateProgress = () => {
      const answered = questions.filter(q => hasAnswer(form, q)).length;
      el.querySelector('#aa-bar').style.width = Math.round((answered / questions.length) * 100) + '%';
    };
    form.addEventListener('input', updateProgress); form.addEventListener('change', updateProgress);
    updateProgress();
    form.onsubmit = e => { e.preventDefault(); submitQuiz(el, form); };
  }

  function hasAnswer(form, q) {
    if (q.question_type === 'multiple_choice' || q.question_type === 'true_false' || q.question_type === 'image_choice') return !!form.querySelector(`input[name="q_${q.question_id}"]:checked`);
    if (q.question_type === 'matching') return [...form.querySelectorAll(`[data-pair-q="${q.question_id}"]`)].every(i => i.value.trim());
    const f = form.querySelector(`[name="q_${q.question_id}"]`); return f && f.value.trim();
  }

  function questionHtml(q, i) {
    const num = `<span style="color:#7165d9">${i + 1}.</span> `;
    if (q.question_type === 'multiple_choice' || q.question_type === 'true_false' || q.question_type === 'image_choice') {
      return `<div class="aa-q">${q.image_url ? `<img src="${esc(q.image_url)}" style="max-width:100%;border-radius:10px;margin-bottom:10px">` : ''}<p class="aa-qtext">${num}${esc(q.prompt)}</p>${q.options.map(o => `<label class="aa-opt"><input type="radio" name="q_${q.question_id}" value="${esc(o.id)}"> ${esc(o.option_text)}</label>`).join('')}</div>`;
    }
    if (q.question_type === 'matching') {
      return `<div class="aa-q"><p class="aa-qtext">${num}${esc(q.prompt)}</p>${q.options.map(o => `<div class="aa-pair"><span>${esc((o.option_text || '').split('→')[0].trim())}</span><input type="text" data-pair-q="${q.question_id}" data-pair-opt="${esc(o.id)}" placeholder="Tu respuesta"></div>`).join('')}</div>`;
    }
    return `<div class="aa-q"><p class="aa-qtext">${num}${esc(q.prompt)}</p>${q.question_type === 'long_answer' ? `<textarea name="q_${q.question_id}" placeholder="${esc(QTYPE_HINT[q.question_type] || '')}"></textarea>` : `<input type="text" name="q_${q.question_id}" placeholder="${esc(QTYPE_HINT[q.question_type] || '')}">`}</div>`;
  }

  async function submitQuiz(el, form) {
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    const answers = {};
    questions.forEach(q => {
      if (q.question_type === 'multiple_choice' || q.question_type === 'true_false' || q.question_type === 'image_choice') {
        const checked = form.querySelector(`input[name="q_${q.question_id}"]:checked`);
        answers[q.question_id] = checked ? checked.value : null;
      } else if (q.question_type === 'matching') {
        answers[q.question_id] = [...form.querySelectorAll(`[data-pair-q="${q.question_id}"]`)].map(i => ({ option_id: i.dataset.pairOpt, value: i.value.trim() }));
      } else {
        const f = form.querySelector(`[name="q_${q.question_id}"]`); answers[q.question_id] = f ? f.value.trim() : null;
      }
    });
    try {
      const r = await window.docenciaSupabase.rpc('submit_anonymous_activity_attempt_graded', { p_attempt_id: attemptId, p_answers: answers });
      if (r.error) throw r.error;
      const res = Array.isArray(r.data) ? r.data[0] : r.data;
      renderResult(el, res);
    } catch (err) {
      const m = form.querySelector('#sj-msg'); m.hidden = false; m.className = 'sj-msg sj-error'; m.textContent = err.message || 'No pudimos entregar tus respuestas. Intenta de nuevo.';
      btn.disabled = false;
    }
  }

  function renderResult(el, res) {
    const showScore = activityMeta.show_results_immediately && res && res.total_points > 0;
    el.querySelector('.sj-modal').innerHTML = `<div class="aa-success"><div class="aa-check">✓</div><h2>¡Entregado!</h2>${showScore ? `<div class="aa-result-score">${res.score} / ${res.total_points}</div><p>Puntos obtenidos en esta ${esc(TYPE_LABEL[resolved.activity_type] || '')}.</p>` : `<p>Tu profesor revisará tus respuestas.</p>`}</div><div class="sj-actions" style="margin-top:16px"><button class="sj-primary" id="aa-done" style="width:100%">Listo</button></div>`;
    el.querySelector('#aa-done').onclick = () => el.remove();
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
