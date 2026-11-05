// Boletines de calificaciones por sección y corte: notas de todos los cortes
// hasta el elegido, promedio, escala cualitativa, asistencia, conducta y
// comentario del maestro guía. Se imprimen (o guardan en PDF) todos juntos.
import { sb, q } from "../core/sb.js";
import { h, fecha, hoyISO, nombreCompleto, imprimir } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { estructura, cualitativa, CUALI_TEXTO, urlArchivo, selector } from "./util.js";

export async function render(el, ctx, { params }) {
  const E = await estructura(ctx);
  const secs = E.misSecciones();
  if (!secs.length || !E.periodos.length) { el.append(ctx.titulo("Boletines"), h("div.vacio", "Necesitas secciones y cortes evaluativos para generar boletines.")); return; }
  let seccion = secs.find((s) => s.id === params.get("seccion"))?.id || secs[0].id;
  let periodo = params.get("periodo") || E.periodoActual()?.id;
  let vista = params.get("vista") || "boletines";
  const cont = h("div");
  const ctrl = h("div.no-imprimir", { style: "display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center" });
  el.append(ctx.titulo("Boletines", h("button.btn", { onclick: () => imprimir(cont.querySelector(".lote") || cont) }, h("span", { html: ICONOS.imprimir }), "Imprimir todos / PDF")), ctrl, cont);

  function controles() {
    const ir = () => { history.replaceState(null, "", `#/boletines?seccion=${seccion}&periodo=${periodo}&vista=${vista}`); controles(); pintar(); };
    ctrl.replaceChildren(
      selector(secs.map((s) => [s.id, s.nombre]), seccion, (v) => { seccion = v; ir(); }, "Sección"),
      selector(E.periodos.map((p) => [p.id, p.nombre]), periodo, (v) => { periodo = v; ir(); }, "Corte"),
      h("div.segmentos", { role: "group" }, [["boletines", "Vista previa"], ["comentarios", "Conducta y comentarios"]].map(([v, t]) =>
        h("button", { type: "button", "aria-pressed": String(v === vista), onclick: () => { vista = v; ir(); } }, t))));
  }

  async function datos() {
    const sec = E.seccion(seccion);
    const idx = E.periodos.findIndex((p) => p.id === periodo);
    const pers = E.periodos.slice(0, idx + 1);
    const alumnos = (await q(sb.from("grupo_estudiantes").select("estudiante_id, estudiantes(id,nombres,apellidos,codigo,foto_url)").eq("grupo_id", seccion).eq("estado", "activo")))
      .sort((a, b) => nombreCompleto(a.estudiantes).localeCompare(nombreCompleto(b.estudiantes)));
    const ids = alumnos.map((a) => a.estudiante_id);
    const [notasPer, asisPer, coms] = await Promise.all([
      Promise.all(pers.map((p) => q(sb.rpc("d360_notas_seccion", { p_grupo: seccion, p_periodo: p.id })))),
      Promise.all(pers.map((p) => q(sb.rpc("d360_resumen_asistencia", { p_cuenta: ctx.id, p_grupo: seccion, p_desde: p.inicio, p_hasta: p.fin })))),
      ids.length ? q(sb.from("boletin_comentarios").select("*").in("estudiante_id", ids).in("periodo_id", pers.map((p) => p.id))) : [],
    ]);
    return { sec, pers, alumnos, notasPer, asisPer, coms };
  }

  async function pintar() {
    cont.replaceChildren(h("p.tenue", "Preparando boletines…"));
    const D = await datos();
    const plan = E.planDe(D.sec.grado_id);
    const C = {}; D.coms.forEach((c) => (C[`${c.estudiante_id}|${c.periodo_id}`] = c));

    if (vista === "comentarios") {
      const puede = ctx.esGestor || !!E.asignaciones.find((x) => x.grupo_id === seccion && x.miembro_id === ctx.cuenta.miembro_id);
      cont.replaceChildren(h("section.hoja",
        h("h2", `Conducta y comentarios · ${D.sec.nombre} · ${E.periodos.find((p) => p.id === periodo)?.nombre}`),
        h("p.suave", "Lo escribe el maestro guía. Aparece en el boletín de cada estudiante."),
        h("div.tabla-envoltura", h("table.registro",
          h("thead", h("tr", h("th", "Estudiante"), h("th", "Conducta"), h("th", "Comentario"))),
          h("tbody", D.alumnos.map((al) => {
            const c = C[`${al.estudiante_id}|${periodo}`] || {};
            const guardar = async (cambio) => {
              try {
                await q(sb.from("boletin_comentarios").upsert({ cuenta_id: ctx.id, estudiante_id: al.estudiante_id, periodo_id: periodo,
                  conducta: cambio.conducta ?? c.conducta ?? null, comentario: cambio.comentario ?? c.comentario ?? null, actualizado: new Date().toISOString() }, { onConflict: "estudiante_id,periodo_id" }));
                Object.assign(c, cambio); ctx.toast("Guardado");
              } catch (e) { ctx.toast(e.message, "mal"); }
            };
            return h("tr",
              h("td", h("strong", nombreCompleto(al.estudiantes))),
              h("td", h("select", { disabled: !puede, style: "width:auto", onchange: (e) => guardar({ conducta: e.target.value || null }) },
                h("option", { value: "" }, "—"), ["AA", "AS", "AF", "AI"].map((v) => h("option", { value: v, selected: c.conducta === v }, v)))),
              h("td", h("input", { value: c.comentario || "", disabled: !puede, maxLength: 300, placeholder: "Comentario para la familia",
                onchange: (e) => guardar({ comentario: e.target.value.trim() || null }) })));
          }))))));
      return;
    }

    const logo = await urlArchivo(E.cuenta.logo_url);
    const guia = E.docente(E.guiaDe(seccion)?.miembro_id);
    const anio = E.cfg.anio_lectivo || new Date().getFullYear();
    const iniciales = E.cuenta.nombre.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("");
    const lote = h("div.lote", D.alumnos.map((al) => {
      const id = al.estudiante_id;
      const filas = plan.map((a) => {
        const vs = D.pers.map((p, i) => D.notasPer[i].find((x) => x.estudiante_id === id && x.asignatura_id === a.id)?.final ?? null);
        const con = vs.filter((v) => v != null);
        const prom = con.length ? con.reduce((s, v) => s + Number(v), 0) / con.length : null;
        return { a, vs, prom };
      });
      const promGeneral = (() => { const v = filas.map((f) => f.prom).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; })();
      const celda = (v) => v == null ? h("td", "—") : h("td", { className: Number(v) < E.minima ? "rep" : "" }, Number(v).toFixed(0), E.cuali ? ` ${cualitativa(v)}` : "");
      return h("article.boletin",
        h("div.cab", logo ? h("img", { src: logo, alt: "Logo" }) : h("div.escudo", iniciales),
          h("div", h("h3", E.cuenta.nombre), h("div", { style: "font-size:.85rem" }, E.cfg.lema || "", E.cuenta.direccion ? h("div", E.cuenta.direccion) : null)),
          h("div", { style: "text-align:right" }, h("strong", "Boletín de calificaciones"), h("div", `Año lectivo ${anio}`), h("div", D.pers[D.pers.length - 1]?.nombre))),
        h("div.datos",
          h("div", "Estudiante: ", h("b", nombreCompleto(al.estudiantes))),
          h("div", "Código: ", h("b", al.estudiantes.codigo || "—")),
          h("div", "Grado y sección: ", h("b", `${E.grado(D.sec.grado_id)?.nombre || ""} · ${D.sec.nombre}`)),
          h("div", "Maestro guía: ", h("b", guia?.nombre || "—"))),
        h("table",
          h("thead", h("tr", h("th", "Asignatura"), D.pers.map((p) => h("th", p.nombre)), h("th", "Promedio"))),
          h("tbody", filas.map((f) => h("tr", h("td", f.a.nombre), f.vs.map(celda), celda(f.prom))),
            h("tr", h("td", h("b", "Promedio general")), D.pers.map(() => h("td", "")), celda(promGeneral)),
            h("tr", h("td", "Asistencia"), D.pers.map((p, i) => { const x = D.asisPer[i].find((y) => y.estudiante_id === id); return h("td", x?.porcentaje == null ? "—" : `${x.porcentaje}%`); }), h("td", "")),
            h("tr", h("td", "Ausencias / tardanzas"), D.pers.map((p, i) => { const x = D.asisPer[i].find((y) => y.estudiante_id === id); return h("td", x ? `${x.ausentes} / ${x.tardes}` : "—"); }), h("td", "")),
            h("tr", h("td", "Conducta"), D.pers.map((p) => h("td", C[`${id}|${p.id}`]?.conducta || "—")), h("td", "")))),
        C[`${id}|${periodo}`]?.comentario ? h("p", { style: "margin:.75rem 0 0" }, h("b", "Observación del maestro guía: "), C[`${id}|${periodo}`].comentario) : null,
        h("div.pie", h("span", guia?.nombre || "Maestro guía"), h("span", E.cfg.certificado?.firma1 || "Dirección"), h("span", "Padre, madre o tutor")),
        h("p.leyenda", `Nota mínima de aprobación: ${E.minima}. ` + (E.cuali ? Object.entries(CUALI_TEXTO).map(([k, t]) => `${k}: ${t}`).join(" · ") + ". " : "") + `Emitido el ${fecha(hoyISO())}.`));
    }));
    cont.replaceChildren(
      h("p.tenue.no-imprimir", `${D.alumnos.length} boletines de ${D.sec.nombre}. Las notas en rojo están por debajo de ${E.minima}.`),
      D.alumnos.length ? lote : h("div.vacio", "La sección no tiene estudiantes."));
  }
  controles();
  pintar();
}
