// Tareas y actividades: fechas de entrega, cumplimiento y nota.
import { sb, q } from "../core/sb.js";
import { h, tabla, modal, fecha, hoyISO, nombreCompleto } from "../core/ui.js";
import { editarEvaluacion } from "./calificaciones.js";
import { ICONOS } from "../core/iconos.js";

export async function render(el, ctx) {
  const grupos = (await ctx.datos.grupos()).filter((g) => g.estado === "activo");
  const tareas = await q(sb.from("evaluaciones").select("*, grupos(nombre)").eq("cuenta_id", ctx.id).eq("tipo", "tarea").order("fecha", { ascending: false }));
  const ids = tareas.map((t) => t.id);
  const [cals, miembros] = await Promise.all([
    ids.length ? q(sb.from("calificaciones").select("evaluacion_id,entregado").in("evaluacion_id", ids)) : [],
    q(sb.from("grupo_estudiantes").select("grupo_id").eq("cuenta_id", ctx.id).eq("estado", "activo")),
  ]);
  const entregas = {}; cals.forEach((c) => { if (c.entregado) entregas[c.evaluacion_id] = (entregas[c.evaluacion_id] || 0) + 1; });
  const tam = {}; miembros.forEach((m) => (tam[m.grupo_id] = (tam[m.grupo_id] || 0) + 1));
  const hoy = hoyISO();

  const nueva = () => {
    if (!grupos.length) return ctx.toast("Primero crea un grupo activo.", "mal");
    const sel = h("select", grupos.map((g) => h("option", { value: g.id }, g.nombre)));
    modal("¿Para qué grupo es la tarea?", h("label.campo", h("span", "Grupo"), sel), [
      { texto: "Cancelar", clase: "btn-sec" },
      { texto: "Continuar", onclick: (cerrar) => { cerrar(); editarEvaluacion(ctx, sel.value, null, ctx.recargar, "tarea"); } },
    ]);
  };

  const fila = (t) => {
    const total = tam[t.grupo_id] || 0, ent = entregas[t.id] || 0;
    const vencida = t.fecha < hoy;
    return {
      ...t, total, ent,
      estado: ent >= total && total > 0 ? h("span.estado.ok", "Completa") : vencida ? h("span.estado.mal", `${total - ent} sin entregar`) : h("span.estado.info", "Abierta"),
    };
  };
  const proximas = tareas.filter((t) => t.fecha >= hoy).reverse().map(fila);
  const pasadas = tareas.filter((t) => t.fecha < hoy).map(fila);
  const cols = [
    { t: "Tarea", v: (t) => [h("strong", t.titulo), h("div.tenue", t.grupos?.nombre)] },
    { t: "Entrega", v: (t) => fecha(t.fecha) },
    { t: "Entregadas", v: (t) => `${t.ent} / ${t.total}`, clase: "derecha" },
    { t: "Estado", v: (t) => t.estado },
    { t: "", clase: "acciones", v: (t) => h("button.btn.btn-sec.btn-sm", { onclick: () => revisar(ctx, t) }, "Revisar") },
  ];

  el.append(
    ctx.titulo("Tareas", h("button.btn", { onclick: nueva }, h("span", { html: ICONOS.mas_add }), "Nueva tarea")),
    h("section.hoja", h("h2", "Por entregar"), tabla(cols, proximas, { vacio: "No hay tareas abiertas." })),
    h("section.hoja", h("h2", "Anteriores"), tabla(cols, pasadas, { vacio: "Sin tareas anteriores." })),
  );
}

async function revisar(ctx, t) {
  const [miembros, cals] = await Promise.all([
    q(sb.from("grupo_estudiantes").select("estudiante_id, estudiantes(nombres,apellidos)").eq("grupo_id", t.grupo_id).eq("estado", "activo")),
    q(sb.from("calificaciones").select("*").eq("evaluacion_id", t.id)),
  ]);
  miembros.sort((a, b) => nombreCompleto(a.estudiantes).localeCompare(nombreCompleto(b.estudiantes)));
  const prev = Object.fromEntries(cals.map((c) => [c.estudiante_id, c]));
  const filas = miembros.map((m) => {
    const c = prev[m.estudiante_id];
    const chk = h("input", { type: "checkbox", checked: !!c?.entregado, "aria-label": "Entregó" });
    const pts = h("input", { type: "number", min: 0, max: t.puntaje_max, step: "0.01", value: c?.puntaje ?? "", style: "width:6rem", "aria-label": "Nota" });
    pts.addEventListener("input", () => { if (pts.value !== "") chk.checked = true; });
    return { m, chk, pts, el: h("li", h("label.check.crece", chk, nombreCompleto(m.estudiantes)), pts, h("span.tenue", `/ ${Number(t.puntaje_max)}`)) };
  });
  modal(`${t.titulo}`, h("div",
    h("p.tenue", `${t.grupos?.nombre} · entrega ${fecha(t.fecha)}`),
    t.descripcion ? h("p", t.descripcion) : null,
    filas.length ? h("ul.lista", filas.map((f) => f.el)) : h("p", "El grupo no tiene estudiantes.")), [
    { texto: "Cancelar", clase: "btn-sec" },
    { texto: "Guardar", onclick: async (cerrar) => {
      const up = [], del = [];
      for (const f of filas) {
        const p = f.pts.value === "" ? null : Number(f.pts.value);
        if (p != null && (p < 0 || p > Number(t.puntaje_max))) { ctx.toast(`Nota fuera de rango para ${f.m.estudiantes.nombres}`, "mal"); return; }
        if (!f.chk.checked && p == null) { if (prev[f.m.estudiante_id]) del.push(f.m.estudiante_id); continue; }
        up.push({ cuenta_id: ctx.id, evaluacion_id: t.id, estudiante_id: f.m.estudiante_id, entregado: f.chk.checked, puntaje: p, actualizado: new Date().toISOString() });
      }
      try {
        if (up.length) await q(sb.from("calificaciones").upsert(up, { onConflict: "evaluacion_id,estudiante_id" }));
        if (del.length) await q(sb.from("calificaciones").delete().eq("evaluacion_id", t.id).in("estudiante_id", del));
        cerrar(); ctx.toast("Entregas guardadas"); ctx.recargar();
      } catch (e) { ctx.toast(e.message, "mal"); }
    } },
  ]);
}
