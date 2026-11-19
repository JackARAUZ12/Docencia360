// Comunicados institucionales dirigidos a toda la comunidad, al personal,
// a las familias o a una sección (colegio) o grupo (academia).
// Los que son para todos o para un grupo también llegan al aula del estudiante.
import { sb, q } from "../core/sb.js";
import { h, formularioModal, confirmar, fecha } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { estructura } from "./util.js";

const AUD_COL = { todos: "Toda la comunidad", personal: "Solo personal", tutores: "Solo familias", grupo: "Una sección" };
const AUD_ACA = { todos: "Todos (estudiantes, familias e instructores)", personal: "Solo instructores y personal", tutores: "Solo familias", grupo: "Un grupo" };

export async function render(el, ctx) {
  const aca = ctx.modalidad === "academia";
  const AUD = aca ? AUD_ACA : AUD_COL;
  const [E, coms] = await Promise.all([
    aca ? ctx.datos.grupos().then((gs) => { const act = gs.filter((g) => g.estado === "activo"); return { secciones: act, seccion: (id) => gs.find((g) => g.id === id) }; }) : estructura(ctx),
    q(sb.from("comunicados").select("*").eq("cuenta_id", ctx.id).order("publicado", { ascending: false }))]);
    const puede = ctx.esGestor && ctx.f("comunicados");
  const editar = (c) => formularioModal(c ? "Editar comunicado" : "Nuevo comunicado", [
    { name: "titulo", label: "Título", required: true, full: true, maxlength: 140 },
    { name: "audiencia", label: "Para", type: "select", options: Object.entries(AUD), value: "todos" },
    { name: "grupo_id", label: aca ? "Grupo (si es para un grupo)" : "Sección (si es para una sección)", type: "select", placeholder: "—", options: E.secciones.map((s) => [s.id, s.nombre]) },
    { name: "cuerpo", label: "Mensaje", type: "textarea", required: true, full: true, max: 4000 },
  ], c, async (d, cerrar) => {
    if (d.audiencia === "grupo" && !d.grupo_id) throw new Error(`Elige ${aca ? "el grupo" : "la sección"}.`);
    if (d.audiencia !== "grupo") d.grupo_id = null;
    if (c) await q(sb.from("comunicados").update(d).eq("id", c.id)); else await q(sb.from("comunicados").insert({ ...d, cuenta_id: ctx.id }));
    cerrar(); ctx.toast(c ? "Comunicado actualizado" : "Comunicado publicado"); ctx.recargar();
  }, { boton: c ? "Guardar" : "Publicar" });

  el.append(ctx.titulo("Comunicados", puede ? h("button.btn", { onclick: () => editar(null) }, h("span", { html: ICONOS.mas_add }), "Nuevo comunicado") : null),
    !ctx.f("comunicados") ? h("section.hoja", h("p", aca ? "Envía avisos a toda la academia, a un grupo, solo a instructores o solo a familias. Los estudiantes los ven en su aula." : "Envía avisos a toda la comunidad, a una sección, al personal o a las familias."),
      h("p.suave", aca ? "Disponible en los planes Profesional y Empresarial." : "No incluido en tu plan."), ctx.mejora("Comunicados")) : null,
    aca && puede ? h("p.suave", "Los comunicados para todos o para un grupo aparecen en el aula de los estudiantes y en el portal de familias.") : null,
    coms.length ? coms.map((c) => h("article.hoja",
      h("div.hoja-titulo", h("h2", c.titulo), h("span.estado.info", c.audiencia === "grupo" ? E.seccion(c.grupo_id)?.nombre || (aca ? "Grupo" : "Sección") : AUD[c.audiencia])),
      h("p", { style: "white-space:pre-line" }, c.cuerpo),
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap" },
        h("span.tenue", `Publicado el ${fecha(c.publicado)}`),
        puede ? h("span", h("button.btn.btn-texto.btn-sm", { onclick: () => editar(c) }, "Editar"),
          h("button.btn.btn-texto.btn-sm", { onclick: async () => { if (await confirmar("Eliminar comunicado", `¿Eliminar «${c.titulo}»?`, { boton: "Eliminar", peligro: true })) { await q(sb.from("comunicados").delete().eq("id", c.id)); ctx.recargar(); } } }, "Eliminar")) : null)))
    : ctx.f("comunicados") ? h("div.vacio", h("p", "Aún no hay comunicados.")) : null);
}
