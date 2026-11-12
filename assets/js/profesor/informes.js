// Informes: rendimiento por grupo y por estudiante, imprimibles o como PDF.
import { sb, q } from "../core/sb.js";
import { h, tabla, fecha, fechaCorta, hoyISO, nombreCompleto, nota, descargarCSV } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";

export async function render(el, ctx, { params }) {
  const [grupos, estudiantes] = await Promise.all([ctx.datos.grupos(), ctx.datos.estudiantes()]);
  let tipo = params.get("estudiante") ? "estudiante" : "grupo";
  let grupoId = params.get("grupo") || grupos.find((g) => g.estado === "activo")?.id || grupos[0]?.id;
  let estId = params.get("estudiante") || estudiantes.find((e) => e.estado === "activo")?.id;
  const cont = h("div");

  const pdf = ctx.f("reportes_pdf");
  const botonImprimir = pdf
    ? h("button.btn.btn-sec", { onclick: () => print() }, h("span", { html: ICONOS.imprimir }), "Imprimir / guardar PDF")
    : ctx.mejora("Imprimir / PDF");

  const selTipo = h("div.segmentos", { role: "group" }, [["grupo", "Por grupo"], ["estudiante", "Por estudiante"]].map(([v, t]) =>
    h("button", { type: "button", "aria-pressed": String(v === tipo), onclick: (e) => { tipo = v; selTipo.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); controles(); pintar(); } }, t)));
  const zonaSel = h("div", { style: "flex:1;min-width:220px;max-width:360px" });
  function controles() {
    zonaSel.replaceChildren(tipo === "grupo"
      ? h("select", { "aria-label": "Grupo", onchange: (e) => { grupoId = e.target.value; pintar(); } }, grupos.map((g) => h("option", { value: g.id, selected: g.id === grupoId }, g.nombre)))
      : h("select", { "aria-label": "Estudiante", onchange: (e) => { estId = e.target.value; pintar(); } }, estudiantes.map((e) => h("option", { value: e.id, selected: e.id === estId }, nombreCompleto(e) + (e.estado !== "activo" ? ` (${e.estado})` : "")))));
  }
  controles();

  el.append(ctx.titulo("Informes", botonImprimir),
    h("div.no-imprimir", { style: "display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem" }, selTipo, zonaSel), cont);

  const cabecera = (titulo, sub) => h("div.cab",
    h("div", h("strong", ctx.cuenta.nombre), h("div.tenue", ctx.cuenta.miembro_nombre)),
    h("div", { style: "text-align:right" }, h("strong", titulo), h("div.tenue", sub || `Emitido el ${fecha(hoyISO())}`)));

  async function pintar() {
    cont.replaceChildren(h("p.tenue", "Preparando informe…"));
    if (tipo === "grupo") {
      if (!grupoId) { cont.replaceChildren(h("div.vacio", "Aún no tienes grupos.")); return; }
      const g = grupos.find((x) => x.id === grupoId);
      const [miembros, proms, asis, evals] = await Promise.all([
        q(sb.from("grupo_estudiantes").select("estudiante_id, estudiantes(nombres,apellidos)").eq("grupo_id", grupoId).eq("estado", "activo")),
        q(sb.rpc("d360_promedios_grupo", { p_grupo: grupoId })),
        q(sb.rpc("d360_resumen_asistencia", { p_cuenta: ctx.id, p_grupo: grupoId })),
        q(sb.from("evaluaciones").select("id").eq("grupo_id", grupoId)),
      ]);
      const P = Object.fromEntries(proms.map((p) => [p.estudiante_id, p]));
      const A = Object.fromEntries(asis.map((a) => [a.estudiante_id, a]));
      miembros.sort((a, b) => nombreCompleto(a.estudiantes).localeCompare(nombreCompleto(b.estudiantes)));
      const conProm = proms.filter((p) => p.promedio != null);
      const promGrupo = conProm.length ? conProm.reduce((s, p) => s + Number(p.promedio), 0) / conProm.length : null;
      const riesgo = (id) => (P[id]?.promedio != null && Number(P[id].promedio) < 60) || (A[id]?.porcentaje != null && Number(A[id].porcentaje) < 80);
      cont.replaceChildren(h("div.hoja.informe",
        cabecera(`Informe del grupo ${g.nombre}`),
        h("section.cifras",
          h("div.cifra", h("b", miembros.length), h("span", "estudiantes")),
          h("div.cifra", h("b", evals.length), h("span", "evaluaciones")),
          h("div.cifra", h("b", promGrupo == null ? "—" : promGrupo.toFixed(1)), h("span", "promedio del grupo")),
          h("div.cifra.alerta", h("b", miembros.filter((m) => riesgo(m.estudiante_id)).length), h("span", "en riesgo"))),
        h("div", { style: "margin-top:1rem" }, tabla([
          { t: "Estudiante", v: (m) => nombreCompleto(m.estudiantes) },
          { t: "Calificadas", v: (m) => `${P[m.estudiante_id]?.calificadas ?? 0}/${P[m.estudiante_id]?.total_evaluaciones ?? evals.length}`, clase: "derecha" },
          { t: "Asistencia", v: (m) => A[m.estudiante_id]?.porcentaje == null ? "—" : `${A[m.estudiante_id].porcentaje}%`, clase: "derecha" },
          { t: "Ausencias", v: (m) => A[m.estudiante_id]?.ausentes ?? 0, clase: "derecha" },
          { t: "Promedio", v: (m) => nota(P[m.estudiante_id]?.promedio), clase: "derecha" },
          { t: "Situación", v: (m) => P[m.estudiante_id]?.promedio == null ? h("span.tenue", "Sin notas") : riesgo(m.estudiante_id) ? h("span.estado.mal", "En riesgo") : h("span.estado.ok", "Al día") },
        ], miembros)),
        h("p.tenue", { style: "margin-top:1rem" }, "En riesgo: promedio menor a 60 o asistencia menor a 80%."),
        ctx.f("exportar") ? h("button.btn.btn-texto.btn-sm.no-imprimir", { onclick: () => descargarCSV(`informe-${g.nombre}.csv`,
          [["Estudiante", "Calificadas", "Asistencia %", "Ausencias", "Promedio"],
           ...miembros.map((m) => [nombreCompleto(m.estudiantes), P[m.estudiante_id]?.calificadas ?? 0, A[m.estudiante_id]?.porcentaje ?? "", A[m.estudiante_id]?.ausentes ?? 0, P[m.estudiante_id]?.promedio ?? ""])]) }, "Descargar CSV") : ctx.mejora("Exportar a Excel")));
      return;
    }

    if (!estId) { cont.replaceChildren(h("div.vacio", "Aún no tienes estudiantes.")); return; }
    const e = estudiantes.find((x) => x.id === estId);
    const [insc, notas, asis, obs] = await Promise.all([
      q(sb.from("grupo_estudiantes").select("grupo_id, estado, grupos(nombre)").eq("estudiante_id", estId)),
      q(sb.from("calificaciones").select("puntaje, evaluaciones(titulo,tipo,fecha,peso,puntaje_max,grupo_id)").eq("estudiante_id", estId)),
      q(sb.rpc("d360_resumen_asistencia", { p_cuenta: ctx.id }).eq("estudiante_id", estId)),
      q(sb.from("observaciones").select("*").eq("estudiante_id", estId).eq("tipo", "academica").order("creado", { ascending: false }).limit(5)),
    ]);
    const proms = await Promise.all(insc.map(async (i) => ({ ...i, p: (await q(sb.rpc("d360_promedios_grupo", { p_grupo: i.grupo_id }))).find((x) => x.estudiante_id === estId) })));
    const a = asis[0];
    cont.replaceChildren(h("div.hoja.informe",
      cabecera("Informe de rendimiento"),
      h("h2", nombreCompleto(e)),
      h("section.cifras",
        h("div.cifra", h("b", a?.porcentaje == null ? "—" : `${a.porcentaje}%`), h("span", "asistencia")),
        h("div.cifra", h("b", a?.ausentes ?? 0), h("span", "ausencias")),
        h("div.cifra", h("b", a?.tardes ?? 0), h("span", "tardanzas"))),
      proms.map((g) => {
        const ns = notas.filter((n) => n.evaluaciones?.grupo_id === g.grupo_id).sort((x, y) => x.evaluaciones.fecha.localeCompare(y.evaluaciones.fecha));
        return h("section", { style: "margin-top:1.25rem" },
          h("div.hoja-titulo", h("h3", g.grupos?.nombre + (g.estado !== "activo" ? " (retirado)" : "")), h("span", "Promedio: ", nota(g.p?.promedio))),
          tabla([
            { t: "Fecha", v: (n) => fechaCorta(n.evaluaciones.fecha) },
            { t: "Evaluación", v: (n) => n.evaluaciones.titulo },
            { t: "Peso", v: (n) => Number(n.evaluaciones.peso) ? `${Number(n.evaluaciones.peso)}%` : "—", clase: "derecha" },
            { t: "Nota", v: (n) => n.puntaje == null ? "—" : `${Number(n.puntaje)} / ${Number(n.evaluaciones.puntaje_max)}`, clase: "derecha" },
          ], ns, { vacio: "Sin calificaciones en este grupo." }));
      }),
      obs.length ? h("section", { style: "margin-top:1.25rem" }, h("h3", "Observaciones del docente"), h("ul", obs.map((o) => h("li", o.texto)))) : null,
      h("p", { style: "margin-top:3rem;display:flex;justify-content:space-between;gap:2rem;flex-wrap:wrap" },
        h("span", "_______________________", h("br"), ctx.cuenta.miembro_nombre),
        h("span", "_______________________", h("br"), "Firma del responsable"))));
  }
  pintar();
}
