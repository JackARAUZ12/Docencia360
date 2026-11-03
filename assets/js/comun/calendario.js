// Calendario mensual: clases (del horario), evaluaciones y fechas importantes.
import { sb, q } from "../core/sb.js";
import { h, formularioModal, confirmar, modal, hora, fecha, hoyISO, DIAS } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";

const TIPOS = [["general", "General"], ["clase", "Clase extra"], ["evaluacion", "Evaluación"], ["feriado", "Feriado / sin clases"], ["reunion", "Reunión"], ["actividad", "Actividad"]];

export async function render(el, ctx, { params }) {
  const hoy = hoyISO();
  let [anio, mes] = (params.get("mes") || hoy.slice(0, 7)).split("-").map(Number);
  const grupos = await ctx.gruposVisibles();
  const cont = h("div");

  const evento = (ev, fechaInicial) => formularioModal(ev ? "Editar fecha" : "Nueva fecha importante", [
    { name: "titulo", label: "Título", required: true, full: true, maxlength: 140 },
    { name: "fecha", label: "Fecha", type: "date", required: true, value: fechaInicial || hoy },
    { name: "tipo", label: "Tipo", type: "select", options: TIPOS },
    { name: "hora_inicio", label: "Desde", type: "time" },
    { name: "hora_fin", label: "Hasta", type: "time" },
    { name: "grupo_id", label: "Grupo", type: "select", placeholder: "Todos / ninguno", options: grupos.map((g) => [g.id, g.nombre]) },
    { name: "descripcion", label: "Detalle", type: "textarea", full: true },
  ], ev, async (d, cerrar) => {
    if (d.hora_inicio && d.hora_fin && d.hora_fin <= d.hora_inicio) throw new Error("La hora de fin debe ser posterior al inicio.");
    if (ev) await q(sb.from("eventos").update(d).eq("id", ev.id));
    else await q(sb.from("eventos").insert({ ...d, cuenta_id: ctx.id }));
    cerrar(); ctx.toast("Guardado"); pintar();
  });

  el.append(ctx.titulo("Calendario", h("button.btn", { onclick: () => evento(null) }, h("span", { html: ICONOS.mas_add }), "Nueva fecha")), cont);

  async function pintar() {
    const ini = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const finD = new Date(Date.UTC(anio, mes, 0));
    const fin = finD.toISOString().slice(0, 10);
    const [horarios, evals, eventos] = await Promise.all([
      q(sb.from("horarios").select("dia,hora_inicio,hora_fin,grupo_id,grupos(nombre,estado,fecha_inicio,fecha_fin)").eq("cuenta_id", ctx.id)),
      q(sb.from("evaluaciones").select("id,titulo,tipo,fecha,grupo_id,grupos(nombre)").eq("cuenta_id", ctx.id).gte("fecha", ini).lte("fecha", fin)),
      q(sb.from("eventos").select("*").eq("cuenta_id", ctx.id).gte("fecha", ini).lte("fecha", fin).order("hora_inicio")),
    ]);
    const feriados = new Set(eventos.filter((e) => e.tipo === "feriado").map((e) => e.fecha));
    const delDia = (iso) => {
      const dow = ((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
      const clases = feriados.has(iso) ? [] : horarios.filter((x) => x.dia === dow && x.grupos?.estado === "activo"
        && (!x.grupos.fecha_inicio || x.grupos.fecha_inicio <= iso) && (!x.grupos.fecha_fin || x.grupos.fecha_fin >= iso))
        .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
      return {
        clases,
        evals: evals.filter((e) => e.fecha === iso),
        eventos: eventos.filter((e) => e.fecha === iso),
      };
    };

    const primerDow = (new Date(ini + "T00:00:00Z").getUTCDay() + 6) % 7;
    const celdas = [];
    for (let i = 0; i < primerDow; i++) celdas.push(h("div.dia.fuera"));
    for (let d = 1; d <= finD.getUTCDate(); d++) {
      const iso = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const x = delDia(iso);
      celdas.push(h("div.dia" + (iso === hoy ? ".hoy" : ""), { tabIndex: 0, role: "button", "aria-label": fecha(iso), onclick: () => detalleDia(iso, x), onkeydown: (e) => { if (e.key === "Enter") detalleDia(iso, x); } },
        h("span.n", d),
        x.eventos.map((e) => h("span.ev", e.titulo)),
        x.evals.map((e) => h("span.ev.eval", e.titulo)),
        x.clases.slice(0, 3).map((c) => h("span.ev.clase", `${hora(c.hora_inicio)} ${c.grupos.nombre}`))));
    }
    const nombreMes = new Intl.DateTimeFormat("es-NI", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(ini + "T00:00:00Z"));
    const mover = (n) => { mes += n; if (mes < 1) { mes = 12; anio--; } if (mes > 12) { mes = 1; anio++; } history.replaceState(null, "", `#/calendario?mes=${anio}-${String(mes).padStart(2, "0")}`); pintar(); };
    cont.replaceChildren(
      h("div.hoja-titulo", h("h2", nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)),
        h("div", { style: "display:flex;gap:.5rem" },
          h("button.btn.btn-sec.btn-sm", { onclick: () => mover(-1), "aria-label": "Mes anterior" }, "‹"),
          h("button.btn.btn-sec.btn-sm", { onclick: () => { [anio, mes] = hoy.slice(0, 7).split("-").map(Number); mover(0); } }, "Hoy"),
          h("button.btn.btn-sec.btn-sm", { onclick: () => mover(1), "aria-label": "Mes siguiente" }, "›"))),
      h("div.mes", DIAS.slice(1).map((d) => h("div.dsem", d.slice(0, 3))), celdas),
      h("p.tenue", { style: "margin-top:.75rem" }, "Gris: clases de tu horario · Rojo: evaluaciones y entregas · Color: fechas importantes. Toca un día para ver el detalle."),
    );
  }

  function detalleDia(iso, x) {
    const cuerpo = h("div",
      x.clases.length ? [h("h3", "Clases"), h("ul.agenda", x.clases.map((c) => h("li", h("span.h", hora(c.hora_inicio)), h("div", h("strong", c.grupos.nombre), " ", h("a", { href: `#/asistencia?grupo=${c.grupo_id}&fecha=${iso}`, onclick: () => document.querySelector("dialog.modal")?.remove() }, "Pasar lista")))))] : null,
      x.evals.length ? [h("h3", "Evaluaciones y entregas"), h("ul.lista", x.evals.map((e) => h("li", h("div.crece", h("strong", e.titulo), h("div.tenue", `${e.tipo} · ${e.grupos?.nombre}`)))))] : null,
      x.eventos.length ? [h("h3", "Fechas importantes"), h("ul.lista", x.eventos.map((e) => h("li",
        h("div.crece", h("strong", e.titulo), h("div.tenue", [e.tipo, e.hora_inicio ? `${hora(e.hora_inicio)}${e.hora_fin ? "–" + hora(e.hora_fin) : ""}` : null].filter(Boolean).join(" · ")), e.descripcion ? h("div", e.descripcion) : null),
        h("button.btn.btn-texto.btn-sm", { onclick: () => { m.cerrar(); evento(e); } }, "Editar"),
        h("button.btn.btn-texto.btn-sm", { onclick: async () => { if (await confirmar("Eliminar", `¿Eliminar «${e.titulo}»?`, { boton: "Eliminar", peligro: true })) { await q(sb.from("eventos").delete().eq("id", e.id)); m.cerrar(); pintar(); } } }, "Borrar"))))] : null,
      !x.clases.length && !x.evals.length && !x.eventos.length ? h("p.suave", "Nada programado este día.") : null);
    const m = modal(fecha(iso), cuerpo, [{ texto: "Cerrar", clase: "btn-sec" }, { texto: "Agregar fecha", onclick: (c) => { c(); evento(null, iso); } }]);
  }

  pintar();
}
