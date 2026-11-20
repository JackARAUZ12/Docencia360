// Utilidades de interfaz compartidas por las tres modalidades.

// Las vistas se componen con condicionales (cond ? nodo : null). El DOM
// convertiría null/false en el texto "null"; aquí se ignoran en append,
// prepend y replaceChildren para toda la aplicación.
for (const m of ["append", "prepend", "replaceChildren"]) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...xs) { return orig.apply(this, xs.flat(Infinity).filter((x) => x != null && x !== false)); };
}

/** Crea elementos: h("button.btn.btn-sec", {onclick}, "Texto") */
export function h(sel, attrs, ...hijos) {
  const [tag, ...clases] = sel.split(".");
  const el = document.createElement(tag || "div");
  if (clases.length) el.className = clases.join(" ");
  if (attrs != null && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    hijos.unshift(attrs); attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k in el && k !== "list" && k !== "form") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of hijos.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Formatos ----------
const fmtFecha = new Intl.DateTimeFormat("es-NI", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtFechaCorta = new Intl.DateTimeFormat("es-NI", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtDia = new Intl.DateTimeFormat("es-NI", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const fecha = (d) => (d ? fmtFecha.format(new Date(String(d).slice(0, 10) + "T00:00:00Z")) : "—");
export const fechaCorta = (d) => (d ? fmtFechaCorta.format(new Date(String(d).slice(0, 10) + "T00:00:00Z")) : "—");
export const diaLargo = (d) => { const t = fmtDia.format(new Date(String(d).slice(0, 10) + "T00:00:00Z")); return t.charAt(0).toUpperCase() + t.slice(1); };
export function hoyISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function sumarDias(iso, n) {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export const hora = (t) => (t ? String(t).slice(0, 5) : "");
export function dinero(n, moneda = "NIO") {
  return new Intl.NumberFormat("es-NI", { style: "currency", currency: moneda, maximumFractionDigits: 2 }).format(Number(n || 0));
}
export const nombreCompleto = (e) => `${e.nombres ?? ""} ${e.apellidos ?? ""}`.trim();
export function nota(n) {
  if (n == null) return h("span.tenue", "—");
  const v = Number(n);
  return h("span", { className: v >= 60 ? "nota-alta num" : "nota-baja num" }, v.toFixed(1));
}
export const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// ---------- Toast ----------
export function toast(msg, tipo = "") {
  let c = document.getElementById("toasts");
  if (!c) { c = h("div", { id: "toasts", "aria-live": "polite" }); document.body.append(c); }
  const t = h("div.toast" + (tipo ? "." + tipo : ""), { role: tipo === "mal" ? "alert" : "status" }, msg);
  c.append(t);
  // Mensajes largos (p. ej. varios pasos completados) quedan más tiempo en pantalla
  setTimeout(() => t.remove(), Math.min(9000, Math.max(tipo === "mal" ? 6000 : 3200, String(msg).length * 55)));
}

// ---------- Modal ----------
/**
 * Abre un modal. contenido: Node. acciones: [{texto, clase, onclick(cerrar) => bool|Promise}]
 * Devuelve { cerrar, el }.
 */
export function modal(titulo, contenido, acciones = []) {
  const dlg = h("dialog.modal");
  const cerrar = () => { dlg.close(); dlg.remove(); };
  const pie = h("div.modal-pie");
  for (const a of acciones) {
    const b = h("button.btn" + (a.clase ? "." + a.clase : ""), { type: a.submit ? "submit" : "button" }, a.texto);
    b.addEventListener("click", async (ev) => {
      if (a.submit) return; // lo maneja el submit del formulario
      ev.preventDefault();
      if (!a.onclick) return cerrar();
      b.disabled = true;
      try { const r = await a.onclick(cerrar); if (r !== false) {} } finally { b.disabled = false; }
    });
    pie.append(b);
  }
  dlg.append(
    h("div.modal-cab", h("h2", titulo), h("button.btn.btn-texto.btn-sm", { type: "button", "aria-label": "Cerrar", onclick: cerrar }, "✕")),
    h("div.modal-cuerpo", contenido),
    acciones.length ? pie : null,
  );
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(); });
  document.body.append(dlg);
  dlg.showModal();
  return { cerrar, el: dlg };
}

export function confirmar(titulo, texto, { boton = "Confirmar", peligro = false } = {}) {
  return new Promise((ok) => {
    const m = modal(titulo, h("p", texto), [
      { texto: "Cancelar", clase: "btn-sec", onclick: (c) => { c(); ok(false); } },
      { texto: boton, clase: peligro ? "btn-peligro" : "", onclick: (c) => { c(); ok(true); } },
    ]);
    m.el.addEventListener("close", () => ok(false));
  });
}

/**
 * Formulario en modal a partir de una definición de campos.
 * campos: [{name, label, type, required, options:[[v,t]], value, help, min, max, step, full}]
 * onGuardar(datos, cerrar) => Promise. Si lanza error, se muestra en el modal.
 */
export function formularioModal(titulo, campos, valores, onGuardar, { boton = "Guardar" } = {}) {
  const form = h("form", { novalidate: true });
  const err = h("div.aviso.mal.oculto", { role: "alert" });
  form.append(err);
  let fila = null;
  for (const c of campos) {
    if (c.type === "seccion") { fila = null; form.append(h("h3", c.label)); continue; }
    const v = valores?.[c.name] ?? c.value ?? "";
    let input;
    if (c.type === "select") {
      input = h("select", { name: c.name, required: c.required },
        c.placeholder ? h("option", { value: "" }, c.placeholder) : null,
        (c.options || []).map(([val, txt]) => h("option", { value: val, selected: String(val) === String(v) }, txt)));
    } else if (c.type === "textarea") {
      input = h("textarea", { name: c.name, required: c.required, maxLength: c.max || 2000 }, v);
    } else if (c.type === "checkbox") {
      const lab = h("label.check", h("input", { type: "checkbox", name: c.name, checked: !!v }), c.label);
      fila = null; form.append(lab); continue;
    } else {
      input = h("input", { name: c.name, type: c.type || "text", required: c.required, value: v,
        min: c.min, max: c.max, step: c.step, maxLength: c.maxlength, placeholder: c.placeholder,
        inputMode: c.inputmode, autocomplete: c.autocomplete || "off" });
    }
    // «(opcional)» solo donde de verdad se puede dejar vacío (una lista sin opción en blanco siempre tiene valor)
    const opcional = !c.required && !(c.type === "select" && !c.placeholder) && !/\(opcional\)/.test(c.label);
    const campo = h("label.campo", h("span", c.label + (opcional ? " (opcional)" : "")), input, c.help ? h("small", c.help) : null);
    if (c.full) { fila = null; form.append(campo); }
    else { if (!fila) { fila = h("div.fila"); form.append(fila); } fila.append(campo); }
  }
  const m = modal(titulo, form, [
    { texto: "Cancelar", clase: "btn-sec" },
    { texto: boton, onclick: () => { form.requestSubmit(); return false; } },
  ]);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    err.classList.add("oculto");
    if (!form.checkValidity()) {
      const inv = form.querySelector(":invalid");
      err.textContent = "Completa los campos obligatorios" + (inv ? `: ${inv.closest(".campo")?.querySelector("span")?.textContent ?? ""}` : ".");
      err.classList.remove("oculto"); inv?.focus(); return;
    }
    const datos = {};
    for (const c of campos) {
      if (!c.name) continue;
      const el = form.elements[c.name];
      if (!el) continue;
      if (c.type === "checkbox") datos[c.name] = el.checked;
      else if (c.type === "number") datos[c.name] = el.value === "" ? null : Number(el.value);
      else datos[c.name] = el.value.trim() === "" ? null : el.value.trim();
    }
    const btns = m.el.querySelectorAll(".modal-pie .btn"); btns.forEach((b) => (b.disabled = true));
    try { await onGuardar(datos, m.cerrar); }
    catch (e) { err.textContent = e.message || String(e); err.classList.remove("oculto"); m.el.querySelector(".modal-cuerpo").scrollTop = 0; }
    finally { btns.forEach((b) => (b.disabled = false)); }
  });
  setTimeout(() => form.querySelector("input,select,textarea")?.focus(), 30);
  return m;
}

/** Tabla tipo registro. columnas: [{t:"Título", v:(fila)=>Node|string, clase}] */
export function tabla(columnas, filas, { vacio = "Sin registros todavía." } = {}) {
  if (!filas.length) return h("div.vacio", h("p", vacio));
  return h("div.tabla-envoltura",
    h("table.registro",
      h("thead", h("tr", columnas.map((c) => h("th", { className: c.clase || "" }, c.t)))),
      h("tbody", filas.map((f) => h("tr", columnas.map((c) => h("td", { className: c.clase || "", dataset: { t: c.t || "" } }, c.v(f))))))));
}

export function cargando(el, texto = "Cargando…") {
  el.replaceChildren(h("div.vacio", { "aria-busy": "true" }, h("p", texto)));
}

export function errorEn(el, e, reintentar) {
  el.replaceChildren(h("div.aviso.mal", { role: "alert" }, h("p", e.message || String(e)),
    reintentar ? h("button.btn.btn-sec.btn-sm", { onclick: reintentar }, "Reintentar") : null));
}

/** Marca SVG de Docencia360: anillo de 360° trazado como el círculo de un docente, con la D al centro. */
export const LOGO_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5a12.5 12.5 0 1 1-11.3 7.2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M4.2 6.6l.6 4.4 4.3-1" fill="none" stroke="var(--resaltador)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 10h3.6a6 6 0 0 1 0 12H12z" fill="currentColor"/></svg>`;
export function marca(href = "/") {
  const a = h("a.marca", { href, html: LOGO_SVG });
  a.append(h("span", "Docencia", h("b", "360")));
  return a;
}

export function descargarCSV(nombre, filas) {
  const csv = filas.map((f) => f.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = h("a", { href: url, download: nombre }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Imprime solo el nodo dado (recibos, certificados) con el diálogo del navegador; permite «Guardar como PDF». */
export function imprimir(nodo) {
  const zona = h("div", { id: "impresion" }, nodo.cloneNode(true));
  document.body.append(zona);
  document.body.classList.add("solo-impresion");
  const fin = () => { zona.remove(); document.body.classList.remove("solo-impresion"); removeEventListener("afterprint", fin); };
  addEventListener("afterprint", fin);
  setTimeout(() => { print(); setTimeout(fin, 1000); }, 50);
}

// ---------- Búsqueda ----------
/** Texto comparable: sin tildes, sin mayúsculas y con espacios simples («María» = «maria»). */
export const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** ¿Los campos contienen todas las palabras buscadas, en cualquier orden? («lopez ana» encuentra «Ana López»). */
export function coincide(consulta, ...campos) {
  const pal = normalizar(consulta).split(" ").filter(Boolean);
  if (!pal.length) return true;
  const txt = normalizar(campos.flat().filter((x) => x != null).join(" "));
  return pal.every((p) => txt.includes(p));
}

/**
 * Buscador que filtra mientras escribes cualquier lista o tabla ya pintada
 * (filas de tabla o elementos de lista), sin volver a pedir datos. Si la lista
 * se vuelve a pintar, el filtro se aplica solo. Muestra «N de M» y un aviso
 * cuando nada coincide.
 */
export function buscadorVivo(objetivo, { placeholder = "Buscar…", items = "tbody > tr, ul.lista > li, ol.lista > li, ul.pase > li", min = 0, etiqueta = "Buscar en la lista" } = {}) {
  const input = h("input", { type: "search", placeholder, "aria-label": etiqueta, autocomplete: "off", enterKeyHint: "search" });
  const cuenta = h("span.tenue.buscador-cuenta", { "aria-live": "polite" });
  const caja = h("div.buscador-vivo", h("span.buscador-icono", { "aria-hidden": "true" }, "⌕"), input, cuenta);
  let aviso = null, t;
  const aplicar = () => {
    const el = typeof objetivo === "function" ? objetivo() : objetivo;
    if (!el) return;
    const filas = [...el.querySelectorAll(items)].filter((f) => !f.closest(".buscador-vivo"));
    caja.hidden = filas.length < min && !input.value;
    let vis = 0;
    for (const f of filas) { const ok = coincide(input.value, f.textContent); f.hidden = !ok; if (ok) vis++; }
    cuenta.textContent = input.value ? `${vis} de ${filas.length}` : "";
    if (aviso) { aviso.remove(); aviso = null; }
    if (input.value && !vis && filas.length) { aviso = h("p.vacio.buscador-nada", `Nada coincide con «${input.value}».`); el.append(aviso); }
  };
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(aplicar, 60); });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { input.value = ""; aplicar(); } });
  // Re-aplicar cuando la lista se vuelve a pintar
  queueMicrotask(() => {
    const el = typeof objetivo === "function" ? objetivo() : objetivo;
    if (!el) return;
    new MutationObserver((m) => { if (m.some((x) => x.target !== aviso && ![...x.addedNodes].every((n) => n === aviso))) { clearTimeout(t); t = setTimeout(aplicar, 30); } }).observe(el, { childList: true, subtree: true });
    aplicar();
  });
  caja.aplicar = aplicar; caja.input = input;
  return caja;
}

/**
 * Pone un buscador en vivo en cada lista o tabla larga (10 filas o más) de la
 * pantalla, también en las que se pintan después. No toca las pantallas que ya
 * traen su propio buscador ni las listas dentro de ventanas.
 */
const SEL_FILAS = "tbody > tr, ul.lista > li, ol.lista > li, ul.pase > li";
export function activarBuscadores(raiz, { min = 10 } = {}) {
  const revisar = () => {
    if (raiz.querySelector('input[type="search"]:not(.buscador-vivo input)')) return;   // la pantalla ya tiene su buscador
    for (const s of raiz.querySelectorAll("section.hoja, div.hoja")) {
      if (s.closest("dialog") || s.querySelector(".buscador-vivo") || s.parentElement?.closest("section.hoja, div.hoja")) continue;
      const filas = [...s.querySelectorAll(SEL_FILAS)].filter((f) => !f.closest(".buscador-vivo"));
      if (filas.length < min) continue;
      const b = buscadorVivo(s, { placeholder: "Escribe para buscar en esta lista…", items: SEL_FILAS });
      const titulo = s.querySelector(":scope > h2, :scope > .hoja-titulo");
      titulo ? titulo.after(b) : s.prepend(b);
    }
  };
  let t;
  const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(revisar, 120); });
  obs.observe(raiz, { childList: true, subtree: true });
  revisar();
  return () => obs.disconnect();
}
