// Informes institucionales: rendimiento por sección y asignatura, estudiantes
// en riesgo, asistencia, matrícula y finanzas escolares.
import { sb, q } from "../core/sb.js";
import { h, tabla, fecha, hoyISO, dinero, nombreCompleto, descargarCSV, imprimir } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { estructura, notaCelda, selector } from "./util.js";

const barra = (pct, color = "var(--acento)") => h("div", { style: "display:flex;align-items:center;gap:.5rem;min-width:140px" },
  h("div", { style: "flex:1;height:10px;background:var(--papel-2);border-radius:5px;overflow:hidden" }, h("div", { style: `width:${Math.max(0, Math.min(100, pct || 0))}%;height:100%;background:${color}` })),
  h("span.num", { style: "width:3.2rem;text-align:right" }, pct == null ? "—" : `${pct.toFixed(0)}%`));

export async function render(el, ctx, { params }) {
  const E = await estructura(ctx);
  const tipos = [ctx.esGestor ? ["rendimiento", "Rendimiento"] : null, ctx.esGestor ? ["asistencia", "Asistencia"] : null, ["matricula", "Matrícula"], ctx.esFinanzas && ctx.f("finanzas") ? ["finanzas", "Finanzas"] : null].filter(Boolean);
  let tipo = tipos.some(([t]) => t === params.get("tipo")) ? params.get("tipo") : tipos[0][0];
  let periodo = params.get("periodo") || E.periodoActual()?.id;
  const cont = h("div");
  const ctrl = h("div.no-imprimir", { style: "display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center" });
  el.append(ctx.titulo("Informes", h("button.btn.btn-sec", { onclick: () => imprimir(cont) }, h("span", { html: ICONOS.imprimir }), "Imprimir / PDF")), ctrl, cont);
  const M = (v) => dinero(v, ctx.cuenta.moneda);

  function controles() {
    const ir = () => { history.replaceState(null, "", `#/informes?tipo=${tipo}&periodo=${periodo || ""}`); controles(); pintar(); };
    ctrl.replaceChildren(
      h("div.segmentos", { role: "group" }, tipos.map(([v, t]) => h("button", { type: "button", "aria-pressed": String(v === tipo), onclick: () => { tipo = v; ir(); } }, t))),
      tipo === "rendimiento" && E.periodos.length ? selector(E.periodos.map((p) => [p.id, p.nombre]), periodo, (v) => { periodo = v; ir(); }, "Corte") : null);
  }

  async function pintar() {
    cont.replaceChildren(h("p.tenue", "Calculando…"));
    const cab = h("div", { style: "display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;border-bottom:2px solid var(--texto);padding-bottom:.5rem;margin-bottom:1rem" },
      h("strong", E.cuenta.nombre), h("span.tenue", `Emitido el ${fecha(hoyISO())}`));
    const secs = E.secciones.filter((s) => s.estado === "activo");

    if (tipo === "rendimiento") {
      if (!periodo) { cont.replaceChildren(h("div.vacio", "Define los cortes evaluativos.")); return; }
      const porSec = await Promise.all(secs.map(async (s) => ({ s, n: await q(sb.rpc("d360_notas_seccion", { p_grupo: s.id, p_periodo: periodo })) })));
      const todas = porSec.flatMap(({ s, n }) => n.map((x) => ({ ...x, seccion: s })));
      const conNota = todas.filter((x) => x.final != null);
      const rep = conNota.filter((x) => Number(x.final) < E.minima);
      const filasSec = porSec.map(({ s, n }) => { const c = n.filter((x) => x.final != null); const r = c.filter((x) => Number(x.final) < E.minima);
        return { s, prom: c.length ? c.reduce((t, x) => t + Number(x.final), 0) / c.length : null, aprob: c.length ? (1 - r.length / c.length) * 100 : null, rep: r.length, est: new Set(r.map((x) => x.estudiante_id)).size }; });
      const porAsig = {}; conNota.forEach((x) => { const nom = E.asignatura(x.asignatura_id)?.nombre || "—"; (porAsig[nom] ||= []).push(Number(x.final)); });
      const filasAsig = Object.entries(porAsig).map(([nom, v]) => ({ nom, prom: v.reduce((t, x) => t + x, 0) / v.length, aprob: (v.filter((x) => x >= E.minima).length / v.length) * 100, rep: v.filter((x) => x < E.minima).length }))
        .sort((a, b) => a.aprob - b.aprob);
      const riesgo = {}; rep.forEach((x) => { (riesgo[x.estudiante_id] ||= { sec: x.seccion, asig: [] }).asig.push(E.asignatura(x.asignatura_id)?.nombre); });
      const ids = Object.keys(riesgo);
      const est = ids.length ? await q(sb.from("estudiantes").select("id,nombres,apellidos,contacto_nombre,contacto_telefono").in("id", ids)) : [];
      const per = E.periodos.find((p) => p.id === periodo);
      cont.replaceChildren(cab,
        h("h2", `Rendimiento · ${per?.nombre}`),
        h("section.cifras",
          h("div.cifra", h("b", conNota.length ? (conNota.reduce((t, x) => t + Number(x.final), 0) / conNota.length).toFixed(1) : "—"), h("span", "promedio institucional")),
          h("div.cifra", h("b", conNota.length ? `${((1 - rep.length / conNota.length) * 100).toFixed(1)}%` : "—"), h("span", "de notas aprobadas")),
          h("div.cifra.alerta", h("b", ids.length), h("span", "estudiantes con asignaturas reprobadas")),
          h("div.cifra", h("b", rep.length), h("span", "notas reprobadas"))),
        h("h3", { style: "margin-top:1.5rem" }, "Por sección"),
        tabla([{ t: "Sección", v: (f) => h("a", { href: `#/calificaciones?seccion=${f.s.id}&periodo=${periodo}&vista=cuadro` }, f.s.nombre) },
          { t: "Promedio", v: (f) => notaCelda(f.prom, E.minima, E.cuali), clase: "derecha" }, { t: "Aprobación", v: (f) => barra(f.aprob, f.aprob < 85 ? "var(--correccion)" : "var(--aprobado)") },
          { t: "Estudiantes en riesgo", v: (f) => f.est, clase: "derecha" }], filasSec),
        h("h3", { style: "margin-top:1.5rem" }, "Por asignatura (todo el colegio)"),
        tabla([{ t: "Asignatura", v: (f) => f.nom }, { t: "Promedio", v: (f) => notaCelda(f.prom, E.minima, E.cuali), clase: "derecha" },
          { t: "Aprobación", v: (f) => barra(f.aprob, f.aprob < 85 ? "var(--correccion)" : "var(--aprobado)") }, { t: "Reprobados", v: (f) => f.rep, clase: "derecha" }], filasAsig, { vacio: "Sin notas en el corte." }),
        h("div.hoja-titulo", { style: "margin-top:1.5rem" }, h("h3", "Estudiantes en riesgo"),
          h("button.btn.btn-texto.btn-sm.no-imprimir", { onclick: () => descargarCSV(`riesgo-${per?.nombre}.csv`, [["Estudiante", "Sección", "Asignaturas reprobadas", "Responsable", "Teléfono"], ...est.map((e) => [nombreCompleto(e), riesgo[e.id].sec.nombre, riesgo[e.id].asig.join("; "), e.contacto_nombre, e.contacto_telefono])]) }, "Descargar CSV")),
        tabla([{ t: "Estudiante", v: (e) => h("a", { href: `#/estudiantes/${e.id}` }, nombreCompleto(e)) }, { t: "Sección", v: (e) => riesgo[e.id].sec.nombre },
          { t: "Reprobadas", v: (e) => riesgo[e.id].asig.join(", ") }, { t: "Contacto", v: (e) => [e.contacto_nombre, e.contacto_telefono].filter(Boolean).join(" · ") || "—" }],
          est.sort((a, b) => riesgo[b.id].asig.length - riesgo[a.id].asig.length), { vacio: "Ningún estudiante con asignaturas reprobadas." }));
      return;
    }

    if (tipo === "asistencia") {
      const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const filas = await Promise.all(secs.map(async (s) => { const r = await q(sb.rpc("d360_resumen_asistencia", { p_cuenta: ctx.id, p_grupo: s.id, p_desde: desde }));
        const t = r.reduce((a, x) => a + x.total, 0), p = r.reduce((a, x) => a + x.presentes + x.tardes + x.justificados, 0);
        return { s, pct: t ? (p / t) * 100 : null, aus: r.reduce((a, x) => a + x.ausentes, 0), tar: r.reduce((a, x) => a + x.tardes, 0), bajo: r.filter((x) => Number(x.porcentaje) < 85).length }; }));
      cont.replaceChildren(cab, h("h2", "Asistencia de los últimos 30 días"),
        tabla([{ t: "Sección", v: (f) => h("a", { href: `#/asistencia?grupo=${f.s.id}&vista=historial` }, f.s.nombre) }, { t: "Asistencia", v: (f) => barra(f.pct, f.pct != null && f.pct < 90 ? "var(--atencion)" : "var(--aprobado)") },
          { t: "Ausencias", v: (f) => f.aus, clase: "derecha" }, { t: "Tardanzas", v: (f) => f.tar, clase: "derecha" }, { t: "Estudiantes bajo 85%", v: (f) => f.bajo, clase: "derecha" }], filas));
      return;
    }

    if (tipo === "matricula") {
      const R = await q(sb.rpc("d360_resumen_colegio", { p_cuenta: ctx.id }));
      const ms = await q(sb.from("matriculas").select("grupo_id,descuento_pct,beca,estado").eq("cuenta_id", ctx.id).eq("anio", String(new Date().getFullYear())));
      const becas = ms.filter((m) => Number(m.descuento_pct) > 0 && m.estado === "activa");
      const tiposBeca = {}; becas.forEach((m) => (tiposBeca[m.beca || `${Number(m.descuento_pct)}%`] = (tiposBeca[m.beca || `${Number(m.descuento_pct)}%`] || 0) + 1));
      cont.replaceChildren(cab, h("h2", `Matrícula ${new Date().getFullYear()}`),
        h("section.cifras", h("div.cifra", h("b", R.matriculados_anio), h("span", "matriculados")), h("div.cifra", h("b", ms.filter((m) => m.estado === "retirada").length), h("span", "retiros")),
          h("div.cifra", h("b", becas.length), h("span", "con beca o descuento")), h("div.cifra", h("b", R.familias), h("span", "familias con acceso al portal"))),
        h("h3", { style: "margin-top:1.5rem" }, "Por grado"),
        tabla([{ t: "Nivel", v: (g) => g.nivel || "—" }, { t: "Grado", v: (g) => g.nombre }, { t: "Secciones", v: (g) => g.secciones, clase: "derecha" }, { t: "Estudiantes", v: (g) => g.estudiantes, clase: "derecha" }], R.por_grado || []),
        h("h3", { style: "margin-top:1.5rem" }, "Becas y descuentos"),
        tabla([{ t: "Tipo", v: ([k]) => k }, { t: "Estudiantes", v: ([, n]) => n, clase: "derecha" }], Object.entries(tiposBeca), { vacio: "Sin becas." }));
      return;
    }

    const anio = new Date().getFullYear();
    const inf = await q(sb.rpc("d360_informe_operativo", { p_cuenta: ctx.id, p_desde: `${anio}-01-01`, p_hasta: hoyISO() }));
    const total = inf.ingresos_mes.reduce((s, x) => s + Number(x.total), 0);
    const max = Math.max(1, ...inf.ingresos_mes.map((x) => Number(x.total)));
    cont.replaceChildren(cab, h("h2", `Finanzas escolares ${anio}`),
      h("section.cifras", h("div.cifra", h("b", M(total)), h("span", "cobrado en el año")),
        h("div.cifra.alerta", h("b", M(inf.morosos.reduce((s, x) => s + Number(x.saldo), 0))), h("span", `vencido · ${inf.morosos.length} estudiantes`)),
        h("div.cifra", h("b", M(inf.por_vencer)), h("span", "vence en 15 días"))),
      h("h3", { style: "margin-top:1.5rem" }, "Ingresos por mes"),
      tabla([{ t: "Mes", v: (x) => x.mes }, { t: "", v: (x) => barra((Number(x.total) / max) * 100) }, { t: "Total", v: (x) => h("strong", M(x.total)), clase: "derecha" }], inf.ingresos_mes, { vacio: "Sin pagos." }),
      h("h3", { style: "margin-top:1.5rem" }, "Familias con pagos vencidos"),
      tabla([{ t: "Estudiante", v: (x) => h("a", { href: `#/finanzas?estudiante=${x.id}` }, x.nombre) }, { t: "Contacto", v: (x) => x.contacto_telefono || x.telefono || "—" },
        { t: "Desde", v: (x) => fecha(x.desde) }, { t: "Saldo", v: (x) => h("strong.nota-baja", M(x.saldo)), clase: "derecha" }], inf.morosos, { vacio: "Sin pagos vencidos." }));
  }
  controles();
  pintar();
}
