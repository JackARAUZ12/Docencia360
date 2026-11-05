// Grupos: integrantes, asignatura/curso y horario semanal.
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, confirmar, modal, fecha, hora, DIAS, nombreCompleto } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { CAMPOS_ESTUDIANTE } from "./estudiantes.js";

const ESTADO = { planificado: "info", activo: "ok", finalizado: "", cancelado: "mal" };

async function editarGrupo(ctx, g) {
  const [asig, cursos] = await Promise.all([ctx.datos.asignaturas(), ctx.datos.cursos()]);
  formularioModal(g ? "Editar grupo" : "Nuevo grupo", [
    { name: "nombre", label: "Nombre del grupo", required: true, placeholder: "Ej.: Matemática 9no — sábados", maxlength: 100, full: true },
    { name: "asignatura_id", label: "Asignatura", type: "select", placeholder: asig.length ? "Sin asignatura" : "Aún no tienes asignaturas", options: asig.filter((a) => a.activo).map((a) => [a.id, a.nombre]) },
    !g && ctx.modalidad === "profesor" ? { name: "asignatura_nueva", label: "…o escribe una asignatura nueva", placeholder: "Ej.: Matemática", maxlength: 100, help: "Opcional. Se crea al guardar." } : null,
    { name: "curso_id", label: "Curso", type: "select", placeholder: "Sin curso", options: cursos.filter((c) => c.activo).map((c) => [c.id, c.nombre]) },
    { name: "cupo", label: "Cupo máximo", type: "number", min: 1, max: 1000 },
    { name: "estado", label: "Estado", type: "select", options: [["activo", "Activo"], ["planificado", "Planificado"], ["finalizado", "Finalizado"], ["cancelado", "Cancelado"]], value: "activo" },
    { name: "fecha_inicio", label: "Inicia", type: "date" },
    { name: "fecha_fin", label: "Termina", type: "date" },
  ].filter(Boolean), g, async (d, cerrar) => {
    if (d.fecha_inicio && d.fecha_fin && d.fecha_fin < d.fecha_inicio) throw new Error("La fecha de fin no puede ser anterior al inicio.");
    const nueva = (d.asignatura_nueva || "").trim(); delete d.asignatura_nueva;
    if (nueva) {
      const existe = asig.find((a) => a.nombre.toLowerCase() === nueva.toLowerCase());
      d.asignatura_id = existe ? existe.id : (await q(sb.from("asignaturas").insert({ cuenta_id: ctx.id, nombre: nueva }).select("id").single())).id;
      ctx.datos.invalidar("asignaturas");
    }
    let id = g?.id;
    if (g) await q(sb.from("grupos").update(d).eq("id", g.id));
    else id = (await q(sb.from("grupos").insert({ ...d, cuenta_id: ctx.id }).select("id").single())).id;
    ctx.datos.invalidar("grupos"); cerrar(); ctx.toast("Grupo guardado");
    if (!g) ctx.ir(`#/grupos/${id}`); else ctx.recargar();
  });
}

export async function render(el, ctx, { partes, params }) {
  if (partes[0]) return detalle(el, ctx, partes[0]);
  if (params?.get("nuevo") === "1" && ctx.esGestor) { history.replaceState(null, "", "#/grupos"); setTimeout(() => editarGrupo(ctx, null), 50); }
  const academia = ctx.modalidad !== "profesor";
  const [grupos, conteos, horarios, docentes] = await Promise.all([
    ctx.gruposVisibles(true),
    q(sb.from("grupo_estudiantes").select("grupo_id").eq("cuenta_id", ctx.id).eq("estado", "activo")),
    q(sb.from("horarios").select("grupo_id,dia,hora_inicio,hora_fin").eq("cuenta_id", ctx.id).order("dia").order("hora_inicio")),
    academia ? q(sb.from("grupo_docentes").select("grupo_id, miembros(nombre)").eq("cuenta_id", ctx.id)) : [],
  ]);
  const inst = {}; docentes.forEach((d) => (inst[d.grupo_id] ||= []).push(d.miembros?.nombre));
  const n = {}; conteos.forEach((c) => (n[c.grupo_id] = (n[c.grupo_id] || 0) + 1));
  const hor = {}; horarios.forEach((x) => (hor[x.grupo_id] ||= []).push(`${DIAS[x.dia].slice(0, 3)} ${hora(x.hora_inicio)}`));

  el.append(
    ctx.titulo(ctx.esDocente ? "Mis grupos" : "Grupos y horarios", ctx.esGestor ? h("button.btn", { onclick: () => editarGrupo(ctx, null) }, h("span", { html: ICONOS.mas_add }), "Nuevo grupo") : null),
    h("div.hoja", tabla([
      { t: "Grupo", v: (g) => [h("a.fila-enlace", { href: `#/grupos/${g.id}` }, g.nombre), h("div.tenue", g.asignaturas?.nombre || g.cursos?.nombre || "")] },
      academia ? { t: "Instructor", v: (g) => (inst[g.id] || []).join(", ") || h("span.estado.ojo", "Sin asignar") } : null,
      { t: "Horario", v: (g) => (hor[g.id] || []).join(", ") || h("span.tenue", "Sin horario") },
      { t: "Estudiantes", v: (g) => `${n[g.id] || 0}${g.cupo ? ` / ${g.cupo}` : ""}`, clase: "derecha" },
      { t: "Estado", v: (g) => h("span.estado." + (ESTADO[g.estado] || "x"), g.estado) },
    ].filter(Boolean), grupos, { vacio: "Aún no tienes grupos. Un grupo reúne a los estudiantes que reciben una misma clase." })),
  );
}

async function detalle(el, ctx, id) {
  const academia = ctx.modalidad !== "profesor";
  const [g, miembros, horarios, todos, asignados] = await Promise.all([
    q(sb.from("grupos").select("*, asignaturas(nombre), cursos(nombre)").eq("id", id).maybeSingle()),
    q(sb.from("grupo_estudiantes").select("*, estudiantes(id,nombres,apellidos,telefono,estado)").eq("grupo_id", id).order("estado")),
    q(sb.from("horarios").select("*").eq("grupo_id", id).order("dia").order("hora_inicio")),
    ctx.datos.estudiantes(),
    q(sb.from("grupo_docentes").select("miembro_id, miembros(nombre)").eq("grupo_id", id)),
  ]);
  if (!g) { el.append(h("div.aviso.mal", "Grupo no encontrado.")); return; }
  const activos = miembros.filter((m) => m.estado === "activo");

  const agregarHorario = () => formularioModal("Agregar horario", [
    { name: "dia", label: "Día", type: "select", required: true, options: DIAS.slice(1).map((d, i) => [i + 1, d]) },
    { name: "hora_inicio", label: "Desde", type: "time", required: true },
    { name: "hora_fin", label: "Hasta", type: "time", required: true },
    academia ? { name: "miembro_id", label: "Instructor", type: "select", placeholder: "Sin instructor", options: asignados.map((a) => [a.miembro_id, a.miembros?.nombre]),
      value: asignados[0]?.miembro_id, help: "Docencia360 avisa si el instructor ya tiene clase a esa hora." } : null,
  ].filter(Boolean), {}, async (d, cerrar) => {
    if (d.hora_fin <= d.hora_inicio) throw new Error("La hora de fin debe ser posterior al inicio.");
    const miembro = academia ? d.miembro_id : ctx.cuenta.miembro_id;
    await q(sb.from("horarios").insert({ dia: Number(d.dia), hora_inicio: d.hora_inicio, hora_fin: d.hora_fin, grupo_id: id, cuenta_id: ctx.id, miembro_id: miembro || null }));
    cerrar(); ctx.toast("Horario agregado"); ctx.recargar();
  }, { boton: "Agregar" });

  const ya = new Set(activos.map((m) => m.estudiante_id));
  const libres = todos.filter((e) => e.estado === "activo" && !ya.has(e.id));
  // Registrar un estudiante nuevo y dejarlo en este grupo
  const nuevoEnGrupo = () => formularioModal("Nuevo estudiante en " + g.nombre, CAMPOS_ESTUDIANTE.filter((c) => c.name !== "estado"), null, async (d, cerrar) => {
    const est = await q(sb.from("estudiantes").insert({ ...d, cuenta_id: ctx.id }).select("id").single());
    await q(sb.from("grupo_estudiantes").insert({ grupo_id: id, estudiante_id: est.id, cuenta_id: ctx.id, estado: "activo" }));
    ctx.datos.invalidar("estudiantes"); cerrar(); ctx.toast("Estudiante registrado en el grupo"); ctx.recargar();
  }, { boton: "Guardar y agregar" });
  const importarEnGrupo = async () => (await import("./importar.js")).abrirImportacion(ctx, ctx.recargar, { grupo: id });
  const opcionesAgregar = () => {
    const m = modal("Agregar estudiantes", h("div",
      h("p.suave", "¿Cómo quieres agregarlos?"),
      h("div", { style: "display:grid;gap:.6rem" },
        libres.length ? h("button.btn.btn-sec", { type: "button", onclick: () => { m.cerrar(); agregarEstudiantes(); } }, `Elegir de mis estudiantes (${libres.length} disponibles)`) : null,
        h("button.btn.btn-sec", { type: "button", onclick: () => { m.cerrar(); nuevoEnGrupo(); } }, "Registrar un estudiante nuevo"),
        h("button.btn.btn-sec", { type: "button", onclick: () => { m.cerrar(); importarEnGrupo(); } }, "Importar una lista de Excel o CSV"))));
  };
  const agregarEstudiantes = () => {
    const buscar = h("input", { type: "search", placeholder: "Buscar", "aria-label": "Buscar estudiante" });
    const lista = h("div", libres.map((e) => h("label.check", { dataset: { n: nombreCompleto(e).toLowerCase() } }, h("input", { type: "checkbox", value: e.id }), nombreCompleto(e))));
    buscar.addEventListener("input", () => lista.querySelectorAll("label").forEach((l) => l.classList.toggle("oculto", !l.dataset.n.includes(buscar.value.toLowerCase()))));
    modal("Agregar estudiantes al grupo", h("div", buscar, lista), [
      { texto: "Cancelar", clase: "btn-sec" },
      { texto: "Agregar seleccionados", onclick: async (cerrar) => {
        const ids = [...lista.querySelectorAll("input:checked")].map((i) => i.value);
        if (!ids.length) return ctx.toast("Selecciona al menos un estudiante", "mal");
        try {
          await q(sb.from("grupo_estudiantes").upsert(ids.map((estudiante_id) => ({ grupo_id: id, estudiante_id, cuenta_id: ctx.id, estado: "activo" }))));
          cerrar(); ctx.toast(`${ids.length} agregado(s)`); ctx.recargar();
        } catch (e) { ctx.toast(e.message, "mal"); }
      } },
    ]);
  };

  el.append(
    h("p", h("a", { href: "#/grupos" }, "← Grupos")),
    ctx.titulo(g.nombre,
      h("a.btn.btn-sec", { href: `#/asistencia?grupo=${id}` }, "Pasar lista"),
      h("a.btn.btn-sec", { href: `#/calificaciones?grupo=${id}` }, "Calificaciones"),
      ctx.esGestor ? h("button.btn.btn-sec", { onclick: () => editarGrupo(ctx, g) }, "Editar") : null,
      !ctx.esGestor ? null : h("button.btn.btn-texto", { onclick: async () => {
        if (!(await confirmar("Eliminar grupo", `Se borrarán también su asistencia, evaluaciones y notas. Si el grupo terminó, mejor márcalo como «Finalizado».`, { boton: "Eliminar", peligro: true }))) return;
        try { await q(sb.from("grupos").delete().eq("id", id)); ctx.datos.invalidar("grupos"); ctx.toast("Grupo eliminado"); ctx.ir("#/grupos"); } catch (e) { ctx.toast(e.message, "mal"); }
      } }, "Eliminar")),
    h("p.suave", [g.asignaturas?.nombre, g.cursos?.nombre, g.fecha_inicio ? `Del ${fecha(g.fecha_inicio)}${g.fecha_fin ? ` al ${fecha(g.fecha_fin)}` : ""}` : null, `Estado: ${g.estado}`].filter(Boolean).join(" · ")),
    h("div.dos-col",
      h("section.hoja",
        h("div.hoja-titulo", h("h2", `Estudiantes (${activos.length}${g.cupo ? ` de ${g.cupo}` : ""})`),
          !ctx.esGestor && !ctx.esFinanzas ? null : academia ? h("a.btn.btn-sm", { href: `#/matriculas?grupo=${id}` }, "Matricular") : h("button.btn.btn-sm", { onclick: opcionesAgregar }, "Agregar")),
        miembros.length ? h("ul.lista.integrantes", miembros.map((m) => h("li",
          h("div.crece", h("a.titulo", { href: `#/estudiantes/${m.estudiante_id}`, style: "color:inherit;display:block" }, nombreCompleto(m.estudiantes)),
            h("div.tenue", `Desde ${fecha(m.desde)}`)),
          m.estado === "activo"
            ? (academia || !ctx.esGestor ? h("span.estado.ok", "Activo") : h("button.btn.btn-texto.btn-sm", { onclick: async () => {
                if (!(await confirmar("Retirar", `¿Retirar a ${m.estudiantes.nombres} del grupo? Se conserva su historial.`, { boton: "Retirar" }))) return;
                await q(sb.from("grupo_estudiantes").update({ estado: "retirado" }).eq("grupo_id", id).eq("estudiante_id", m.estudiante_id)); ctx.recargar(); } }, "Retirar"))
            : h("span.estado.mal", "Retirado"))))
          : h("div.vacio", h("p", "Este grupo aún no tiene estudiantes."),
              !academia && ctx.esGestor ? h("button.btn", { type: "button", onclick: opcionesAgregar }, "Agregar estudiantes") : null)),
      h("section.hoja",
        h("div.hoja-titulo", h("h2", "Horario semanal"), ctx.esGestor ? h("button.btn.btn-sm", { onclick: agregarHorario }, "Agregar") : null),
        horarios.length ? h("ul.agenda", horarios.map((x) => h("li",
          h("span.h", DIAS[x.dia].slice(0, 3)),
          h("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:.5rem" },
            h("span.num", `${hora(x.hora_inicio)} – ${hora(x.hora_fin)}`),
            ctx.esGestor ? h("button.btn.btn-texto.btn-sm", { onclick: async () => { await q(sb.from("horarios").delete().eq("id", x.id)); ctx.recargar(); } }, "Quitar") : null)))) : h("p.suave", "Sin horario. Agrégalo para verlo en Inicio y en el Calendario."),
        h("p.tenue", "Docencia360 avisa si dos grupos chocan en el mismo horario."),
        (academia ? ctx.esGestor : ctx.f("asistentes") && ctx.esDueno) ? await seccionAsistentes(ctx, id) : null)),
  );
}

async function seccionAsistentes(ctx, grupoId) {
  const [asis, asignados] = await Promise.all([
    q(sb.from("miembros").select("id,nombre,activo").eq("cuenta_id", ctx.id).eq("rol", "docente")),
    q(sb.from("grupo_docentes").select("id,miembro_id").eq("grupo_id", grupoId)),
  ]);
  const academia = ctx.modalidad !== "profesor";
  if (!asis.length) return h("p.tenue", academia ? "Registra instructores en «Instructores» para asignarlos." : "Crea un asistente en Mi cuenta para asignarlo a este grupo.");
  const ya = new Map(asignados.map((a) => [a.miembro_id, a.id]));
  return h("div", { style: "margin-top:1rem;border-top:1px solid var(--renglon);padding-top:.75rem" },
    h("h3", academia ? "Instructores del grupo" : "Asistentes del grupo"),
    asis.filter((a) => a.activo).map((a) => h("label.check",
      h("input", { type: "checkbox", checked: ya.has(a.id), onchange: async (e) => {
        try {
          if (e.target.checked) await q(sb.from("grupo_docentes").insert({ cuenta_id: ctx.id, grupo_id: grupoId, miembro_id: a.id }));
          else await q(sb.from("grupo_docentes").delete().eq("grupo_id", grupoId).eq("miembro_id", a.id));
          ctx.toast("Guardado"); ctx.datos.invalidar("misGrupos");
          if (academia) setTimeout(ctx.recargar, 300);
        } catch (err) { e.target.checked = !e.target.checked; ctx.toast(err.message, "mal"); }
      } }), a.nombre)),
    h("p.tenue", academia ? "Cada instructor pasa lista y califica solo en sus grupos." : "El asistente puede pasar lista y calificar solo en los grupos marcados."));
}
