// Estructura académica: niveles, grados (con aranceles), secciones, aulas,
// plan de estudios por grado y asignación de docentes por sección y asignatura.
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, confirmar, dinero } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { estructura, invalidarEstructura, selector } from "./util.js";

const TURNOS = [["matutino", "Matutino"], ["vespertino", "Vespertino"], ["nocturno", "Nocturno"], ["sabatino", "Sabatino"], ["dominical", "Dominical"]];

export async function render(el, ctx, { params }) {
  const E = await estructura(ctx, true);
  const ocup = await q(sb.from("grupo_estudiantes").select("grupo_id").eq("cuenta_id", ctx.id).eq("estado", "activo"));
  const n = {}; ocup.forEach((x) => (n[x.grupo_id] = (n[x.grupo_id] || 0) + 1));
  let vista = params.get("vista") || "grados";
  const M = (v) => dinero(v, ctx.cuenta.moneda);
  const guardar = async (tablaN, fila, datos, cerrar, msg = "Guardado") => {
    if (fila) await q(sb.from(tablaN).update(datos).eq("id", fila.id)); else await q(sb.from(tablaN).insert({ ...datos, cuenta_id: ctx.id }));
    invalidarEstructura(ctx); cerrar(); ctx.toast(msg); ctx.recargar();
  };
  const borrar = async (tablaN, fila, texto) => {
    if (!(await confirmar("Eliminar", texto, { boton: "Eliminar", peligro: true }))) return;
    try { await q(sb.from(tablaN).delete().eq("id", fila.id)); invalidarEstructura(ctx); ctx.toast("Eliminado"); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
  };

  // ---------- Formularios ----------
  const fNivel = (x) => formularioModal(x ? "Editar nivel" : "Nuevo nivel", [
    { name: "nombre", label: "Nombre", required: true, placeholder: "Ej.: Preescolar, Primaria, Secundaria", full: true },
    { name: "orden", label: "Orden", type: "number", min: 1, value: E.niveles.length + 1 },
  ], x, (d, c) => guardar("niveles", x, d, c));
  const fGrado = (x) => formularioModal(x ? "Editar grado" : "Nuevo grado", [
    { name: "nombre", label: "Nombre", required: true, placeholder: "Ej.: 7mo grado" },
    { name: "nivel_id", label: "Nivel", type: "select", placeholder: "Sin nivel", options: E.niveles.map((v) => [v.id, v.nombre]) },
    { name: "orden", label: "Orden", type: "number", min: 1, value: E.grados.length + 1 },
    { type: "seccion", label: "Aranceles (se usan al matricular)" },
    { name: "matricula", label: `Matrícula anual (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", value: 0 },
    { name: "colegiatura", label: `Colegiatura mensual (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", value: 0 },
  ], x, (d, c) => guardar("grados", x, { ...d, matricula: d.matricula ?? 0, colegiatura: d.colegiatura ?? 0 }, c));
  const fSeccion = (x, gradoId) => formularioModal(x ? "Editar sección" : "Nueva sección", [
    { name: "nombre", label: "Nombre", required: true, placeholder: "Ej.: 7mo A" },
    { name: "grado_id", label: "Grado", type: "select", required: true, options: E.grados.map((g) => [g.id, g.nombre]), value: gradoId },
    { name: "turno", label: "Turno", type: "select", options: TURNOS, value: "matutino" },
    { name: "cupo", label: "Cupo", type: "number", min: 1, max: 200, value: 30 },
    { name: "aula_id", label: "Aula", type: "select", placeholder: "Sin aula fija", options: E.aulas.map((a) => [a.id, a.nombre]) },
    E.sedes.length ? { name: "sede_id", label: "Sede", type: "select", placeholder: "Sin sede", options: E.sedes.map((s) => [s.id, s.nombre]) } : null,
    { name: "estado", label: "Estado", type: "select", options: [["activo", "Activa"], ["planificado", "Planificada"], ["finalizado", "Finalizada"]], value: "activo" },
  ].filter(Boolean), x, (d, c) => guardar("grupos", x, d, c));
  const fAula = (x) => formularioModal(x ? "Editar aula" : "Nueva aula", [
    { name: "nombre", label: "Nombre", required: true, placeholder: "Ej.: Aula 101, Laboratorio" },
    { name: "capacidad", label: "Capacidad", type: "number", min: 1 },
  ], x, (d, c) => guardar("aulas", x, d, c));
  const fAsig = (x, gradoId) => formularioModal(x ? "Editar asignatura" : "Agregar asignatura al plan", [
    { name: "nombre", label: "Asignatura", required: true, placeholder: "Ej.: Matemática", full: true },
    { name: "grado_id", label: "Grado", type: "select", required: true, options: E.grados.map((g) => [g.id, g.nombre]), value: gradoId },
    { name: "codigo", label: "Código" },
    { name: "activo", label: "Activa", type: "checkbox", value: true },
  ], x, (d, c) => guardar("asignaturas", x, d, c));

  const segs = h("div.segmentos", { role: "group" }, [["grados", "Grados y secciones"], ["plan", "Plan de estudios"], ["docentes", "Asignación de docentes"], ["aulas", "Aulas"]].map(([v, t]) =>
    h("button", { type: "button", "aria-pressed": String(v === vista), onclick: () => { vista = v; history.replaceState(null, "", `#/estructura?vista=${v}`); ctx.recargar(); } }, t)));
  el.append(ctx.titulo("Grados y secciones"), h("div", { style: "margin-bottom:1rem" }, segs));

  if (vista === "grados") {
    el.append(
      h("div", { style: "display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem" },
        h("button.btn.btn-sec", { onclick: () => fNivel(null) }, "Nuevo nivel"),
        h("button.btn.btn-sec", { onclick: () => fGrado(null) }, "Nuevo grado"),
        h("button.btn", { onclick: () => fSeccion(null), disabled: !E.grados.length }, h("span", { html: ICONOS.mas_add }), "Nueva sección")),
      !E.grados.length ? h("div.vacio", h("h3", "Arma la estructura de tu colegio"), h("p", "1) Crea niveles (Primaria, Secundaria). 2) Crea grados con su matrícula y colegiatura. 3) Abre las secciones de cada grado.")) : null,
      [...E.niveles, null].map((nv) => {
        const grs = E.grados.filter((g) => (nv ? g.nivel_id === nv.id : !g.nivel_id));
        if (!grs.length && !nv) return null;
        return h("section.hoja",
          h("div.hoja-titulo", h("h2", nv ? nv.nombre : "Sin nivel"),
            nv ? h("span", h("button.btn.btn-texto.btn-sm", { onclick: () => fNivel(nv) }, "Editar"), h("button.btn.btn-texto.btn-sm", { onclick: () => borrar("niveles", nv, `¿Eliminar el nivel ${nv.nombre}? Los grados quedarán sin nivel.`) }, "Eliminar")) : null),
          grs.length ? tabla([
            { t: "Grado", v: (g) => h("strong", g.nombre) },
            { t: "Secciones", v: (g) => E.secciones.filter((s) => s.grado_id === g.id).map((s) => h("span.estado" + (s.estado === "activo" ? ".info" : ""), { style: "margin:0 .25rem .25rem 0;cursor:pointer", onclick: () => fSeccion(s) },
              `${s.nombre} · ${n[s.id] || 0}${s.cupo ? "/" + s.cupo : ""}`)) },
            { t: "Matrícula", v: (g) => M(g.matricula), clase: "derecha" },
            { t: "Colegiatura", v: (g) => M(g.colegiatura), clase: "derecha" },
            { t: "Asignaturas", v: (g) => E.planDe(g.id).length, clase: "derecha" },
            { t: "", clase: "acciones", v: (g) => [h("button.btn.btn-texto.btn-sm", { onclick: () => fSeccion(null, g.id) }, "+ Sección"), h("button.btn.btn-texto.btn-sm", { onclick: () => fGrado(g) }, "Editar"),
              h("button.btn.btn-texto.btn-sm", { onclick: () => borrar("grados", g, `¿Eliminar ${g.nombre}?`) }, "Eliminar")] },
          ], grs) : h("p.suave", "Sin grados en este nivel."));
      }),
      h("p.tenue", "Toca una sección para editarla (turno, cupo, aula y sede)."));
  }

  if (vista === "plan") {
    let gradoSel = params.get("grado") || E.grados[0]?.id;
    if (!E.grados.length) { el.append(h("div.vacio", "Crea primero los grados.")); return; }
    const g = E.grado(gradoSel) || E.grados[0];
    const plan = E.asignaturas.filter((a) => a.grado_id === g.id);
    el.append(
      h("div", { style: "display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center" },
        selector(E.grados.map((x) => [x.id, x.nombre]), g.id, (v) => { history.replaceState(null, "", `#/estructura?vista=plan&grado=${v}`); ctx.recargar(); }, "Grado"),
        h("button.btn", { onclick: () => fAsig(null, g.id) }, h("span", { html: ICONOS.mas_add }), "Agregar asignatura"),
        plan.length === 0 && E.grados.some((x) => E.planDe(x.id).length) ? h("button.btn.btn-sec", { onclick: async () => {
          const origen = E.grados.find((x) => E.planDe(x.id).length);
          await q(sb.from("asignaturas").insert(E.planDe(origen.id).map((a) => ({ cuenta_id: ctx.id, grado_id: g.id, nombre: a.nombre }))));
          invalidarEstructura(ctx); ctx.toast(`Plan copiado de ${origen.nombre}`); ctx.recargar();
        } }, "Copiar plan de otro grado") : null),
      h("section.hoja", h("h2", `Plan de estudios · ${g.nombre}`),
        tabla([
          { t: "Asignatura", v: (a) => [h("strong", a.nombre), a.codigo ? h("div.tenue", a.codigo) : null] },
          { t: "Docentes asignados", v: (a) => [...new Set(E.asignaciones.filter((x) => x.asignatura_id === a.id).map((x) => E.docente(x.miembro_id)?.nombre))].join(", ") || h("span.estado.ojo", "Sin asignar") },
          { t: "", v: (a) => h("span.estado" + (a.activo ? ".ok" : ""), a.activo ? "Activa" : "Inactiva") },
          { t: "", clase: "acciones", v: (a) => [h("button.btn.btn-texto.btn-sm", { onclick: () => fAsig(a) }, "Editar"), h("button.btn.btn-texto.btn-sm", { onclick: () => borrar("asignaturas", a, `¿Eliminar ${a.nombre} de ${g.nombre}? Se pierde el vínculo de sus evaluaciones.`) }, "Eliminar")] },
        ], plan, { vacio: "Este grado aún no tiene asignaturas." })));
  }

  if (vista === "docentes") {
    if (!E.secciones.length) { el.append(h("div.vacio", "Crea primero las secciones.")); return; }
    let secSel = params.get("seccion") || E.secciones[0].id;
    const s = E.seccion(secSel) || E.secciones[0];
    const plan = E.planDe(s.grado_id);
    const docentesAct = E.docentes.filter((d) => d.activo);
    const asignar = async (asigId, miembroId, guia) => {
      try {
        await q(sb.from("grupo_docentes").delete().eq("grupo_id", s.id).eq("asignatura_id", asigId));
        if (miembroId) await q(sb.from("grupo_docentes").insert({ cuenta_id: ctx.id, grupo_id: s.id, miembro_id: miembroId, asignatura_id: asigId, es_guia: !!guia }));
        invalidarEstructura(ctx); ctx.toast("Asignación guardada");
      } catch (e) { ctx.toast(e.message, "mal"); }
    };
    const guiaActual = E.guiaDe(s.id)?.miembro_id;
    el.append(
      h("div", { style: "display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center" },
        selector(E.secciones.map((x) => [x.id, x.nombre]), s.id, (v) => { history.replaceState(null, "", `#/estructura?vista=docentes&seccion=${v}`); ctx.recargar(); }, "Sección"),
        h("span.tenue", `${E.grado(s.grado_id)?.nombre || ""} · ${n[s.id] || 0} estudiantes`)),
      !docentesAct.length ? h("div.aviso.ojo", "Registra docentes en «Docentes» para asignarlos.") : null,
      h("section.hoja", h("h2", `Docentes de ${s.nombre}`),
        plan.length ? h("div.tabla-envoltura", h("table.registro.matriz",
          h("thead", h("tr", h("th", "Asignatura"), h("th", "Docente"), h("th", "Maestro guía"))),
          h("tbody", plan.map((a) => {
            const actual = E.docenteDe(s.id, a.id);
            const sel = h("select", { "aria-label": `Docente de ${a.nombre}`, onchange: (ev) => asignar(a.id, ev.target.value, actual?.es_guia) },
              h("option", { value: "" }, "Sin asignar"), docentesAct.map((d) => h("option", { value: d.id, selected: actual?.miembro_id === d.id }, d.nombre + (d.especialidad ? ` · ${d.especialidad}` : ""))));
            return h("tr", h("td", h("strong", a.nombre)), h("td", sel),
              h("td", h("input", { type: "radio", name: "guia", checked: !!actual?.es_guia, disabled: !actual, "aria-label": "Maestro guía", onchange: async () => {
                try {
                  await q(sb.from("grupo_docentes").update({ es_guia: false }).eq("grupo_id", s.id));
                  await q(sb.from("grupo_docentes").update({ es_guia: true }).eq("grupo_id", s.id).eq("asignatura_id", a.id));
                  invalidarEstructura(ctx); ctx.toast("Maestro guía actualizado");
                } catch (e) { ctx.toast(e.message, "mal"); }
              } })));
          })))) : h("p.suave", "El grado de esta sección no tiene plan de estudios."),
        h("p.tenue", { style: "margin-top:.75rem" }, "Cada docente solo podrá calificar la asignatura que tiene asignada en esta sección. El maestro guía escribe la conducta y el comentario del boletín.",
          guiaActual ? ` Guía actual: ${E.docente(guiaActual)?.nombre}.` : "")));
  }

  if (vista === "aulas") {
    el.append(h("div", { style: "margin-bottom:1rem" }, h("button.btn", { onclick: () => fAula(null) }, h("span", { html: ICONOS.mas_add }), "Nueva aula")),
      h("section.hoja", tabla([
        { t: "Aula", v: (a) => h("strong", a.nombre) },
        { t: "Capacidad", v: (a) => a.capacidad || "—", clase: "derecha" },
        { t: "Sección fija", v: (a) => E.secciones.filter((s) => s.aula_id === a.id).map((s) => s.nombre).join(", ") || "—" },
        { t: "", clase: "acciones", v: (a) => [h("button.btn.btn-texto.btn-sm", { onclick: () => fAula(a) }, "Editar"), h("button.btn.btn-texto.btn-sm", { onclick: () => borrar("aulas", a, `¿Eliminar ${a.nombre}?`) }, "Eliminar")] },
      ], E.aulas, { vacio: "Sin aulas registradas." })));
  }
}
