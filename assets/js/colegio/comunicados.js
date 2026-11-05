// Comunicados institucionales dirigidos a toda la comunidad, al personal,
// a las familias o a una sección.
import { sb, q } from "../core/sb.js";
import { h, formularioModal, confirmar, fecha } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { estructura } from "./util.js";

const AUD = { todos: "Toda la comunidad", personal: "Solo personal", tutores: "Solo familias", grupo: "Una sección" };

export async function render(el, ctx) {
  const [E, coms] = await Promise.all([estructura(ctx), q(sb.from("comunicados").select("*").eq("cuenta_id", ctx.id).order("publicado", { ascending: false }))]);
  const puede = ctx.esGestor && ctx.f("comunicados");
  const editar = (c) => formularioModal(c ? "Editar comunicado" : "Nuevo comunicado", [
    { name: "titulo", label: "Título", required: true, full: true, maxlength: 140 },
    { name: "audiencia", label: "Para", type: "select", options: Object.entries(AUD), value: "todos" },
    { name: "grupo_id", label: "Sección (si es para una sección)", type: "select", placeholder: "—", options: E.secciones.map((s) => [s.id, s.nombre]) },
    { name: "cuerpo", label: "Mensaje", type: "textarea", required: true, full: true, max: 4000 },
  ], c, async (d, cerrar) => {
    if (d.audiencia === "grupo" && !d.grupo_id) throw new Error("Elige la sección.");
    if (d.audiencia !== "grupo") d.grupo_id = null;
    if (c) await q(sb.from("comunicados").update(d).eq("id", c.id)); else await q(sb.from("comunicados").insert({ ...d, cuenta_id: ctx.id }));
    cerrar(); ctx.toast(c ? "Comunicado actualizado" : "Comunicado publicado"); ctx.recargar();
  }, { boton: c ? "Guardar" : "Publicar" });

  el.append(ctx.titulo("Comunicados", puede ? h("button.btn", { onclick: () => editar(null) }, h("span", { html: ICONOS.mas_add }), "Nuevo comunicado") : null),
    !ctx.f("comunicados") ? h("div.aviso.ojo", "Los comunicados no están incluidos en tu plan.") : null,
    coms.length ? coms.map((c) => h("article.hoja",
      h("div.hoja-titulo", h("h2", c.titulo), h("span.estado.info", c.audiencia === "grupo" ? E.seccion(c.grupo_id)?.nombre || "Sección" : AUD[c.audiencia])),
      h("p", { style: "white-space:pre-line" }, c.cuerpo),
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap" },
        h("span.tenue", `Publicado el ${fecha(c.publicado)}`),
        puede ? h("span", h("button.btn.btn-texto.btn-sm", { onclick: () => editar(c) }, "Editar"),
          h("button.btn.btn-texto.btn-sm", { onclick: async () => { if (await confirmar("Eliminar comunicado", `¿Eliminar «${c.titulo}»?`, { boton: "Eliminar", peligro: true })) { await q(sb.from("comunicados").delete().eq("id", c.id)); ctx.recargar(); } } }, "Eliminar")) : null)))
    : h("div.vacio", h("p", "Aún no hay comunicados.")));
}
