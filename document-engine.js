(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sb = () => window.docenciaSupabase;

  async function getLetterhead() {
    const { data: { user } } = await sb().auth.getUser();
    const r = await sb().from('profiles').select('full_name,institution_name,logo_path').eq('id', user.id).maybeSingle();
    if (r.error) return { full_name: '', institution_name: '', logo_url: null };
    let logo_url = null;
    if (r.data.logo_path) logo_url = sb().storage.from('branding').getPublicUrl(r.data.logo_path).data.publicUrl;
    return { full_name: r.data.full_name || '', institution_name: r.data.institution_name || '', logo_url };
  }

  function openLetterheadModal(onDone) {
    const back = document.createElement('div'); back.className = 'ta-modal-back';
    back.innerHTML = `<section class="ta-modal"><h2>Membrete de tus documentos</h2><p style="font-size:11px;color:#8b92a0;margin:-6px 0 14px">Configúralo una vez; se usará en todos tus documentos imprimibles.</p>
      <div class="field" style="display:flex;flex-direction:column;gap:5px;margin-bottom:11px"><label style="font-size:10px;font-weight:800;color:#5a6272">Nombre de la institución / academia / curso</label><input type="text" id="lh-inst" placeholder="Ej. Colegio San José" style="border:1px solid #e2e3e9;border-radius:9px;padding:9px 10px;font-size:11px;width:100%"></div>
      <div class="field" style="display:flex;flex-direction:column;gap:5px;margin-bottom:11px"><label style="font-size:10px;font-weight:800;color:#5a6272">Logo (opcional)</label><div class="rc-file-drop" id="lh-drop" style="border:1.5px dashed #d6d0ff;border-radius:12px;padding:16px;text-align:center;font-size:11px;color:#7d8492;cursor:pointer">Toca para elegir una imagen<input type="file" accept="image/*" id="lh-file" style="display:none"></div></div>
      <div id="lh-msg"></div>
      <div style="display:flex;gap:8px;margin-top:6px"><button class="ta-ghost" id="lh-skip" style="flex:1">Omitir por ahora</button><button class="ta-save" id="lh-save" style="flex:1">Guardar y continuar</button></div>
    </section>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    let file = null;
    const drop = back.querySelector('#lh-drop'); const input = back.querySelector('#lh-file');
    drop.onclick = () => input.click();
    input.onchange = () => { file = input.files[0] || null; if (file) { drop.textContent = `✓ ${file.name}`; drop.style.borderColor = '#5b4ce2'; drop.style.color = '#5645d5'; drop.style.fontWeight = '800'; } };
    back.querySelector('#lh-skip').onclick = () => { back.remove(); onDone({ full_name: '', institution_name: '', logo_url: null }); };
    back.querySelector('#lh-save').onclick = async () => {
      const btn = back.querySelector('#lh-save'); btn.disabled = true;
      const msg = back.querySelector('#lh-msg');
      try {
        const { data: { user } } = await sb().auth.getUser();
        let logo_path = null;
        if (file) {
          if (file.size > 3 * 1024 * 1024) throw new Error('El logo debe pesar menos de 3 MB.');
          logo_path = `${user.id}/${Date.now()}-${file.name}`;
          const up = await sb().storage.from('branding').upload(logo_path, file);
          if (up.error) throw up.error;
        }
        const patch = { institution_name: back.querySelector('#lh-inst').value.trim() || null };
        if (logo_path) patch.logo_path = logo_path;
        const upd = await sb().from('profiles').update(patch).eq('id', user.id).select('full_name').single();
        if (upd.error) throw upd.error;
        back.remove();
        const lh = await getLetterhead();
        window.D360?.toast('Membrete guardado.', 'success');
        onDone(lh);
      } catch (err) {
        msg.innerHTML = `<div class="ta-msg ta-error">${esc(err.message || 'No se pudo guardar.')}</div>`;
        btn.disabled = false;
      }
    };
  }

  function printWindowWith(html) {
    const w = window.open('', '_blank');
    if (!w) { window.D360?.toast('Tu navegador bloqueó la ventana de impresión. Permite ventanas emergentes.', 'error'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 350);
  }

  const baseCss = `
    @page{size:letter;margin:18mm 16mm}
    *{box-sizing:border-box}
    body{font-family:Georgia,'Times New Roman',serif;color:#111;margin:0;padding:24px 30px;font-size:13px;line-height:1.5}
    .doc-header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:16px}
    .doc-header img{height:52px;width:52px;object-fit:contain}
    .doc-header .inst{font-size:15px;font-weight:700}
    .doc-header .sub{font-size:10.5px;color:#555}
    .doc-title{text-align:center;margin:6px 0 14px}
    .doc-title h1{font-size:17px;margin:0;text-transform:uppercase;letter-spacing:.03em}
    .doc-title .meta{font-size:10.5px;color:#555;margin-top:3px}
    .doc-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;border:1px solid #ccc;border-radius:4px;padding:10px 14px;margin-bottom:18px;font-size:11.5px}
    .doc-fields div{border-bottom:1px dotted #999;padding-bottom:3px}
    .doc-fields .full{grid-column:1/-1}
    .q{margin-bottom:16px;page-break-inside:avoid}
    .q-head{font-weight:700;font-size:12.5px;margin-bottom:6px}
    .q-pts{float:right;font-weight:400;font-size:10.5px;color:#555}
    .opt{margin:4px 0 4px 6px;font-size:12px}
    .opt .bullet{display:inline-block;width:12px;height:12px;border:1.3px solid #333;border-radius:50%;margin-right:7px;vertical-align:-1px}
    .opt.correct .bullet{background:#111}
    .opt.correct{font-weight:700}
    .line{border-bottom:1px solid #333;display:inline-block;min-width:180px;margin:0 3px}
    .lines-block{border-bottom:1px solid #333;height:22px;margin-bottom:4px}
    .pair-row{display:flex;justify-content:space-between;font-size:12px;margin:5px 0;max-width:420px}
    .footer-space{margin-top:40px;text-align:center;font-size:10px;color:#888}
    @media print{.no-print{display:none}}
    .no-print{position:fixed;top:10px;right:10px;background:#5b4ce2;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-family:sans-serif;font-size:12px;font-weight:700;cursor:pointer}
  `;

  function header(lh, kicker) {
    return `<div class="doc-header">${lh.logo_url ? `<img src="${esc(lh.logo_url)}">` : ''}<div><div class="inst">${esc(lh.institution_name || 'Docencia360')}</div><div class="sub">${esc(kicker || '')}</div></div></div>`;
  }

  function fieldsBlock(a, withAnswerKey) {
    return `<div class="doc-fields">
      <div>Nombre del estudiante: <span class="line" style="min-width:220px"></span></div>
      <div>Sección: <span class="line" style="min-width:90px"></span></div>
      <div>Fecha: <span class="line" style="min-width:110px"></span></div>
      <div>Puntaje: <span class="line" style="min-width:90px"></span> / ${Number(a.total_points || 0)}</div>
      <div class="full">Profesor(a): ${esc(a.teacherName || '_______________________')}</div>
      ${withAnswerKey ? '<div class="full" style="border:0;color:#b42318;font-weight:700">HOJA DE RESPUESTAS — SOLO PARA EL PROFESOR</div>' : ''}
    </div>`;
  }

  function TYPE_LABEL(t) { return { activity: 'Actividad', assignment: 'Tarea', exam: 'Examen' }[t] || t; }

  function questionHtml(q, i, withAnswerKey) {
    let body = '';
    if (q.question_type === 'multiple_choice' || q.question_type === 'image_choice' || q.question_type === 'true_false') {
      body = (q.options || []).map(o => `<div class="opt ${withAnswerKey && o.is_correct ? 'correct' : ''}"><span class="bullet"></span>${esc(o.option_text)}</div>`).join('');
    } else if (q.question_type === 'matching') {
      const pairs = (q.options || []).map(o => o.metadata || {});
      body = `<div style="display:flex;gap:30px"><div style="flex:1">${pairs.map((p, idx) => `<div class="pair-row"><span>${idx + 1}. ${esc(p.left || '')}</span><span class="line" style="min-width:24px"></span></div>`).join('')}</div><div style="flex:1">${pairs.map(p => `<div class="pair-row"><span>${esc(p.right || '')}</span></div>`).join('')}</div></div>`;
    } else if (q.question_type === 'long_answer') {
      body = `<div class="lines-block"></div><div class="lines-block"></div><div class="lines-block"></div>`;
    } else {
      body = `<div class="lines-block" style="max-width:340px"></div>`;
    }
    return `<div class="q"><div class="q-head"><span class="q-pts">${q.points} pt${q.points === 1 ? '' : 's'}</span>${i + 1}. ${esc(q.prompt)}</div>${body}</div>`;
  }

  async function generateActivityDocument(activity, questions, withAnswerKey) {
    const lh = await getLetterhead();
    const total = questions.reduce((s, q) => s + Number(q.points || 0), 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(activity.title)}</title><style>${baseCss}</style></head><body>
      <button class="no-print" onclick="window.print()">Imprimir / Guardar PDF</button>
      ${header(lh, `${TYPE_LABEL(activity.activity_type)} · ${lh.full_name ? 'Prof. ' + esc(lh.full_name) : ''}`)}
      <div class="doc-title"><h1>${esc(activity.title)}</h1>${activity.description ? `<div class="meta">${esc(activity.description)}</div>` : ''}</div>
      ${fieldsBlock({ total_points: total, teacherName: lh.full_name }, withAnswerKey)}
      ${activity.instructions ? `<p style="font-size:11.5px;font-style:italic;margin-bottom:16px">${esc(activity.instructions)}</p>` : ''}
      ${questions.map((q, i) => questionHtml(q, i, withAnswerKey)).join('')}
      <div class="footer-space">Generado con Docencia360</div>
    </body></html>`;
    printWindowWith(html);
  }

  window.D360Documents = { getLetterhead, openLetterheadModal, generateActivityDocument };
})();
