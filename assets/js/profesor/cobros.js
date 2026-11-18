// Cobros del profesor: mensualidad por grupo, cobros del mes de un toque,
// quién debe, pagos con recibo y recordatorio por WhatsApp.
// Usa las mismas tablas y reglas que las academias (cargos y pagos con
// recibo numerado y saldo automático). Profesional y Premium.
import { sb, q } from "../core/sb.js";
import { h, tabla, modal, formularioModal, confirmar, fecha, hoyISO, dinero, nombreCompleto } from "../core/ui.js";
import { registrarPago, verRecibo } from "../academia/finanzas.js";
import { numeroWhatsApp } from "../comun/reporte.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const saldoDe = (c) => Math.round((Number(c.monto) - Number(c.descuento) - Number(c.pagado)) * 100) / 100;
const mesISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const nombreMes = (p) => { const [a, m] = p.split("-"); return `${MESES[Number(m) - 1]} ${a}`; };

export async function render(el, ctx, { params }) {
  if (!ctx.f("finanzas")) {
    el.append(ctx.titulo("Cobros"), h("section.hoja",
      h("h2", "Lleva el control de lo que te pagan"),
      h("ul",
        h("li", "Pones la mensualidad de cada grupo y generas los cobros del mes con un toque."),
        h("li", "Ves quién te debe, cuánto y desde cuándo."),
        h("li", "Registras pagos completos o abonos y entregas un recibo numerado."),
        h("li", "Envías un recordatorio amable por WhatsApp.")),
      h("p.suave", "Disponible en los planes Profesional y Premium."),
      ctx.mejora("Control de pagos")));
    return;
  }
  if (!ctx.esFinanzas) { el.append(ctx.titulo("Cobros"), h("div.vacio", h("p", "Solo el dueño de la cuenta ve los cobros."))); return; }

  const hoy = hoyISO();
  const [cargos, pagos, grupos, estudiantes] = await Promise.all([
    q(sb.from("cargos").select("*").eq("cuenta_id", ctx.id).neq("estado", "anulado").order("vence")),
    q(sb.from("pagos").select("*").eq("cuenta_id", ctx.id).gte("fecha", hoy.slice(0, 8) + "01").order("recibo", { ascending: false })),
    ctx.datos.grupos(true),
    ctx.datos.estudiantes(true),
  ]);
  const E = Object.fromEntries(estudiantes.map((e) => [e.id, e]));
  const pendientes = cargos.filter((c) => ["pendiente", "parcial"].includes(c.estado));
  const vencidos = pendientes.filter((c) => c.vence < hoy);
  const cobradoMes = pagos.filter((p) => !p.anulado).reduce((s, p) => s + Number(p.monto), 0);
  const porEst = {};
  for (const c of pendientes) (porEst[c.estudiante_id] ??= []).push(c);
  const deudores = Object.entries(porEst).map(([id, cs]) => ({ id, est: E[id] || { id, nombres: "Estudiante", apellidos: "" }, cargos: cs,
    saldo: cs.reduce((s, c) => s + saldoDe(c), 0), vencido: cs.filter((c) => c.vence < hoy).reduce((s, c) => s + saldoDe(c), 0),
    desde: cs.map((c) => c.vence).sort()[0] }))
    .sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);
  const activos = grupos.filter((g) => g.estado === "activo");
  const sinMensualidad = activos.filter((g) => !(Number(g.mensualidad) > 0));
  let vista = params.get("vista") || (params.get("estudiante") ? "deben" : "deben");
  const filtroEst = params.get("estudiante");

  const segs = h("div.segmentos", { role: "group", "aria-label": "Vista" },
    [["deben", `Quién debe (${deudores.length})`], ["pagos", "Pagos de este mes"], ["mensualidades", "Mensualidades"]].map(([v, t]) =>
      h("button", { type: "button", "aria-pressed": String(v === vista), onclick: (e) => { vista = v; segs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); pintar(); } }, t)));
  const cuerpo = h("div");
  el.append(
    ctx.titulo("Cobros",
      h("button.btn.btn-sec", { onclick: () => cobroSuelto(ctx, estudiantes) }, "Otro cobro"),
      h("button.btn", { onclick: () => generar(ctx, activos) }, "Generar mensualidades")),
    sinMensualidad.length && activos.length ? h("div.aviso.ojo", `${sinMensualidad.length} grupo(s) aún no tienen mensualidad. `,
      h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => { vista = "mensualidades"; segs.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === 2))); pintar(); } }, "Ponerla ahora")) : null,
    h("section.cifras",
      h("div.cifra", h("b", dinero(cobradoMes, ctx.cuenta.moneda)), h("span", `cobrado en ${MESES[new Date().getMonth()]}`)),
      h("div.cifra", h("b", dinero(pendientes.reduce((s, c) => s + saldoDe(c), 0), ctx.cuenta.moneda)), h("span", "por cobrar")),
      h("div.cifra" + (vencidos.length ? ".alerta" : ""), h("b", dinero(vencidos.reduce((s, c) => s + saldoDe(c), 0), ctx.cuenta.moneda)), h("span", "vencido")),
      h("div.cifra", h("b", String(deudores.filter((d) => d.vencido > 0).length)), h("span", "estudiantes atrasados"))),
    h("div.barra-filtros", { style: "margin-top:1rem" }, segs), cuerpo);

  function pintar() {
    if (vista === "pagos") return vistaPagos();
    if (vista === "mensualidades") return vistaMensualidades();
    const lista = filtroEst ? deudores.filter((d) => d.id === filtroEst) : deudores;
    cuerpo.replaceChildren(h("section.hoja",
      filtroEst ? h("p", h("a", { href: "#/cobros" }, "← Ver a todos")) : null,
      lista.length ? h("ul.lista.lista-cobros", lista.map((d) => h("li",
        h("div.crece",
          h("a.titulo", { href: `#/estudiantes/${d.id}`, style: "color:inherit" }, nombreCompleto(d.est)),
          h("div.tenue", d.cargos.map((c) => c.concepto.replace(/ · .*$/, "")).join(" · ")),
          d.vencido > 0 ? h("span.estado.mal", `Vencido desde ${fecha(d.desde)}`) : h("span.estado.ojo", `Vence ${fecha(d.desde)}`)),
        h("strong.num", dinero(d.saldo, ctx.cuenta.moneda)),
        h("div.acciones-cobro",
          h("button.btn.btn-sm", { type: "button", onclick: () => cobrar(ctx, d) }, "Registrar pago"),
          h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => recordatorio(ctx, d) }, "WhatsApp")))))
        : h("div.vacio", h("p", filtroEst ? "Este estudiante no tiene cobros pendientes." : "Nadie te debe. ¡Todo al día!"),
            !cargos.length ? h("p.suave", "Empieza poniendo la mensualidad de tus grupos y genera los cobros del mes.") : null)));
  }

  function vistaPagos() {
    cuerpo.replaceChildren(h("section.hoja", tabla([
      { t: "Recibo", v: (p) => `N.º ${String(p.recibo).padStart(6, "0")}` },
      { t: "Fecha", v: (p) => fecha(p.fecha) },
      { t: "Estudiante", v: (p) => nombreCompleto(E[p.estudiante_id] || {}) },
      { t: "Monto", v: (p) => p.anulado ? h("s", dinero(p.monto, ctx.cuenta.moneda)) : dinero(p.monto, ctx.cuenta.moneda), clase: "derecha" },
      { t: "", clase: "acciones", v: (p) => [
        h("button.btn.btn-texto.btn-sm", { onclick: () => verRecibo(ctx, p, cargos.find((c) => c.id === p.cargo_id) || null, E[p.estudiante_id] || {}) }, "Recibo"),
        !p.anulado ? h("button.btn.btn-texto.btn-sm", { onclick: async () => {
          if (!(await confirmar("Anular pago", `El recibo N.º ${p.recibo} quedará anulado y el saldo vuelve a estar pendiente.`, { boton: "Anular", peligro: true }))) return;
          try { await q(sb.from("pagos").update({ anulado: true }).eq("id", p.id)); ctx.toast("Pago anulado"); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
        } }, "Anular") : h("span.estado.mal", "Anulado")] },
    ], pagos, { vacio: "Aún no registras pagos este mes." })));
  }

  function vistaMensualidades() {
    const filas = activos.map((g) => {
      const inp = h("input", { type: "number", min: 0, step: "0.01", value: Number(g.mensualidad) || "", placeholder: "0", style: "max-width:9rem", "aria-label": `Mensualidad de ${g.nombre}` });
      const btn = h("button.btn.btn-sec.btn-sm", { type: "button", onclick: async () => {
        btn.disabled = true;
        try { await q(sb.from("grupos").update({ mensualidad: Number(inp.value) || 0 }).eq("id", g.id)); g.mensualidad = Number(inp.value) || 0; ctx.datos.invalidar("grupos"); ctx.toast("Mensualidad guardada"); }
        catch (e) { ctx.toast(e.message, "mal"); } finally { btn.disabled = false; }
      } }, "Guardar");
      return h("li", h("div.crece", h("strong", g.nombre), h("div.tenue", `${ctx.cuenta.moneda === "USD" ? "US$" : "C$"} por estudiante al mes`)), inp, btn);
    });
    cuerpo.replaceChildren(h("section.hoja",
      h("p.suave", "Pon cuánto cobras al mes en cada grupo. Si a un estudiante le haces descuento (por ejemplo, hermanos), ponlo en su ficha con «Editar»."),
      filas.length ? h("ul.lista.lista-cobros", filas) : h("p.suave", "No tienes grupos activos.")));
  }

  pintar();
}

/** Genera las mensualidades de un mes. No duplica si ya existen. */
function generar(ctx, grupos) {
  const con = grupos.filter((g) => Number(g.mensualidad) > 0);
  if (!con.length) { ctx.toast("Primero pon la mensualidad de tus grupos en «Mensualidades».", "mal"); return; }
  const d = new Date(); const sig = new Date(d.getFullYear(), d.getMonth() + 1, 1); const ant = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  formularioModal("Generar mensualidades", [
    { name: "periodo", label: "Mes", type: "select", options: [[mesISO(ant), nombreMes(mesISO(ant))], [mesISO(d), nombreMes(mesISO(d))], [mesISO(sig), nombreMes(mesISO(sig))]], value: mesISO(d) },
    { name: "dia", label: "Día de pago", type: "number", min: 1, max: 31, value: 5, required: true, help: "Desde ese día el cobro aparece como vencido si no se paga." },
    ...con.map((g) => ({ name: `g_${g.id}`, label: `${g.nombre} · ${dinero(g.mensualidad, ctx.cuenta.moneda)}`, type: "checkbox", value: true, full: true })),
  ], {}, async (v, cerrar) => {
    const ids = con.filter((g) => v[`g_${g.id}`]).map((g) => g.id);
    if (!ids.length) throw new Error("Elige al menos un grupo.");
    const r = await q(sb.rpc("d360_cobros_generar", { p_cuenta: ctx.id, p_periodo: v.periodo, p_grupos: ids, p_dia: Number(v.dia) || 5 }));
    cerrar();
    ctx.toast(r.creados ? `${r.creados} mensualidad(es) de ${nombreMes(v.periodo)} creadas` + (r.ya_existian ? ` · ${r.ya_existian} ya existían` : "") : `Las mensualidades de ${nombreMes(v.periodo)} ya estaban creadas.`);
    ctx.recargar();
  }, { boton: "Generar" });
}

/** Cobro de otro concepto (material, inscripción, clase extra…). */
function cobroSuelto(ctx, estudiantes) {
  const activos = estudiantes.filter((e) => e.estado === "activo");
  if (!activos.length) { ctx.toast("Primero registra a tus estudiantes.", "mal"); return; }
  formularioModal("Otro cobro", [
    { name: "estudiante_id", label: "Estudiante", type: "select", required: true, options: activos.map((e) => [e.id, nombreCompleto(e)]), full: true },
    { name: "concepto", label: "Concepto", required: true, maxlength: 140, placeholder: "Ej.: Libro de ejercicios", full: true },
    { name: "monto", label: `Monto (${ctx.cuenta.moneda})`, type: "number", min: 0.01, step: "0.01", required: true },
    { name: "vence", label: "Fecha límite", type: "date", required: true, value: hoyISO() },
  ], {}, async (d, cerrar) => {
    await q(sb.from("cargos").insert({ cuenta_id: ctx.id, estudiante_id: d.estudiante_id, concepto: d.concepto.trim(), tipo: "otro", monto: Number(d.monto), vence: d.vence }));
    cerrar(); ctx.toast("Cobro agregado"); ctx.recargar();
  }, { boton: "Agregar cobro" });
}

/** Registrar pago: si debe varios conceptos, primero elige cuál. */
function cobrar(ctx, d) {
  if (d.cargos.length === 1) return registrarPago(ctx, d.cargos[0], d.est, ctx.recargar);
  const m = modal(`¿Qué paga ${nombreCompleto(d.est)}?`, h("ul.lista", d.cargos.map((c) => h("li",
    h("div.crece", h("strong", c.concepto), h("div.tenue", `Vence ${fecha(c.vence)}`)),
    h("strong.num", dinero(saldoDe(c), ctx.cuenta.moneda)),
    h("button.btn.btn-sm", { type: "button", onclick: () => { m.cerrar(); registrarPago(ctx, c, d.est, ctx.recargar); } }, "Cobrar")))),
  [{ texto: "Cancelar", clase: "btn-sec" }]);
}

/** Recordatorio amable por WhatsApp (se revisa antes de enviar). */
function recordatorio(ctx, d) {
  const contacto = (d.est.contacto_nombre || "").trim();
  const texto = [`Hola${contacto ? " " + contacto : ""}, le saluda ${ctx.cuenta.miembro_nombre} (${ctx.cuenta.nombre}).`, "",
    `Le recuerdo con cariño el pago pendiente de ${nombreCompleto(d.est)}:`,
    ...d.cargos.map((c) => `• ${c.concepto}: ${dinero(saldoDe(c), ctx.cuenta.moneda)} (vence ${fecha(c.vence)})`),
    `Total: ${dinero(d.saldo, ctx.cuenta.moneda)}.`, "", "Si ya lo pagó, por favor ignore este mensaje. ¡Gracias!"].join("\n");
  const tel = numeroWhatsApp(d.est.contacto_telefono || d.est.telefono);
  const area = h("textarea", { rows: 9, value: texto, "aria-label": "Mensaje" });
  modal("Recordatorio de pago", h("div.reporte-wa",
    tel ? h("p.suave", `Se enviará a ${d.est.contacto_nombre || "el contacto"} (+${tel}).`) : h("div.aviso.ojo", "Sin teléfono de contacto: WhatsApp te pedirá elegir a quién enviarlo."),
    h("label.campo", h("span", "Mensaje"), area)), [
    { texto: "Cancelar", clase: "btn-sec" },
    { texto: "Abrir WhatsApp", onclick: (cerrar) => { window.open(`https://wa.me/${tel}?text=${encodeURIComponent(area.value.trim())}`, "_blank", "noopener"); cerrar(); } },
  ]);
}

/** Sección «Pagos» en la ficha del estudiante. */
export async function seccionPagosFicha(ctx, e) {
  const cargos = await q(sb.from("cargos").select("*").eq("estudiante_id", e.id).neq("estado", "anulado").order("vence", { ascending: false }).limit(12));
  const pend = cargos.filter((c) => ["pendiente", "parcial"].includes(c.estado));
  const saldo = pend.reduce((s, c) => s + saldoDe(c), 0);
  const hoy = hoyISO();
  return h("section.hoja",
    h("div.hoja-titulo", h("h2", "Pagos"), saldo > 0 ? h("a.btn.btn-sec.btn-sm", { href: `#/cobros?estudiante=${e.id}` }, "Cobrar") : null),
    h("p", saldo > 0 ? ["Debe ", h("strong.num", dinero(saldo, ctx.cuenta.moneda))] : h("span.estado.ok", "Al día"),
      Number(e.descuento_pct) > 0 ? h("span.tenue", ` · descuento ${Number(e.descuento_pct)}% en mensualidades`) : null),
    cargos.length ? tabla([
      { t: "Concepto", v: (c) => c.concepto },
      { t: "Vence", v: (c) => fecha(c.vence) },
      { t: "Saldo", v: (c) => dinero(saldoDe(c), ctx.cuenta.moneda), clase: "derecha" },
      { t: "", v: (c) => h("span.estado." + (c.estado === "pagado" ? "ok" : c.vence < hoy ? "mal" : "ojo"), c.estado === "pagado" ? "Pagado" : c.vence < hoy ? "Vencido" : c.estado === "parcial" ? "Abonado" : "Pendiente") },
    ], cargos) : h("p.suave", "Sin cobros todavía."));
}
