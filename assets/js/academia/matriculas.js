// Matrículas: inscripción con cobros automáticos, renovación y retiro.
import { sb, q } from "../core/sb.js";
import { h, tabla, modal, formularioModal, confirmar, fecha, hoyISO, dinero, nombreCompleto, descargarCSV } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { editarEstudiante } from "../comun/estudiantes.js";

const ESTADO = { activa: "ok", pendiente: "ojo", completada: "info", retirada: "mal", cancelada: "mal" };

/** Formulario de matrícula. Precarga precios del curso; el servidor genera los cobros. */
export async function abrirMatricula(ctx, { estudianteId, grupoId } = {}) {
  const [est, grupos, cursos, ocup] = await Promise.all([
    ctx.datos.estudiantes(), ctx.datos.grupos(), ctx.datos.cursos(),
    q(sb.from("grupo_estudiantes").select("grupo_id").eq("cuenta_id", ctx.id).eq("estado", "activo")),
  ]);
  const usados = {}; ocup.forEach((o) => (usados[o.grupo_id] = (usados[o.grupo_id] || 0) + 1));
  const abiertos = grupos.filter((g) => ["activo", "planificado"].includes(g.estado));
  if (!abiertos.length) return ctx.toast("No hay grupos abiertos. Crea uno en Grupos.", "mal");
  const activos = est.filter((e) => e.estado === "activo");
  const finanzas = ctx.f("finanzas");

  const cursoDe = (gid) => cursos.find((c) => c.id === abiertos.find((g) => g.id === gid)?.curso_id);
  const g0 = grupoId || abiertos[0].id;
  const c0 = cursoDe(g0);
  const m = formularioModal("Nueva matrícula", [
    { name: "estudiante", label: "Estudiante", type: "select", required: true, full: true, placeholder: "Elige un estudiante",
      options: activos.map((e) => [e.id, nombreCompleto(e)]), value: estudianteId,
      help: "¿No está en la lista? Regístralo primero en Estudiantes." },
    { name: "grupo", label: "Grupo", type: "select", required: true, full: true, value: g0,
      options: abiertos.map((g) => [g.id, `${g.nombre}${g.cursos?.nombre ? " · " + g.cursos.nombre : ""} — ${usados[g.id] || 0}${g.cupo ? "/" + g.cupo : ""} inscritos${g.cupo && (usados[g.id] || 0) >= g.cupo ? " (LLENO)" : ""}`]) },
    { name: "fecha", label: "Fecha de matrícula", type: "date", required: true, value: hoyISO() },
    ...(finanzas ? [
      { type: "seccion", label: "Cobros que se generarán" },
      { name: "monto_matricula", label: `Matrícula (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", value: c0?.precio_matricula ?? 0 },
      { name: "mensualidad", label: `Mensualidad (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", value: c0?.mensualidad ?? 0 },
      { name: "meses", label: "Meses a generar", type: "number", min: 0, max: 36, value: c0?.duracion_semanas ? Math.max(1, Math.ceil(c0.duracion_semanas / 4.3)) : 1, help: "Puedes renovar después." },
      { name: "dia_pago", label: "Día de pago de cada mes", type: "number", min: 1, max: 31, value: Number(hoyISO().slice(8, 10)) },
      { name: "descuento_pct", label: "Descuento en mensualidad (%)", type: "number", min: 0, max: 100, step: "0.5", value: 0 },
      { name: "beca", label: "Beca o convenio", placeholder: "Ej.: Beca hermanos" },
    ] : []),
    { name: "notas", label: "Notas", type: "textarea", full: true },
  ], {}, async (d, cerrar) => {
    const r = await q(sb.rpc("d360_matricular", {
      p_cuenta: ctx.id, p_estudiante: d.estudiante, p_curso: cursoDe(d.grupo)?.id || null, p_grupo: d.grupo, p_fecha: d.fecha,
      p_monto_matricula: d.monto_matricula ?? 0, p_mensualidad: d.mensualidad ?? 0, p_meses: d.meses ?? 0, p_dia_pago: d.dia_pago ?? 5,
      p_descuento_pct: d.descuento_pct ?? 0, p_beca: d.beca, p_notas: d.notas,
    }));
    ctx.datos.invalidar("grupos");
    cerrar(); ctx.toast(r.cargos ? `Matrícula registrada con ${r.cargos} cobro(s)` : "Matrícula registrada");
    ctx.recargar();
  }, { boton: "Matricular" });

  // Al cambiar de grupo, proponer los precios del curso
  const f = m.el.querySelector("form");
  f.elements.grupo.addEventListener("change", (e) => {
    const c = cursoDe(e.target.value);
    if (c && finanzas) { f.elements.monto_matricula.value = c.precio_matricula; f.elements.mensualidad.value = c.mensualidad; }
  });
}

export const accionMatricular = (ctx, e) => h("button.btn", { onclick: () => abrirMatricula(ctx, { estudianteId: e.id }) }, "Matricular");

/** Sección del expediente: historial de matrículas */
export async function seccionMatriculasFicha(ctx, e) {
  const ms = await q(sb.from("matriculas").select("*, cursos(nombre), grupos(nombre)").eq("estudiante_id", e.id).order("fecha", { ascending: false }));
  return h("section.hoja", h("div.hoja-titulo", h("h2", "Historial de matrículas")),
    tabla([
      { t: "Fecha", v: (m) => fecha(m.fecha) },
      { t: "Curso / grupo", v: (m) => [h("strong", m.cursos?.nombre || "—"), h("div.tenue", m.grupos?.nombre || "")] },
      { t: "Estado", v: (m) => h("span.estado." + ESTADO[m.estado], m.estado) },
      { t: "", clase: "acciones", v: (m) => ctx.esGestor || ctx.esFinanzas ? accionesMatricula(ctx, m) : null },
    ], ms, { vacio: "Sin matrículas." }));
}

/** Sección del expediente: estado de cuenta */
export async function seccionEstadoCuenta(ctx, e) {
  const cargos = await q(sb.from("cargos").select("*").eq("estudiante_id", e.id).neq("estado", "anulado").order("vence"));
  const saldo = cargos.reduce((s, c) => s + Number(c.monto) - Number(c.descuento) - Number(c.pagado), 0);
  const vencido = cargos.filter((c) => c.vence < hoyISO()).reduce((s, c) => s + Number(c.monto) - Number(c.descuento) - Number(c.pagado), 0);
  return h("section.hoja",
    h("div.hoja-titulo", h("h2", "Estado de cuenta"), h("a.btn.btn-sec.btn-sm", { href: `#/finanzas?estudiante=${e.id}` }, "Cobrar")),
    h("p", "Saldo pendiente: ", h("strong.num", dinero(saldo, ctx.cuenta.moneda)),
      vencido > 0 ? [" · ", h("span.nota-baja", `vencido ${dinero(vencido, ctx.cuenta.moneda)}`)] : null),
    tabla([
      { t: "Vence", v: (c) => fecha(c.vence) },
      { t: "Concepto", v: (c) => c.concepto },
      { t: "Saldo", v: (c) => dinero(Number(c.monto) - Number(c.descuento) - Number(c.pagado), ctx.cuenta.moneda), clase: "derecha" },
      { t: "", v: (c) => h("span.estado." + (c.estado === "pagado" ? "ok" : c.vence < hoyISO() ? "mal" : c.estado === "parcial" ? "ojo" : ""), c.estado === "pendiente" && c.vence < hoyISO() ? "vencido" : c.estado) },
    ], cargos.slice(-12), { vacio: "Sin cobros." }));
}

function accionesMatricula(ctx, m) {
  if (["retirada", "cancelada"].includes(m.estado)) return null;
  return h("span", { style: "display:inline-flex;gap:.25rem" },
    ctx.f("finanzas") ? h("button.btn.btn-texto.btn-sm", { onclick: () => formularioModal("Renovar matrícula", [
      { name: "meses", label: "Meses a agregar", type: "number", min: 1, max: 36, required: true, value: 1 },
      { name: "dia", label: "Día de pago", type: "number", min: 1, max: 31, help: "Si lo dejas vacío, se usa el día de pago anterior." },
    ], {}, async (d, cerrar) => {
      const n = await q(sb.rpc("d360_renovar_matricula", { p_matricula: m.id, p_meses: d.meses, p_dia_pago: d.dia }));
      cerrar(); ctx.toast(`Renovada: ${n} mensualidad(es) nuevas`); ctx.recargar();
    }, { boton: "Renovar" }) }, "Renovar") : null,
    h("button.btn.btn-texto.btn-sm", { onclick: () => formularioModal("Retirar estudiante", [
      { name: "motivo", label: "Motivo del retiro", required: true, full: true },
      { name: "anular", label: "Anular las mensualidades futuras que no tengan abonos", type: "checkbox", value: true },
    ], {}, async (d, cerrar) => {
      const n = await q(sb.rpc("d360_retirar_matricula", { p_matricula: m.id, p_motivo: d.motivo, p_anular_pendientes: d.anular }));
      ctx.datos.invalidar("grupos");
      cerrar(); ctx.toast(`Retiro registrado${n ? ` · ${n} cobro(s) anulados` : ""}`); ctx.recargar();
    }, { boton: "Registrar retiro" }) }, "Retirar"));
}

// ---------------- Vista principal ----------------
export async function render(el, ctx, { params }) {
  let estado = params.get("estado") || "activa";
  let texto = "";
  const [ms, cursos] = await Promise.all([
    q(sb.from("matriculas").select("*, estudiantes(id,nombres,apellidos,telefono), cursos(nombre), grupos(nombre)").eq("cuenta_id", ctx.id).order("fecha", { ascending: false })),
    ctx.datos.cursos(),
  ]);
  const cont = h("div");
  const mesActual = hoyISO().slice(0, 7);
  const cuenta = (e) => ms.filter((m) => m.estado === e).length;

  function pintar() {
    const t = texto.toLowerCase();
    const filas = ms.filter((m) => (estado === "todas" || m.estado === estado) &&
      (!t || nombreCompleto(m.estudiantes || {}).toLowerCase().includes(t) || (m.cursos?.nombre || "").toLowerCase().includes(t) || (m.grupos?.nombre || "").toLowerCase().includes(t)));
    cont.replaceChildren(tabla([
      { t: "Estudiante", v: (m) => h("a.fila-enlace", { href: `#/estudiantes/${m.estudiante_id}` }, nombreCompleto(m.estudiantes || {})) },
      { t: "Curso / grupo", v: (m) => [m.cursos?.nombre || "—", h("div.tenue", m.grupos?.nombre || "")] },
      { t: "Fecha", v: (m) => fecha(m.fecha) },
      { t: "Mensualidad", v: (m) => Number(m.mensualidad) ? [dinero(m.mensualidad, ctx.cuenta.moneda), Number(m.descuento_pct) ? h("div.tenue", `−${Number(m.descuento_pct)}%${m.beca ? " · " + m.beca : ""}`) : null] : "—", clase: "derecha" },
      { t: "Estado", v: (m) => h("span.estado." + ESTADO[m.estado], m.estado) },
      { t: "", clase: "acciones", v: (m) => accionesMatricula(ctx, m) },
    ], filas, { vacio: ms.length ? "No hay matrículas con ese filtro." : "Aún no hay matrículas. Usa «Nueva matrícula»." }));
  }

  const segs = h("div.segmentos", { role: "group", "aria-label": "Estado" },
    [["activa", `Activas (${cuenta("activa")})`], ["completada", `Completadas (${cuenta("completada")})`], ["retirada", `Retiradas (${cuenta("retirada")})`], ["todas", "Todas"]].map(([v, t]) =>
      h("button", { type: "button", "aria-pressed": String(v === estado), onclick: (e) => { estado = v; segs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); pintar(); } }, t)));

  el.append(
    ctx.titulo("Matrículas",
      ctx.f("exportar") ? h("button.btn.btn-sec", { onclick: () => descargarCSV("matriculas.csv", [["Estudiante", "Curso", "Grupo", "Fecha", "Estado", "Mensualidad", "Descuento %", "Beca"],
        ...ms.map((m) => [nombreCompleto(m.estudiantes || {}), m.cursos?.nombre, m.grupos?.nombre, m.fecha, m.estado, m.mensualidad, m.descuento_pct, m.beca])]) }, h("span", { html: ICONOS.descargar }), "Exportar") : null,
      h("button.btn.btn-sec", { onclick: () => editarEstudiante(ctx, null, () => abrirMatricula(ctx, {})) }, "Estudiante nuevo"),
      h("button.btn", { onclick: () => abrirMatricula(ctx, { grupoId: params.get("grupo") }) }, h("span", { html: ICONOS.mas_add }), "Nueva matrícula")),
    h("section.cifras",
      h("div.cifra", h("b", cuenta("activa")), h("span", "matrículas activas")),
      h("div.cifra", h("b", ms.filter((m) => m.fecha.startsWith(mesActual)).length), h("span", "nuevas este mes")),
      h("div.cifra", h("b", ms.filter((m) => m.estado === "retirada" && m.fecha.startsWith(hoyISO().slice(0, 4))).length), h("span", "retiros este año")),
      h("div.cifra", h("b", cursos.filter((c) => c.activo).length), h("span", "cursos abiertos"))),
    h("div", { style: "display:flex;gap:.75rem;flex-wrap:wrap;margin:1.25rem 0 1rem;align-items:center" },
      h("input", { type: "search", placeholder: "Buscar estudiante, curso o grupo", style: "max-width:320px", oninput: (e) => { texto = e.target.value; pintar(); } }), segs),
    h("section.hoja", cont));
  pintar();
  if (params.get("grupo") && params.get("nueva") !== "0") setTimeout(() => abrirMatricula(ctx, { grupoId: params.get("grupo") }), 50);
}
