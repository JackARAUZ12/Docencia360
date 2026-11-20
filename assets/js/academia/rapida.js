// Barra rápida de la academia (siempre visible arriba): buscar a un estudiante
// mientras se escribe y, desde el resultado, cobrarle, abrir su ficha o
// escribirle por WhatsApp. El botón «Cobrar» deja la barra lista para cobrar.
import { sb, q } from "../core/sb.js";
import { h, coincide, nombreCompleto } from "../core/ui.js";
import { numeroWhatsApp } from "../comun/reporte.js";

export function barraRapida(ctx) {
  const puedeCobrar = ctx.esFinanzas && ctx.f("finanzas");
  let modo = "buscar", datos = null, activo = 0, vis = [];
  const input = h("input", { type: "search", autocomplete: "off", enterKeyHint: "search", "aria-label": "Buscar estudiante",
    placeholder: "Buscar estudiante…", title: "Por nombre, teléfono, código o grupo", role: "combobox", "aria-expanded": "false", "aria-controls": "rapida-res" });
  const res = h("ul.rapida-res", { id: "rapida-res", role: "listbox", hidden: true });
  const pista = h("span.rapida-pista", { hidden: true }, "Cobrar a:");

  const cargar = async () => {
    if (datos) return datos;
    const [est, rels] = await Promise.all([
      ctx.datos.estudiantes(),
      q(sb.from("grupo_estudiantes").select("estudiante_id, grupos(nombre,estado)").eq("cuenta_id", ctx.id).eq("estado", "activo")).catch(() => []),
    ]);
    const gr = {};
    rels.forEach((r) => { if (r.grupos?.estado !== "finalizado") (gr[r.estudiante_id] ||= []).push(r.grupos?.nombre); });
    datos = est.filter((e) => e.estado === "activo").map((e) => ({ e, grupos: (gr[e.id] || []).join(", ") }));
    return datos;
  };
  const cerrar = () => { res.hidden = true; input.setAttribute("aria-expanded", "false"); };
  const volverABuscar = () => { modo = "buscar"; pista.hidden = true; input.placeholder = "Buscar estudiante…"; };

  const cobrar = async (e) => { cerrar(); input.value = ""; volverABuscar(); (await import("./finanzas.js")).cobrarVarios(ctx, e, [], () => { ctx.datos.invalidar("estudiantes"); ctx.recargar(); }); };
  const ficha = (e) => { cerrar(); input.value = ""; volverABuscar(); ctx.ir(`#/estudiantes/${e.id}`); };
  const whatsapp = (e) => { const n = numeroWhatsApp(e.telefono || e.contacto_telefono); if (n) window.open(`https://wa.me/${n}`, "_blank", "noopener"); cerrar(); };
  const principal = (x) => (modo === "cobrar" && puedeCobrar ? cobrar(x.e) : ficha(x.e));

  const pintar = async () => {
    const txt = input.value.trim();
    if (!txt) { cerrar(); return; }
    const todos = await cargar();
    vis = todos.filter((x) => coincide(txt, nombreCompleto(x.e), x.e.telefono, x.e.contacto_telefono, x.e.codigo, x.e.documento, x.grupos)).slice(0, 8);
    activo = 0;
    res.replaceChildren(...(vis.length ? vis.map((x, i) => h("li.rapida-item" + (i === activo ? ".activo" : ""), { role: "option", "aria-selected": String(i === activo) },
      h("button.rapida-nombre", { type: "button", onmousedown: (ev) => ev.preventDefault(), onclick: () => principal(x) },
        h("strong", nombreCompleto(x.e)), h("span.tenue", [x.grupos || "Sin grupo", x.e.telefono || x.e.contacto_telefono].filter(Boolean).join(" · "))),
      h("span.rapida-acciones",
        puedeCobrar ? h("button.btn.btn-sm", { type: "button", onmousedown: (ev) => ev.preventDefault(), onclick: () => cobrar(x.e) }, "Cobrar") : null,
        h("button.btn.btn-sec.btn-sm", { type: "button", onmousedown: (ev) => ev.preventDefault(), onclick: () => ficha(x.e) }, "Ficha"),
        numeroWhatsApp(x.e.telefono || x.e.contacto_telefono) ? h("button.btn.btn-texto.btn-sm", { type: "button", "aria-label": `WhatsApp de ${nombreCompleto(x.e)}`, onmousedown: (ev) => ev.preventDefault(), onclick: () => whatsapp(x.e) }, "WhatsApp") : null)))
      : [h("li.rapida-vacio", `Nadie coincide con «${txt}».`)]));
    res.hidden = false; input.setAttribute("aria-expanded", "true");
  };
  const mover = (d) => {
    if (!vis.length) return;
    activo = (activo + d + vis.length) % vis.length;
    [...res.children].forEach((li, i) => { li.classList.toggle("activo", i === activo); li.setAttribute("aria-selected", String(i === activo)); });
  };
  let t;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(pintar, 80); });
  input.addEventListener("focus", () => { cargar(); if (input.value.trim()) pintar(); });
  input.addEventListener("blur", () => setTimeout(cerrar, 150));
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); mover(1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); mover(-1); }
    else if (ev.key === "Enter" && vis[activo] && !res.hidden) { ev.preventDefault(); principal(vis[activo]); }
    else if (ev.key === "Escape") { input.value = ""; cerrar(); volverABuscar(); }
  });
  // Los cambios en estudiantes se ven en la próxima búsqueda
  addEventListener("hashchange", () => { datos = null; });

  const botonCobrar = puedeCobrar ? h("button.btn.rapida-cobrar", { type: "button", onclick: () => {
    modo = "cobrar"; pista.hidden = false; input.placeholder = "¿Quién paga? Escribe su nombre…"; input.value = ""; input.focus(); cerrar();
  } }, "Cobrar") : null;

  const barra = h("div.a-rapida", { role: "search" }, h("div.rapida-caja", h("span.rapida-icono", { "aria-hidden": "true" }, "⌕"), pista, input, res), botonCobrar);
  barra.enfocar = (m) => { if (m === "cobrar" && botonCobrar) botonCobrar.click(); else input.focus(); };
  return barra;
}
