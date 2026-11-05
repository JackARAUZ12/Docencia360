// Portal de familias: lo que un padre, madre o tutor necesita ver de cada hijo.
// Solo lectura. La base de datos limita todo a sus propios hijos (RLS).
import { sb, q } from "../core/sb.js";
import { h, marca, tabla, fecha, fechaCorta, hoyISO, dinero, diaLargo } from "../core/ui.js";
import { salir, ruta } from "../core/sesion.js";
import { ICONOS } from "../core/iconos.js";
import { botonTema } from "../core/tema.js";
import { crearContexto } from "../core/panel.js";
import { cualitativa, CUALI_TEXTO, urlArchivo } from "../colegio/util.js";

const ctx = await crearContexto("colegio");
if (ctx.rol !== "tutor") { location.replace(ruta("app/colegio.html")); await new Promise(() => {}); }

const [cuenta, hijosRel, periodos, asignaturas] = await Promise.all([
  q(sb.from("cuentas").select("nombre,config,telefono,moneda").eq("id", ctx.id).single()),
  q(sb.from("tutores_estudiantes").select("parentesco, estudiantes(id,nombres,apellidos,codigo,foto_url,estado)").eq("miembro_id", ctx.cuenta.miembro_id)),
  q(sb.from("periodos").select("*").eq("cuenta_id", ctx.id).order("orden")),
  q(sb.from("asignaturas").select("id,nombre").eq("cuenta_id", ctx.id)),
]);
const cfg = cuenta.config || {};
const MIN = Number(cfg.nota_minima ?? 60);
const A = Object.fromEntries(asignaturas.map((a) => [a.id, a.nombre]));
const hijos = hijosRel.map((r) => r.estudiantes).filter(Boolean);
const M = (v) => dinero(v, cuenta.moneda || "NIO");
const hoy = hoyISO();
const perActual = periodos.find((p) => p.inicio <= hoy && p.fin >= hoy) || [...periodos].reverse().find((p) => p.fin < hoy) || periodos[0];
let hijo = hijos[0]?.id;
let vista = location.hash.replace("#/", "") || "inicio";

const main = h("main.f-main");
const VISTAS = [["inicio", "Inicio", "inicio"], ["notas", "Notas", "notas"], ["asistencia", "Asistencia", "asistencia"], ["avisos", "Avisos", "calendario"], ["pagos", "Pagos", "finanzas"]];
const barra = h("nav.p-barra", { "aria-label": "Secciones" }, VISTAS.map(([r, t, i]) => h("a", { href: "#/" + r, dataset: { r } }, h("span", { html: ICONOS[i] }), t)));
const nombreTutor = ctx.cuenta.miembro_nombre.split(" ")[0];
document.getElementById("app").replaceChildren(
  h("header.f-cab", h("div.fila1", marca(ruta("app/familias.html")), h("span", { style: "display:flex;gap:.5rem;align-items:center" }, botonTema(),
      h("button.btn.btn-sm", { style: "background:transparent;border:1px solid rgba(255,255,255,.3);color:#F4F6F2", onclick: salir }, "Salir"))),
    h("h1", `Hola, ${nombreTutor}`), h("p", cuenta.nombre)),
  main, barra);

const sel = h("div.hijos", { role: "group", "aria-label": "Elige a tu hijo o hija" });
async function pintarHijos() {
  sel.replaceChildren(...await Promise.all(hijos.map(async (e) => {
    const url = await urlArchivo(e.foto_url);
    return h("button.hijo", { type: "button", "aria-pressed": String(e.id === hijo), onclick: () => { hijo = e.id; pintarHijos(); pintar(); } },
      h("span.av", url ? h("img", { src: url, alt: "" }) : (e.nombres[0] + (e.apellidos?.[0] || ""))), e.nombres.split(" ")[0]);
  })));
}

async function seccionDe(id) {
  const r = await q(sb.from("grupo_estudiantes").select("grupo_id, grupos(id,nombre)").eq("estudiante_id", id).eq("estado", "activo").limit(1));
  return r[0]?.grupos || null;
}
const celdaNota = (v) => v == null ? h("span.tenue", "—") : h("span", { style: "white-space:nowrap" }, h("span", { className: Number(v) < MIN ? "nota-baja num" : "num" }, Number(v).toFixed(0)), " ", h("span.cuali." + cualitativa(v), cualitativa(v)));

async function pintar() {
  document.querySelectorAll("[data-r]").forEach((a) => (a.dataset.r === vista ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  if (!hijos.length) { main.replaceChildren(h("section.hoja", h("h2", "Sin estudiantes vinculados"), h("p", "Pide al colegio que vincule a tu hijo o hija con tu acceso."))); return; }
  const e = hijos.find((x) => x.id === hijo);
  const sec = await seccionDe(e.id);
  const cont = h("div", h("p.tenue", "Cargando…"));
  main.replaceChildren(sel, cont);
  const titulo = h("p.tenue", { style: "margin:0 0 .75rem" }, `${e.nombres} ${e.apellidos} · ${sec?.nombre || "sin sección"}`);

  if (vista === "inicio" || vista === "notas") {
    const notas = sec && perActual ? await q(sb.rpc("d360_notas_seccion", { p_grupo: sec.id, p_periodo: perActual.id })) : [];
    const mias = notas.filter((n) => n.estudiante_id === e.id);
    const prom = mias.filter((n) => n.final != null); const promedio = prom.length ? prom.reduce((s, n) => s + Number(n.final), 0) / prom.length : null;
    if (vista === "notas") {
      const pers = periodos.filter((p) => p.inicio <= hoy);
      const todas = sec ? await Promise.all(pers.map((p) => q(sb.rpc("d360_notas_seccion", { p_grupo: sec.id, p_periodo: p.id })))) : [];
      const asigs = [...new Set(todas.flat().filter((n) => n.estudiante_id === e.id).map((n) => n.asignatura_id))];
      const coms = await q(sb.from("boletin_comentarios").select("*").eq("estudiante_id", e.id));
      cont.replaceChildren(titulo,
        h("section.hoja", h("h2", "Calificaciones del año"),
          h("div.tabla-envoltura", h("table.registro.cuaderno",
            h("thead", h("tr", h("th", "Asignatura"), pers.map((p) => h("th.derecha", p.nombre)))),
            h("tbody", asigs.map((a) => h("tr", h("td", A[a] || "—"), pers.map((p, i) => h("td.derecha", celdaNota(todas[i].find((n) => n.estudiante_id === e.id && n.asignatura_id === a)?.final)))))))),
          h("p.tenue", `Se aprueba con ${MIN}. ` + Object.entries(CUALI_TEXTO).map(([k, t]) => `${k}: ${t}`).join(" · "))),
        coms.length ? h("section.hoja", h("h2", "Comentarios del maestro guía"),
          h("ul.lista", coms.sort((a, b) => (periodos.find((p) => p.id === b.periodo_id)?.orden || 0) - (periodos.find((p) => p.id === a.periodo_id)?.orden || 0)).map((c) =>
            h("li", h("div.crece", h("div.titulo", periodos.find((p) => p.id === c.periodo_id)?.nombre), h("div", c.comentario || ""), c.conducta ? h("div.tenue", `Conducta: ${c.conducta}`) : null))))) : null);
      return;
    }
    // Inicio: resumen del día
    const [asis, cargos, coms] = await Promise.all([
      q(sb.from("asistencias").select("fecha,estado").eq("estudiante_id", e.id).gte("fecha", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).order("fecha", { ascending: false })),
      q(sb.from("cargos").select("monto,descuento,pagado,vence,estado,concepto").eq("estudiante_id", e.id).in("estado", ["pendiente", "parcial"]).order("vence")),
      q(sb.from("comunicados").select("titulo,publicado").eq("cuenta_id", ctx.id).order("publicado", { ascending: false }).limit(2)),
    ]);
    const pct = asis.length ? Math.round((asis.filter((a) => a.estado !== "ausente").length / asis.length) * 100) : null;
    const vencido = cargos.filter((c) => c.vence < hoy).reduce((s, c) => s + Number(c.monto) - Number(c.descuento) - Number(c.pagado), 0);
    const proximo = cargos.find((c) => c.vence >= hoy);
    const hoyAsis = asis.find((a) => a.fecha === hoy);
    const bajas = mias.filter((n) => n.final != null && Number(n.final) < MIN);
    cont.replaceChildren(titulo,
      h("section.hoja", h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem" },
        h("div", h("div.nota-grande", promedio == null ? "—" : promedio.toFixed(0)), h("div.tenue", `promedio del ${perActual?.nombre || "corte"}`)),
        h("div", h("div.nota-grande", pct == null ? "—" : `${pct}%`), h("div.tenue", "asistencia en 30 días")),
        h("div", h("div.nota-grande", { style: vencido > 0 ? "color:var(--correccion)" : "" }, vencido > 0 ? M(vencido).replace(/\.00$/, "") : "Al día"), h("div.tenue", vencido > 0 ? "pagos vencidos" : "en pagos")))),
      hoyAsis ? h("div.aviso" + (hoyAsis.estado === "ausente" ? ".mal" : ".ok"), `Hoy (${diaLargo(hoy)}): ${hoyAsis.estado}.`) : null,
      bajas.length ? h("div.aviso.ojo", `${e.nombres.split(" ")[0]} va por debajo de ${MIN} en: ${bajas.map((b) => A[b.asignatura_id]).join(", ")}. `, h("a", { href: "#/notas" }, "Ver notas")) : null,
      proximo ? h("section.hoja", h("h2", "Próximo pago"), h("p", h("strong", proximo.concepto), h("br"), `${M(Number(proximo.monto) - Number(proximo.descuento) - Number(proximo.pagado))} · vence el ${fecha(proximo.vence)}`)) : null,
      h("section.hoja", h("div.hoja-titulo", h("h2", "Avisos del colegio"), h("a", { href: "#/avisos" }, "Ver todos")),
        coms.length ? h("ul.lista", coms.map((c) => h("li", h("div.crece", h("div.titulo", c.titulo), h("div.tenue", fechaCorta(c.publicado)))))) : h("p.suave", "Sin avisos.")));
    return;
  }

  if (vista === "asistencia") {
    const asis = await q(sb.from("asistencias").select("fecha,estado,nota").eq("estudiante_id", e.id).order("fecha", { ascending: false }).limit(120));
    const c = { presente: 0, ausente: 0, tarde: 0, justificado: 0 }; asis.forEach((a) => c[a.estado]++);
    cont.replaceChildren(titulo,
      h("section.cifras", h("div.cifra", h("b", c.presente), h("span", "días presente")), h("div.cifra.alerta", h("b", c.ausente), h("span", "ausencias")),
        h("div.cifra", h("b", c.tarde), h("span", "llegadas tarde")), h("div.cifra", h("b", c.justificado), h("span", "justificadas"))),
      h("section.hoja", { style: "margin-top:1rem" }, h("h2", "Ausencias y tardanzas"),
        tabla([{ t: "Fecha", v: (a) => fecha(a.fecha) }, { t: "Estado", v: (a) => h("span.estado." + ({ ausente: "mal", tarde: "ojo", justificado: "info" }[a.estado]), a.estado) }, { t: "Nota", v: (a) => a.nota || "" }],
          asis.filter((a) => a.estado !== "presente"), { vacio: "Sin ausencias ni tardanzas registradas. ¡Excelente!" })));
    return;
  }

  if (vista === "avisos") {
    const [coms, evs] = await Promise.all([
      q(sb.from("comunicados").select("*").eq("cuenta_id", ctx.id).order("publicado", { ascending: false })),
      q(sb.from("eventos").select("*").eq("cuenta_id", ctx.id).gte("fecha", hoy).order("fecha").limit(10)),
    ]);
    cont.replaceChildren(
      evs.length ? h("section.hoja", h("h2", "Próximas fechas"), h("ul.lista", evs.map((v) => h("li", h("span.estado.info", fechaCorta(v.fecha)), h("div.crece", h("div.titulo", v.titulo), v.descripcion ? h("div.tenue", v.descripcion) : null))))) : null,
      coms.length ? coms.map((c) => h("article.hoja", h("h2", c.titulo), h("p", { style: "white-space:pre-line" }, c.cuerpo), h("p.tenue", fecha(c.publicado)))) : h("div.vacio", "Sin comunicados."));
    return;
  }

  // Pagos
  const [cargos, pagos] = await Promise.all([
    q(sb.from("cargos").select("*").eq("estudiante_id", e.id).neq("estado", "anulado").order("vence")),
    q(sb.from("pagos").select("*").eq("estudiante_id", e.id).eq("anulado", false).order("fecha", { ascending: false })),
  ]);
  const saldo = (c) => Number(c.monto) - Number(c.descuento) - Number(c.pagado);
  const pendientes = cargos.filter((c) => ["pendiente", "parcial"].includes(c.estado));
  cont.replaceChildren(titulo,
    h("section.cifras", h("div.cifra" + (pendientes.some((c) => c.vence < hoy) ? ".alerta" : ""), h("b", M(pendientes.filter((c) => c.vence < hoy).reduce((s, c) => s + saldo(c), 0))), h("span", "vencido")),
      h("div.cifra", h("b", M(pendientes.reduce((s, c) => s + saldo(c), 0))), h("span", "pendiente en total")),
      h("div.cifra", h("b", M(pagos.reduce((s, p) => s + Number(p.monto), 0))), h("span", "pagado este año"))),
    h("section.hoja", { style: "margin-top:1rem" }, h("h2", "Por pagar"),
      tabla([{ t: "Concepto", v: (c) => c.concepto }, { t: "Vence", v: (c) => h("span", { className: c.vence < hoy ? "nota-baja" : "" }, fecha(c.vence)) }, { t: "Saldo", v: (c) => h("strong", M(saldo(c))), clase: "derecha" }],
        pendientes, { vacio: "No hay pagos pendientes. ¡Gracias!" }),
      h("p.tenue", { style: "margin-top:.75rem" }, `Para pagar, acércate a caja o comunícate con el colegio${cuenta.telefono ? ` al ${cuenta.telefono}` : ""}.`)),
    h("section.hoja", h("h2", "Pagos realizados"),
      tabla([{ t: "Recibo", v: (p) => `N.º ${String(p.recibo).padStart(6, "0")}` }, { t: "Fecha", v: (p) => fecha(p.fecha) }, { t: "Monto", v: (p) => M(p.monto), clase: "derecha" }], pagos, { vacio: "Sin pagos registrados." })));
}

addEventListener("hashchange", () => { vista = location.hash.replace("#/", "") || "inicio"; pintar(); });
await pintarHijos();
pintar();
