// Asignaturas (lo que enseñas) y cursos (cómo lo ofreces: duración, precio, modalidad).
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, confirmar, dinero } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";

export async function render(el, ctx) {
  const [asig, cursos, grupos] = await Promise.all([ctx.datos.asignaturas(true), ctx.datos.cursos(true), ctx.datos.grupos()]);
  const usoAsig = (id) => grupos.filter((g) => g.asignatura_id === id).length;
  const usoCurso = (id) => grupos.filter((g) => g.curso_id === id).length;

  const editarAsig = (a) => formularioModal(a ? "Editar asignatura" : "Nueva asignatura", [
    { name: "nombre", label: "Nombre", required: true, placeholder: "Ej.: Matemática, Inglés, Piano", maxlength: 100 },
    { name: "codigo", label: "Código corto", maxlength: 20 },
    { name: "descripcion", label: "Descripción", type: "textarea", full: true },
    { name: "activo", label: "Activa", type: "checkbox", value: true },
  ], a, async (d, cerrar) => {
    if (a) await q(sb.from("asignaturas").update(d).eq("id", a.id));
    else await q(sb.from("asignaturas").insert({ ...d, cuenta_id: ctx.id }));
    ctx.datos.invalidar("asignaturas", "grupos"); cerrar(); ctx.toast("Guardado"); ctx.recargar();
  });

  const editarCurso = (c) => formularioModal(c ? "Editar curso" : "Nuevo curso", [
    { name: "nombre", label: "Nombre del curso", required: true, placeholder: "Ej.: Inglés conversacional A1", maxlength: 120 },
    { name: "asignatura_id", label: "Asignatura", type: "select", placeholder: "Sin asignatura", options: asig.map((x) => [x.id, x.nombre]) },
    { name: "duracion_semanas", label: "Duración (semanas)", type: "number", min: 1, max: 520 },
    { name: "horas_totales", label: "Horas totales", type: "number", min: 1, max: 5000 },
    { name: "modalidad_clase", label: "Modalidad", type: "select", options: [["presencial", "Presencial"], ["virtual", "Virtual"], ["mixta", "Mixta"]], value: "presencial" },
    { name: "mensualidad", label: `Precio mensual (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", value: 0 },
    { name: "descripcion", label: "Descripción y organización (unidades, temas)", type: "textarea", full: true },
    { name: "requisitos", label: "Requisitos", type: "textarea", full: true },
    { name: "activo", label: "Disponible", type: "checkbox", value: true },
  ], c, async (d, cerrar) => {
    d.mensualidad = d.mensualidad ?? 0;
    if (c) await q(sb.from("cursos").update(d).eq("id", c.id));
    else await q(sb.from("cursos").insert({ ...d, cuenta_id: ctx.id }));
    ctx.datos.invalidar("cursos", "grupos"); cerrar(); ctx.toast("Guardado"); ctx.recargar();
  });

  const borrar = async (tablaNombre, x, uso) => {
    if (!(await confirmar("Eliminar", uso ? `«${x.nombre}» está asignado a ${uso} grupo(s); esos grupos quedarán sin ${tablaNombre === "cursos" ? "curso" : "asignatura"}. ¿Continuar?` : `¿Eliminar «${x.nombre}»?`, { boton: "Eliminar", peligro: true }))) return;
    try { await q(sb.from(tablaNombre).delete().eq("id", x.id)); ctx.datos.invalidar(); ctx.toast("Eliminado"); ctx.recargar(); }
    catch (e) { ctx.toast(e.message, "mal"); }
  };

  el.append(
    ctx.titulo("Asignaturas y cursos"),
    h("p.suave", "Una asignatura es lo que enseñas (Matemática). Un curso es cómo lo ofreces: duración, precio y modalidad. Puedes usar solo asignaturas si prefieres algo simple."),
    h("section.hoja",
      h("div.hoja-titulo", h("h2", "Asignaturas"), h("button.btn.btn-sm", { onclick: () => editarAsig(null) }, h("span", { html: ICONOS.mas_add }), "Nueva")),
      tabla([
        { t: "Asignatura", v: (a) => [h("strong", a.nombre), a.descripcion ? h("div.tenue", a.descripcion) : null] },
        { t: "Grupos", v: (a) => usoAsig(a.id), clase: "derecha" },
        { t: "Estado", v: (a) => h("span.estado" + (a.activo ? ".ok" : ""), a.activo ? "Activa" : "Inactiva") },
        { t: "", clase: "acciones", v: (a) => [h("button.btn.btn-texto.btn-sm", { onclick: () => editarAsig(a) }, "Editar"), h("button.btn.btn-texto.btn-sm", { onclick: () => borrar("asignaturas", a, usoAsig(a.id)) }, "Eliminar")] },
      ], asig, { vacio: "Sin asignaturas. Crea la primera, por ejemplo «Matemática»." })),
    h("section.hoja",
      h("div.hoja-titulo", h("h2", "Cursos"), h("button.btn.btn-sm", { onclick: () => editarCurso(null) }, h("span", { html: ICONOS.mas_add }), "Nuevo")),
      tabla([
        { t: "Curso", v: (c) => [h("strong", c.nombre), h("div.tenue", [asig.find((a) => a.id === c.asignatura_id)?.nombre, c.modalidad_clase].filter(Boolean).join(" · "))] },
        { t: "Duración", v: (c) => [c.duracion_semanas ? `${c.duracion_semanas} sem.` : null, c.horas_totales ? `${c.horas_totales} h` : null].filter(Boolean).join(" · ") || "—" },
        { t: "Mensualidad", v: (c) => Number(c.mensualidad) ? dinero(c.mensualidad, ctx.cuenta.moneda) : "—", clase: "derecha" },
        { t: "Grupos", v: (c) => usoCurso(c.id), clase: "derecha" },
        { t: "", clase: "acciones", v: (c) => [h("button.btn.btn-texto.btn-sm", { onclick: () => editarCurso(c) }, "Editar"), h("button.btn.btn-texto.btn-sm", { onclick: () => borrar("cursos", c, usoCurso(c.id)) }, "Eliminar")] },
      ], cursos, { vacio: "Sin cursos. Son opcionales." })),
  );
}
