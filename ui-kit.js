(() => {
  'use strict';
  const style = document.createElement('style');
  style.id = 'd360-ui-kit';
  style.textContent = `
    /* ---- Animaciones base ---- */
    @keyframes d360-fade-in{from{opacity:0}to{opacity:1}}
    @keyframes d360-fade-out{from{opacity:1}to{opacity:0}}
    @keyframes d360-slide-up{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes d360-sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
    @keyframes d360-sheet-down{from{transform:translateY(0)}to{transform:translateY(100%)}}
    @keyframes d360-toast-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes d360-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}
    @keyframes d360-spin{to{transform:rotate(360deg)}}

    /* ---- Feedback táctil global en botones (sin romper estilos existentes) ---- */
    button{transition:transform .1s ease, opacity .1s ease, box-shadow .15s ease}
    button:active:not(:disabled){transform:scale(.96)}
    button:disabled{opacity:.55;cursor:not-allowed;transform:none!important}
    .cw-panel,.d360-stat,.d360-action,.ta-card,.class-card{transition:transform .15s ease, box-shadow .15s ease}
    .ta-card:active{transform:scale(.985)}

    /* ---- Vistas: entrada suave del contenido principal ---- */
    .cw-main>.cw-top,.d360-main>*{animation:d360-fade-in .22s ease}

    /* ---- Modal genérico -> hoja inferior en móvil, para TODOS los modales del sistema ---- */
    .tr-modal-back,.sj-modal-back,.tam-back,.ta-modal-back,.d360-confirm-back{animation:d360-fade-in .18s ease}
    .tr-modal,.sj-modal,.tam-modal,.ta-modal,.d360-confirm-modal{animation:d360-slide-up .22s cubic-bezier(.2,.8,.2,1)}
    @media(max-width:620px){
      .tr-modal-back,.sj-modal-back,.tam-back,.ta-modal-back,.d360-confirm-back{align-items:flex-end!important;padding:0!important}
      .tr-modal,.sj-modal,.tam-modal,.ta-modal,.d360-confirm-modal{width:100%!important;max-width:100%!important;border-radius:20px 20px 0 0!important;margin:0!important;max-height:88vh!important;animation:d360-sheet-up .26s cubic-bezier(.2,.8,.2,1)!important}
    }

    /* ---- Toasts ---- */
    #d360-toast-host{position:fixed;left:0;right:0;bottom:14px;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:5000;pointer-events:none;padding:0 14px}
    .d360-toast{pointer-events:auto;max-width:420px;width:100%;display:flex;align-items:center;gap:10px;background:#1c1d2b;color:#fff;border-radius:12px;padding:12px 14px;font-size:12px;font-weight:700;box-shadow:0 12px 30px rgba(0,0,0,.28);animation:d360-toast-in .2s ease}
    .d360-toast.success{background:#0f6b4b}
    .d360-toast.error{background:#b42318}
    .d360-toast .d360-toast-icon{font-size:14px}
    html.d360-dark .d360-toast{background:#1f2036;box-shadow:0 12px 30px rgba(0,0,0,.5)}

    /* ---- Confirm dialog ---- */
    .d360-confirm-modal{width:min(400px,100%);background:#fff;border-radius:20px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.24)}
    .d360-confirm-modal p{margin:0 0 18px;font-size:13px;color:#3c3f4a;line-height:1.5}
    .d360-confirm-actions{display:flex;gap:8px}
    .d360-confirm-actions button{flex:1;height:42px;border-radius:10px;font-weight:850;font-size:11px}
    .d360-confirm-cancel{border:1px solid #e2e3e9;background:#fff;color:#4b5160}
    .d360-confirm-ok{border:0;background:#c0281c;color:#fff}
    .d360-confirm-ok.neutral{background:#5b4ce2}
    html.d360-dark .d360-confirm-modal{background:#151728;color:#f4f5fb}
    html.d360-dark .d360-confirm-modal p{color:#d4d6e2}
    html.d360-dark .d360-confirm-cancel{background:#191b2d;color:#f4f5fb;border-color:#303247}

    /* ---- Skeleton loaders ---- */
    .d360-skel{position:relative;overflow:hidden;background:#edeef3;border-radius:10px;background-image:linear-gradient(90deg,#edeef3 0%,#f7f7fb 50%,#edeef3 100%);background-size:200% 100%;animation:d360-shimmer 1.3s ease-in-out infinite}
    .d360-skel-line{height:12px;margin-bottom:8px}
    .d360-skel-card{height:64px;border-radius:14px;margin-bottom:10px}
    html.d360-dark .d360-skel{background:#191b2d;background-image:linear-gradient(90deg,#191b2d 0%,#232544 50%,#191b2d 100%)}

    /* ---- Spinner pequeño para botones en carga ---- */
    .d360-spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:d360-spin .6s linear infinite;vertical-align:-2px;margin-right:6px}

    /* ---- Drag and drop de preguntas ---- */
    .ta-qrow[draggable=true]{cursor:grab}
    .ta-qrow.d360-dragging{opacity:.4}
    .ta-qrow.d360-drop-above{box-shadow:inset 0 3px 0 #5b4ce2}
    .ta-qrow.d360-drop-below{box-shadow:inset 0 -3px 0 #5b4ce2}
    .ta-drag-handle{cursor:grab;color:#c4c7d2;font-size:14px;padding:0 4px;user-select:none}
  `;
  document.head.appendChild(style);

  function toastHost() {
    let h = document.getElementById('d360-toast-host');
    if (!h) { h = document.createElement('div'); h.id = 'd360-toast-host'; document.body.appendChild(h); }
    return h;
  }
  function toast(message, type = 'info', ms = 3200) {
    const host = toastHost();
    const el = document.createElement('div');
    el.className = 'd360-toast ' + type;
    const icon = type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ';
    el.innerHTML = `<span class="d360-toast-icon">${icon}</span><span>${String(message)}</span>`;
    el.onclick = () => dismiss();
    host.appendChild(el);
    const timer = setTimeout(dismiss, ms);
    function dismiss() { clearTimeout(timer); el.style.animation = 'd360-fade-out .18s ease forwards'; setTimeout(() => el.remove(), 180); }
  }

  function confirmDialog(message, opts = {}) {
    return new Promise(resolve => {
      const back = document.createElement('div');
      back.className = 'ta-modal-back d360-confirm-back';
      back.innerHTML = `<section class="d360-confirm-modal"><p>${String(message)}</p><div class="d360-confirm-actions"><button class="d360-confirm-cancel" id="d360-c-cancel">${opts.cancelText || 'Cancelar'}</button><button class="d360-confirm-ok ${opts.tone === 'neutral' ? 'neutral' : ''}" id="d360-c-ok">${opts.okText || 'Eliminar'}</button></div></section>`;
      document.body.appendChild(back);
      const close = v => { back.remove(); resolve(v); };
      back.addEventListener('click', e => { if (e.target === back) close(false); });
      back.querySelector('#d360-c-cancel').onclick = () => close(false);
      back.querySelector('#d360-c-ok').onclick = () => close(true);
    });
  }

  function skeletonList(n = 3) {
    return `<div>${Array.from({ length: n }).map(() => '<div class="d360-skel d360-skel-card"></div>').join('')}</div>`;
  }

  /** Makes a list of rows reorderable by drag-and-drop. onReorder(orderedIds) fires after drop. */
  function makeReorderable(host, rowSelector, onReorder) {
    let dragEl = null;
    host.querySelectorAll(rowSelector).forEach(row => {
      row.setAttribute('draggable', 'true');
      row.addEventListener('dragstart', () => { dragEl = row; row.classList.add('d360-dragging'); });
      row.addEventListener('dragend', () => { row.classList.remove('d360-dragging'); host.querySelectorAll(rowSelector).forEach(r => r.classList.remove('d360-drop-above', 'd360-drop-below')); });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragEl || dragEl === row) return;
        const rect = row.getBoundingClientRect();
        const above = (e.clientY - rect.top) < rect.height / 2;
        host.querySelectorAll(rowSelector).forEach(r => r.classList.remove('d360-drop-above', 'd360-drop-below'));
        row.classList.add(above ? 'd360-drop-above' : 'd360-drop-below');
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragEl || dragEl === row) return;
        const rect = row.getBoundingClientRect();
        const above = (e.clientY - rect.top) < rect.height / 2;
        row.parentNode.insertBefore(dragEl, above ? row : row.nextSibling);
        host.querySelectorAll(rowSelector).forEach(r => r.classList.remove('d360-drop-above', 'd360-drop-below'));
        onReorder([...host.querySelectorAll(rowSelector)].map(r => r.dataset.id));
      });
    });
  }

  window.D360 = { toast, confirm: confirmDialog, skeletonList, makeReorderable };
})();
