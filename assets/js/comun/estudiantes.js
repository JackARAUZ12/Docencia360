// Estudiantes: registro, edición y expediente individual.
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, confirmar, fecha, fechaCorta, nombreCompleto, nota, descargarCSV } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";

const ESTADOS = [["activo", "Activo"], ["inactivo", "Inactivo"], ["retirado", "Retirado"], ["egresado", "Egresado"]];
const claseEstado = { activo: "ok", inactivo: "", retirado: "mal", egresado: "info" };
const PARENTESCO = [["Madre", "Madre"], ["Padre", "Padre"], ["Tutor legal", "Tutor legal"], ["Abuelo/a", "Abuelo/a"], ["Otro", "Otro"], ["Ninguno (es adulto)", "Ninguno (es adulto)"]];

export const CAMPOS_ESTUDIANTE = [
  { name: "nombres", label: "Nombres", required: true, maxlength: 80 },
  { name: "apellidos", label: "Apellidos", maxlength: 80 },
  { name: "fecha_nacimiento", label: "Fecha de nacimiento", type: "date" },
  { name: "genero", label: "Género", type: "select", placeholder: "Sin indicar", options: [["F", "Femenino"], ["M", "Masculino"], ["O", "Otro"]] },
  { name: "telefono", label: "Teléfono", type: "tel" },
  { name: "email", label: "Correo", type: "email" },
  { name: "documento", label: "Cédula / documento" },
  { name: "estado", label: "Estado", type: "select", options: ESTADOS, value: "activo" },
  { type: "seccion", label: "Contacto de la familia o responsable" },
  { name: "contacto_nombre", label: "Nombre" },
  { name: "contacto_telefono", label: "Teléfono", type: "tel" },
  { name: "contacto_parentesco", label: "Parentesco", type: "select", placeholder: "Sin indicar", options: PARENTESCO },
  { name: "direccion", label: "Dirección", full: true },
  { name: "observaciones", label: "Notas generales", type: "textarea", full: true },
];

export function editarEstudiante(ctx, est, alGuardar) {
  formularioModal(est ? "Editar estudiante" : "Nuevo estudiante", CAMPOS_ESTUDIANTE, est, async (d, cerrar) => {
    if (est) await q(sb.from("estudiantes").update(d).eq("id", est.id));
    else await q(sb.from("estudiantes").insert({ ...d, cuenta_id: ctx.id }));
    ctx.datos.invalidar("estudiantes");
    cerrar(); ctx.toast(est ? "Cambios guardados" : "Estudiante registrado");
    alGuardar?.();
  });
}

export async function render(el, ctx, { partes }) {
  if (partes[0]) return ficha(el, ctx, partes[0]);
  const [est, rels] = await Promise.all([
    ctx.datos.estudiantes(true),
    q(sb.from("grupo_estudiantes").select("estudiante_id, grupos(nombre)").eq("cuenta_id", ctx.id).eq("estado", "activo")),
  ]);
  const gruposDe = {};
  rels.forEach((r) => (gruposDe[r.estudiante_id] ||= []).push(r.grupos?.nombre));

  let filtro = "activo", texto = "";
  const cont = h("div");
  const pintar = () => {
    const t = texto.toLowerCase();
    const lista = est.filter((e) => (filtro === "todos" || e.estado === filtro) &&
      (!t || nombreCompleto(e).toLowerCase().includes(t) || (e.telefono || "").includes(t) || (e.codigo || "").toLowerCase().includes(t)));
    cont.replaceChildren(tabla([
      { t: "Estudiante", v: (e) => h("a.fila-enlace", { href: `#/estudiantes/${e.id}` }, nombreCompleto(e)) },
      { t: "Grupos", v: (e) => (gruposDe[e.id] || []).join(", ") || h("span.tenue", "Sin grupo") },
      { t: "Teléfono", v: (e) => e.telefono || e.contacto_telefono || "—" },
      { t: "Estado", v: (e) => h("span.estado." + (claseEstado[e.estado] || "x"), e.estado) },
    ], lista, { vacio: est.length ? "Ningún estudiante coincide con la búsqueda." : "Todavía no registras estudiantes. Empieza con el botón «Nuevo estudiante»." }));
  };

  const filtros = h("div.segmentos", { role: "group", "aria-label": "Filtrar por estado" },
    [["activo", "Activos"], ["inactivo", "Inactivos"], ["retirado", "Retirados"], ["todos", "Todos"]].map(([v, t]) =>
      h("button", { type: "button", "aria-pressed": String(v === filtro), onclick: (ev) => {
        filtro = v; ev.currentTarget.parentNode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === ev.currentTarget))); pintar(); } }, t)));

  el.append(
    ctx.titulo("Estudiantes",
      ctx.f("exportar") ? h("button.btn.btn-sec", { onclick: () => descargarCSV("estudiantes.csv",
        [["Nombres", "Apellidos", "Estado", "Teléfono", "Correo", "Responsable", "Tel. responsable", "Grupos"],
         ...est.map((e) => [e.nombres, e.apellidos, e.estado, e.telefono, e.email, e.contacto_nombre, e.contacto_telefono, (gruposDe[e.id] || []).join("; ")])]) },
        h("span", { html: ICONOS.descargar }), "Exportar") : null,
      ctx.esGestor ? h("button.btn", { onclick: () => editarEstudiante(ctx, null, ctx.recargar) }, h("span", { html: ICONOS.mas_add }), "Nuevo estudiante") : null),
    h("div", { style: "display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center" },
      h("input", { type: "search", placeholder: "Buscar por nombre o teléfono", style: "max-width:320px", "aria-label": "Buscar",
        oninput: (e) => { texto = e.target.value; pintar(); } }),
      filtros,
      h("span.tenue", `${est.filter((e) => e.estado === "activo").length} activos de ${est.length}`)),
    h("div.hoja", cont),
  );
  pintar();
}

// ---------------- Expediente ----------------
async function ficha(el, ctx, id) {
  const [e, grupos, asis, notas, obs, todosGrupos] = await Promise.all([
    q(sb.from("estudiantes").select("*").eq("id", id).maybeSingle()),
    q(sb.from("grupo_estudiantes").select("*, grupos(id,nombre,estado)").eq("estudiante_id", id)),
    q(sb.rpc("d360_resumen_asistencia", { p_cuenta: ctx.id }).eq("estudiante_id", id)),
    q(sb.from("calificaciones").select("puntaje, comentario, evaluaciones(titulo,tipo,fecha,peso,puntaje_max,grupo_id,grupos(nombre))").eq("estudiante_id", id)),
    q(sb.from("observaciones").select("*").eq("estudiante_id", id).order("creado", { ascending: false })),
    ctx.datos.grupos(),
  ]);
  if (!e) { el.append(h("div.aviso.mal", "Estudiante no encontrado."), h("a", { href: "#/estudiantes" }, "Volver")); return; }
  const a = asis[0];
  const ultimas = await q(sb.from("asistencias").select("fecha,estado,nota,grupos(nombre)").eq("estudiante_id", id).neq("estado", "presente").order("fecha", { ascending: false }).limit(10));

  // Promedio por grupo del estudiante
  const promedios = await Promise.all(grupos.filter((g) => g.estado === "activo").map(async (g) => {
    const p = await q(sb.rpc("d360_promedios_grupo", { p_grupo: g.grupo_id }));
    return { nombre: g.grupos?.nombre, ...p.find((x) => x.estudiante_id === id) };
  }));

  const dato = (t, v) => v ? h("div", h("dt.tenue", t), h("dd", { style: "margin:0 0 .6rem;font-weight:700" }, v)) : null;
  const edad = e.fecha_nacimiento ? Math.floor((Date.now() - new Date(e.fecha_nacimiento)) / 31557600000) : null;

  el.append(
    h("p", h("a", { href: "#/estudiantes" }, "← Estudiantes")),
    ctx.titulo(nombreCompleto(e),
      (ctx.accionesFicha || []).map((fn) => fn(ctx, e)),
      h("a.btn.btn-sec", { href: `#/informes?estudiante=${e.id}` }, "Informe"),
      ctx.esGestor ? h("button.btn.btn-sec", { onclick: () => editarEstudiante(ctx, e, ctx.recargar) }, "Editar") : null,
      !ctx.esGestor ? null : h("button.btn.btn-texto", { onclick: async () => {
        if (!(await confirmar("Eliminar estudiante", `Se borrará a ${nombreCompleto(e)} con todo su historial de notas y asistencia. Si solo dejó de venir, mejor cambia su estado a «Retirado».`, { boton: "Eliminar", peligro: true }))) return;
        try { await q(sb.from("estudiantes").delete().eq("id", e.id)); ctx.datos.invalidar("estudiantes"); ctx.toast("Estudiante eliminado"); ctx.ir("#/estudiantes"); }
        catch (err) { ctx.toast(err.message, "mal"); }
      } }, "Eliminar")),
    h("div.dos-col",
      h("div",
        h("section.cifras",
          h("div.cifra", h("b", a?.porcentaje == null ? "—" : `${a.porcentaje}%`), h("span", "asistencia")),
          h("div.cifra", h("b", a ? a.ausentes : 0), h("span", "ausencias")),
          h("div.cifra", h("b", a ? a.tardes : 0), h("span", "tardanzas"))),
        h("section.hoja", { style: "margin-top:1rem" },
          h("div.hoja-titulo", h("h2", "Rendimiento por grupo")),
          promedios.length ? tabla([
            { t: "Grupo", v: (p) => p.nombre },
            { t: "Calificadas", v: (p) => `${p.calificadas ?? 0} de ${p.total_evaluaciones ?? 0}`, clase: "derecha" },
            { t: "Promedio", v: (p) => nota(p.promedio), clase: "derecha" },
          ], promedios) : h("p.suave", "No está inscrito en ningún grupo activo."),
          h("h3", { style: "margin-top:1.25rem" }, "Historial de calificaciones"),
          tabla([
            { t: "Fecha", v: (n) => fechaCorta(n.evaluaciones?.fecha) },
            { t: "Evaluación", v: (n) => [n.evaluaciones?.titulo, h("div.tenue", n.evaluaciones?.grupos?.nombre)] },
            { t: "Nota", v: (n) => n.puntaje == null ? "—" : `${Number(n.puntaje)} / ${Number(n.evaluaciones?.puntaje_max)}`, clase: "derecha" },
          ], notas.sort((x, y) => (y.evaluaciones?.fecha || "").localeCompare(x.evaluaciones?.fecha || "")), { vacio: "Aún no tiene calificaciones." })),
        h("section.hoja",
          h("div.hoja-titulo", h("h2", "Ausencias y tardanzas recientes")),
          tabla([
            { t: "Fecha", v: (x) => fecha(x.fecha) },
            { t: "Grupo", v: (x) => x.grupos?.nombre },
            { t: "Estado", v: (x) => h("span.estado." + ({ ausente: "mal", tarde: "ojo", justificado: "info" }[x.estado]), x.estado) },
            { t: "Nota", v: (x) => x.nota || "" },
          ], ultimas, { vacio: "Sin ausencias registradas." })),
        await Promise.all((ctx.seccionesFicha || []).map((fn) => fn(ctx, e)))),
      h("div",
        h("section.hoja",
          h("div.hoja-titulo", h("h2", "Datos"), h("span.estado." + (claseEstado[e.estado] || "x"), e.estado)),
          h("dl", { style: "margin:0" },
            dato("Edad", edad != null ? `${edad} años (${fecha(e.fecha_nacimiento)})` : null),
            dato("Teléfono", e.telefono), dato("Correo", e.email), dato("Documento", e.documento),
            dato("Responsable", e.contacto_nombre ? `${e.contacto_nombre}${e.contacto_parentesco ? ` (${e.contacto_parentesco})` : ""}` : null),
            dato("Teléfono del responsable", e.contacto_telefono), dato("Dirección", e.direccion),
            dato("Notas", e.observaciones), dato("Registrado", fecha(e.creado)))),
        h("section.hoja",
          h("div.hoja-titulo", h("h2", "Grupos"), ctx.esGestor && ctx.modalidad === "profesor" ? h("button.btn.btn-sec.btn-sm", { onclick: () => inscribir(ctx, e, grupos, todosGrupos) }, "Inscribir") : null),
          grupos.length ? h("ul.lista", grupos.map((g) => h("li",
            h("div.crece", h("div.titulo", g.grupos?.nombre), h("div.tenue", `Desde ${fecha(g.desde)}`)),
            h("span.estado." + (g.estado === "activo" ? "ok" : "mal"), g.estado),
            g.estado === "activo" && ctx.esGestor && ctx.modalidad === "profesor" ? h("button.btn.btn-texto.btn-sm", { onclick: async () => {
              if (!(await confirmar("Retirar del grupo", `¿Retirar a ${e.nombres} de ${g.grupos?.nombre}? Se conserva su historial.`, { boton: "Retirar" }))) return;
              try { await q(sb.from("grupo_estudiantes").update({ estado: "retirado" }).eq("grupo_id", g.grupo_id).eq("estudiante_id", id)); ctx.recargar(); }
              catch (err) { ctx.toast(err.message, "mal"); }
            } }, "Retirar") : null))) : h("p.suave", "Sin grupos.")),
        h("section.hoja",
          h("div.hoja-titulo", h("h2", "Observaciones"), h("button.btn.btn-sec.btn-sm", { onclick: () => nuevaObs(ctx, e) }, "Agregar")),
          obs.length ? h("ul.lista", obs.map((o) => h("li", { style: "align-items:flex-start" },
            h("div.crece", h("div", o.texto), h("div.tenue", `${fecha(o.creado)} · ${o.tipo}`)),
            h("button.btn.btn-texto.btn-sm", { "aria-label": "Borrar observación", onclick: async () => {
              if (!(await confirmar("Borrar observación", "¿Borrar esta observación?", { boton: "Borrar", peligro: true }))) return;
              await q(sb.from("observaciones").delete().eq("id", o.id)); ctx.recargar(); } }, "Borrar")))) : h("p.suave", "Sin observaciones."))),
    ),
  );
}

function inscribir(ctx, e, actuales, todos) {
  const ya = new Set(actuales.filter((g) => g.estado === "activo").map((g) => g.grupo_id));
  const opciones = todos.filter((g) => g.estado === "activo" && !ya.has(g.id)).map((g) => [g.id, g.nombre]);
  if (!opciones.length) return ctx.toast("No hay otros grupos activos. Crea uno en Grupos.", "mal");
  formularioModal("Inscribir en un grupo", [{ name: "grupo_id", label: "Grupo", type: "select", required: true, options: opciones }], {}, async (d, cerrar) => {
    await q(sb.from("grupo_estudiantes").upsert({ grupo_id: d.grupo_id, estudiante_id: e.id, cuenta_id: ctx.id, estado: "activo" }));
    cerrar(); ctx.toast("Inscrito"); ctx.recargar();
  }, { boton: "Inscribir" });
}

function nuevaObs(ctx, e) {
  formularioModal("Nueva observación", [
    { name: "tipo", label: "Tipo", type: "select", options: [["general", "General"], ["academica", "Académica"], ["conducta", "Conducta"], ["salud", "Salud"], ["familia", "Familia"]] },
    { name: "texto", label: "Observación", type: "textarea", required: true, full: true },
  ], {}, async (d, cerrar) => {
    await q(sb.from("observaciones").insert({ ...d, cuenta_id: ctx.id, estudiante_id: e.id, autor: ctx.user.id }));
    cerrar(); ctx.toast("Observación guardada"); ctx.recargar();
  });
}
