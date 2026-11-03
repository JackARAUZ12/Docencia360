// Asistencia: pase de lista rápido (pensado para el teléfono) e historial.
import { sb, q } from "../core/sb.js";
import { h, tabla, hoyISO, sumarDias, fecha, diaLargo, nombreCompleto } from "../core/ui.js";

const OPC = [["presente", "P", "Presente"], ["ausente", "A", "Ausente"], ["tarde", "T", "Tarde"], ["justificado", "J", "Justificado"]];

export async function render(el, ctx, { params }) {
  const grupos = (await ctx.gruposVisibles()).filter((g) => g.estado === "activo");
  if (!grupos.length) {
    el.append(ctx.titulo("Asistencia"), h("div.vacio", h("h3", "Primero crea un grupo"), h("p", "La asistencia se toma por grupo."), h("a.btn", { href: "#/grupos" }, "Ir a Grupos")));
    return;
  }
  let grupoId = params.get("grupo") && grupos.some((g) => g.id === params.get("grupo")) ? params.get("grupo") : grupos[0].id;
  let fechaSel = params.get("fecha") || hoyISO();
  let vista = params.get("vista") === "historial" ? "historial" : "lista";

  const selGrupo = h("select", { "aria-label": "Grupo", onchange: (e) => { grupoId = e.target.value; pintar(); } },
    grupos.map((g) => h("option", { value: g.id, selected: g.id === grupoId }, g.nombre)));
  const selFecha = h("input", { type: "date", value: fechaSel, max: hoyISO(), "aria-label": "Fecha", onchange: (e) => { fechaSel = e.target.value || hoyISO(); pintar(); } });
  const segs = h("div.segmentos", { role: "group" }, [["lista", "Pasar lista"], ["historial", "Historial"]].map(([v, t]) =>
    h("button", { type: "button", "aria-pressed": String(v === vista), onclick: (e) => {
      vista = v; segs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
      selFecha.classList.toggle("oculto", v !== "lista"); pintar(); } }, t)));
  const cuerpo = h("div");

  el.append(ctx.titulo("Asistencia"),
    h("div", { style: "display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem" }, h("div", { style: "flex:1;min-width:200px;max-width:360px" }, selGrupo), selFecha, segs),
    cuerpo);
  if (vista !== "lista") selFecha.classList.add("oculto");

  async function pintar() {
    cuerpo.replaceChildren(h("p.tenue", "Cargando…"));
    if (vista === "historial") return historial();
    const [miembros, previos] = await Promise.all([
      q(sb.from("grupo_estudiantes").select("estudiante_id, estudiantes(nombres,apellidos)").eq("grupo_id", grupoId).eq("estado", "activo")),
      q(sb.from("asistencias").select("estudiante_id,estado,nota").eq("grupo_id", grupoId).eq("fecha", fechaSel)),
    ]);
    if (!miembros.length) { cuerpo.replaceChildren(h("div.vacio", h("p", "Este grupo no tiene estudiantes."), h("a.btn.btn-sec", { href: `#/grupos/${grupoId}` }, "Agregar estudiantes"))); return; }
    miembros.sort((a, b) => nombreCompleto(a.estudiantes).localeCompare(nombreCompleto(b.estudiantes)));
    const marcas = {}; const notas = {};
    previos.forEach((p) => { marcas[p.estudiante_id] = p.estado; notas[p.estudiante_id] = p.nota || ""; });
    const yaTomada = previos.length > 0;
    let sucio = false;

    const items = miembros.map((m) => {
      const id = m.estudiante_id;
      const nota = h("input", { placeholder: "Motivo (opcional)", value: notas[id] || "", maxLength: 200, className: marcas[id] && marcas[id] !== "presente" ? "" : "oculto",
        style: "grid-column:1/-1;min-height:38px", oninput: (e) => { notas[id] = e.target.value; sucio = true; } });
      const grupoBtns = h("div.opc", { role: "group", "aria-label": `Asistencia de ${nombreCompleto(m.estudiantes)}` },
        OPC.map(([v, letra, t]) => h("button", { type: "button", title: t, "aria-label": t, dataset: { e: v }, "aria-pressed": String(marcas[id] === v),
          onclick: (e) => {
            marcas[id] = v; sucio = true;
            grupoBtns.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
            nota.classList.toggle("oculto", v === "presente");
            contar();
          } }, letra)));
      return h("li", h("span.nombre", nombreCompleto(m.estudiantes)), grupoBtns, nota);
    });

    const contador = h("span.tenue");
    function contar() {
      const c = { presente: 0, ausente: 0, tarde: 0, justificado: 0 };
      Object.values(marcas).forEach((v) => c[v]++);
      const falt = miembros.length - Object.keys(marcas).length;
      contador.textContent = `${c.presente} presentes · ${c.ausente} ausentes · ${c.tarde} tarde · ${c.justificado} justificados` + (falt ? ` · faltan ${falt}` : "");
    }
    contar();

    const guardar = h("button.btn", { onclick: async () => {
      const filas = miembros.filter((m) => marcas[m.estudiante_id]).map((m) => ({
        cuenta_id: ctx.id, grupo_id: grupoId, estudiante_id: m.estudiante_id, fecha: fechaSel,
        estado: marcas[m.estudiante_id], nota: marcas[m.estudiante_id] === "presente" ? null : (notas[m.estudiante_id] || null),
      }));
      if (filas.length < miembros.length) return ctx.toast(`Falta marcar a ${miembros.length - filas.length} estudiante(s).`, "mal");
      guardar.disabled = true;
      try {
        await q(sb.from("asistencias").upsert(filas, { onConflict: "grupo_id,estudiante_id,fecha" }));
        sucio = false; ctx.toast("Asistencia guardada");
        estadoLista.replaceChildren(h("span.estado.ok", "Lista guardada"));
      } catch (e) { ctx.toast(e.message, "mal"); }
      finally { guardar.disabled = false; }
    } }, "Guardar asistencia");
    const estadoLista = h("span", yaTomada ? h("span.estado.ok", "Lista ya tomada · puedes corregirla") : h("span.estado.ojo", "Sin tomar"));

    cuerpo.replaceChildren(h("section.hoja",
      h("div.hoja-titulo", h("div", h("h2", diaLargo(fechaSel)), contador), estadoLista),
      h("div", { style: "display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem" },
        h("button.btn.btn-sec.btn-sm", { onclick: () => { miembros.forEach((m) => { if (!marcas[m.estudiante_id]) marcas[m.estudiante_id] = "presente"; }); pintarMarcas(); } }, "Marcar los demás como presentes"),
        h("span.tenue", { style: "align-self:center" }, "P presente · A ausente · T tarde · J justificado")),
      h("ul.pase", items),
      h("div", { style: "display:flex;justify-content:flex-end;margin-top:1rem;position:sticky;bottom:calc(72px + env(safe-area-inset-bottom));" }, guardar)));

    function pintarMarcas() {
      items.forEach((li, i) => {
        const id = miembros[i].estudiante_id;
        li.querySelectorAll(".opc button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.e === marcas[id])));
      });
      sucio = true; contar();
    }
    addEventListener("beforeunload", (e) => { if (sucio) e.preventDefault(); }, { once: true });
  }

  async function historial() {
    const desde = sumarDias(hoyISO(), -90);
    const [resumen, miembros, fechas] = await Promise.all([
      q(sb.rpc("d360_resumen_asistencia", { p_cuenta: ctx.id, p_grupo: grupoId, p_desde: desde })),
      q(sb.from("grupo_estudiantes").select("estudiante_id, estado, estudiantes(nombres,apellidos)").eq("grupo_id", grupoId)),
      q(sb.from("asistencias").select("fecha,estado").eq("grupo_id", grupoId).gte("fecha", desde).order("fecha", { ascending: false })),
    ]);
    const porId = Object.fromEntries(resumen.map((r) => [r.estudiante_id, r]));
    const dias = {}; fechas.forEach((f) => { (dias[f.fecha] ||= { t: 0, p: 0 }).t++; if (f.estado !== "ausente") dias[f.fecha].p++; });
    const total = fechas.length, pres = fechas.filter((f) => f.estado !== "ausente").length;
    cuerpo.replaceChildren(
      h("section.cifras",
        h("div.cifra", h("b", Object.keys(dias).length), h("span", "clases con lista (90 días)")),
        h("div.cifra", h("b", total ? `${Math.round((pres / total) * 1000) / 10}%` : "—"), h("span", "asistencia del grupo")),
        h("div.cifra.alerta", h("b", resumen.filter((r) => Number(r.porcentaje) < 80).length), h("span", "estudiantes bajo 80%"))),
      h("section.hoja", { style: "margin-top:1rem" }, h("h2", "Por estudiante"),
        tabla([
          { t: "Estudiante", v: (m) => h("a.fila-enlace", { href: `#/estudiantes/${m.estudiante_id}` }, nombreCompleto(m.estudiantes)) },
          { t: "Presente", v: (m) => porId[m.estudiante_id]?.presentes ?? 0, clase: "derecha" },
          { t: "Ausente", v: (m) => porId[m.estudiante_id]?.ausentes ?? 0, clase: "derecha" },
          { t: "Tarde", v: (m) => porId[m.estudiante_id]?.tardes ?? 0, clase: "derecha" },
          { t: "Justif.", v: (m) => porId[m.estudiante_id]?.justificados ?? 0, clase: "derecha" },
          { t: "%", v: (m) => { const p = porId[m.estudiante_id]?.porcentaje; return p == null ? "—" : h("span", { className: Number(p) < 80 ? "nota-baja" : "" }, `${p}%`); }, clase: "derecha" },
        ], miembros.filter((m) => m.estado === "activo" || porId[m.estudiante_id]))),
      h("section.hoja", h("h2", "Clases registradas"),
        tabla([
          { t: "Fecha", v: ([f]) => h("a", { href: `#/asistencia?grupo=${grupoId}&fecha=${f}` }, fecha(f)) },
          { t: "Asistieron", v: ([, d]) => `${d.p} de ${d.t}`, clase: "derecha" },
        ], Object.entries(dias), { vacio: "Aún no hay listas en los últimos 90 días." })),
    );
  }

  pintar();
}
