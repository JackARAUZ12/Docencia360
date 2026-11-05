// Calificaciones del colegio: por sección, corte y asignatura.
// Vista "Registrar notas" (cuaderno de la asignatura) y "Cuadro de la sección"
// (todas las asignaturas con la nota del corte y la escala cualitativa).
import { sb, q } from "../core/sb.js";
import { h, formularioModal, confirmar, fechaCorta, hoyISO, nombreCompleto, descargarCSV } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { estructura, notaCelda, cualitativa, selector } from "./util.js";

const TIPOS = [["examen", "Examen"], ["practica", "Trabajo práctico"], ["tarea", "Tarea"], ["proyecto", "Proyecto"], ["participacion", "Participación"], ["recuperacion", "Recuperación"]];

export async function render(el, ctx, { params }) {
  const E = await estructura(ctx);
  const secs = E.misSecciones().filter((s) => s.estado !== "cancelado");
  if (!secs.length) { el.append(ctx.titulo("Calificaciones"), h("div.vacio", h("p", ctx.esDocente ? "Aún no tienes secciones asignadas." : "Crea secciones en «Grados y secciones»."))); return; }
  if (!E.periodos.length) { el.append(ctx.titulo("Calificaciones"), h("div.vacio", h("p", "Define los cortes evaluativos en «Datos del colegio»."))); return; }
  let seccion = secs.find((s) => s.id === params.get("seccion"))?.id || secs[0].id;
  let periodo = params.get("periodo") || E.periodoActual()?.id;
  let asig = params.get("asignatura") || null;
  let vista = params.get("vista") || "notas";
  const cont = h("div");
  const ctrl = h("div", { style: "display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center" });
  el.append(ctx.titulo("Calificaciones"), ctrl, cont);

  function controles() {
    const asigs = E.misAsignaturas(seccion);
    if (!asigs.some((a) => a.id === asig)) asig = asigs[0]?.id || null;
    const ir = () => { history.replaceState(null, "", `#/calificaciones?seccion=${seccion}&periodo=${periodo}&asignatura=${asig || ""}&vista=${vista}`); controles(); pintar(); };
    ctrl.replaceChildren(
      selector(secs.map((s) => [s.id, s.nombre]), seccion, (v) => { seccion = v; ir(); }, "Sección"),
      selector(E.periodos.map((p) => [p.id, p.nombre + (p.cerrado ? " (cerrado)" : "")]), periodo, (v) => { periodo = v; ir(); }, "Corte"),
      vista === "notas" ? selector(asigs.map((a) => [a.id, a.nombre]), asig, (v) => { asig = v; ir(); }, "Asignatura") : null,
      h("div.segmentos", { role: "group" }, [["notas", "Registrar notas"], ["cuadro", "Cuadro de la sección"]].map(([v, t]) =>
        h("button", { type: "button", "aria-pressed": String(v === vista), onclick: () => { vista = v; ir(); } }, t))));
  }

  async function pintar() {
    cont.replaceChildren(h("p.tenue", "Cargando…"));
    const per = E.periodos.find((p) => p.id === periodo);
    const sec = E.seccion(seccion);
    const alumnos = (await q(sb.from("grupo_estudiantes").select("estudiante_id, estudiantes(nombres,apellidos)").eq("grupo_id", seccion).eq("estado", "activo")))
      .sort((a, b) => nombreCompleto(a.estudiantes).localeCompare(nombreCompleto(b.estudiantes)));
    const notas = await q(sb.rpc("d360_notas_seccion", { p_grupo: seccion, p_periodo: periodo }));

    if (vista === "cuadro") {
      const plan = E.planDe(sec.grado_id);
      const N = {}; notas.forEach((x) => (N[`${x.estudiante_id}|${x.asignatura_id}`] = x));
      const promedioDe = (id) => { const v = plan.map((a) => N[`${id}|${a.id}`]?.final).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + Number(x), 0) / v.length : null; };
      const reprobadas = (id) => plan.filter((a) => N[`${id}|${a.id}`]?.final != null && Number(N[`${id}|${a.id}`].final) < E.minima).length;
      cont.replaceChildren(
        h("section.hoja",
          h("div.hoja-titulo", h("h2", `${sec.nombre} · ${per?.nombre}`),
            h("span", { style: "display:flex;gap:.5rem" },
              ctx.f("exportar") ? h("button.btn.btn-sec.btn-sm", { onclick: () => descargarCSV(`cuadro-${sec.nombre}-${per?.nombre}.csv`,
                [["Estudiante", ...plan.map((a) => a.nombre), "Promedio"], ...alumnos.map((al) => [nombreCompleto(al.estudiantes), ...plan.map((a) => N[`${al.estudiante_id}|${a.id}`]?.final ?? ""), promedioDe(al.estudiante_id)?.toFixed(1) ?? ""])]) }, "Exportar") : null,
              h("a.btn.btn-sm", { href: `#/boletines?seccion=${seccion}&periodo=${periodo}` }, "Ver boletines"))),
          h("div.tabla-envoltura", h("table.registro.cuaderno.cuadro",
            h("thead", h("tr", h("th", "Estudiante"), plan.map((a) => h("th.rot", a.nombre)), h("th.derecha", "Promedio"), h("th.derecha", "Reprob."))),
            h("tbody", alumnos.map((al) => h("tr",
              h("td", h("a.fila-enlace", { href: `#/estudiantes/${al.estudiante_id}` }, nombreCompleto(al.estudiantes))),
              plan.map((a) => { const x = N[`${al.estudiante_id}|${a.id}`]; const v = x?.final;
                return h("td.n" + (v != null && Number(v) < E.minima ? ".rep" : ""), { title: x?.recuperacion != null ? `Promedio ${x.promedio} · recuperación ${x.recuperacion}` : "" },
                  v == null ? "—" : Number(v).toFixed(0), x?.recuperacion != null ? "ᴿ" : ""); }),
              h("td.derecha", notaCelda(promedioDe(al.estudiante_id), E.minima, E.cuali)),
              h("td.derecha", reprobadas(al.estudiante_id) ? h("span.nota-baja", reprobadas(al.estudiante_id)) : "0")))))),
          h("p.tenue", { style: "margin-top:.75rem" }, `Nota mínima de aprobación: ${E.minima}. ᴿ = nota obtenida en recuperación. Escala: AA 90–100 · AS 76–89 · AF 60–75 · AI menos de 60.`)));
      return;
    }

    if (!asig) { cont.replaceChildren(h("div.vacio", "No tienes asignaturas asignadas en esta sección.")); return; }
    const a = E.asignatura(asig);
    const evals = await q(sb.from("evaluaciones").select("*").eq("grupo_id", seccion).eq("asignatura_id", asig).eq("periodo_id", periodo).order("fecha").order("creado"));
    const cals = evals.length ? await q(sb.from("calificaciones").select("evaluacion_id,estudiante_id,puntaje").in("evaluacion_id", evals.map((e) => e.id))) : [];
    const val = {}; cals.forEach((c) => (val[`${c.evaluacion_id}|${c.estudiante_id}`] = c.puntaje));
    const N = Object.fromEntries(notas.filter((x) => x.asignatura_id === asig).map((x) => [x.estudiante_id, x]));
    const pesos = evals.filter((e) => e.tipo !== "recuperacion").reduce((s, e) => s + Number(e.peso), 0);
    const cerrado = per?.cerrado && !ctx.esGestor;

    const nuevaEval = (ev) => formularioModal(ev ? "Editar evaluación" : `Nueva evaluación · ${a.nombre}`, [
      { name: "titulo", label: "Título", required: true, full: true, placeholder: "Ej.: Examen del IV corte" },
      { name: "tipo", label: "Tipo", type: "select", options: TIPOS },
      { name: "fecha", label: "Fecha", type: "date", required: true, value: hoyISO() },
      { name: "peso", label: "Peso en el corte (%)", type: "number", min: 0, max: 100, step: "0.5", value: Math.max(0, 100 - pesos), help: "La recuperación no lleva peso: reemplaza la nota del corte si es mayor." },
      { name: "puntaje_max", label: "Puntaje máximo", type: "number", min: 1, value: 100, required: true },
    ], ev, async (d, cerrar) => {
      if (d.tipo === "recuperacion") d.peso = 0;
      if (ev) await q(sb.from("evaluaciones").update(d).eq("id", ev.id));
      else await q(sb.from("evaluaciones").insert({ ...d, peso: d.peso ?? 0, cuenta_id: ctx.id, grupo_id: seccion, asignatura_id: asig, periodo_id: periodo }));
      cerrar(); ctx.toast("Guardado"); pintar();
    });

    const cambios = new Map();
    const btnGuardar = h("button.btn", { disabled: true, onclick: async () => {
      btnGuardar.disabled = true;
      const up = [], del = [];
      for (const [k, v] of cambios) { const [ev, est] = k.split("|"); if (v == null) del.push([ev, est]); else up.push({ cuenta_id: ctx.id, evaluacion_id: ev, estudiante_id: est, puntaje: v, entregado: true, actualizado: new Date().toISOString() }); }
      try {
        if (up.length) await q(sb.from("calificaciones").upsert(up, { onConflict: "evaluacion_id,estudiante_id" }));
        for (const [ev, est] of del) await q(sb.from("calificaciones").delete().eq("evaluacion_id", ev).eq("estudiante_id", est));
        ctx.toast(`${cambios.size} nota(s) guardadas`); pintar();
      } catch (e) { ctx.toast(e.message, "mal"); btnGuardar.disabled = false; }
    } }, "Guardar notas");

    cont.replaceChildren(
      cerrado ? h("div.aviso.ojo", "Este corte está cerrado: solo la dirección puede modificar notas.") : null,
      pesos > 0 && Math.abs(pesos - 100) > .01 ? h("div.aviso.ojo", `Los pesos de ${a.nombre} en este corte suman ${pesos}%. Ajusta a 100% para que la nota del corte sea exacta.`) : null,
      h("section.hoja",
        h("div.hoja-titulo", h("h2", `${a.nombre} · ${sec.nombre} · ${per?.nombre}`),
          h("span", { style: "display:flex;gap:.5rem;flex-wrap:wrap" },
            cerrado ? null : h("button.btn.btn-sec.btn-sm", { onclick: () => nuevaEval(null) }, h("span", { html: ICONOS.mas_add }), "Evaluación"), cerrado ? null : btnGuardar)),
        !evals.length ? h("div.vacio", h("p", "Sin evaluaciones en este corte."), cerrado ? null : h("button.btn", { onclick: () => nuevaEval(null) }, "Crear la primera")) :
        h("div.tabla-envoltura", h("table.registro.cuaderno",
          h("thead", h("tr", h("th", "Estudiante"),
            evals.map((ev) => h("th.derecha", h("button.btn.btn-texto.btn-sm", { style: "padding:0;min-height:0;font-weight:700", disabled: cerrado, onclick: () => menuEval(ev) }, ev.titulo),
              h("small", `${fechaCorta(ev.fecha)} · ${ev.tipo === "recuperacion" ? "recuperación" : Number(ev.peso) + "%"}`))),
            h("th.derecha", "Nota del corte"))),
          h("tbody", alumnos.map((al) => h("tr",
            h("td", h("a.fila-enlace", { href: `#/estudiantes/${al.estudiante_id}` }, nombreCompleto(al.estudiantes))),
            evals.map((ev) => { const k = `${ev.id}|${al.estudiante_id}`; const v0 = val[k] == null ? null : Number(val[k]);
              return h("td.derecha", h("input", { type: "number", inputMode: "decimal", min: 0, max: ev.puntaje_max, step: "0.5", value: v0 ?? "", disabled: cerrado,
                "aria-label": `${ev.titulo}: ${nombreCompleto(al.estudiantes)}`, oninput: (e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  if (v != null && (v < 0 || v > Number(ev.puntaje_max))) { e.target.setCustomValidity(`Entre 0 y ${Number(ev.puntaje_max)}`); e.target.reportValidity(); return; }
                  e.target.setCustomValidity(""); e.target.classList.toggle("cambiado", v !== v0);
                  if (v === v0) cambios.delete(k); else cambios.set(k, v);
                  btnGuardar.disabled = !cambios.size; btnGuardar.textContent = cambios.size ? `Guardar ${cambios.size} nota(s)` : "Guardar notas";
                } })); }),
            h("td.derecha", notaCelda(N[al.estudiante_id]?.final, E.minima, E.cuali)))))))),
      h("p.tenue", "Toca el título de una evaluación para editarla o eliminarla. La nota del corte se calcula con los pesos; si hay recuperación y es mayor, la reemplaza."));

    function menuEval(ev) {
      nuevaEval(ev);
      document.querySelector("dialog.modal .modal-pie")?.prepend(h("button.btn.btn-texto", { type: "button", style: "margin-right:auto", onclick: async () => {
        if (!(await confirmar("Eliminar evaluación", `Se borrarán las notas de «${ev.titulo}».`, { boton: "Eliminar", peligro: true }))) return;
        try { await q(sb.from("evaluaciones").delete().eq("id", ev.id)); document.querySelector("dialog.modal")?.remove(); ctx.toast("Evaluación eliminada"); pintar(); } catch (e) { ctx.toast(e.message, "mal"); }
      } }, "Eliminar"));
    }
  }
  controles();
  pintar();
}
export { cualitativa };
