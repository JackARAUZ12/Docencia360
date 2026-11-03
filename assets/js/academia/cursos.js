// Cursos y programas de la academia: oferta, precios, modalidad,
// duración, requisitos y certificación. La matrícula toma estos precios.
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, confirmar, dinero } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";

const MOD = { presencial: "Presencial", virtual: "Virtual", mixta: "Mixta" };

export async function render(el, ctx) {
  const [cursos, asig, grupos, mats] = await Promise.all([
    ctx.datos.cursos(true), ctx.datos.asignaturas(true), ctx.datos.grupos(),
    q(sb.from("matriculas").select("curso_id").eq("cuenta_id", ctx.id).eq("estado", "activa")),
  ]);
  const activos = {}; mats.forEach((m) => (activos[m.curso_id] = (activos[m.curso_id] || 0) + 1));
  const gruposDe = (id) => grupos.filter((g) => g.curso_id === id && ["activo", "planificado"].includes(g.estado));
  const M = (n) => dinero(n, ctx.cuenta.moneda);

  const editar = (c) => formularioModal(c ? "Editar curso" : "Nuevo curso", [
    { name: "nombre", label: "Nombre del curso", required: true, full: true, maxlength: 120, placeholder: "Ej.: Inglés General — Nivel 1" },
    { name: "asignatura_id", label: "Área o programa", type: "select", placeholder: "Sin área", options: asig.map((a) => [a.id, a.nombre]),
      help: "Agrupa cursos de un mismo programa (Inglés, Música, Ofimática…)." },
    { name: "modalidad_clase", label: "Modalidad", type: "select", options: Object.entries(MOD), value: "presencial" },
    { name: "duracion_semanas", label: "Duración (semanas)", type: "number", min: 1, max: 520 },
    { name: "horas_totales", label: "Horas totales", type: "number", min: 1, max: 5000 },
    { name: "precio_matricula", label: `Matrícula (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", value: 0 },
    { name: "mensualidad", label: `Mensualidad (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", value: 0 },
    { name: "descripcion", label: "Descripción y contenido", type: "textarea", full: true },
    { name: "requisitos", label: "Requisitos", type: "textarea", full: true, placeholder: "Ej.: Edad mínima 12 años; prueba de ubicación" },
    { name: "certifica", label: "Entrega certificado al completarlo", type: "checkbox" },
    { name: "activo", label: "Disponible para matrícula", type: "checkbox", value: true },
  ], c, async (d, cerrar) => {
    d.precio_matricula = d.precio_matricula ?? 0; d.mensualidad = d.mensualidad ?? 0;
    if (c) await q(sb.from("cursos").update(d).eq("id", c.id));
    else await q(sb.from("cursos").insert({ ...d, cuenta_id: ctx.id }));
    ctx.datos.invalidar("cursos", "grupos"); cerrar(); ctx.toast("Curso guardado"); ctx.recargar();
  });

  const editarArea = (a) => formularioModal(a ? "Editar área" : "Nueva área o programa", [
    { name: "nombre", label: "Nombre", required: true, full: true, placeholder: "Ej.: Inglés, Música, Computación" },
    { name: "descripcion", label: "Descripción", type: "textarea", full: true },
    { name: "activo", label: "Activa", type: "checkbox", value: true },
  ], a, async (d, cerrar) => {
    if (a) await q(sb.from("asignaturas").update(d).eq("id", a.id)); else await q(sb.from("asignaturas").insert({ ...d, cuenta_id: ctx.id }));
    ctx.datos.invalidar("asignaturas"); cerrar(); ctx.toast("Guardado"); ctx.recargar();
  });

  const porArea = [...asig.map((a) => [a, cursos.filter((c) => c.asignatura_id === a.id)]), [null, cursos.filter((c) => !c.asignatura_id)]].filter(([, cs]) => cs.length);

  el.append(
    ctx.titulo("Cursos y programas",
      h("button.btn.btn-sec", { onclick: () => editarArea(null) }, "Nueva área"),
      h("button.btn", { onclick: () => editar(null) }, h("span", { html: ICONOS.mas_add }), "Nuevo curso")),
    cursos.length ? null : h("div.vacio", h("h3", "Crea tu oferta"), h("p", "Registra cada curso con su precio y duración. Luego abre grupos y matricula estudiantes."), h("button.btn", { onclick: () => editar(null) }, "Crear el primer curso")),
    porArea.map(([area, cs]) => h("section.hoja",
      h("div.hoja-titulo", h("h2", area ? area.nombre : "Sin área"), area ? h("button.btn.btn-texto.btn-sm", { onclick: () => editarArea(area) }, "Editar área") : null),
      tabla([
        { t: "Curso", v: (c) => [h("strong", c.nombre), h("div.tenue", [MOD[c.modalidad_clase], c.duracion_semanas ? `${c.duracion_semanas} semanas` : null, c.horas_totales ? `${c.horas_totales} h` : null, c.certifica ? "con certificado" : null].filter(Boolean).join(" · "))] },
        { t: "Matrícula", v: (c) => Number(c.precio_matricula) ? M(c.precio_matricula) : "—", clase: "derecha" },
        { t: "Mensualidad", v: (c) => Number(c.mensualidad) ? M(c.mensualidad) : "—", clase: "derecha" },
        { t: "Grupos abiertos", v: (c) => gruposDe(c.id).length, clase: "derecha" },
        { t: "Activos", v: (c) => activos[c.id] || 0, clase: "derecha" },
        { t: "", v: (c) => h("span.estado" + (c.activo ? ".ok" : ""), c.activo ? "Abierto" : "Cerrado") },
        { t: "", clase: "acciones", v: (c) => [
          h("button.btn.btn-texto.btn-sm", { onclick: () => editar(c) }, "Editar"),
          h("button.btn.btn-texto.btn-sm", { onclick: async () => {
            const msg = activos[c.id] ? `«${c.nombre}» tiene ${activos[c.id]} matrícula(s) activa(s). Mejor ciérralo (desmarca «Disponible»). ¿Eliminar de todas formas?` : `¿Eliminar «${c.nombre}»?`;
            if (!(await confirmar("Eliminar curso", msg, { boton: "Eliminar", peligro: true }))) return;
            try { await q(sb.from("cursos").delete().eq("id", c.id)); ctx.datos.invalidar(); ctx.toast("Curso eliminado"); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
          } }, "Eliminar")] },
      ], cs))),
  );
}
