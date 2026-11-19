// Asistencia: pase de lista rápido (pensado para el teléfono) e historial.
import { sb, q } from "../core/sb.js";
import { h, tabla, hoyISO, sumarDias, fecha, diaLargo, nombreCompleto, confirmar, modal } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";

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

  // Cambios sin guardar: se avisa antes de cambiar de grupo, fecha o pantalla
  let sucio = false;
  const seguro = async () => !sucio || await confirmar("Cambios sin guardar", "Marcaste asistencia que aún no guardas. Si continúas, se perderá.", { boton: "Continuar sin guardar", peligro: true });
  ctx.pendiente = { hay: () => sucio, confirmar: seguro };
  const irGrupo = (id) => { grupoId = id; selGrupo.value = id; history.replaceState(null, "", `#/asistencia?grupo=${id}`); pintar(); };

  const selGrupo = h("select", { "aria-label": "Grupo", onchange: async (e) => {
    if (!(await seguro())) { e.target.value = grupoId; return; }
    irGrupo(e.target.value); } },
    grupos.map((g) => h("option", { value: g.id, selected: g.id === grupoId }, g.nombre)));
  const selFecha = h("input", { type: "date", value: fechaSel, max: hoyISO(), "aria-label": "Fecha", onchange: async (e) => {
    if (!(await seguro())) { e.target.value = fechaSel; return; }
    fechaSel = e.target.value || hoyISO(); pintar(); } });
  const segs = h("div.segmentos", { role: "group" }, [["lista", "Pasar lista"], ["historial", "Historial"]].map(([v, t]) =>
    h("button", { type: "button", "aria-pressed": String(v === vista), onclick: async (e) => {
      const b = e.currentTarget;
      if (v !== vista && !(await seguro())) return;
      vista = v; e = { currentTarget: b }; segs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
      selFecha.classList.toggle("oculto", v !== "lista"); pintar(); } }, t)));
  const cuerpo = h("div");

  el.append(ctx.titulo("Asistencia"),
    h("div.barra-filtros", selGrupo, selFecha, segs),
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
    sucio = false;

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
      const anotar = h("button.btn-anotar", { type: "button", title: "Anotar una observación", "aria-label": `Anotar una observación de ${nombreCompleto(m.estudiantes)}`,
        onclick: () => notaRapida(ctx, { id, ...m.estudiantes }, anotar) }, h("span", { html: ICONOS.nota_rapida }));
      return h("li", h("span.nombre", nombreCompleto(m.estudiantes), anotar), grupoBtns, nota);
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
        const i = grupos.findIndex((g) => g.id === grupoId);
        const sig = grupos[(i + 1) % grupos.length];
        siguiente.replaceChildren(grupos.length > 1 ? h("button.btn.btn-sec", { type: "button", onclick: () => irGrupo(sig.id) }, `Siguiente: ${sig.nombre} →`) : null);
      } catch (e) { ctx.toast(e.message, "mal"); }
      finally { guardar.disabled = false; }
    } }, "Guardar asistencia");
    const siguiente = h("span");
    const estadoLista = h("span", yaTomada ? h("span.estado.ok", "Lista ya tomada · puedes corregirla") : h("span.estado.ojo", "Sin tomar"));

    cuerpo.replaceChildren(h("section.hoja",
      h("div.hoja-titulo", h("div", h("h2", diaLargo(fechaSel)), contador), estadoLista),
      h("div.pase-rapido",
        h("button.btn" + (yaTomada ? ".btn-sec" : ""), { type: "button", onclick: () => {
          const ninguno = !Object.keys(marcas).length;
          miembros.forEach((m) => { if (ninguno || !marcas[m.estudiante_id]) marcas[m.estudiante_id] = "presente"; });
          pintarMarcas();
          ctx.toast("Listo. Ahora toca solo a quien faltó o llegó tarde.");
        } }, "✓ Todos presentes"),
        h("span.tenue", "Marca a todos presentes y cambia solo a quien faltó (A), llegó tarde (T) o tiene excusa (J). El lápiz anota una observación.")),
      h("ul.pase", items),
      h("div.pie-fijo", siguiente, guardar)));
    // Academias: quienes vienen a este grupo a recuperar una clase que perdieron en otro
    if (ctx.modalidad === "academia") {
      const recs = await q(sb.from("recuperaciones").select("id,estado,fecha_falta,grupo_origen,estudiantes(nombres,apellidos)").eq("grupo_destino", grupoId).eq("fecha", fechaSel).neq("estado", "cancelada")).catch(() => []);
      if (recs.length) {
        const caja = h("section.hoja.recuperan", h("h2", `Vienen a recuperar (${recs.length})`),
          h("ul.lista", recs.map((r) => {
            const est = h("span");
            const pintarR = () => est.replaceChildren(r.estado === "asistio" ? h("span.estado.ok", "Vino") : r.estado === "no_vino" ? h("span.estado.mal", "No vino") : h("span.estado.ojo", "Pendiente"));
            pintarR();
            const marcar = (v) => async () => { try { await q(sb.rpc("d360_recuperacion_marcar", { p_id: r.id, p_estado: v })); r.estado = v; pintarR(); ctx.toast("Anotado"); } catch (e) { ctx.toast(e.message, "mal"); } };
            return h("li", h("div.crece", h("strong", nombreCompleto(r.estudiantes || {})), h("div.tenue", r.fecha_falta ? `Faltó el ${fecha(r.fecha_falta)}` : "Recuperación")), est,
              fechaSel <= hoyISO() ? h("div.acciones-cobro", h("button.btn.btn-sm", { type: "button", onclick: marcar("asistio") }, "Vino"), h("button.btn.btn-sec.btn-sm", { type: "button", onclick: marcar("no_vino") }, "No vino")) : null);
          })),
          h("p.tenue", "No se cuentan en la lista del grupo: solo se anota si vinieron a recuperar."));
        cuerpo.prepend(caja);
      }
    }

    function pintarMarcas() {
      items.forEach((li, i) => {
        const id = miembros[i].estudiante_id;
        li.querySelectorAll(".opc button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.e === marcas[id])));
        li.querySelector("input")?.classList.toggle("oculto", !marcas[id] || marcas[id] === "presente");
      });
      sucio = true; contar();
    }
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

// Observación rápida desde la lista: frases de un toque o texto libre.
const FRASES = [
  ["academica", "Excelente participación en clase."], ["academica", "No entregó la tarea."], ["academica", "Necesita reforzar el tema de hoy."],
  ["conducta", "Llegó sin material."], ["conducta", "Se distrajo con frecuencia."], ["conducta", "Muy buena actitud y respeto."],
];
function notaRapida(ctx, est, boton) {
  const texto = h("textarea", { rows: 3, maxLength: 1000, placeholder: "O escribe tu observación…" });
  let tipo = "general";
  const chips = h("div.chips", FRASES.map(([t, f]) => h("button.chip", { type: "button", onclick: (e) => {
    texto.value = f; tipo = t; chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === e.currentTarget)));
  } }, f)));
  modal(`Observación de ${nombreCompleto(est)}`, h("div",
    h("p.suave", "Toca una frase o escribe la tuya. Queda en su ficha y puede ir en el reporte a la familia."), chips,
    h("label.campo", h("span", "Observación"), texto)), [
    { texto: "Cancelar", clase: "btn-sec" },
    { texto: "Guardar", onclick: async (cerrar) => {
      const t = texto.value.trim();
      if (!t) { texto.focus(); return false; }
      try {
        await q(sb.from("observaciones").insert({ cuenta_id: ctx.id, estudiante_id: est.id, autor: ctx.user.id, tipo, texto: t }));
        cerrar(); ctx.toast("Observación guardada");
        boton?.classList.add("hecha");
      } catch (e) { ctx.toast(e.message, "mal"); }
      return false;
    } },
  ]);
}
