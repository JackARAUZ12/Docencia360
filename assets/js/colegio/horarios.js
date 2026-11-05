// Horarios del colegio: cuadrícula semanal por sección, por docente o por aula.
// El servidor valida que no choquen docentes, aulas ni secciones.
import { sb, q } from "../core/sb.js";
import { h, formularioModal, confirmar, hora, DIAS } from "../core/ui.js";
import { estructura, selector } from "./util.js";

const BLOQUES = [["07:00", "07:45"], ["07:45", "08:30"], ["08:50", "09:35"], ["09:35", "10:20"], ["10:30", "11:15"], ["11:15", "12:00"]];

export async function render(el, ctx, { params }) {
  const E = await estructura(ctx);
  let modo = ctx.esDocente ? "docente" : (params.get("modo") || "seccion");
  let ref = params.get("ref");
  const cont = h("div");
  const ctrl = h("div", { style: "display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center" });
  el.append(ctx.titulo(ctx.esDocente ? "Mi horario" : "Horarios"), ctrl, cont);

  const opciones = () => modo === "seccion" ? E.secciones.map((s) => [s.id, s.nombre])
    : modo === "docente" ? (ctx.esDocente ? [[ctx.cuenta.miembro_id, ctx.cuenta.miembro_nombre]] : E.docentes.filter((d) => d.activo).map((d) => [d.id, d.nombre]))
    : E.aulas.map((a) => [a.id, a.nombre]);

  function controles() {
    const ops = opciones();
    if (!ops.some(([v]) => v === ref)) ref = ops[0]?.[0];
    const ir = () => { history.replaceState(null, "", `#/horarios?modo=${modo}&ref=${ref || ""}`); controles(); pintar(); };
    ctrl.replaceChildren(
      ctx.esDocente ? null : h("div.segmentos", { role: "group" }, [["seccion", "Por sección"], ["docente", "Por docente"], ["aula", "Por aula"]].map(([v, t]) =>
        h("button", { type: "button", "aria-pressed": String(v === modo), onclick: () => { modo = v; ref = null; ir(); } }, t))),
      ops.length ? selector(ops, ref, (v) => { ref = v; ir(); }, "Ver") : h("span.tenue", "No hay registros para mostrar."));
  }

  async function pintar() {
    if (!ref) { cont.replaceChildren(h("div.vacio", modo === "aula" ? "Registra aulas en «Grados y secciones»." : "Crea secciones y docentes primero.")); return; }
    const col = modo === "seccion" ? "grupo_id" : modo === "docente" ? "miembro_id" : "aula_id";
    const filas = await q(sb.from("horarios").select("*").eq("cuenta_id", ctx.id).eq(col, ref).order("hora_inicio"));
    const horas = [...new Set([...BLOQUES.map((b) => b[0]), ...filas.map((f) => hora(f.hora_inicio))])].sort();
    const finDe = (ini) => BLOQUES.find((b) => b[0] === ini)?.[1] || hora(filas.find((f) => hora(f.hora_inicio) === ini)?.hora_fin);
    const dias = filas.some((f) => f.dia === 6) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    const editable = ctx.esGestor && modo === "seccion";
    const horasSem = filas.reduce((s, f) => s + (new Date(`2000-01-01T${f.hora_fin}`) - new Date(`2000-01-01T${f.hora_inicio}`)) / 36e5, 0);

    const agregar = (dia, ini) => {
      const sec = E.seccion(ref);
      const plan = E.planDe(sec.grado_id);
      formularioModal(`Clase · ${DIAS[dia]} ${ini}`, [
        { name: "asignatura_id", label: "Asignatura", type: "select", required: true, options: plan.map((a) => [a.id, a.nombre + (E.docenteDe(ref, a.id) ? ` · ${E.docente(E.docenteDe(ref, a.id).miembro_id)?.nombre}` : " · sin docente")]) },
        { name: "hora_inicio", label: "Desde", type: "time", required: true, value: ini },
        { name: "hora_fin", label: "Hasta", type: "time", required: true, value: finDe(ini) },
        { name: "aula_id", label: "Aula", type: "select", placeholder: "Aula de la sección", options: E.aulas.map((a) => [a.id, a.nombre]) },
      ], {}, async (d, cerrar) => {
        if (d.hora_fin <= d.hora_inicio) throw new Error("La hora de fin debe ser posterior al inicio.");
        await q(sb.from("horarios").insert({ cuenta_id: ctx.id, grupo_id: ref, dia, asignatura_id: d.asignatura_id, hora_inicio: d.hora_inicio, hora_fin: d.hora_fin,
          miembro_id: E.docenteDe(ref, d.asignatura_id)?.miembro_id || null, aula_id: d.aula_id || sec.aula_id || null }));
        cerrar(); ctx.toast("Clase agregada"); pintar();
      }, { boton: "Agregar" });
    };

    const celda = (dia, ini) => {
      const f = filas.find((x) => x.dia === dia && hora(x.hora_inicio) === ini);
      if (!f) return h("div.libre", editable ? { onclick: () => agregar(dia, ini), title: "Agregar clase" } : {}, editable ? "+" : "");
      const a = E.asignatura(f.asignatura_id), d = E.docente(f.miembro_id), s = E.seccion(f.grupo_id), au = E.aulas.find((x) => x.id === f.aula_id);
      return h("div", h("div.clase", editable ? { style: "cursor:pointer", onclick: async () => {
        if (await confirmar("Quitar clase", `¿Quitar ${a?.nombre || "la clase"} del ${DIAS[dia]} a las ${ini}?`, { boton: "Quitar" })) { await q(sb.from("horarios").delete().eq("id", f.id)); pintar(); }
      } } : {},
        h("strong", a?.nombre || "Clase"),
        h("span", [modo !== "seccion" ? s?.nombre : null, modo !== "docente" ? d?.nombre : null, modo !== "aula" ? au?.nombre : null, `${hora(f.hora_inicio)}–${hora(f.hora_fin)}`].filter(Boolean).join(" · "))));
    };

    cont.replaceChildren(
      h("section.hoja",
        h("div.hoja-titulo", h("h2", opciones().find(([v]) => v === ref)?.[1]), h("span.tenue", `${filas.length} clases · ${horasSem.toFixed(1)} horas por semana`)),
        h("div.tabla-envoltura", h("div.horario",
          h("div.cab", ""), dias.map((d) => h("div.cab", DIAS[d])),
          horas.map((ini) => [h("div.hora", ini, h("br"), finDe(ini) || ""), dias.map((d) => celda(d, ini))]))),
        editable ? h("p.tenue", { style: "margin-top:.75rem" }, "Toca «+» para agregar una clase y una clase para quitarla. Si el docente o el aula ya están ocupados a esa hora, el sistema no lo permite.") : null));
  }
  controles();
  pintar();
}
