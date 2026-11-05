// Matrícula escolar: inscripción por sección con matrícula y colegiaturas automáticas,
// becas, traslados y retiros. Vista por grado y sección con cupos.
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, fecha, dinero, nombreCompleto, descargarCSV } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { estructura } from "./util.js";
import { editarEstudiante } from "../comun/estudiantes.js";

const ANIO = new Date().getFullYear();
const ESTADO = { activa: "ok", pendiente: "ojo", completada: "info", retirada: "mal", cancelada: "mal" };

async function ocupacion(ctx) {
  const r = await q(sb.from("grupo_estudiantes").select("grupo_id").eq("cuenta_id", ctx.id).eq("estado", "activo"));
  const n = {}; r.forEach((x) => (n[x.grupo_id] = (n[x.grupo_id] || 0) + 1)); return n;
}

export async function abrirMatriculaColegio(ctx, { estudianteId, seccionId } = {}) {
  const [E, est, n, ya] = await Promise.all([estructura(ctx), ctx.datos.estudiantes(true), ocupacion(ctx),
    q(sb.from("matriculas").select("estudiante_id").eq("cuenta_id", ctx.id).eq("anio", String(ANIO)).in("estado", ["activa", "pendiente"]))]);
  const matriculados = new Set(ya.map((m) => m.estudiante_id));
  const libres = est.filter((e) => e.estado === "activo" && (!matriculados.has(e.id) || e.id === estudianteId));
  const secs = E.secciones.filter((s) => ["activo", "planificado"].includes(s.estado));
  if (!secs.length) return ctx.toast("Primero crea grados y secciones en «Grados y secciones».", "mal");
  if (!libres.length) return ctx.toast("Todos los estudiantes activos ya están matriculados este año. Registra uno nuevo.", "mal");
  const finanzas = ctx.f("finanzas");
  const M = (v) => dinero(v, ctx.cuenta.moneda);
  formularioModal(`Matrícula ${ANIO}`, [
    { name: "estudiante", label: "Estudiante", type: "select", required: true, full: true, placeholder: "Elige", options: libres.map((e) => [e.id, nombreCompleto(e)]), value: estudianteId },
    { name: "seccion", label: "Sección", type: "select", required: true, full: true, value: seccionId || secs[0].id,
      options: secs.map((s) => { const g = E.grado(s.grado_id); return [s.id, `${s.nombre} · ${n[s.id] || 0}${s.cupo ? "/" + s.cupo : ""} estudiantes${finanzas && g ? ` · matrícula ${M(g.matricula)}, colegiatura ${M(g.colegiatura)}` : ""}${s.cupo && (n[s.id] || 0) >= s.cupo ? " (LLENA)" : ""}`]; }) },
    ...(finanzas ? [
      { type: "seccion", label: "Colegiaturas" },
      { name: "mes_inicio", label: "Primer mes", type: "select", options: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"].map((m, i) => [i + 1, m]), value: 2 },
      { name: "meses", label: "Cantidad de colegiaturas", type: "number", min: 0, max: 12, value: 10 },
      { name: "dia", label: "Día de pago", type: "number", min: 1, max: 28, value: 10 },
      { name: "descuento_pct", label: "Beca o descuento (%)", type: "number", min: 0, max: 100, step: "0.5", value: 0 },
      { name: "beca", label: "Tipo de beca", placeholder: "Ej.: Beca hermanos, beca académica" },
    ] : []),
    { name: "notas", label: "Notas", type: "textarea", full: true },
  ], {}, async (d, cerrar) => {
    const r = await q(sb.rpc("d360_matricular_colegio", { p_cuenta: ctx.id, p_estudiante: d.estudiante, p_seccion: d.seccion, p_anio: ANIO,
      p_meses: d.meses ?? 0, p_mes_inicio: Number(d.mes_inicio || 2), p_dia: d.dia ?? 10, p_descuento_pct: d.descuento_pct ?? 0, p_beca: d.beca, p_notas: d.notas }));
    ctx.datos.invalidar(); cerrar(); ctx.toast(r.cargos ? `Matriculado · ${r.cargos} cobros generados` : "Matriculado"); ctx.recargar();
  }, { boton: "Matricular" });
}

export async function abrirTraslado(ctx, m) {
  const [E, n] = await Promise.all([estructura(ctx), ocupacion(ctx)]);
  const opciones = E.secciones.filter((s) => s.id !== m.grupo_id && s.estado === "activo").map((s) => [s.id, `${s.nombre} · ${n[s.id] || 0}${s.cupo ? "/" + s.cupo : ""}`]);
  if (!opciones.length) return ctx.toast("No hay otra sección activa.", "mal");
  formularioModal("Trasladar de sección", [
    { name: "seccion", label: "Nueva sección", type: "select", required: true, options: opciones, full: true },
    { name: "motivo", label: "Motivo", full: true },
  ], {}, async (d, cerrar) => {
    await q(sb.rpc("d360_trasladar_seccion", { p_matricula: m.id, p_seccion: d.seccion, p_motivo: d.motivo }));
    ctx.datos.invalidar(); cerrar(); ctx.toast("Traslado registrado"); ctx.recargar();
  }, { boton: "Trasladar" });
}

function retirar(ctx, m) {
  formularioModal("Retirar estudiante", [
    { name: "motivo", label: "Motivo del retiro", required: true, full: true },
    { name: "anular", label: "Anular las colegiaturas futuras sin abonos", type: "checkbox", value: true },
  ], {}, async (d, cerrar) => {
    const n = await q(sb.rpc("d360_retirar_matricula", { p_matricula: m.id, p_motivo: d.motivo, p_anular_pendientes: d.anular }));
    ctx.datos.invalidar(); cerrar(); ctx.toast(`Retiro registrado${n ? ` · ${n} cobros anulados` : ""}`); ctx.recargar();
  }, { boton: "Registrar retiro" });
}

export async function render(el, ctx, { params }) {
  const [E, ms, n] = await Promise.all([estructura(ctx, true),
    q(sb.from("matriculas").select("*, estudiantes(id,nombres,apellidos,codigo)").eq("cuenta_id", ctx.id).eq("anio", String(ANIO)).order("fecha", { ascending: false })),
    ocupacion(ctx)]);
  let filtroSec = params.get("seccion") || "", texto = "";
  const activas = ms.filter((m) => m.estado === "activa");
  const becas = activas.filter((m) => Number(m.descuento_pct) > 0);
  const cupoTotal = E.secciones.filter((s) => s.estado === "activo").reduce((t, s) => t + (s.cupo || 0), 0);
  const cont = h("div");

  const pintar = () => {
    const t = texto.toLowerCase();
    const fs = ms.filter((m) => (!filtroSec || m.grupo_id === filtroSec) && (!t || nombreCompleto(m.estudiantes || {}).toLowerCase().includes(t) || (m.estudiantes?.codigo || "").toLowerCase().includes(t)));
    cont.replaceChildren(tabla([
      { t: "Estudiante", v: (m) => [h("a.fila-enlace", { href: `#/estudiantes/${m.estudiante_id}` }, nombreCompleto(m.estudiantes || {})), m.estudiantes?.codigo ? h("div.tenue", m.estudiantes.codigo) : null] },
      { t: "Sección", v: (m) => E.seccion(m.grupo_id)?.nombre || "—" },
      { t: "Fecha", v: (m) => fecha(m.fecha) },
      { t: "Beca", v: (m) => Number(m.descuento_pct) ? `${Number(m.descuento_pct)}%${m.beca ? " · " + m.beca : ""}` : "—" },
      { t: "Estado", v: (m) => h("span.estado." + (ESTADO[m.estado] || ""), m.estado) },
      { t: "", clase: "acciones", v: (m) => m.estado === "activa" ? [
        h("button.btn.btn-texto.btn-sm", { onclick: () => abrirTraslado(ctx, m) }, "Trasladar"),
        h("button.btn.btn-texto.btn-sm", { onclick: () => retirar(ctx, m) }, "Retirar")] : null },
    ], fs, { vacio: ms.length ? "Sin resultados." : `Aún no hay matrículas para ${ANIO}.` }));
  };

  el.append(
    ctx.titulo(`Matrícula ${ANIO}`,
      ctx.f("exportar") ? h("button.btn.btn-sec", { onclick: () => descargarCSV(`matricula-${ANIO}.csv`, [["Código", "Estudiante", "Sección", "Grado", "Fecha", "Beca %", "Tipo de beca", "Estado"],
        ...ms.map((m) => { const s = E.seccion(m.grupo_id); return [m.estudiantes?.codigo, nombreCompleto(m.estudiantes || {}), s?.nombre, E.grado(s?.grado_id)?.nombre, m.fecha, m.descuento_pct, m.beca, m.estado]; })]) }, h("span", { html: ICONOS.descargar }), "Exportar") : null,
      ctx.esGestor ? h("button.btn.btn-sec", { onclick: () => editarEstudiante(ctx, null, () => abrirMatriculaColegio(ctx, {})) }, "Estudiante nuevo") : null,
      h("button.btn", { onclick: () => abrirMatriculaColegio(ctx, { seccionId: filtroSec || undefined }) }, h("span", { html: ICONOS.mas_add }), "Matricular")),
    h("section.cifras",
      h("div.cifra", h("b", activas.length), h("span", "matriculados activos")),
      h("div.cifra", h("b", cupoTotal ? `${Math.round((activas.length / cupoTotal) * 100)}%` : "—"), h("span", "de ocupación de cupos")),
      h("div.cifra", h("b", becas.length), h("span", "con beca o descuento")),
      h("div.cifra", h("b", ms.filter((m) => m.estado === "retirada").length), h("span", "retiros en el año"))),
    h("section.hoja", { style: "margin-top:1.25rem" },
      h("div.hoja-titulo", h("h2", "Ocupación por sección")),
      tabla([
        { t: "Sección", v: (s) => h("a.fila-enlace", { href: "#", onclick: (ev) => { ev.preventDefault(); filtroSec = s.id; sel.value = s.id; pintar(); cont.scrollIntoView({ behavior: "smooth" }); } }, s.nombre) },
        { t: "Grado", v: (s) => E.grado(s.grado_id)?.nombre || "—" },
        { t: "Turno", v: (s) => s.turno || "—" },
        { t: "Estudiantes", v: (s) => `${n[s.id] || 0}${s.cupo ? " / " + s.cupo : ""}`, clase: "derecha" },
        { t: "", v: (s) => s.cupo && (n[s.id] || 0) >= s.cupo ? h("span.estado.mal", "Llena") : s.cupo && (n[s.id] || 0) >= s.cupo * .9 ? h("span.estado.ojo", "Casi llena") : h("span.estado.ok", "Con cupo") },
      ], E.secciones.filter((s) => s.estado === "activo"), { vacio: "Crea secciones en «Grados y secciones»." })),
    h("div", { style: "display:flex;gap:.75rem;flex-wrap:wrap;margin:1rem 0;align-items:center" },
      h("input", { type: "search", placeholder: "Buscar estudiante o código", style: "max-width:280px", oninput: (e) => { texto = e.target.value; pintar(); } })),
    h("section.hoja", cont));
  const sel = h("select", { "aria-label": "Sección", style: "width:auto", onchange: (e) => { filtroSec = e.target.value; pintar(); } },
    h("option", { value: "" }, "Todas las secciones"), E.secciones.map((s) => h("option", { value: s.id, selected: s.id === filtroSec }, s.nombre)));
  el.querySelector("input[type=search]").after(sel);
  pintar();
}
