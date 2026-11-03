// Finanzas de la academia: cobros, pagos, recibos y morosidad.
// Sin contabilidad compleja: lo necesario para saber quién debe y cuánto entró.
import { sb, q } from "../core/sb.js";
import { h, tabla, modal, formularioModal, confirmar, fecha, hoyISO, sumarDias, dinero, nombreCompleto, descargarCSV, imprimir } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";

const METODOS = [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["deposito", "Depósito"], ["tarjeta", "Tarjeta"], ["otro", "Otro"]];
const saldoDe = (c) => Math.round((Number(c.monto) - Number(c.descuento) - Number(c.pagado)) * 100) / 100;

export function recibo(ctx, p, cargo, est) {
  return h("div.recibo",
    h("div.cab",
      h("div", h("strong", ctx.cuenta.nombre), h("div", { style: "font-size:.85rem" }, "Comprobante de pago")),
      h("div", { style: "text-align:right" }, h("strong", `Recibo N.º ${String(p.recibo).padStart(6, "0")}`), h("div", { style: "font-size:.85rem" }, fecha(p.fecha)))),
    h("p", "Recibimos de ", h("strong", nombreCompleto(est)), ` la cantidad de:`),
    h("p.monto", dinero(p.monto, ctx.cuenta.moneda)),
    h("p", "Por concepto de: ", h("strong", cargo?.concepto || "Abono a cuenta")),
    h("p", { style: "font-size:.9rem" }, `Forma de pago: ${METODOS.find((m) => m[0] === p.metodo)?.[1] || p.metodo}${p.referencia ? ` · Ref. ${p.referencia}` : ""}`),
    cargo ? h("p", { style: "font-size:.9rem" }, `Saldo de este concepto después del pago: ${dinero(Math.max(saldoDe(cargo), 0), ctx.cuenta.moneda)}`) : null,
    p.anulado ? h("p", { style: "color:#B3362A;font-weight:700;font-size:1.3rem" }, "ANULADO") : null,
    h("p", { style: "margin-top:3rem;display:flex;justify-content:space-between;gap:1rem;font-size:.9rem" },
      h("span", "_____________________", h("br"), "Recibido por"), h("span", "_____________________", h("br"), "Firma")));
}

function verRecibo(ctx, p, cargo, est) {
  const doc = recibo(ctx, p, cargo, est);
  modal(`Recibo N.º ${p.recibo}`, doc, [
    { texto: "Cerrar", clase: "btn-sec" },
    { texto: "Imprimir / PDF", onclick: () => { imprimir(doc); return false; } },
  ]);
}

export function registrarPago(ctx, cargo, est, alGuardar) {
  const saldo = saldoDe(cargo);
  formularioModal(`Registrar pago · ${nombreCompleto(est)}`, [
    { name: "monto", label: `Monto (${ctx.cuenta.moneda})`, type: "number", min: 0.01, max: saldo, step: "0.01", required: true, value: saldo,
      help: `${cargo.concepto} · saldo ${dinero(saldo, ctx.cuenta.moneda)}. Puedes registrar un abono parcial.` },
    { name: "metodo", label: "Forma de pago", type: "select", options: METODOS },
    { name: "fecha", label: "Fecha", type: "date", required: true, value: hoyISO() },
    { name: "referencia", label: "Referencia / número de transferencia" },
  ], {}, async (d, cerrar) => {
    if (d.monto > saldo + 0.001) throw new Error(`El monto supera el saldo (${dinero(saldo, ctx.cuenta.moneda)}).`);
    const p = await q(sb.from("pagos").insert({ cuenta_id: ctx.id, estudiante_id: est.id, cargo_id: cargo.id, monto: d.monto, metodo: d.metodo, fecha: d.fecha, referencia: d.referencia }).select("*").single());
    cerrar(); ctx.toast(`Pago registrado · recibo N.º ${p.recibo}`);
    const actualizado = { ...cargo, pagado: Number(cargo.pagado) + Number(d.monto) };
    verRecibo(ctx, p, actualizado, est);
    alGuardar?.();
  }, { boton: "Registrar pago" });
}

export async function render(el, ctx, { params }) {
  if (!ctx.f("finanzas")) {
    el.append(ctx.titulo("Finanzas"), h("div.aviso.ojo", "Tu plan no incluye el módulo de finanzas."));
    return;
  }
  let vista = params.get("vista") || "cobrar";
  let filtro = params.get("estudiante") ? "todos" : "vencidos";
  let estSel = params.get("estudiante") || "";
  let texto = "";
  const hoy = hoyISO();
  const inicioMes = hoy.slice(0, 8) + "01";

  const [cargos, pagos, est] = await Promise.all([
    q(sb.from("cargos").select("*").eq("cuenta_id", ctx.id).in("estado", ["pendiente", "parcial"]).order("vence")),
    q(sb.from("pagos").select("*, cargos(concepto)").eq("cuenta_id", ctx.id).gte("fecha", sumarDias(hoy, -120)).order("recibo", { ascending: false })),
    ctx.datos.estudiantes(),
  ]);
  const E = Object.fromEntries(est.map((e) => [e.id, e]));
  const totalPend = cargos.reduce((s, c) => s + saldoDe(c), 0);
  const vencidos = cargos.filter((c) => c.vence < hoy);
  const totalVenc = vencidos.reduce((s, c) => s + saldoDe(c), 0);
  const porVencer = cargos.filter((c) => c.vence >= hoy && c.vence <= sumarDias(hoy, 15)).reduce((s, c) => s + saldoDe(c), 0);
  const ingresosMes = pagos.filter((p) => !p.anulado && p.fecha >= inicioMes).reduce((s, p) => s + Number(p.monto), 0);
  const M = (n) => dinero(n, ctx.cuenta.moneda);

  const cont = h("div");
  function pintar() {
    if (vista === "pagos") {
      const t = texto.toLowerCase();
      const fs = pagos.filter((p) => !t || nombreCompleto(E[p.estudiante_id] || {}).toLowerCase().includes(t) || String(p.recibo).includes(t));
      cont.replaceChildren(tabla([
        { t: "Recibo", v: (p) => h("strong.num", String(p.recibo).padStart(6, "0")) },
        { t: "Fecha", v: (p) => fecha(p.fecha) },
        { t: "Estudiante", v: (p) => nombreCompleto(E[p.estudiante_id] || {}) },
        { t: "Concepto", v: (p) => p.cargos?.concepto || "Abono" },
        { t: "Forma", v: (p) => METODOS.find((m) => m[0] === p.metodo)?.[1] },
        { t: "Monto", v: (p) => h("span", { style: p.anulado ? "text-decoration:line-through" : "" }, M(p.monto)), clase: "derecha" },
        { t: "", clase: "acciones", v: (p) => [
          h("button.btn.btn-texto.btn-sm", { onclick: () => verRecibo(ctx, p, null, E[p.estudiante_id] || {}) }, "Recibo"),
          p.anulado ? h("span.estado.mal", "Anulado") : h("button.btn.btn-texto.btn-sm", { onclick: async () => {
            if (!(await confirmar("Anular pago", `¿Anular el recibo N.º ${p.recibo} por ${M(p.monto)}? El cobro volverá a quedar pendiente. Queda registrado en la auditoría.`, { boton: "Anular", peligro: true }))) return;
            try { await q(sb.from("pagos").update({ anulado: true }).eq("id", p.id)); ctx.toast("Pago anulado"); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
          } }, "Anular")] },
      ], fs, { vacio: "No hay pagos en los últimos 120 días." }));
      return;
    }
    const t = texto.toLowerCase();
    const fs = cargos.filter((c) => (filtro === "todos" || (filtro === "vencidos" ? c.vence < hoy : c.vence >= hoy)) &&
      (!estSel || c.estudiante_id === estSel) &&
      (!t || nombreCompleto(E[c.estudiante_id] || {}).toLowerCase().includes(t) || c.concepto.toLowerCase().includes(t)));
    cont.replaceChildren(tabla([
      { t: "Vence", v: (c) => h("span", { className: c.vence < hoy ? "nota-baja" : "" }, fecha(c.vence)) },
      { t: "Estudiante", v: (c) => [h("a.fila-enlace", { href: `#/estudiantes/${c.estudiante_id}` }, nombreCompleto(E[c.estudiante_id] || {})), h("div.tenue", E[c.estudiante_id]?.contacto_telefono || E[c.estudiante_id]?.telefono || "")] },
      { t: "Concepto", v: (c) => c.concepto },
      { t: "Saldo", v: (c) => [h("strong", M(saldoDe(c))), Number(c.pagado) ? h("div.tenue", `abonado ${M(c.pagado)}`) : null], clase: "derecha" },
      { t: "", clase: "acciones", v: (c) => [
        h("button.btn.btn-sm", { onclick: () => registrarPago(ctx, c, E[c.estudiante_id], ctx.recargar) }, "Cobrar"),
        Number(c.pagado) === 0 ? h("button.btn.btn-texto.btn-sm", { onclick: async () => {
          if (!(await confirmar("Anular cobro", `¿Anular «${c.concepto}» de ${nombreCompleto(E[c.estudiante_id] || {})}?`, { boton: "Anular", peligro: true }))) return;
          try { await q(sb.from("cargos").update({ estado: "anulado" }).eq("id", c.id)); ctx.toast("Cobro anulado"); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
        } }, "Anular") : null] },
    ], fs, { vacio: filtro === "vencidos" ? "No hay cobros vencidos. ¡Todo al día!" : "No hay cobros con ese filtro." }));
  }

  const cobroManual = () => formularioModal("Nuevo cobro", [
    { name: "estudiante_id", label: "Estudiante", type: "select", required: true, full: true, placeholder: "Elige", options: est.filter((e) => e.estado === "activo").map((e) => [e.id, nombreCompleto(e)]), value: estSel },
    { name: "concepto", label: "Concepto", required: true, full: true, placeholder: "Ej.: Libro de inglés, examen internacional" },
    { name: "tipo", label: "Tipo", type: "select", options: [["material", "Material"], ["otro", "Otro"], ["mensualidad", "Mensualidad"], ["matricula", "Matrícula"]] },
    { name: "monto", label: `Monto (${ctx.cuenta.moneda})`, type: "number", min: 0.01, step: "0.01", required: true },
    { name: "descuento", label: "Descuento", type: "number", min: 0, step: "0.01", value: 0 },
    { name: "vence", label: "Vence", type: "date", required: true, value: hoy },
  ], {}, async (d, cerrar) => {
    d.descuento = d.descuento ?? 0;
    await q(sb.from("cargos").insert({ ...d, cuenta_id: ctx.id }));
    cerrar(); ctx.toast("Cobro creado"); ctx.recargar();
  }, { boton: "Crear cobro" });

  const segVista = h("div.segmentos", { role: "group" }, [["cobrar", "Por cobrar"], ["pagos", "Pagos recibidos"]].map(([v, t]) =>
    h("button", { type: "button", "aria-pressed": String(v === vista), onclick: (e) => { vista = v; segVista.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); filtros.classList.toggle("oculto", v !== "cobrar"); pintar(); } }, t)));
  const filtros = h("div.segmentos", { role: "group" }, [["vencidos", `Vencidos (${vencidos.length})`], ["proximos", "Próximos"], ["todos", "Todos"]].map(([v, t]) =>
    h("button", { type: "button", "aria-pressed": String(v === filtro), onclick: (e) => { filtro = v; filtros.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); pintar(); } }, t)));
  if (vista !== "cobrar") filtros.classList.add("oculto");

  el.append(
    ctx.titulo("Finanzas",
      ctx.f("exportar") ? h("button.btn.btn-sec", { onclick: () => descargarCSV(`pagos-${hoy}.csv`, [["Recibo", "Fecha", "Estudiante", "Concepto", "Forma", "Referencia", "Monto", "Anulado"],
        ...pagos.map((p) => [p.recibo, p.fecha, nombreCompleto(E[p.estudiante_id] || {}), p.cargos?.concepto || "Abono", p.metodo, p.referencia, p.monto, p.anulado ? "sí" : "no"])]) }, h("span", { html: ICONOS.descargar }), "Exportar pagos") : null,
      h("button.btn", { onclick: cobroManual }, h("span", { html: ICONOS.mas_add }), "Nuevo cobro")),
    h("section.cifras",
      h("div.cifra", h("b", M(ingresosMes)), h("span", "cobrado este mes")),
      h("div.cifra", h("b", M(totalPend)), h("span", "por cobrar en total")),
      h("div.cifra.alerta", h("b", M(totalVenc)), h("span", `vencido · ${new Set(vencidos.map((c) => c.estudiante_id)).size} estudiantes`)),
      h("div.cifra", h("b", M(porVencer)), h("span", "vence en 15 días"))),
    estSel ? h("div.aviso", `Mostrando cobros de ${nombreCompleto(E[estSel] || {})}. `, h("a", { href: "#/finanzas" }, "Ver todos")) : null,
    h("div", { style: "display:flex;gap:.75rem;flex-wrap:wrap;margin:1.25rem 0 1rem;align-items:center" },
      segVista, filtros,
      h("input", { type: "search", placeholder: "Buscar estudiante, concepto o recibo", style: "max-width:300px", oninput: (e) => { texto = e.target.value; pintar(); } })),
    h("section.hoja", cont));
  pintar();
}
