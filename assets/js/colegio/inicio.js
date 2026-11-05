// Inicio del colegio: indicadores institucionales, lo que pasa hoy y alertas.
import { sb, q } from "../core/sb.js";
import { h, tabla, hoyISO, diaLargo, fechaCorta, hora, dinero, DIAS } from "../core/ui.js";
import { estructura, notaCelda } from "./util.js";

export async function render(el, ctx) {
  const hoy = hoyISO();
  const dia = ((new Date(hoy + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
  const M = (v) => dinero(v, ctx.cuenta.moneda);
  const [E, R, coms, eventos] = await Promise.all([
    estructura(ctx), q(sb.rpc("d360_resumen_colegio", { p_cuenta: ctx.id })),
    q(sb.from("comunicados").select("id,titulo,publicado,audiencia").eq("cuenta_id", ctx.id).order("publicado", { ascending: false }).limit(3)),
    q(sb.from("eventos").select("*").eq("cuenta_id", ctx.id).gte("fecha", hoy).order("fecha").limit(4)),
  ]);
  const nombre = ctx.cuenta.miembro_nombre.replace(/^(Lic\.|Prof\.|Profa\.|Sr\.|Sra\.)\s*/, "").split(" ")[0];

  // Vista del docente: sus clases de hoy y sus secciones
  if (ctx.esDocente) {
    const mias = await q(sb.from("horarios").select("*").eq("cuenta_id", ctx.id).eq("miembro_id", ctx.cuenta.miembro_id).eq("dia", dia).order("hora_inicio"));
    const conLista = new Set((await q(sb.from("asistencias").select("grupo_id").eq("cuenta_id", ctx.id).eq("fecha", hoy))).map((a) => a.grupo_id));
    const secs = E.misSecciones();
    const guia = secs.find((s) => E.guiaDe(s.id)?.miembro_id === ctx.cuenta.miembro_id);
    el.append(
      h("div.p-titulo", h("div", h("p.tenue", { style: "margin:0" }, diaLargo(hoy)), h("h1", `Buen día, ${nombre}`))),
      h("section.cifras",
        h("div.cifra", h("b", secs.length), h("span", "secciones a mi cargo")),
        h("div.cifra", h("b", mias.length), h("span", "clases hoy")),
        h("div.cifra", h("b", R.periodo?.nombre || "—"), h("span", "corte en curso")),
        guia ? h("div.cifra", h("b", guia.nombre), h("span", "soy maestro guía")) : null),
      h("div.dos-col", { style: "margin-top:1.25rem" },
        h("section.hoja", h("h2", "Mis clases de hoy"),
          mias.length ? h("ul.agenda", mias.map((c) => h("li", h("span.h", hora(c.hora_inicio)),
            h("div", h("strong", E.asignatura(c.asignatura_id)?.nombre), " · ", E.seccion(c.grupo_id)?.nombre,
              h("div", { style: "margin-top:.35rem;display:flex;gap:.4rem;flex-wrap:wrap" },
                conLista.has(c.grupo_id) ? h("span.estado.ok", "Lista tomada") : h("a.btn.btn-sm", { href: `#/asistencia?grupo=${c.grupo_id}` }, "Pasar lista"),
                h("a.btn.btn-sec.btn-sm", { href: `#/calificaciones?seccion=${c.grupo_id}&asignatura=${c.asignatura_id}` }, "Notas")))))) : h("p.suave", "Hoy no tienes clases en el horario.")),
        h("section.hoja", h("h2", "Comunicados recientes"), coms.length ? h("ul.lista", coms.map((c) => h("li", h("div.crece", h("div.titulo", c.titulo), h("div.tenue", fechaCorta(c.publicado)))))) : h("p.suave", "Sin comunicados."))));
    return;
  }

  const alertas = [];
  if (R.docentes_ausentes_hoy) alertas.push(["ojo", `${R.docentes_ausentes_hoy} docente(s) ausentes hoy.`, "#/docentes?vista=asistencia", "Ver"]);
  const sinLista = R.secciones - (R.secciones_con_lista_hoy || 0);
  if (dia <= 5 && sinLista > 0 && new Date().getHours() >= 9) alertas.push(["ojo", `${sinLista} sección(es) sin lista tomada hoy.`, "#/asistencia", "Revisar"]);
  if (R.estudiantes_en_riesgo) alertas.push(["mal", `${R.estudiantes_en_riesgo} estudiante(s) con asignaturas reprobadas en el ${R.periodo?.nombre}.`, "#/informes?tipo=rendimiento", "Ver informe"]);
  if (ctx.esFinanzas && Number(R.vencido_cobro) > 0) alertas.push(["mal", `${R.familias_morosas} familia(s) con pagos vencidos por ${M(R.vencido_cobro)}.`, "#/finanzas", "Cobrar"]);
  const sinDoc = E.secciones.reduce((t, s) => t + E.planDe(s.grado_id).filter((a) => !E.docenteDe(s.id, a.id)).length, 0);
  if (ctx.esGestor && sinDoc) alertas.push(["info", `${sinDoc} asignatura(s) sin docente asignado.`, "#/estructura?vista=docentes", "Asignar"]);

  el.append(
    h("div.p-titulo", h("div", h("p.tenue", { style: "margin:0" }, `${diaLargo(hoy)} · ${R.periodo?.nombre || "sin corte en curso"}`), h("h1", `Buen día, ${nombre}`))),
    E.grados.length ? null : h("section.hoja", { style: "margin-bottom:1rem" }, h("h2", "Pon en marcha tu colegio"),
      h("ol.lista", [["Completa los datos del colegio y los cortes evaluativos", "#/institucion"], ["Crea niveles, grados (con aranceles) y secciones", "#/estructura"],
        ["Registra a los docentes y asígnales asignaturas", "#/docentes"], ["Matricula a los estudiantes", "#/matriculas"], ["Arma los horarios", "#/horarios"]]
        .map(([t, href], i) => h("li", h("span.estado", `Paso ${i + 1}`), h("div.crece", h("div.titulo", t)), h("a.btn.btn-sm", { href }, "Ir"))))),
    h("section.cifras",
      h("div.cifra", h("b", R.estudiantes_activos), h("span", `estudiantes · ${R.matriculados_anio} matriculados`)),
      h("div.cifra", h("b", R.docentes), h("span", `docentes · ${R.personal} administrativos`)),
      h("div.cifra", h("b", `${R.grados} / ${R.secciones}`), h("span", "grados / secciones")),
      h("div.cifra", h("b", R.asistencia_hoy == null ? "—" : `${R.asistencia_hoy}%`), h("span", `asistencia hoy · ${R.asistencia_30d ?? "—"}% en 30 días`)),
      h("div.cifra", h("b", R.promedio_general == null ? "—" : Number(R.promedio_general).toFixed(1)), h("span", `promedio del ${R.periodo?.nombre || "corte"}`)),
      ctx.esFinanzas && ctx.f("finanzas") ? [
        h("div.cifra", h("b", M(R.ingresos_mes)), h("span", "cobrado este mes")),
        h("div.cifra" + (Number(R.vencido_cobro) ? ".alerta" : ""), h("b", M(R.vencido_cobro)), h("span", "colegiaturas vencidas"))] : null),
    alertas.length ? h("section", { style: "margin-top:1.25rem" }, alertas.map(([t, x, href, b]) => h(`div.aviso.${t}`, x, " ", h("a", { href }, b)))) : null,
    h("div.dos-col", { style: "margin-top:1.25rem" },
      h("section.hoja", h("div.hoja-titulo", h("h2", "Matrícula por grado"), h("a", { href: "#/matriculas" }, "Matrícula")),
        tabla([
          { t: "Grado", v: (g) => [h("strong", g.nombre), h("div.tenue", g.nivel || "")] },
          { t: "Secciones", v: (g) => g.secciones, clase: "derecha" },
          { t: "Estudiantes", v: (g) => g.estudiantes, clase: "derecha" },
        ], R.por_grado || [], { vacio: "Sin grados." })),
      h("div",
        h("section.hoja", h("div.hoja-titulo", h("h2", "Comunicados"), h("a", { href: "#/comunicados" }, "Ver todos")),
          coms.length ? h("ul.lista", coms.map((c) => h("li", h("div.crece", h("div.titulo", c.titulo), h("div.tenue", `${fechaCorta(c.publicado)} · ${{ todos: "Toda la comunidad", personal: "Personal", tutores: "Familias", grupo: "Una sección" }[c.audiencia]}`))))) : h("p.suave", "Sin comunicados.")),
        h("section.hoja", h("h2", "Próximas fechas"),
          eventos.length ? h("ul.lista", eventos.map((e) => h("li", h("span.estado.info", fechaCorta(e.fecha)), h("div.crece", h("div.titulo", e.titulo))))) : h("p.suave", "Sin fechas próximas.")))),
  );
}
