// Inicio del profesor: qué toca hoy, qué está pendiente y cómo va todo.
import { sb, q } from "../core/sb.js";
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

  // Primeros pasos: el ciclo completo de trabajo, marcado con datos reales
  const hay = async (t) => (await q(sb.from(t).select("id").eq("cuenta_id", ctx.id).limit(1))).length > 0;
  const [hayHorario, hayLista, hayEval] = await Promise.all([hay("horarios"), hay("asistencias"), hay("evaluaciones")]);
  const g1 = activos[0];
  const pasos = [
    { hecho: activos.length > 0, t: "Crea tu primer grupo", d: "Un grupo reúne a los estudiantes de una misma clase. La asignatura la escribes ahí mismo.", href: "#/grupos?nuevo=1", b: "Crear grupo" },
    { hecho: resumen.estudiantes_activos > 0, t: "Agrega a tus estudiantes", d: "Uno por uno o todos de una vez desde Excel.", href: g1 ? `#/grupos/${g1.id}` : "#/estudiantes", b: "Agregar" },
    { hecho: hayHorario, t: "Ponle horario al grupo", d: "Así Inicio te recuerda a qué grupo pasar lista cada día.", href: g1 ? `#/grupos/${g1.id}` : "#/grupos", b: "Poner horario" },
    { hecho: hayLista, t: "Pasa lista", d: "Toca P, A, T o J por estudiante, o marca a todos presentes.", href: "#/asistencia", b: "Pasar lista" },
    { hecho: hayEval, t: "Crea una evaluación y pon notas", d: "El promedio se calcula solo.", href: "#/calificaciones?nuevo=1", b: "Crear evaluación" },
  ];
  const hechos = pasos.filter((p) => p.hecho).length;
  const claveGuia = `d360-guia-oculta-${ctx.id}`;
  let guiaOculta = false; try { guiaOculta = localStorage.getItem(claveGuia) === "1"; } catch (_) {}
  const siguiente = pasos.findIndex((p) => !p.hecho);
  const guia = (completa) => h("section.hoja", { style: completa ? "" : "margin-bottom:1rem" },
    h("div.hoja-titulo", h("h2", completa ? "Deja listo tu espacio" : `Primeros pasos · ${hechos} de ${pasos.length}`),
      completa ? null : h("button.btn.btn-texto.btn-sm", { type: "button", onclick: (e) => { try { localStorage.setItem(claveGuia, "1"); } catch (_) {} e.target.closest("section").remove(); } }, "Ocultar")),
    h("div.barra-progreso", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": pasos.length, "aria-valuenow": hechos }, h("span", { style: `width:${(hechos / pasos.length) * 100}%` })),
    h("ol.pasos-guia", pasos.map((p, i) => h("li" + (p.hecho ? ".hecho" : ""),
      h("span.num", p.hecho ? "✓" : String(i + 1)),
      h("div.crece", h("div.titulo", p.t), p.hecho ? null : h("div.tenue", p.d)),
      p.hecho ? null : h("a.btn.btn-sm" + (i === siguiente ? "" : ".btn-sec"), { href: p.href }, p.b)))));

  // Cuenta nueva: la guía en lugar de un panel vacío
  if (!activos.length || !resumen.estudiantes_activos) {
    el.append(h("h1", `Hola, ${nombre}`), h("p.suave", "Estos son los pasos para empezar. Toman pocos minutos."), guia(true));
    return;
  }

  // Grupos con clase hoy sin asistencia registrada
  const { data: asisHoy } = await sb.from("asistencias").select("grupo_id").eq("cuenta_id", ctx.id).eq("fecha", hoy);
  const conLista = new Set((asisHoy || []).map((a) => a.grupo_id));
  const clasesHoy = horariosHoy.filter((x) => x.grupos?.estado === "activo");
  const sinLista = [...new Map(clasesHoy.filter((c) => !conLista.has(c.grupo_id)).map((c) => [c.grupo_id, c])).values()];

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
    hechos < pasos.length && !guiaOculta ? guia(false) : null,
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
