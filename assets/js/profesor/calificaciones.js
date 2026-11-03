// Calificaciones: evaluaciones con ponderación y cuaderno de notas.
// El promedio lo calcula el servidor (d360_promedios_grupo).
import { sb, q } from "../core/sb.js";
import { h, formularioModal, confirmar, fechaCorta, hoyISO, nombreCompleto, nota, descargarCSV } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";

export const TIPOS = [["examen", "Examen"], ["tarea", "Tarea"], ["proyecto", "Proyecto"], ["practica", "Práctica"], ["participacion", "Participación"], ["otro", "Otro"]];

export function editarEvaluacion(ctx, grupoId, ev, alGuardar, tipoInicial) {
  formularioModal(ev ? "Editar evaluación" : (tipoInicial === "tarea" ? "Nueva tarea" : "Nueva evaluación"), [
    { name: "titulo", label: "Título", required: true, maxlength: 140, placeholder: "Ej.: Examen parcial 1", full: true },
    { name: "tipo", label: "Tipo", type: "select", options: TIPOS, value: tipoInicial || "examen" },
    { name: "fecha", label: tipoInicial === "tarea" || ev?.tipo === "tarea" ? "Fecha de entrega" : "Fecha", type: "date", required: true, value: hoyISO() },
    { name: "peso", label: "Peso en el promedio (%)", type: "number", min: 0, max: 100, step: "0.5", value: 0,
      help: "Déjalo en 0 si todas valen lo mismo." },
    { name: "puntaje_max", label: "Puntaje máximo", type: "number", min: 1, max: 1000, step: "0.5", value: 100, required: true },
    { name: "descripcion", label: "Indicaciones", type: "textarea", full: true },
  ], ev, async (d, cerrar) => {
    d.peso = d.peso ?? 0;
    if (ev) await q(sb.from("evaluaciones").update(d).eq("id", ev.id));
    else await q(sb.from("evaluaciones").insert({ ...d, cuenta_id: ctx.id, grupo_id: grupoId }));
    cerrar(); ctx.toast("Guardado"); alGuardar?.();
  });
}

export async function render(el, ctx, { params }) {
  const grupos = (await ctx.datos.grupos()).filter((g) => g.estado !== "cancelado");
  if (!grupos.length) {
    el.append(ctx.titulo("Calificaciones"), h("div.vacio", h("h3", "Primero crea un grupo"), h("a.btn", { href: "#/grupos" }, "Ir a Grupos")));
    return;
  }
  let grupoId = grupos.some((g) => g.id === params.get("grupo")) ? params.get("grupo") : grupos.find((g) => g.estado === "activo")?.id || grupos[0].id;
  const sel = h("select", { "aria-label": "Grupo", style: "max-width:360px", onchange: (e) => { grupoId = e.target.value; history.replaceState(null, "", `#/calificaciones?grupo=${grupoId}`); pintar(); } },
    grupos.map((g) => h("option", { value: g.id, selected: g.id === grupoId }, g.nombre + (g.estado !== "activo" ? ` (${g.estado})` : ""))));
  const cuerpo = h("div");
  el.append(ctx.titulo("Calificaciones",
    h("button.btn", { onclick: () => editarEvaluacion(ctx, grupoId, null, pintar) }, h("span", { html: ICONOS.mas_add }), "Nueva evaluación")),
    h("div", { style: "margin-bottom:1rem" }, sel), cuerpo);

  async function pintar() {
    cuerpo.replaceChildren(h("p.tenue", "Cargando…"));
    const [evals, miembros, proms] = await Promise.all([
      q(sb.from("evaluaciones").select("*").eq("grupo_id", grupoId).order("fecha").order("creado")),
      q(sb.from("grupo_estudiantes").select("estudiante_id, estudiantes(nombres,apellidos)").eq("grupo_id", grupoId).eq("estado", "activo")),
      q(sb.rpc("d360_promedios_grupo", { p_grupo: grupoId })),
    ]);
    const notas = evals.length ? await q(sb.from("calificaciones").select("id,evaluacion_id,estudiante_id,puntaje,entregado").in("evaluacion_id", evals.map((e) => e.id))) : [];
    miembros.sort((a, b) => nombreCompleto(a.estudiantes).localeCompare(nombreCompleto(b.estudiantes)));
    const valor = {}; notas.forEach((n) => (valor[`${n.evaluacion_id}|${n.estudiante_id}`] = n.puntaje));
    const promedio = Object.fromEntries(proms.map((p) => [p.estudiante_id, p]));
    const sumaPesos = evals.reduce((s, e) => s + Number(e.peso), 0);

    if (!evals.length) {
      cuerpo.replaceChildren(h("div.vacio", h("h3", "Sin evaluaciones en este grupo"),
        h("p", "Crea exámenes, tareas o proyectos. Si les pones peso, el promedio se calcula con esa ponderación."),
        h("button.btn", { onclick: () => editarEvaluacion(ctx, grupoId, null, pintar) }, "Crear la primera")));
      return;
    }
    if (!miembros.length) {
      cuerpo.replaceChildren(h("div.aviso.ojo", "Este grupo no tiene estudiantes activos. ", h("a", { href: `#/grupos/${grupoId}` }, "Agregar estudiantes")));
    }

    const cambios = new Map();
    const guardar = h("button.btn", { disabled: true, onclick: guardarCambios }, "Guardar notas");
    const tablaNotas = h("div.tabla-envoltura",
      h("table.registro.cuaderno",
        h("thead", h("tr",
          h("th", "Estudiante"),
          evals.map((ev) => h("th.derecha",
            h("button.btn.btn-texto.btn-sm", { style: "padding:0;min-height:0;font-weight:700", title: "Editar evaluación", onclick: () => menuEval(ev) }, ev.titulo),
            h("small", `${fechaCorta(ev.fecha)} · /${Number(ev.puntaje_max)}${Number(ev.peso) ? ` · ${Number(ev.peso)}%` : ""}`))),
          h("th.derecha", "Promedio"))),
        h("tbody", miembros.map((m) => h("tr",
          h("td", h("a.fila-enlace", { href: `#/estudiantes/${m.estudiante_id}` }, nombreCompleto(m.estudiantes))),
          evals.map((ev) => {
            const k = `${ev.id}|${m.estudiante_id}`;
            const v = valor[k];
            return h("td.derecha", h("input", { type: "number", inputMode: "decimal", min: 0, max: ev.puntaje_max, step: "0.01",
              value: v == null ? "" : Number(v), "aria-label": `${ev.titulo}: ${nombreCompleto(m.estudiantes)}`,
              oninput: (e) => {
                const n = e.target.value === "" ? null : Number(e.target.value);
                if (n != null && (n < 0 || n > Number(ev.puntaje_max))) { e.target.setCustomValidity(`Entre 0 y ${Number(ev.puntaje_max)}`); e.target.reportValidity(); return; }
                e.target.setCustomValidity("");
                e.target.classList.toggle("cambiado", n !== (v == null ? null : Number(v)));
                if (n === (v == null ? null : Number(v))) cambios.delete(k); else cambios.set(k, { ev, est: m.estudiante_id, n });
                guardar.disabled = cambios.size === 0;
                guardar.textContent = cambios.size ? `Guardar ${cambios.size} nota(s)` : "Guardar notas";
              } }));
          }),
          h("td.derecha", nota(promedio[m.estudiante_id]?.promedio)))))));

    cuerpo.replaceChildren(
      sumaPesos > 0 && Math.abs(sumaPesos - 100) > 0.01
        ? h("div.aviso.ojo", `Los pesos suman ${sumaPesos}%. El promedio se calcula proporcionalmente con lo ya calificado; ajusta a 100% para tener la nota final exacta.`) : null,
      h("section.hoja",
        h("div.hoja-titulo", h("h2", `${evals.length} evaluaciones · ${miembros.length} estudiantes`),
          h("div", { style: "display:flex;gap:.5rem" },
            ctx.f("exportar") ? h("button.btn.btn-sec.btn-sm", { onclick: () => descargarCSV("calificaciones.csv",
              [["Estudiante", ...evals.map((e) => e.titulo), "Promedio"],
               ...miembros.map((m) => [nombreCompleto(m.estudiantes), ...evals.map((e) => valor[`${e.id}|${m.estudiante_id}`] ?? ""), promedio[m.estudiante_id]?.promedio ?? ""])]) }, "Exportar") : null,
            guardar)),
        tablaNotas,
        h("p.tenue", { style: "margin-top:.75rem" }, "Escala 0–100. Aprobado desde 60. Toca el título de una evaluación para editarla o borrarla.")));

    async function guardarCambios() {
      guardar.disabled = true;
      const upserts = [], borrar = [];
      for (const { ev, est, n } of cambios.values()) {
        if (n == null) borrar.push({ ev: ev.id, est });
        else upserts.push({ cuenta_id: ctx.id, evaluacion_id: ev.id, estudiante_id: est, puntaje: n, entregado: true, actualizado: new Date().toISOString() });
      }
      try {
        if (upserts.length) await q(sb.from("calificaciones").upsert(upserts, { onConflict: "evaluacion_id,estudiante_id" }));
        for (const b of borrar) await q(sb.from("calificaciones").delete().eq("evaluacion_id", b.ev).eq("estudiante_id", b.est));
        ctx.toast("Notas guardadas"); pintar();
      } catch (e) { ctx.toast(e.message, "mal"); guardar.disabled = false; }
    }
  }

  async function menuEval(ev) {
    editarEvaluacion(ctx, grupoId, ev, pintar);
    // Botón de borrar dentro del modal abierto
    const pie = document.querySelector("dialog.modal .modal-pie");
    pie?.prepend(h("button.btn.btn-texto", { type: "button", style: "margin-right:auto", onclick: async () => {
      if (!(await confirmar("Eliminar evaluación", `Se borrarán también las notas de «${ev.titulo}».`, { boton: "Eliminar", peligro: true }))) return;
      try { await q(sb.from("evaluaciones").delete().eq("id", ev.id)); document.querySelector("dialog.modal")?.remove(); ctx.toast("Evaluación eliminada"); pintar(); }
      catch (e) { ctx.toast(e.message, "mal"); }
    } }, "Eliminar"));
  }

  pintar();
}
