// Inicio de la academia: lo que pasa hoy, lo que requiere atención y cómo va el negocio.
import { sb, q } from "../core/sb.js";
import { h, hoyISO, sumarDias, diaLargo, fechaCorta, hora, dinero, nombreCompleto } from "../core/ui.js";

export async function render(el, ctx) {
  const hoy = hoyISO();
  const dia = ((new Date(hoy + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
  const M = (n) => dinero(n, ctx.cuenta.moneda);
  const visibles = await ctx.gruposVisibles();
  const ids = new Set(visibles.map((g) => g.id));

  const [resumen, horarios, asisHoy, ultimas, ocup, docentes, notifs] = await Promise.all([
    q(sb.rpc("d360_resumen_panel", { p_cuenta: ctx.id })),
    q(sb.from("horarios").select("hora_inicio,hora_fin,grupo_id,miembro_id,miembros(nombre),grupos(nombre,estado)").eq("cuenta_id", ctx.id).eq("dia", dia).order("hora_inicio")),
    q(sb.from("asistencias").select("grupo_id").eq("cuenta_id", ctx.id).eq("fecha", hoy)),
    ctx.esGestor || ctx.esFinanzas ? q(sb.from("matriculas").select("fecha,estado,estudiantes(id,nombres,apellidos),cursos(nombre)").eq("cuenta_id", ctx.id).order("creado", { ascending: false }).limit(6)) : [],
    q(sb.from("grupo_estudiantes").select("grupo_id").eq("cuenta_id", ctx.id).eq("estado", "activo")),
    ctx.esGestor ? q(sb.from("grupo_docentes").select("grupo_id").eq("cuenta_id", ctx.id)) : [],
    q(sb.from("notificaciones").select("*").eq("cuenta_id", ctx.id).eq("leida", false).order("creado", { ascending: false }).limit(5)),
  ]);
  const conLista = new Set(asisHoy.map((a) => a.grupo_id));
  const clases = horarios.filter((x) => x.grupos?.estado === "activo" && ids.has(x.grupo_id));
  const n = {}; ocup.forEach((o) => (n[o.grupo_id] = (n[o.grupo_id] || 0) + 1));
  const activos = visibles.filter((g) => g.estado === "activo");
  const conDocente = new Set(docentes.map((d) => d.grupo_id));

  // Alertas que requieren acción
  const alertas = [];
  if (ctx.esFinanzas && Number(resumen.vencido_cobro) > 0) alertas.push(["mal", `Hay ${M(resumen.vencido_cobro)} en cobros vencidos.`, "#/finanzas", "Ver morosos"]);
  if (ctx.esGestor) {
    const sinDoc = activos.filter((g) => !conDocente.has(g.id));
    if (sinDoc.length) alertas.push(["ojo", `${sinDoc.length} grupo(s) activos sin instructor: ${sinDoc.slice(0, 3).map((g) => g.nombre).join(", ")}${sinDoc.length > 3 ? "…" : ""}.`, "#/grupos", "Asignar"]);
    const llenos = activos.filter((g) => g.cupo && (n[g.id] || 0) >= g.cupo);
    if (llenos.length) alertas.push(["info", `${llenos.length} grupo(s) con el cupo lleno. Considera abrir otro.`, "#/grupos", "Ver grupos"]);
  }
  if (!ctx.esFinanzas || ctx.esGestor || ctx.esDocente) {
    if (resumen.evaluaciones_sin_nota && !ctx.esFinanzas) alertas.push(["ojo", `${resumen.evaluaciones_sin_nota} evaluación(es) sin calificar.`, "#/calificaciones", "Calificar"]);
  }
  const sinLista = clases.filter((c) => !conLista.has(c.grupo_id) && c.hora_inicio.slice(0, 5) <= new Date().toTimeString().slice(0, 5));
  if (sinLista.length && !ctx.esFinanzas) alertas.push(["ojo", `${new Set(sinLista.map((c) => c.grupo_id)).size} clase(s) de hoy ya empezaron y no tienen lista.`, "#/asistencia", "Pasar lista"]);

  // Clase de ahora (o la próxima de hoy) del instructor: un toque para pasar lista
  let claseAhora = null;
  if (ctx.esDocente) {
    const ahora = (() => { const x = new Date(); return x.getHours() * 60 + x.getMinutes(); })();
    const aMin = (t) => { const [hh, mm] = String(t).split(":").map(Number); return hh * 60 + mm; };
    const mias = clases.filter((c) => !c.miembro_id || c.miembro_id === ctx.cuenta.miembro_id).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    const enCurso = mias.find((c) => aMin(c.hora_inicio) - 15 <= ahora && ahora <= aMin(c.hora_fin));
    const c = enCurso || mias.find((x) => aMin(x.hora_inicio) > ahora);
    if (c) {
      const tomada = conLista.has(c.grupo_id);
      claseAhora = h("section.clase-ahora" + (enCurso ? ".en-curso" : ""), { "aria-label": enCurso ? "Clase de ahora" : "Próxima clase" },
        h("div.crece",
          h("p.etiqueta", enCurso ? "Clase de ahora" : "Tu próxima clase de hoy"),
          h("p.nombre", c.grupos?.nombre || "Grupo"),
          h("p.tenue", `${hora(c.hora_inicio)} – ${hora(c.hora_fin)} · ${n[c.grupo_id] || 0} estudiantes`)),
        h("div.acciones",
          tomada ? h("span.estado.ok", "✓ Lista tomada") : null,
          h("a.btn" + (tomada ? ".btn-sec" : ""), { href: `#/asistencia?grupo=${c.grupo_id}` }, tomada ? "Ver o corregir la lista" : "Pasar lista"),
          h("a.btn.btn-sec", { href: `#/calificaciones?grupo=${c.grupo_id}` }, "Poner notas")));
    }
  }

  // Acciones de todos los días, a un toque (según el rol)
  const F = ctx.esFinanzas && ctx.f("finanzas"), G = ctx.esGestor;
  let cajaHoy = null;
  if (F) {
    const miUser = ctx.rol === "finanzas" ? (await sb.auth.getUser()).data?.user?.id || null : null;
    const cd = await q(sb.rpc("d360_caja_dia", { p_cuenta: ctx.id, p_fecha: hoy, p_cajero: miUser })).catch(() => null);
    if (cd) cajaHoy = h("a.atajo.atajo-caja", { href: "#/caja" }, h("span.tenue", miUser ? "Mi caja de hoy" : "Caja de hoy"), h("strong", M(cd.total)), h("span.tenue", `${cd.recibos} recibo(s)${(cd.cierres || []).length ? " · cerrada" : ""}`));
  }
  const atajos = !ctx.esDocente ? h("div.atajos",
    F ? h("button.atajo.atajo-principal", { type: "button", onclick: () => ctx.barraRapida?.enfocar("cobrar") }, h("strong", "Cobrar"), h("span", "matrícula o mensualidad")) : null,
    cajaHoy,
    G ? h("a.atajo", { href: "#/asistencia" }, h("strong", "Pasar lista"), h("span", "de la clase de hoy")) : null,
    G || F ? h("a.atajo", { href: "#/interesados" }, h("strong", "Interesados"), h("span", "anotar o matricular")) : null,
    G || F ? h("button.atajo", { type: "button", onclick: () => ctx.barraRapida?.enfocar("buscar") }, h("strong", "Buscar estudiante"), h("span", "ficha, cobro o WhatsApp")) : null) : null;

  el.append(
    h("div.p-titulo", h("div", h("p.tenue", { style: "margin:0" }, diaLargo(hoy)), h("h1", `Hola, ${ctx.cuenta.miembro_nombre.split(" ")[0]}`))),
    claseAhora,
    atajos,
    notifs.map((x) => h("div.aviso.ojo", h("strong", x.titulo + ". "), x.cuerpo || "", x.enlace ? [" ", h("a", { href: x.enlace }, "Ver")] : null, " ",
      h("button.btn.btn-texto.btn-sm", { onclick: async (e) => { await sb.from("notificaciones").update({ leida: true }).eq("id", x.id); e.target.closest(".aviso").remove(); } }, "Entendido"))),
    ctx.esDocente
      ? h("section.cifras",
          h("div.cifra", h("b", activos.length), h("span", "mis grupos activos")),
          h("div.cifra", h("b", activos.reduce((s, g) => s + (n[g.id] || 0), 0)), h("span", "estudiantes a mi cargo")),
          h("div.cifra", h("b", clases.length), h("span", "clases hoy")))
      : h("section.cifras",
          h("div.cifra", h("b", resumen.estudiantes_activos ?? 0), h("span", "estudiantes activos")),
          h("div.cifra", h("b", resumen.matriculas_activas ?? 0), h("span", "matrículas activas")),
          h("div.cifra", h("b", resumen.grupos_activos ?? 0), h("span", "grupos en curso")),
          h("div.cifra", h("b", resumen.docentes ?? 0), h("span", "instructores")),
          ctx.esFinanzas && ctx.f("finanzas") ? [
            h("div.cifra", h("b", M(resumen.ingresos_mes)), h("span", "cobrado este mes")),
            h("div.cifra" + (Number(resumen.vencido_cobro) ? ".alerta" : ""), h("b", M(resumen.pendiente_cobro)), h("span", "pagos pendientes")),
          ] : null,
          h("div.cifra", h("b", resumen.asistencia_30d == null ? "—" : `${resumen.asistencia_30d}%`), h("span", "asistencia 30 días"))),
    alertas.length ? h("section", { style: "margin-top:1.25rem" }, alertas.map(([t, txt, href, b]) => h(`div.aviso.${t}`, txt, " ", h("a", { href }, b)))) : null,
    h("div.dos-col", { style: "margin-top:1.25rem" },
      h("section.hoja",
        h("div.hoja-titulo", h("h2", "Clases de hoy"), h("a", { href: "#/calendario" }, "Calendario")),
        clases.length ? h("ul.agenda", clases.map((c) => h("li", h("span.h", hora(c.hora_inicio)),
          h("div", h("strong", c.grupos.nombre), h("div.tenue", [`${hora(c.hora_inicio)}–${hora(c.hora_fin)}`, c.miembros?.nombre, `${n[c.grupo_id] || 0} estudiantes`].filter(Boolean).join(" · ")),
            conLista.has(c.grupo_id) ? h("span.estado.ok", "Lista tomada") : ctx.esFinanzas && !ctx.esGestor ? null : h("a.btn.btn-sm", { href: `#/asistencia?grupo=${c.grupo_id}`, style: "margin-top:.35rem" }, "Pasar lista")))))
          : h("p.suave", "No hay clases programadas para hoy.")),
      ctx.esGestor || ctx.esFinanzas ? h("section.hoja",
        h("div.hoja-titulo", h("h2", "Últimas matrículas"), h("a", { href: "#/matriculas" }, "Ver todas")),
        ultimas.length ? h("ul.lista", ultimas.map((m) => h("li",
          h("div.crece", h("a.titulo", { href: `#/estudiantes/${m.estudiantes?.id}`, style: "color:inherit" }, nombreCompleto(m.estudiantes || {})), h("div.tenue", m.cursos?.nombre || "")),
          h("span.tenue", fechaCorta(m.fecha)))))
          : h("div.vacio", h("p", "Aún no hay matrículas."), h("a.btn", { href: "#/matriculas" }, "Matricular")))
        : h("section.hoja", h("h2", "Mis grupos"), h("ul.lista", activos.map((g) => h("li", h("div.crece", h("a.titulo", { href: `#/grupos/${g.id}`, style: "color:inherit" }, g.nombre), h("div.tenue", `${n[g.id] || 0} estudiantes`)),
          h("a.btn.btn-sec.btn-sm", { href: `#/calificaciones?grupo=${g.id}` }, "Notas")))))),
  );

  // Cuenta en marcha: los primeros pasos con avance real, arriba, hasta completarlos
  if (ctx.esDueno && !ctx.guia?.oculta) {
    const { pasosAcademia, listaPasos, alActualizarGuia } = await import("../core/guia.js");
    const g = await pasosAcademia(ctx).catch(() => null);
    const panel = (d) => h("section.hoja.guia-inicio", { style: "margin-bottom:1.25rem" },
      h("div.hoja-titulo", h("h2", `Pon en marcha tu academia · ${d.hechos} de ${d.pasos.length}`),
        h("button.btn.btn-texto.btn-sm", { type: "button", onclick: async (e) => { await ctx.guiaGuardar({ oculta: true }); e.target.closest(".guia-viva").remove(); ctx.botonGuia?.actualizar(); ctx.toast("Guía oculta. Puedes volver a verla en «Plan y cuenta»."); } }, "Ocultar")),
      listaPasos(d));
    if (g && !g.completa) {
      const caja = h("div.guia-viva", panel(g));
      el.querySelector(".p-titulo")?.after(caja);
      // Se actualiza sola al completar un paso; al terminarlos todos, desaparece
      alActualizarGuia(caja, (d) => (d.completa ? caja.remove() : caja.replaceChildren(panel(d))));
    }
  }
}
