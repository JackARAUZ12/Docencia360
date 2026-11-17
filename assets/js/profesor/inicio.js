// Inicio del profesor: qué toca hoy, qué está pendiente y cómo va todo.
import { sb, q } from "../core/sb.js";
import { pasosProfesor, listaPasos, bienvenida } from "../core/guia.js";
import { h, hoyISO, sumarDias, diaLargo, fechaCorta, hora, nota } from "../core/ui.js";

const u_al_limite = (filas) => filas.some(([u, m]) => u >= m);

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

  // Primeros pasos (los mismos del botón flotante), marcados con datos reales
  const guiaDatos = ctx.esDueno ? await pasosProfesor(ctx) : null;
  const guia = () => h("section.hoja",
    h("div.hoja-titulo", h("h2", `Primeros pasos · ${guiaDatos.hechos} de ${guiaDatos.pasos.length}`),
      h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => bienvenida(ctx, { forzar: true }) }, "Ver la bienvenida")),
    listaPasos(guiaDatos));

  // Cuenta nueva: la guía en lugar de un panel vacío
  if (!activos.length || !resumen.estudiantes_activos) {
    el.append(h("h1", `Hola, ${nombre}`),
      guiaDatos ? [h("p.suave", "Estos son los pasos para empezar. Toman pocos minutos."), guia()]
        : h("p.suave", "Todavía no tienes grupos asignados. Cuando el profesor te asigne uno, aparecerá aquí."));
    return;
  }

  // Grupos con clase hoy sin asistencia registrada
  const { data: asisHoy } = await sb.from("asistencias").select("grupo_id").eq("cuenta_id", ctx.id).eq("fecha", hoy);
  const conLista = new Set((asisHoy || []).map((a) => a.grupo_id));
  const clasesHoy = horariosHoy.filter((x) => x.grupos?.estado === "activo");
  const sinLista = [...new Map(clasesHoy.filter((c) => !conLista.has(c.grupo_id)).map((c) => [c.grupo_id, c])).values()];

  // Clase de ahora (o la próxima de hoy): un toque para pasar lista
  const ahoraMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const aMin = (t) => { const [hh, mm] = String(t).split(":").map(Number); return hh * 60 + mm; };
  const enCurso = clasesHoy.find((c) => aMin(c.hora_inicio) - 15 <= ahoraMin && ahoraMin <= aMin(c.hora_fin));
  const proxima = enCurso ? null : clasesHoy.find((c) => aMin(c.hora_inicio) > ahoraMin);
  const claseAhora = (c, ahora) => {
    const tomada = conLista.has(c.grupo_id);
    return h("section.clase-ahora" + (ahora ? ".en-curso" : ""), { "aria-label": ahora ? "Clase de ahora" : "Próxima clase" },
      h("div.crece",
        h("p.etiqueta", ahora ? "Clase de ahora" : "Tu próxima clase de hoy"),
        h("p.nombre", c.grupos.nombre),
        h("p.tenue", `${hora(c.hora_inicio)} – ${hora(c.hora_fin)}`)),
      h("div.acciones",
        tomada ? h("span.estado.ok", "✓ Lista tomada") : null,
        h("a.btn" + (tomada ? ".btn-sec" : ""), { href: `#/asistencia?grupo=${c.grupo_id}` }, tomada ? "Ver o corregir la lista" : "Pasar lista"),
        h("a.btn.btn-sec", { href: `#/calificaciones?grupo=${c.grupo_id}` }, "Poner notas")));
  };

  // Cerca del límite del plan (90 %): avisar antes de que el sistema lo bloquee
  let avisoLimite = null;
  if (ctx.esDueno && !ctx.cuenta.es_demo) {
    const plan = await q(sb.from("planes").select("nombre,max_estudiantes,max_grupos").eq("id", ctx.cuenta.plan_id).maybeSingle()).catch(() => null);
    const cerca = plan ? [[resumen.estudiantes_activos, plan.max_estudiantes, "estudiantes activos"], [resumen.grupos_activos, plan.max_grupos, "grupos activos"]]
      .filter(([u, m]) => m != null && m > 0 && u >= Math.ceil(m * 0.9)) : [];
    if (cerca.length) avisoLimite = h("div.aviso.ojo", { style: "margin-bottom:1rem" },
      h("strong", "Tu plan está casi lleno. "),
      cerca.map(([u, m, t]) => `Usas ${u} de ${m} ${t}. `),
      u_al_limite(cerca) ? "No podrás agregar más hasta cambiar de plan. " : "",
      h("a", { href: "#/cuenta" }, "Ver planes"));
  }

  el.append(
    h("div.p-titulo", h("div", h("p.tenue", { style: "margin:0" }, diaLargo(hoy)), h("h1", `Hola, ${nombre}`))),
    avisoLimite,
    enCurso ? claseAhora(enCurso, true) : proxima ? claseAhora(proxima, false) : null,
    notifs.length ? h("div", notifs.map((n) => h("div.aviso.ojo", h("strong", n.titulo + ". "), n.cuerpo || "",
      n.enlace ? [" ", h("a", { href: n.enlace }, "Ver")] : null,
      " ", h("button.btn.btn-texto.btn-sm", { onclick: async (e) => { await sb.from("notificaciones").update({ leida: true }).eq("id", n.id); e.target.closest(".aviso").remove(); } }, "Entendido")))) : null,
    h("section.cifras", { "aria-label": "Resumen" },
      h("div.cifra", h("b", resumen.estudiantes_activos), h("span", "estudiantes activos")),
      h("div.cifra", h("b", resumen.grupos_activos), h("span", "grupos activos")),
      h("div.cifra", h("b", resumen.asistencia_30d == null ? "—" : `${resumen.asistencia_30d}%`), h("span", "asistencia, últimos 30 días")),
      h("a.cifra" + (resumen.evaluaciones_sin_nota ? ".alerta" : ""), { href: "#/calificaciones?vista=evaluacion", style: "color:inherit;text-decoration:none" }, h("b", resumen.evaluaciones_sin_nota), h("span", "evaluaciones sin calificar ›"))),
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
              evals.filter((e) => e.fecha === hoy).map((e) => h("li", h("span.h", e.tipo === "tarea" ? "Tarea" : "Prueba"), h("div", h("strong", e.titulo), h("div.tenue", e.grupos?.nombre),
                h("a.btn.btn-sm.btn-sec", { href: `#/calificaciones?grupo=${e.grupo_id}&evaluacion=${e.id}`, style: "margin-top:.35rem" }, "Poner notas")))))
          : h("p.suave", "No tienes clases programadas para hoy."),
        sinLista.length > 1 ? h("p.tenue", `${sinLista.length} grupos de hoy aún sin lista.`) : null),
      h("section.hoja",
        h("div.hoja-titulo", h("h2", "Próximos 7 días")),
        evals.filter((e) => e.fecha > hoy).length || eventos.filter((e) => e.fecha > hoy).length
          ? h("ul.lista", [...evals.filter((e) => e.fecha > hoy).map((e) => ({ f: e.fecha, t: e.titulo, d: `${e.tipo === "tarea" ? "Entrega de tarea" : "Evaluación"} · ${e.grupos?.nombre}`, href: `#/calificaciones?grupo=${e.grupo_id}&evaluacion=${e.id}` })),
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
