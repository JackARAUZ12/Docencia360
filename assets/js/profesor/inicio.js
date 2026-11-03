// Inicio del profesor: qué toca hoy, qué está pendiente y cómo va todo.
import { sb, q } from "../core/sb.js";
import { h, hoyISO, sumarDias, diaLargo, fechaCorta, hora, nota } from "../core/ui.js";

export async function render(el, ctx) {
  const hoy = hoyISO();
  const diaSemana = ((new Date(hoy + "T00:00:00Z").getUTCDay() + 6) % 7) + 1; // 1 = lunes
  const [resumen, grupos, horariosHoy, evals, eventos, notifs, recientes] = await Promise.all([
    q(sb.rpc("d360_resumen_panel", { p_cuenta: ctx.id })),
    ctx.datos.grupos(),
    q(sb.from("horarios").select("hora_inicio,hora_fin,grupo_id,grupos(nombre,estado)").eq("cuenta_id", ctx.id).eq("dia", diaSemana).order("hora_inicio")),
    q(sb.from("evaluaciones").select("id,titulo,tipo,fecha,grupo_id,grupos(nombre)").eq("cuenta_id", ctx.id).gte("fecha", hoy).lte("fecha", sumarDias(hoy, 7)).order("fecha")),
    q(sb.from("eventos").select("*").eq("cuenta_id", ctx.id).gte("fecha", hoy).lte("fecha", sumarDias(hoy, 7)).order("fecha")),
    q(sb.from("notificaciones").select("*").eq("cuenta_id", ctx.id).eq("leida", false).order("creado", { ascending: false }).limit(5)),
    q(sb.from("estudiantes").select("id,nombres,apellidos,creado").eq("cuenta_id", ctx.id).order("creado", { ascending: false }).limit(4)),
  ]);

  const activos = grupos.filter((g) => g.estado === "activo");
  const nombre = ctx.cuenta.miembro_nombre.split(" ")[0];

  // Cuenta nueva: guía de primeros pasos en lugar de un panel vacío
  if (!activos.length || !resumen.estudiantes_activos) {
    const pasos = [
      [ctx.datos && (await ctx.datos.asignaturas()).length > 0, "Crea tu primera asignatura o curso", "#/cursos"],
      [activos.length > 0, "Crea un grupo y ponle horario", "#/grupos"],
      [resumen.estudiantes_activos > 0, "Registra a tus estudiantes", "#/estudiantes"],
      [false, "Pasa lista en tu primera clase", "#/asistencia"],
    ];
    el.append(
      h("h1", `Hola, ${nombre}`),
      h("p.suave", "Deja listo tu espacio en cuatro pasos. Toma pocos minutos."),
      h("ol.lista", pasos.map(([hecho, texto, href], i) => h("li",
        h("span.estado" + (hecho ? ".ok" : ""), hecho ? "Listo" : `Paso ${i + 1}`),
        h("div.crece", h("div.titulo", texto)),
        hecho ? null : h("a.btn.btn-sm", { href }, "Empezar")))),
    );
    return;
  }

  // Grupos con clase hoy sin asistencia registrada
  const { data: asisHoy } = await sb.from("asistencias").select("grupo_id").eq("cuenta_id", ctx.id).eq("fecha", hoy);
  const conLista = new Set((asisHoy || []).map((a) => a.grupo_id));
  const clasesHoy = horariosHoy.filter((x) => x.grupos?.estado === "activo");
  const sinLista = [...new Map(clasesHoy.filter((c) => !conLista.has(c.grupo_id)).map((c) => [c.grupo_id, c])).values()];

  el.append(
    h("div.p-titulo", h("div", h("p.tenue", { style: "margin:0" }, diaLargo(hoy)), h("h1", `Hola, ${nombre}`))),
    notifs.length ? h("div", notifs.map((n) => h("div.aviso.ojo", h("strong", n.titulo + ". "), n.cuerpo || "",
      n.enlace ? [" ", h("a", { href: n.enlace }, "Ver")] : null,
      " ", h("button.btn.btn-texto.btn-sm", { onclick: async (e) => { await sb.from("notificaciones").update({ leida: true }).eq("id", n.id); e.target.closest(".aviso").remove(); } }, "Entendido")))) : null,
    h("section.cifras", { "aria-label": "Resumen" },
      h("div.cifra", h("b", resumen.estudiantes_activos), h("span", "estudiantes activos")),
      h("div.cifra", h("b", resumen.grupos_activos), h("span", "grupos activos")),
      h("div.cifra", h("b", resumen.asistencia_30d == null ? "—" : `${resumen.asistencia_30d}%`), h("span", "asistencia, últimos 30 días")),
      h("div.cifra" + (resumen.evaluaciones_sin_nota ? ".alerta" : ""), h("b", resumen.evaluaciones_sin_nota), h("span", "evaluaciones sin calificar"))),
    h("div.dos-col", { style: "margin-top:1.5rem" },
      h("section.hoja",
        h("div.hoja-titulo", h("h2", "Hoy")),
        clasesHoy.length || eventos.some((e) => e.fecha === hoy) || evals.some((e) => e.fecha === hoy)
          ? h("ul.agenda",
              clasesHoy.map((c) => h("li", h("span.h", `${hora(c.hora_inicio)}`),
                h("div", h("strong", c.grupos.nombre), h("div.tenue", `${hora(c.hora_inicio)} – ${hora(c.hora_fin)}`),
                  conLista.has(c.grupo_id) ? h("span.estado.ok", "Lista tomada")
                    : h("a.btn.btn-sm", { href: `#/asistencia?grupo=${c.grupo_id}`, style: "margin-top:.35rem" }, "Pasar lista")))),
              eventos.filter((e) => e.fecha === hoy).map((e) => h("li", h("span.h", hora(e.hora_inicio) || "Día"), h("div", h("strong", e.titulo), h("div.tenue", e.tipo)))),
              evals.filter((e) => e.fecha === hoy).map((e) => h("li", h("span.h", "—"), h("div", h("strong", e.titulo), h("div.tenue", `${e.tipo} · ${e.grupos?.nombre}`)))))
          : h("p.suave", "No tienes clases programadas para hoy."),
        sinLista.length > 1 ? h("p.tenue", `${sinLista.length} grupos de hoy aún sin lista.`) : null),
      h("section.hoja",
        h("div.hoja-titulo", h("h2", "Próximos 7 días")),
        evals.filter((e) => e.fecha > hoy).length || eventos.filter((e) => e.fecha > hoy).length
          ? h("ul.lista", [...evals.filter((e) => e.fecha > hoy).map((e) => ({ f: e.fecha, t: e.titulo, d: `${e.tipo === "tarea" ? "Entrega de tarea" : "Evaluación"} · ${e.grupos?.nombre}`, href: `#/calificaciones?grupo=${e.grupo_id}` })),
                           ...eventos.filter((e) => e.fecha > hoy).map((e) => ({ f: e.fecha, t: e.titulo, d: e.tipo, href: "#/calendario" }))]
              .sort((a, b) => a.f.localeCompare(b.f))
              .map((x) => h("li", h("span.estado.info", fechaCorta(x.f)), h("div.crece", h("a.titulo", { href: x.href, style: "color:inherit" }, x.t), h("div.tenue", x.d)))))
          : h("p.suave", "Nada programado. Puedes agregar evaluaciones desde Calificaciones."))),
    h("section.hoja", { style: "margin-top:1rem" },
      h("div.hoja-titulo", h("h2", "Promedio por grupo"), h("a", { href: "#/informes" }, "Ver informes")),
      h("div", { id: "promedios" }, h("p.tenue", "Calculando…"))),
    recientes.length ? h("section.hoja", { style: "margin-top:1rem" },
      h("div.hoja-titulo", h("h2", "Últimos estudiantes registrados")),
      h("ul.lista", recientes.map((e) => h("li", h("div.crece", h("a.titulo", { href: `#/estudiantes/${e.id}`, style: "color:inherit" }, `${e.nombres} ${e.apellidos}`)), h("span.tenue", fechaCorta(e.creado)))))) : null,
  );

  // Promedios por grupo (cálculo en el servidor)
  const filas = await Promise.all(activos.map(async (g) => {
    const p = await q(sb.rpc("d360_promedios_grupo", { p_grupo: g.id }));
    const con = p.filter((x) => x.promedio != null);
    const prom = con.length ? con.reduce((s, x) => s + Number(x.promedio), 0) / con.length : null;
    return { g, prom, n: p.length, bajo: con.filter((x) => Number(x.promedio) < 60).length };
  }));
  el.querySelector("#promedios").replaceChildren(h("ul.lista", filas.map(({ g, prom, n, bajo }) => h("li",
    h("div.crece", h("a.titulo", { href: `#/calificaciones?grupo=${g.id}`, style: "color:inherit" }, g.nombre), h("div.tenue", `${n} estudiantes` + (bajo ? ` · ${bajo} por debajo de 60` : ""))),
    nota(prom)))));
}
