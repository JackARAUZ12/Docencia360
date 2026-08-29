(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TYPE_LABEL = { activity: 'Actividad', assignment: 'Tarea', exam: 'Examen' };
  const QTYPE_HINT = { fill_blank: 'Escribe la respuesta que va en el espacio.', short_answer: 'Respuesta corta.', long_answer: 'Puedes escribir varias líneas.' };
  const sb = () => window.docenciaSupabase;
  let currentClass = null, currentActivity = null, questions = [], attemptId = null;

  const style = document.createElement('style');
  style.textContent = `
    #sc-workspace{position:fixed;inset:0;background:#f7f8fc;z-index:1000;overflow:auto;color:#171827;animation:d360-fade-in .2s ease}
    .sc-top{max-width:840px;margin:0 auto;padding:26px 20px 60px}
    .sc-back{border:0;background:#f3f1ff;color:#5746d5;border-radius:10px;padding:10px 14px;font-weight:800;font-size:11px;cursor:pointer;margin-bottom:16px}
    .sc-head h1{font-size:26px;margin:4px 0}
    .sc-meta{color:#7d8492;font-size:12px}
    .sc-list{display:grid;gap:10px;margin-top:20px}
    .sc-card{background:#fff;border:1px solid #e8e9ef;border-radius:15px;padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    .sc-card h3{margin:0;font-size:13px}
    .sc-card p{margin:4px 0 0;color:#8b92a0;font-size:10px}
    .sc-badge{font-size:9px;font-weight:850;padding:5px 9px;border-radius:999px;white-space:nowrap}
    .sc-badge.pending{background:#fff7df;color:#8a5b00}.sc-badge.in_progress{background:#fde9d0;color:#a15c00}
    .sc-badge.submitted{background:#eef0f5;color:#5a6272}.sc-badge.graded{background:#ecfdf3;color:#087443}
    .sc-btn{border:0;background:#5b4ce2;color:#fff;border-radius:9px;padding:9px 14px;font-weight:850;font-size:10.5px;cursor:pointer}
    .sc-empty{border:1px dashed #dddfea;border-radius:14px;padding:30px;text-align:center;color:#858c9a;font-size:11px}
    .sc-quiz-modal{width:min(680px,100%)}
    .sc-qhead{position:sticky;top:0;background:#fff;padding-bottom:10px;margin-bottom:4px;border-bottom:1px solid #f0f0f5}
    .sc-progress{height:5px;background:#f0edff;border-radius:99px;overflow:hidden;margin-top:8px}
    .sc-progress-bar{height:100%;background:#5b4ce2;transition:width .2s ease}
    .sc-q{border:1px solid #e7e8ee;border-radius:14px;padding:16px;margin-top:14px}
    .sc-q p.sc-qtext{font-weight:800;font-size:13px;margin:0 0 12px}
    .sc-opt{display:flex;align-items:center;gap:9px;border:1px solid #e4e5eb;border-radius:11px;padding:10px 12px;margin-bottom:7px;cursor:pointer;font-size:12px}
    .sc-opt:hover{border-color:#c9c2ff}
    .sc-opt input{accent-color:#5b4ce2}
    .sc-q textarea,.sc-q input[type=text]{width:100%;border:1px solid #e2e3e9;border-radius:9px;padding:9px 10px;font-size:12px;font-family:inherit}
    .sc-q textarea{min-height:70px}
    .sc-pair{display:flex;gap:8px;align-items:center;margin-bottom:7px;font-size:12px}
    .sc-pair span{flex:0 0 40%;font-weight:750}
    .sc-result-score{font-size:34px;font-weight:900;color:#5544d4;margin:6px 0}
    .sc-success{text-align:center;padding:8px 0}
    .sc-success .sc-check{width:52px;height:52px;border-radius:50%;background:#ecfdf3;color:#087443;display:grid;place-items:center;font-size:24px;margin:0 auto 14px}
    html.d360-dark #sc-workspace{background:#0f1020}
    html.d360-dark .sc-card,html.d360-dark .sc-q,html.d360-dark .sc-opt,html.d360-dark .sc-q textarea,html.d360-dark .sc-q input[type=text]{background:#151728;color:#f4f5fb;border-color:#292b40}
    html.d360-dark .sc-qhead{background:#151728;border-color:#292b40}
    html.d360-dark .sc-back{background:#252044;color:#b8adff}
    @media(max-width:620px){.sc-quiz-modal{width:100%}.sc-top{padding:16px 14px 40px}}
  `;
  document.head.appendChild(style);

  function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  async function openClass(c) {
    document.getElementById('sc-workspace')?.remove();
    currentClass = c;
    const el = document.createElement('div'); el.id = 'sc-workspace';
    el.innerHTML = `<div class="sc-top"><button class="sc-back" id="sc-back">← Volver a mis clases</button><div class="sc-head"><div class="sc-meta">${esc(c.subject_name || 'Sin materia')}${c.grade ? ' · ' + esc(c.grade) : ''}</div><h1>${esc(c.name)}</h1><div class="sc-meta">👨‍🏫 ${esc(c.teacher_name || 'Profesor')}</div></div><div id="sc-list" class="sc-list">${window.D360 ? window.D360.skeletonList(3) : 'Cargando…'}</div></div>`;
    document.body.appendChild(el);
    el.querySelector('#sc-back').onclick = () => el.remove();
    const r = await sb().rpc('get_my_class_activities', { p_class_id: c.id });
    const host = document.getElementById('sc-list'); if (!host) return;
    if (r.error) { host.innerHTML = `<div class="sc-empty">No pudimos cargar las actividades. ${esc(r.error.message)}</div>`; return; }
    const items = r.data || [];
    if (!items.length) { host.innerHTML = `<div class="sc-empty">Tu profesor todavía no ha publicado actividades en esta clase.</div>`; return; }
    host.innerHTML = items.map(a => {
      const status = a.best_status || 'pending';
      const canAnswer = a.attempts_used < a.max_attempts && status !== 'graded';
      const label = status === 'graded' ? 'graded' : status === 'submitted' ? 'submitted' : status === 'in_progress' ? 'in_progress' : 'pending';
      const labelText = { pending: 'Pendiente', in_progress: 'En progreso', submitted: 'Entregado', graded: 'Calificado' }[label];
      return `<div class="sc-card" data-id="${a.activity_id}"><div><h3>${esc(a.title)}</h3><p>${esc(TYPE_LABEL[a.activity_type] || a.activity_type)} · ${Number(a.total_points || 0)} pts${a.due_at ? ' · vence ' + new Date(a.due_at).toLocaleDateString('es-NI') : ''}${a.best_score != null ? ' · obtuviste ' + a.best_score : ''}</p></div><div style="display:flex;align-items:center;gap:9px"><span class="sc-badge ${label}">${labelText}</span>${canAnswer ? `<button class="sc-btn" data-answer="${a.activity_id}">${status === 'pending' ? 'Responder' : 'Continuar'}</button>` : ''}</div></div>`;
    }).join('');
    host.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => beginAttempt(items.find(x => x.activity_id === b.dataset.answer)));
  }

  async function beginAttempt(meta) {
    const back = document.createElement('div'); back.className = 'ta-modal-back';
    back.innerHTML = `<section class="ta-modal sc-quiz-modal">${window.D360 ? window.D360.skeletonList(3) : 'Cargando…'}</section>`;
    document.body.appendChild(back);
    try {
      const start = await sb().rpc('start_activity_attempt', { p_activity_id: meta.activity_id });
      if (start.error) throw start.error;
      attemptId = start.data;
      const [act, qs] = await Promise.all([
        sb().rpc('get_activity_for_student', { p_activity_id: meta.activity_id }),
        sb().rpc('get_activity_questions_for_student', { p_activity_id: meta.activity_id })
      ]);
      if (act.error) throw act.error;
      if (qs.error) throw qs.error;
      currentActivity = Array.isArray(act.data) ? act.data[0] : act.data;
      questions = qs.data || [];
      if (!currentActivity || !questions.length) throw new Error('Esta actividad todavía no tiene preguntas listas.');
      if (currentActivity.shuffle_questions) questions = shuffle(questions);
      renderIntro(back);
    } catch (err) {
      back.querySelector('.ta-modal').innerHTML = `<h2>No pudimos empezar</h2><p>${esc(translate(err.message))}</p><button class="ta-ghost" id="sc-close" style="width:100%;margin-top:10px">Cerrar</button>`;
      back.querySelector('#sc-close').onclick = () => back.remove();
    }
  }

  function translate(msg) {
    const map = { max_attempts_reached: 'Ya usaste todos tus intentos disponibles para esta actividad.', past_due_date: 'La fecha límite de esta actividad ya pasó.', not_open_yet: 'Esta actividad todavía no está disponible.', activity_not_available: 'Esta actividad ya no está disponible.' };
    return map[msg] || msg || 'Intenta de nuevo.';
  }

  function renderIntro(back) {
    back.querySelector('.ta-modal').innerHTML = `<div class="sc-success"><div class="sc-check">✓</div><h2>${esc(currentActivity.title)}</h2>${currentActivity.description ? `<p>${esc(currentActivity.description)}</p>` : ''}${currentActivity.instructions ? `<div style="margin-top:10px;text-align:left;background:#f7f5ff;border:1px solid #ebe7ff;border-radius:11px;padding:11px 13px;font-size:12px">${esc(currentActivity.instructions)}</div>` : ''}<p style="margin-top:10px;color:#8b92a0;font-size:11px">${questions.length} pregunta${questions.length === 1 ? '' : 's'}${currentActivity.time_limit_minutes ? ' · ' + currentActivity.time_limit_minutes + ' min' : ''}</p></div><div class="sj-actions" style="margin-top:16px"><button class="sj-primary" id="sc-start" style="width:100%">Empezar</button></div>`;
    back.querySelector('#sc-start').onclick = () => renderQuiz(back);
  }

  function renderQuiz(back) {
    back.querySelector('.ta-modal').innerHTML = `<div class="sc-qhead"><h2 style="margin:0">${esc(currentActivity.title)}</h2><div class="sc-progress"><div class="sc-progress-bar" id="sc-bar" style="width:0%"></div></div></div><form id="sc-answers">${questions.map((q, i) => questionHtml(q, i)).join('')}<div id="sj-msg" hidden></div><div class="sj-actions" style="margin-top:14px;position:sticky;bottom:0;background:#fff;padding-top:10px"><button type="submit" class="sj-primary" style="width:100%">Entregar</button></div></form>`;
    const form = back.querySelector('#sc-answers');
    const updateProgress = () => { const answered = questions.filter(q => hasAnswer(form, q)).length; back.querySelector('#sc-bar').style.width = Math.round((answered / questions.length) * 100) + '%'; };
    form.addEventListener('input', updateProgress); form.addEventListener('change', updateProgress); updateProgress();
    form.onsubmit = e => { e.preventDefault(); submitQuiz(back, form); };
  }

  function hasAnswer(form, q) {
    if (q.question_type === 'multiple_choice' || q.question_type === 'true_false' || q.question_type === 'image_choice') return !!form.querySelector(`input[name="q_${q.question_id}"]:checked`);
    if (q.question_type === 'matching') return [...form.querySelectorAll(`[data-pair-q="${q.question_id}"]`)].every(i => i.value.trim());
    const f = form.querySelector(`[name="q_${q.question_id}"]`); return f && f.value.trim();
  }

  function questionHtml(q, i) {
    const num = `<span style="color:#7165d9">${i + 1}.</span> `;
    if (q.question_type === 'multiple_choice' || q.question_type === 'true_false' || q.question_type === 'image_choice') {
      return `<div class="sc-q">${q.image_url ? `<img src="${esc(q.image_url)}" style="max-width:100%;border-radius:10px;margin-bottom:10px">` : ''}<p class="sc-qtext">${num}${esc(q.prompt)}</p>${q.options.map(o => `<label class="sc-opt"><input type="radio" name="q_${q.question_id}" value="${esc(o.id)}"> ${esc(o.option_text)}</label>`).join('')}</div>`;
    }
    if (q.question_type === 'matching') {
      return `<div class="sc-q"><p class="sc-qtext">${num}${esc(q.prompt)}</p>${q.options.map(o => `<div class="sc-pair"><span>${esc((o.option_text || '').split('→')[0].trim())}</span><input type="text" data-pair-q="${q.question_id}" data-pair-opt="${esc(o.id)}" placeholder="Tu respuesta"></div>`).join('')}</div>`;
    }
    return `<div class="sc-q"><p class="sc-qtext">${num}${esc(q.prompt)}</p>${q.question_type === 'long_answer' ? `<textarea name="q_${q.question_id}" placeholder="${esc(QTYPE_HINT[q.question_type] || '')}"></textarea>` : `<input type="text" name="q_${q.question_id}" placeholder="${esc(QTYPE_HINT[q.question_type] || '')}">`}</div>`;
  }

  async function submitQuiz(back, form) {
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    const answers = {};
    questions.forEach(q => {
      if (q.question_type === 'multiple_choice' || q.question_type === 'true_false' || q.question_type === 'image_choice') {
        const checked = form.querySelector(`input[name="q_${q.question_id}"]:checked`); answers[q.question_id] = checked ? checked.value : null;
      } else if (q.question_type === 'matching') {
        answers[q.question_id] = [...form.querySelectorAll(`[data-pair-q="${q.question_id}"]`)].map(i => ({ option_id: i.dataset.pairOpt, value: i.value.trim() }));
      } else {
        const f = form.querySelector(`[name="q_${q.question_id}"]`); answers[q.question_id] = f ? f.value.trim() : null;
      }
    });
    try {
      const r = await sb().rpc('submit_activity_attempt_graded', { p_attempt_id: attemptId, p_answers: answers });
      if (r.error) throw r.error;
      const res = Array.isArray(r.data) ? r.data[0] : r.data;
      renderResult(back, res);
    } catch (err) {
      const m = form.querySelector('#sj-msg'); m.hidden = false; m.className = 'sj-msg sj-error'; m.textContent = err.message || 'No pudimos entregar tus respuestas.';
      btn.disabled = false;
    }
  }

  function renderResult(back, res) {
    const showScore = currentActivity.show_results_immediately && res && res.total_points > 0;
    back.querySelector('.ta-modal').innerHTML = `<div class="sc-success"><div class="sc-check">✓</div><h2>¡Entregado!</h2>${showScore ? `<div class="sc-result-score">${res.score} / ${res.total_points}</div><p>Puntos obtenidos${res.needs_manual ? '. Algunas preguntas las revisará tu profesor.' : '.'}</p>` : `<p>Tu profesor revisará tus respuestas.</p>`}</div><div class="sj-actions" style="margin-top:16px"><button class="sj-primary" id="sc-done" style="width:100%">Listo</button></div>`;
    back.querySelector('#sc-done').onclick = () => { back.remove(); document.getElementById('sc-workspace')?.remove(); openClass(currentClass); };
  }

  window.docenciaOpenStudentClass = openClass;
})();
