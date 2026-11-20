// Banco de preguntas (Premium): preguntas guardadas por tema para reusarlas
// en cualquier examen o tarea en línea. Se llenan a mano o con «Guardar en
// el banco» desde un examen; se usan con «Agregar del banco».
import { sb, q } from "../core/sb.js";
import { h, modal, confirmar, toast, coincide } from "../core/ui.js";
import { editarPregunta, TIPO_P } from "./enlinea.js";

const resumen = (p) => p.tipo === "opcion" ? `Correcta: ${p.opciones[p.correcta]}` : p.tipo === "vf" ? `Correcta: ${p.correcta ? "Verdadero" : "Falso"}`
  : p.tipo === "corta" ? `Se acepta: ${p.correcta.join(" · ")}` : "La revisas tú";

async function cargar(ctx) {
  return q(sb.from("banco_preguntas").select("*").eq("cuenta_id", ctx.id).order("tema").order("creado", { ascending: false }));
}

export async function render(el, ctx, { params }) {
  el.append(h("p", h("a", { href: "#/enlinea" }, "← Exámenes en línea")));
  if (!ctx.f("banco_preguntas")) {
    el.append(ctx.titulo("Banco de preguntas"), h("section.hoja",
      h("p", "Guarda tus preguntas por tema y arma exámenes nuevos en segundos, sin volver a escribirlas."),
      h("p.suave", "Disponible en el plan Premium."), ctx.mejora("Banco de preguntas")));
    return;
  }
  const todas = await cargar(ctx);
  const temas = [...new Set(todas.map((p) => p.tema))];
  let tema = params.get("tema") || "", texto = "";
  const lista = h("div");
  const filtros = h("div.chips", [["", `Todas (${todas.length})`], ...temas.map((t) => [t, `${t} (${todas.filter((p) => p.tema === t).length})`])].map(([v, t]) =>
    h("button.chip", { type: "button", "aria-pressed": String(v === tema), onclick: (e) => { tema = v; filtros.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); pintar(); } }, t)));
  el.append(
    ctx.titulo("Banco de preguntas", h("button.btn", { onclick: () => editarPregunta(ctx, null, null, 0, ctx.recargar, { banco: true }) }, "Nueva pregunta")),
    h("p.suave", "Para llenarlo rápido: abre un examen que ya tengas y toca «Guardar en el banco». Para usarlo: en un examen, «Agregar del banco»."),
    todas.length ? [filtros, h("input", { type: "search", placeholder: "Buscar en las preguntas", style: "max-width:360px;margin:.5rem 0 1rem", "aria-label": "Buscar", oninput: (e) => { texto = e.target.value; pintar(); } })] : null,
    lista);
  function pintar() {
    const vis = todas.filter((p) => (!tema || p.tema === tema) && coincide(texto, p.enunciado, p.tema));
    lista.replaceChildren(vis.length ? h("section.hoja", h("ol.lista-preguntas", vis.map((p) => h("li",
      h("div.crece",
        h("div.tenue", `${p.tema} · ${TIPO_P[p.tipo]} · ${Number(p.puntos)} punto(s)${p.usada ? ` · usada ${p.usada} vez/veces` : ""}`),
        h("div.enunciado", p.enunciado),
        p.tipo === "opcion" ? h("ol.ops", p.opciones.map((o, k) => h("li" + (k === Number(p.correcta) ? ".correcta" : ""), o))) : null,
        h("div.tenue.correcta-txt", resumen(p))),
      h("div.acciones-preg",
        h("button.btn.btn-texto.btn-sm", { onclick: () => editarPregunta(ctx, null, p, 0, ctx.recargar, { banco: true }) }, "Editar"),
        h("button.btn.btn-texto.btn-sm", { onclick: async () => {
          if (!(await confirmar("Quitar del banco", "Los exámenes que ya la usan no cambian.", { boton: "Quitar", peligro: true }))) return;
          try { await q(sb.from("banco_preguntas").delete().eq("id", p.id)); ctx.recargar(); } catch (e) { toast(e.message, "mal"); }
        } }, "Quitar")))))) :
      h("div.vacio", h("p", todas.length ? "Ninguna pregunta coincide." : "Tu banco está vacío."),
        !todas.length ? h("p.suave", "Guarda las preguntas de un examen con «Guardar en el banco» o crea una con «Nueva pregunta».") : null));
  }
  pintar();
}

/** Elegir preguntas del banco para agregarlas a una actividad. */
export async function elegirDelBanco(ctx, act, alTerminar) {
  const todas = await cargar(ctx);
  if (!todas.length) { toast("Tu banco está vacío. Guarda primero las preguntas de algún examen.", "mal"); return; }
  const temas = [...new Set(todas.map((p) => p.tema))];
  const elegidas = new Set();
  let tema = "";
  const cuenta = h("strong");
  const lista = h("ul.lista.banco-elegir");
  const pintar = () => {
    lista.replaceChildren(...todas.filter((p) => !tema || p.tema === tema).map((p) => h("li",
      h("label", { style: "display:flex;gap:.6rem;align-items:flex-start;cursor:pointer;width:100%" },
        h("input", { type: "checkbox", checked: elegidas.has(p.id), style: "width:20px;height:20px;flex:none;margin-top:.2rem",
          onchange: (e) => { e.target.checked ? elegidas.add(p.id) : elegidas.delete(p.id); cuenta.textContent = `${elegidas.size} elegida(s)`; } }),
        h("span", h("span.tenue", `${p.tema} · ${TIPO_P[p.tipo]} · ${Number(p.puntos)} pt`), h("br"), p.enunciado)))));
  };
  const sel = h("select", { "aria-label": "Tema", onchange: (e) => { tema = e.target.value; pintar(); } }, h("option", { value: "" }, "Todos los temas"), temas.map((t) => h("option", { value: t }, t)));
  cuenta.textContent = "0 elegida(s)";
  pintar();
  const m = modal("Agregar del banco", h("div", sel, h("p", cuenta), lista), [
    { texto: "Cancelar", clase: "btn-sec" },
    { texto: "Agregar al examen", onclick: async (cerrar) => {
      if (!elegidas.size) { toast("Elige al menos una pregunta.", "mal"); return false; }
      try {
        const ids = todas.filter((p) => elegidas.has(p.id)).map((p) => p.id);
        const n = await q(sb.rpc("d360_banco_a_actividad", { p_actividad: act.id, p_ids: ids }));
        cerrar(); toast(`${n} pregunta(s) agregadas`); alTerminar?.();
      } catch (e) { toast(e.message, "mal"); }
      return false;
    } },
  ]);
  m.el.classList.add("ancho");
}
