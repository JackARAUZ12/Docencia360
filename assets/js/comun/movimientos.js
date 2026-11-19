// Gastos e ingresos propios (fuera de lo que se cobra a estudiantes) y el
// resumen del mes: cuánto entró, cuánto se gastó y la ganancia real.
// Lo usan el profesor (Finanzas) y la academia (Finanzas → Resumen y gastos).
// Los pagos a instructores se registran desde «Pagos a instructores» y aquí
// aparecen como gasto, sin poder editarlos (así cuadra la liquidación).
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, confirmar, fecha, hoyISO, dinero } from "../core/ui.js";

const CATS = {
  profesor: {
    gasto: ["Materiales", "Fotocopias e impresión", "Transporte", "Internet y teléfono", "Alquiler de local", "Plataformas y apps", "Capacitación", "Otro"],
    ingreso: ["Talleres", "Venta de material", "Asesorías", "Otro"],
  },
  academia: {
    gasto: ["Alquiler del local", "Luz, agua e internet", "Publicidad", "Materiales", "Personal administrativo", "Mantenimiento y limpieza", "Plataformas y apps", "Impuestos y trámites", "Otro"],
    ingreso: ["Venta de libros o material", "Talleres y eventos", "Alquiler de aulas", "Otro"],
  },
};
export const categorias = (ctx, tipo) => (CATS[ctx.modalidad] || CATS.academia)[tipo];
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const mesISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const nombreMes = (p) => { const [a, m] = p.split("-"); return `${MESES[Number(m) - 1]} ${a}`; };
export const rangoMes = (p) => { const [a, m] = p.split("-").map(Number); return [`${p}-01`, `${p}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`]; };
export const ultimosMeses = (n) => { const d0 = new Date(); return Array.from({ length: n }, (_, k) => mesISO(new Date(d0.getFullYear(), d0.getMonth() - k, 1))); };

/** Registrar o editar un gasto o un ingreso propio. */
export function movimiento(ctx, tipo, m) {
  const cats = categorias(ctx, tipo);
  const ej = ctx.modalidad === "profesor" ? ["Ej.: Fotocopias de la guía 3", "Ej.: Taller de repaso del sábado"] : ["Ej.: Alquiler de noviembre", "Ej.: Venta de libros de inglés"];
  formularioModal(m ? (tipo === "gasto" ? "Editar gasto" : "Editar ingreso") : (tipo === "gasto" ? "Registrar gasto" : "Registrar otro ingreso"), [
    { name: "concepto", label: "Concepto", required: true, maxlength: 140, full: true, placeholder: tipo === "gasto" ? ej[0] : ej[1] },
    { name: "monto", label: `Monto (${ctx.cuenta.moneda})`, type: "number", min: 0.01, step: "0.01", required: true },
    { name: "fecha", label: "Fecha", type: "date", required: true, value: hoyISO() },
    { name: "categoria", label: "Categoría", type: "select", required: true, options: cats.map((c) => [c, c]), value: cats[0] },
    { name: "nota", label: "Nota", maxlength: 500, full: true },
  ], m || null, async (d, cerrar) => {
    const fila = { tipo, concepto: d.concepto.trim(), monto: Number(d.monto), fecha: d.fecha, categoria: d.categoria, nota: d.nota?.trim() || null };
    if (m) await q(sb.from("movimientos").update(fila).eq("id", m.id));
    else await q(sb.from("movimientos").insert({ ...fila, cuenta_id: ctx.id }));
    cerrar(); ctx.toast(tipo === "gasto" ? "Gasto guardado" : "Ingreso guardado"); ctx.recargar();
  }, { boton: "Guardar" });
}

/** Barras horizontales por categoría. */
export function barras(ctx, lista) {
  const max = Math.max(...lista.map((x) => Number(x.total)), 1);
  return h("ul.barras-cat", lista.map((x) => h("li", h("span", { title: x.categoria }, x.categoria), h("span.barra", h("span", { style: `width:${(Number(x.total) / max) * 100}%` })), h("strong.num", dinero(x.total, ctx.cuenta.moneda)))));
}

/** Resumen de un mes para la academia: ingresos por tipo, gastos por categoría y ganancia. */
export async function resumenAcademia(ctx, cont, { mes, alCambiarMes, pendiente }) {
  cont.replaceChildren(h("p.tenue", "Calculando…"));
  const [desde, hasta] = rangoMes(mes);
  const r = await q(sb.rpc("d360_finanzas_resumen", { p_cuenta: ctx.id, p_desde: desde, p_hasta: hasta }));
  const M = (v) => dinero(v, ctx.cuenta.moneda);
  const ingresos = Number(r.cobrado) + Number(r.otros_ingresos), gastos = Number(r.gastos), ganancia = ingresos - gastos;
  const pt = r.por_tipo || {};
  const fila = (t, v) => h("li", h("span.crece", t), h("strong.num", M(v)));
  const TIPOS = [["matricula", "Matrículas"], ["mensualidad", "Mensualidades"], ["material", "Materiales"], ["clase", "Clases"], ["otro", "Otros cobros"]];
  cont.replaceChildren(
    h("div.barra-filtros", h("select", { "aria-label": "Mes", onchange: (e) => alCambiarMes(e.target.value) }, ultimosMeses(6).map((x) => h("option", { value: x, selected: x === mes }, nombreMes(x))))),
    h("section.cifras",
      h("div.cifra", h("b", M(ingresos)), h("span", "ingresos")),
      h("div.cifra", h("b", M(gastos)), h("span", "gastos")),
      h("div.cifra" + (ganancia < 0 ? ".alerta" : ""), h("b", M(ganancia)), h("span", ganancia < 0 ? "pérdida" : "ganancia")),
      pendiente != null ? h("div.cifra", h("b", M(pendiente)), h("span", "por cobrar")) : null),
    h("div.dos-col", { style: "margin-top:1rem" },
      h("section.hoja", h("h2", "De dónde entró"),
        ingresos ? h("ul.lista.lista-montos",
          TIPOS.filter(([k]) => Number(pt[k])).map(([k, t]) => fila(t, pt[k])),
          (r.ingresos_por_categoria || []).map((x) => fila(x.categoria, x.total))) : h("p.suave", "Sin ingresos en este mes."),
        h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => movimiento(ctx, "ingreso") }, "+ Registrar otro ingreso")),
      h("section.hoja", h("h2", "En qué se gastó"),
        (r.gastos_por_categoria || []).length ? barras(ctx, r.gastos_por_categoria) : h("p.suave", "Sin gastos en este mes."),
        h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => movimiento(ctx, "gasto") }, "+ Registrar gasto"))),
    h("p.tenue", { style: "margin-top:1rem" }, "Ingresos = lo cobrado a estudiantes (con recibo) + otros ingresos. Gastos = lo que anotas aquí + los pagos a instructores."));
}

/** Lista de gastos e ingresos de un mes con editar y borrar. */
export async function listaMovimientos(ctx, cont, { mes, alCambiarMes }) {
  cont.replaceChildren(h("p.tenue", "Cargando…"));
  const [desde, hasta] = rangoMes(mes);
  const movs = await q(sb.from("movimientos").select("*").eq("cuenta_id", ctx.id).gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).limit(300));
  const M = (v) => dinero(v, ctx.cuenta.moneda);
  cont.replaceChildren(
    h("div.barra-filtros",
      h("select", { "aria-label": "Mes", onchange: (e) => alCambiarMes(e.target.value) }, ultimosMeses(6).map((x) => h("option", { value: x, selected: x === mes }, nombreMes(x)))),
      h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => movimiento(ctx, "ingreso") }, "+ Ingreso"),
      h("button.btn.btn-sm", { type: "button", onclick: () => movimiento(ctx, "gasto") }, "+ Gasto")),
    h("section.hoja", movs.length ? tabla([
      { t: "Fecha", v: (m) => fecha(m.fecha) },
      { t: "Concepto", v: (m) => h("div.celda-doble", h("strong", m.concepto), h("div.tenue", m.categoria)) },
      { t: "Monto", clase: "derecha", v: (m) => h("strong.num" + (m.tipo === "gasto" ? ".nota-baja" : ""), (m.tipo === "gasto" ? "− " : "+ ") + M(m.monto)) },
      { t: "", clase: "acciones", v: (m) => m.miembro_id ? h("a.btn.btn-texto.btn-sm", { href: "#/pagos-instructores" }, "Ver pago") : [
        h("button.btn.btn-texto.btn-sm", { onclick: () => movimiento(ctx, m.tipo, m) }, "Editar"),
        h("button.btn.btn-texto.btn-sm", { onclick: async () => {
          if (!(await confirmar("Borrar", `¿Borrar «${m.concepto}»?`, { boton: "Borrar", peligro: true }))) return;
          try { await q(sb.from("movimientos").delete().eq("id", m.id)); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
        } }, "Borrar")] },
    ], movs) : h("div.vacio", h("p", "No hay gastos ni otros ingresos en este mes."), h("p.suave", "Anota el alquiler, los servicios, la publicidad… y verás la ganancia real del mes."))));
}
