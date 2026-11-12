// Calificaciones: evaluaciones con ponderación y cuaderno de notas.
// El promedio lo calcula el servidor (d360_promedios_grupo).
import { sb, q } from "../core/sb.js";
import { h, formularioModal, confirmar, fechaCorta, hoyISO, nombreCompleto, nota, descargarCSV } from "../core/ui.js";
const ESTRECHA = () => matchMedia("(max-width: 700px)").matches;
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
    let id = ev?.id;
    if (ev) await q(sb.from("evaluaciones").update(d).eq("id", ev.id));
    else id = (await q(sb.from("evaluaciones").insert({ ...d, cuenta_id: ctx.id, grupo_id: grupoId }).select("id").single()))?.id;
    cerrar(); ctx.toast(ev ? "Guardado" : "Evaluación creada: ya puedes poner las notas"); alGuardar?.(id);
  });
}

export async function render(el, ctx, { params }) {
  const grupos = (await ctx.gruposVisibles()).filter((g) => g.estado !== "cancelado");
  if (!grupos.length) {
    el.append(ctx.titulo("Calificaciones"), h("div.vacio", h("h3", "Primero crea un grupo"), h("a.btn", { href: "#/grupos" }, "Ir a Grupos")));
    return;
  }
  let grupoId = grupos.some((g) => g.id === params.get("grupo")) ? params.get("grupo") : grupos.find((g) => g.estado === "activo")?.id || grupos[0].id;
  let evalSel = params.get("evaluacion") || null;
  let vista = params.get("vista") || (evalSel || ESTRECHA() ? "evaluacion" : "cuadro");
  let pendientes = 0;
  const seguro = async () => !pendientes || await confirmar("Notas sin guardar", `Tienes ${pendientes} nota(s) sin guardar. Si continúas, se perderán.`, { boton: "Continuar sin guardar", peligro: true });
  const segs = h("div.segmentos", { role: "group", "aria-label": "Vista" }, [["evaluacion", "Por evaluación"], ["cuadro", "Cuadro completo"]].map(([v, t]) =>
    h("button", { type: "button", "aria-pressed": String(v === vista), onclick: async (e) => {
      const b = e.currentTarget; if (v === vista || !(await seguro())) return;
      vista = v; segs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); pintar(); } }, t)));
  const sel = h("select", { "aria-label": "Grupo", onchange: async (e) => {
    if (!(await seguro())) { e.target.value = grupoId; return; }
    grupoId = e.target.value; evalSel = null; history.replaceState(null, "", `#/calificaciones?grupo=${grupoId}`); pintar(); } },
    grupos.map((g) => h("option", { value: g.id, selected: g.id === grupoId }, g.nombre + (g.estado !== "activo" ? ` (${g.estado})` : ""))));
  const cuerpo = h("div");
  el.append(ctx.titulo("Calificaciones",
    h("button.btn", { onclick: () => editarEvaluacion(ctx, grupoId, null, irA) }, h("span", { html: ICONOS.mas_add }), "Nueva evaluación")),
    h("div.barra-filtros", sel, segs), cuerpo);
  if (params.get("nuevo") === "1") { history.replaceState(null, "", `#/calificaciones?grupo=${grupoId}`); setTimeout(() => editarEvaluacion(ctx, grupoId, null, irA), 50); }
  // Tras crear una evaluación, se abre lista para calificarla
  function irA(id) { if (id) { evalSel = id; vista = "evaluacion"; segs.querySelectorAll("button").forEach((x, i) => x.setAttribute("aria-pressed", String(i === 0))); } pintar(); }

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
        h("button.btn", { onclick: () => editarEvaluacion(ctx, grupoId, null, irA) }, "Crear la primera")));
      return;
    }
    if (!miembros.length) {
      cuerpo.replaceChildren(h("div.aviso.ojo", "Este grupo no tiene estudiantes activos. ", h("a", { href: `#/grupos/${grupoId}` }, "Agregar estudiantes")));
      return;
    }

    const cambios = new Map();
    pendientes = 0;
    const guardar = h("button.btn", { disabled: true, onclick: guardarCambios }, "Guardar notas");
    // Casilla de nota: valida el rango y registra el cambio
    const casilla = (ev, m, extra = {}) => {
      const k = `${ev.id}|${m.estudiante_id}`;
      const v = valor[k];
      return h("input", { type: "number", inputMode: "decimal", min: 0, max: ev.puntaje_max, step: "0.01", enterKeyHint: "next",
        value: v == null ? "" : Number(v), "aria-label": `${ev.titulo}: ${nombreCompleto(m.estudiantes)}`, ...extra,
        onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); const t = [...cuerpo.querySelectorAll("input[type=number]")]; t[t.indexOf(e.target) + 1]?.focus(); } },
        oninput: (e) => {
          const n = e.target.value === "" ? null : Number(e.target.value);
          if (n != null && (n < 0 || n > Number(ev.puntaje_max))) { e.target.setCustomValidity(`Entre 0 y ${Number(ev.puntaje_max)}`); e.target.reportValidity(); return; }
          e.target.setCustomValidity("");
          e.target.classList.toggle("cambiado", n !== (v == null ? null : Number(v)));
          if (n === (v == null ? null : Number(v))) cambios.delete(k); else cambios.set(k, { ev, est: m.estudiante_id, n });
          pendientes = cambios.size;
          guardar.disabled = cambios.size === 0;
          guardar.textContent = cambios.size ? `Guardar ${cambios.size} nota(s)` : "Guardar notas";
        } });
    };
    if (vista === "evaluacion") return porEvaluacion();
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
          evals.map((ev) => h("td.derecha", casilla(ev, m))),
          h("td.derecha", nota(promedio[m.estudiante_id]?.promedio)))))));

    cuerpo.replaceChildren(
      sumaPesos > 0 && Math.abs(sumaPesos - 100) > 0.01
        ? h("div.aviso.ojo", `Los pesos suman ${sumaPesos}%. El promedio se calcula proporcionalmente con lo ya calificado; ajusta a 100% para tener la nota final exacta.`) : null,
      h("section.hoja",
        h("div.hoja-titulo", h("h2", `${evals.length} evaluaciones · ${miembros.length} estudiantes`),
          h("div", { style: "display:flex;gap:.5rem" },
            ctx.f("exportar") ? h("button.btn.btn-sec.btn-sm", { onclick: () => descargarCSV("calificaciones.csv",
              [["Estudiante", ...evals.map((e) => e.titulo), "Promedio"],
               ...miembros.map((m) => [nombreCompleto(m.estudiantes), ...evals.map((e) => valor[`${e.id}|${m.estudiante_id}`] ?? ""), promedio[m.estudiante_id]?.promedio ?? ""])]) }, "Exportar") : ctx.mejora("Exportar a Excel"),
            guardar)),
        tablaNotas,
        h("p.tenue", { style: "margin-top:.75rem" }, "Escala 0–100. Aprobado desde 60. Toca el título de una evaluación para editarla o borrarla.")));

    function porEvaluacion() {
      const sinNota = (ev) => miembros.filter((m) => valor[`${ev.id}|${m.estudiante_id}`] == null).length;
      if (!evals.some((e) => e.id === evalSel)) evalSel = (evals.find((e) => sinNota(e) > 0 && e.fecha <= hoyISO()) || evals[evals.length - 1]).id;
      const ev = evals.find((e) => e.id === evalSel);
      const selEval = h("select", { "aria-label": "Evaluación", onchange: async (e) => {
        if (!(await seguro())) { e.target.value = evalSel; return; }
        evalSel = e.target.value; pintar(); } },
        evals.map((e) => h("option", { value: e.id, selected: e.id === evalSel }, `${e.titulo} · ${fechaCorta(e.fecha)}${sinNota(e) ? ` · faltan ${sinNota(e)}` : " · completa"}`)));
      const faltan = sinNota(ev);
      cuerpo.replaceChildren(
        h("section.hoja",
          h("div.barra-filtros", selEval,
            h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => menuEval(ev) }, "Editar evaluación")),
          h("p.tenue", { style: "margin:-.25rem 0 .75rem" }, `Sobre ${Number(ev.puntaje_max)} puntos${Number(ev.peso) ? ` · vale ${Number(ev.peso)}% del promedio` : ""} · `,
            faltan ? h("strong", `faltan ${faltan} de ${miembros.length}`) : "todos calificados"),
          miembros.length ? h("ul.calificar", miembros.map((m) => h("li",
            h("div", h("div.nombre", nombreCompleto(m.estudiantes)), h("div.tenue", "Promedio: ", nota(promedio[m.estudiante_id]?.promedio))),
            h("div.campo-nota", casilla(ev, m), h("span.tenue", `/ ${Number(ev.puntaje_max)}`))))) : null,
          h("div.pie-fijo", guardar)));
    }

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
        pendientes = 0; ctx.toast("Notas guardadas"); pintar();
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
