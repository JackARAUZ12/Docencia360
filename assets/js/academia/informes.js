// Informes de la academia: ingresos, matrículas, cursos más demandados,
// morosidad, asistencia y rendimiento por grupo.
import { sb, q } from "../core/sb.js";
import { h, tabla, fecha, hoyISO, sumarDias, dinero, nombreCompleto, nota, descargarCSV, imprimir } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesTxt = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Barra horizontal simple (sin librerías): valor relativo al máximo */
const barra = (v, max, clase = "") => h("div", { style: "display:flex;align-items:center;gap:.5rem;min-width:140px" },
  h("div", { style: `flex:1;height:10px;background:var(--papel-2);border-radius:5px;overflow:hidden` },
    h("div", { className: clase, style: `width:${max ? Math.round((v / max) * 100) : 0}%;height:100%;background:var(--acento);border-radius:5px` })));

export async function render(el, ctx, { params }) {
  let tipo = params.get("tipo") || (ctx.esFinanzas ? "financiero" : "academico");
  let desde = params.get("desde") || sumarDias(hoyISO(), -180).slice(0, 8) + "01";
  let hasta = params.get("hasta") || hoyISO();
  const M = (n) => dinero(n, ctx.cuenta.moneda);
  const cont = h("div");

  const tipos = [ctx.esFinanzas && ctx.f("finanzas") ? ["financiero", "Ingresos y cobros"] : null, ["matriculas", "Matrículas y cursos"], ctx.esGestor ? ["academico", "Rendimiento y asistencia"] : null].filter(Boolean);
  if (!tipos.some(([t]) => t === tipo)) tipo = tipos[0][0];
  const seg = h("div.segmentos", { role: "group" }, tipos.map(([v, t]) => h("button", { type: "button", "aria-pressed": String(v === tipo),
    onclick: (e) => { tipo = v; seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); pintar(); } }, t)));
  const fDesde = h("input", { type: "date", value: desde, "aria-label": "Desde", style: "width:auto", onchange: (e) => { desde = e.target.value; pintar(); } });
  const fHasta = h("input", { type: "date", value: hasta, "aria-label": "Hasta", style: "width:auto", onchange: (e) => { hasta = e.target.value; pintar(); } });

  el.append(ctx.titulo("Informes", h("button.btn.btn-sec", { onclick: () => imprimir(cont) }, h("span", { html: ICONOS.imprimir }), "Imprimir / PDF")),
    h("div", { style: "display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center" }, seg, h("span.tenue", "Del"), fDesde, h("span.tenue", "al"), fHasta),
    cont);

  async function pintar() {
    cont.replaceChildren(h("p.tenue", "Calculando…"));
    const cab = h("div", { style: "display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;border-bottom:2px solid var(--texto);padding-bottom:.5rem;margin-bottom:1rem" },
      h("strong", ctx.cuenta.nombre), h("span.tenue", `Período: ${fecha(desde)} – ${fecha(hasta)} · emitido ${fecha(hoyISO())}`));

    if (tipo === "academico") {
      const grupos = (await ctx.datos.grupos()).filter((g) => g.estado === "activo");
      const [asis, filas] = await Promise.all([
        q(sb.rpc("d360_resumen_asistencia", { p_cuenta: ctx.id, p_desde: desde, p_hasta: hasta })),
        Promise.all(grupos.map(async (g) => {
          const [p, a] = await Promise.all([q(sb.rpc("d360_promedios_grupo", { p_grupo: g.id })), q(sb.rpc("d360_resumen_asistencia", { p_cuenta: ctx.id, p_grupo: g.id, p_desde: desde, p_hasta: hasta }))]);
          const con = p.filter((x) => x.promedio != null);
          const tot = a.reduce((s, x) => s + x.total, 0), pres = a.reduce((s, x) => s + x.presentes + x.tardes + x.justificados, 0);
          return { g, n: p.length, prom: con.length ? con.reduce((s, x) => s + Number(x.promedio), 0) / con.length : null,
                   bajo: con.filter((x) => Number(x.promedio) < 60).length, asis: tot ? Math.round((pres / tot) * 1000) / 10 : null };
        })),
      ]);
      const est = await ctx.datos.estudiantes();
      const E = Object.fromEntries(est.map((e) => [e.id, e]));
      const riesgo = asis.filter((a) => Number(a.porcentaje) < 80).sort((a, b) => a.porcentaje - b.porcentaje);
      cont.replaceChildren(cab,
        h("h2", "Rendimiento por grupo"),
        tabla([
          { t: "Grupo", v: (f) => h("a", { href: `#/calificaciones?grupo=${f.g.id}` }, f.g.nombre) },
          { t: "Estudiantes", v: (f) => f.n, clase: "derecha" },
          { t: "Promedio", v: (f) => nota(f.prom), clase: "derecha" },
          { t: "Bajo 60", v: (f) => f.bajo ? h("span.nota-baja", f.bajo) : 0, clase: "derecha" },
          { t: "Asistencia", v: (f) => f.asis == null ? "—" : `${f.asis}%`, clase: "derecha" },
        ], filas, { vacio: "No hay grupos activos." }),
        h("h2", { style: "margin-top:1.5rem" }, "Estudiantes con asistencia menor a 80%"),
        tabla([
          { t: "Estudiante", v: (a) => h("a", { href: `#/estudiantes/${a.estudiante_id}` }, nombreCompleto(E[a.estudiante_id] || {})) },
          { t: "Ausencias", v: (a) => a.ausentes, clase: "derecha" },
          { t: "Tardanzas", v: (a) => a.tardes, clase: "derecha" },
          { t: "Asistencia", v: (a) => h("span.nota-baja", `${a.porcentaje}%`), clase: "derecha" },
          { t: "Contacto", v: (a) => E[a.estudiante_id]?.contacto_telefono || E[a.estudiante_id]?.telefono || "—" },
        ], riesgo, { vacio: "Ningún estudiante por debajo de 80% en el período." }));
      return;
    }

    const inf = await q(sb.rpc("d360_informe_operativo", { p_cuenta: ctx.id, p_desde: desde, p_hasta: hasta }));
    if (tipo === "financiero") {
      const total = inf.ingresos_mes.reduce((s, x) => s + Number(x.total), 0);
      const maxMes = Math.max(0, ...inf.ingresos_mes.map((x) => Number(x.total)));
      const totalMora = inf.morosos.reduce((s, x) => s + Number(x.saldo), 0);
      cont.replaceChildren(cab,
        h("section.cifras",
          h("div.cifra", h("b", M(total)), h("span", "ingresos del período")),
          h("div.cifra", h("b", M(inf.ingresos_mes.length ? total / inf.ingresos_mes.length : 0)), h("span", "promedio mensual")),
          h("div.cifra.alerta", h("b", M(totalMora)), h("span", `vencido · ${inf.morosos.length} estudiantes`)),
          h("div.cifra", h("b", M(inf.por_vencer)), h("span", "vence en 15 días"))),
        h("h2", { style: "margin-top:1.5rem" }, "Ingresos por mes"),
        tabla([
          { t: "Mes", v: (x) => mesTxt(x.mes) },
          { t: "", v: (x) => barra(Number(x.total), maxMes) },
          { t: "Pagos", v: (x) => x.pagos, clase: "derecha" },
          { t: "Total", v: (x) => h("strong", M(x.total)), clase: "derecha" },
        ], inf.ingresos_mes, { vacio: "Sin pagos en el período." }),
        h("h2", { style: "margin-top:1.5rem" }, "Por forma de pago"),
        tabla([{ t: "Forma", v: ([k]) => k }, { t: "Total", v: ([, v]) => M(v), clase: "derecha" }], Object.entries(inf.metodos), { vacio: "—" }),
        h("div.hoja-titulo", { style: "margin-top:1.5rem" }, h("h2", "Pagos pendientes vencidos"),
          h("button.btn.btn-texto.btn-sm.no-imprimir", { onclick: () => descargarCSV("morosidad.csv", [["Estudiante", "Teléfono", "Tel. responsable", "Cobros", "Vencido desde", "Saldo"], ...inf.morosos.map((x) => [x.nombre, x.telefono, x.contacto_telefono, x.cobros, x.desde, x.saldo])]) }, "Descargar CSV")),
        tabla([
          { t: "Estudiante", v: (x) => h("a", { href: `#/finanzas?estudiante=${x.id}` }, x.nombre) },
          { t: "Contacto", v: (x) => x.contacto_telefono || x.telefono || "—" },
          { t: "Desde", v: (x) => fecha(x.desde) },
          { t: "Cobros", v: (x) => x.cobros, clase: "derecha" },
          { t: "Saldo", v: (x) => h("strong.nota-baja", M(x.saldo)), clase: "derecha" },
        ], inf.morosos, { vacio: "No hay pagos vencidos." }));
      return;
    }

    const maxCurso = Math.max(0, ...inf.cursos.map((c) => Number(c.total)));
    cont.replaceChildren(cab,
      h("h2", "Cursos más demandados"),
      tabla([
        { t: "Curso", v: (c) => c.nombre },
        { t: "", v: (c) => barra(Number(c.total), maxCurso) },
        { t: "Activas", v: (c) => c.activas, clase: "derecha" },
        { t: "Completadas", v: (c) => c.completadas, clase: "derecha" },
        { t: "Retiros", v: (c) => c.retiradas, clase: "derecha" },
        { t: "Total histórico", v: (c) => h("strong", c.total), clase: "derecha" },
      ], inf.cursos, { vacio: "Sin cursos registrados." }),
      h("h2", { style: "margin-top:1.5rem" }, "Matrículas por mes"),
      tabla([
        { t: "Mes", v: (x) => mesTxt(x.mes) },
        { t: "Nuevas", v: (x) => x.nuevas, clase: "derecha" },
        { t: "De ellas, ya retiradas", v: (x) => x.retiradas, clase: "derecha" },
        { t: "Retención", v: (x) => x.nuevas ? `${Math.round(((x.nuevas - x.retiradas) / x.nuevas) * 100)}%` : "—", clase: "derecha" },
      ], inf.matriculas_mes, { vacio: "Sin matrículas en el período." }));
  }
  pintar();
}
