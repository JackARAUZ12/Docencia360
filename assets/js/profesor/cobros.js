// Finanzas del profesor: resumen del mes (ingresos, gastos y ganancia),
// mensualidades por grupo, clases particulares, quién debe, pagos con recibo,
// recordatorio por WhatsApp y registro de gastos e ingresos propios.
// Se adapta a cómo cobra el profesor (por mes, por clase, ambas o no cobra).
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

// Cómo cobra el profesor (lo elige una vez; se puede cambiar)
export const FORMAS_COBRO = [
  ["mensual", "Mensualidad", "Cobro una cuota fija al mes por grupo."],
  ["clase", "Por clase", "Clases particulares: cobro cada clase que doy."],
  ["ambos", "De las dos formas", "Tengo grupos con mensualidad y también clases particulares."],
  ["no", "No cobro", "Enseño en un colegio o institución: solo quiero anotar mis gastos."],
];
export function preguntaCobro(ctx, alElegir, actual) {
  return h("section.hoja.pregunta-cobro",
    h("h2", "¿Cómo cobras a tus estudiantes?"),
    h("p.suave", "Así te mostramos solo lo que te sirve. Lo puedes cambiar cuando quieras."),
    h("div.opciones-cobro", FORMAS_COBRO.map(([v, t, d]) => h("button.bv-opcion" + (actual === v ? ".elegida" : ""), { type: "button", onclick: async () => {
      await ctx.guiaGuardar({ cobro: v }); alElegir?.(v);
    } }, h("strong", t), h("span.tenue", d)))));
}
const CAT_GASTO = ["Materiales", "Fotocopias e impresión", "Transporte", "Internet y teléfono", "Alquiler de local", "Plataformas y apps", "Capacitación", "Otro"];
const CAT_INGRESO = ["Talleres", "Venta de material", "Asesorías", "Otro"];

export async function render(el, ctx, { params }) {
  if (!ctx.f("finanzas")) {
    el.append(ctx.titulo("Finanzas"), h("section.hoja",
      h("h2", "Lleva tus cuentas sin complicarte"),
      h("ul",
        h("li", "Mensualidades por grupo o cobro por clase particular, con recibo numerado."),
        h("li", "Quién te debe, cuánto y desde cuándo, con recordatorio por WhatsApp."),
        h("li", "Tus gastos (materiales, fotocopias, transporte, internet…) y otros ingresos."),
        h("li", "Resumen de cada mes: cuánto entró, cuánto gastaste y cuánto ganaste.")),
      h("p.suave", "Disponible en los planes Profesional y Premium."),
      ctx.mejora("Finanzas")));
    return;
  }
  if (!ctx.esFinanzas) { el.append(ctx.titulo("Finanzas"), h("div.vacio", h("p", "Solo el dueño de la cuenta ve las finanzas."))); return; }

  const forma = ctx.guia?.cobro || null;
  const usaMes = !forma || ["mensual", "ambos"].includes(forma);
  const usaClase = !forma || ["clase", "ambos"].includes(forma);
  const cobra = forma !== "no";
  const hoy = hoyISO();
  const d0 = new Date();
  const meses = [0, 1, 2].map((k) => { const d = new Date(d0.getFullYear(), d0.getMonth() - k, 1); return mesISO(d); });
  let mes = meses.includes(params.get("mes")) ? params.get("mes") : meses[0];
  const [cargos, grupos, estudiantes] = await Promise.all([
    q(sb.from("cargos").select("*").eq("cuenta_id", ctx.id).neq("estado", "anulado").order("vence")),
    ctx.datos.grupos(true),
    ctx.datos.estudiantes(true),
  ]);
  const E = Object.fromEntries(estudiantes.map((e) => [e.id, e]));
  const pendientes = cargos.filter((c) => ["pendiente", "parcial"].includes(c.estado));
  const porEst = {};
  for (const c of pendientes) (porEst[c.estudiante_id] ??= []).push(c);
  const deudores = Object.entries(porEst).map(([id, cs]) => ({ id, est: E[id] || { id, nombres: "Estudiante", apellidos: "" }, cargos: cs,
    saldo: cs.reduce((s, c) => s + saldoDe(c), 0), vencido: cs.filter((c) => c.vence < hoy).reduce((s, c) => s + saldoDe(c), 0),
    desde: cs.map((c) => c.vence).sort()[0] }))
    .sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);
  const activos = grupos.filter((g) => g.estado === "activo");
  const sinMensualidad = activos.filter((g) => !(Number(g.mensualidad) > 0));
  const filtroEst = params.get("estudiante");
  const VISTAS = [["resumen", "Resumen"],
    cobra || deudores.length ? ["deben", `Quién debe (${deudores.length})`] : null,
    usaClase && cobra ? ["clases", "Clases particulares"] : null,
    ["movimientos", "Gastos e ingresos"],
    usaMes && cobra ? ["mensualidades", "Mensualidades"] : null].filter(Boolean);
  let vista = VISTAS.some(([v]) => v === params.get("vista")) ? params.get("vista") : filtroEst ? "deben" : "resumen";

  const segs = h("div.segmentos.envolver", { role: "group", "aria-label": "Vista" }, VISTAS.map(([v, t]) =>
    h("button", { type: "button", "aria-pressed": String(v === vista), onclick: (e) => ir(v, e.currentTarget) }, t)));
  const ir = (v, b) => { vista = v; segs.querySelectorAll("button").forEach((x, i) => x.setAttribute("aria-pressed", String(b ? x === b : VISTAS[i][0] === v))); pintar(); };
  const cuerpo = h("div");
  el.append(
    ctx.titulo("Finanzas",
      h("button.btn.btn-sec", { onclick: () => movimiento(ctx, "gasto") }, "Registrar gasto"),
      usaClase && cobra ? h("button.btn.btn-sec", { onclick: () => registrarClase(ctx, estudiantes) }, "Registrar clase") : null,
      usaMes && cobra ? h("button.btn", { onclick: () => generar(ctx, activos) }, "Generar mensualidades") : null),
    !forma ? preguntaCobro(ctx, () => ctx.recargar()) : null,
    usaMes && cobra && forma && sinMensualidad.length && activos.length ? h("div.aviso.ojo", `${sinMensualidad.length} grupo(s) aún no tienen mensualidad. `,
      h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => ir("mensualidades") }, "Ponerla ahora")) : null,
    h("div.barra-filtros", segs), cuerpo,
    forma ? h("p.tenue", { style: "margin-top:1.5rem" }, `Cobras: ${FORMAS_COBRO.find((x) => x[0] === forma)?.[1].toLowerCase()}. `,
      h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => modal("Cómo cobras", preguntaCobro(ctx, () => { document.querySelector("dialog.modal")?.remove(); ctx.recargar(); }, forma), []) }, "Cambiar")) : null);

  async function pintar() {
    if (vista === "deben") return vistaDeben();
    if (vista === "clases") return vistaClases();
    if (vista === "movimientos") return vistaMovimientos();
    if (vista === "mensualidades") return vistaMensualidades();
    return vistaResumen();
  }

  async function vistaResumen() {
    cuerpo.replaceChildren(h("p.tenue", "Calculando…"));
    const [a, m] = mes.split("-").map(Number);
    const desde = `${mes}-01`, hasta = mesISO(new Date(a, m, 1)) + "-01";
    const fin = new Date(new Date(hasta + "T00:00:00").getTime() - 864e5).toISOString().slice(0, 10);
    const r = await q(sb.rpc("d360_finanzas_resumen", { p_cuenta: ctx.id, p_desde: desde, p_hasta: fin }));
    const ingresos = Number(r.cobrado) + Number(r.otros_ingresos);
    const gastos = Number(r.gastos);
    const ganancia = ingresos - gastos;
    const pt = r.por_tipo || {};
    const fila = (t, v) => h("li", h("span.crece", t), h("strong.num", dinero(v, ctx.cuenta.moneda)));
    const barras = (lista) => { const max = Math.max(...lista.map((x) => Number(x.total)), 1);
      return h("ul.barras-cat", lista.map((x) => h("li", h("span", x.categoria), h("span.barra", h("span", { style: `width:${(Number(x.total) / max) * 100}%` })), h("strong.num", dinero(x.total, ctx.cuenta.moneda))))); };
    const selMes = h("select", { "aria-label": "Mes", onchange: (e) => { mes = e.target.value; vistaResumen(); } }, meses.map((x) => h("option", { value: x, selected: x === mes }, nombreMes(x))));
    cuerpo.replaceChildren(
      h("div.barra-filtros", selMes),
      h("section.cifras",
        h("div.cifra", h("b", dinero(ingresos, ctx.cuenta.moneda)), h("span", "ingresos")),
        h("div.cifra", h("b", dinero(gastos, ctx.cuenta.moneda)), h("span", "gastos")),
        h("div.cifra" + (ganancia < 0 ? ".alerta" : ""), h("b", dinero(ganancia, ctx.cuenta.moneda)), h("span", ganancia < 0 ? "pérdida" : "ganancia")),
        cobra ? h("div.cifra" + (deudores.some((d) => d.vencido > 0) ? ".alerta" : ""), h("b", dinero(pendientes.reduce((s, c) => s + saldoDe(c), 0), ctx.cuenta.moneda)), h("span", "te deben")) : null),
      h("div.dos-col", { style: "margin-top:1rem" },
        h("section.hoja", h("h2", "De dónde entró"),
          ingresos ? h("ul.lista.lista-montos",
            Number(pt.mensualidad) ? fila("Mensualidades", pt.mensualidad) : null,
            Number(pt.clase) ? fila("Clases particulares", pt.clase) : null,
            Number(pt.otro) || Number(pt.material) || Number(pt.matricula) ? fila("Otros cobros a estudiantes", Number(pt.otro || 0) + Number(pt.material || 0) + Number(pt.matricula || 0)) : null,
            ...(r.ingresos_por_categoria || []).map((x) => fila(x.categoria, x.total))) : h("p.suave", "Sin ingresos en este mes."),
          h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => movimiento(ctx, "ingreso") }, "+ Registrar otro ingreso")),
        h("section.hoja", h("h2", "En qué gastaste"),
          (r.gastos_por_categoria || []).length ? barras(r.gastos_por_categoria) : h("p.suave", "Sin gastos en este mes."),
          h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => movimiento(ctx, "gasto") }, "+ Registrar gasto"))));
  }

  function vistaDeben() {
    const lista = filtroEst ? deudores.filter((d) => d.id === filtroEst) : deudores;
    cuerpo.replaceChildren(h("section.hoja",
      filtroEst ? h("p", h("a", { href: "#/cobros?vista=deben" }, "← Ver a todos")) : null,
      lista.length ? h("ul.lista.lista-cobros", lista.map((d) => h("li",
        h("div.crece",
          h("a.titulo", { href: `#/estudiantes/${d.id}`, style: "color:inherit" }, nombreCompleto(d.est)),
          h("div.tenue", d.cargos.map((c) => c.concepto.replace(/ · .*$/, "")).join(" · ")),
          d.vencido > 0 ? h("span.estado.mal", `Vencido desde ${fecha(d.desde)}`) : h("span.estado.ojo", `Vence ${fecha(d.desde)}`)),
        h("strong.num", dinero(d.saldo, ctx.cuenta.moneda)),
        h("div.acciones-cobro",
          h("button.btn.btn-sm", { type: "button", onclick: () => cobrar(ctx, d) }, "Registrar pago"),
          h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => recordatorio(ctx, d) }, "WhatsApp")))))
        : h("div.vacio", h("p", filtroEst ? "Este estudiante no tiene cobros pendientes." : "Nadie te debe. ¡Todo al día!"))),
      h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => cobroSuelto(ctx, estudiantes) }, "+ Otro cobro (libro, material…)"));
  }

  function vistaClases() {
    const clases = cargos.filter((c) => c.tipo === "clase").sort((a, b) => b.vence.localeCompare(a.vence)).slice(0, 60);
    cuerpo.replaceChildren(h("section.hoja",
      h("div.hoja-titulo", h("h2", "Clases particulares"), h("button.btn.btn-sm", { type: "button", onclick: () => registrarClase(ctx, estudiantes) }, "Registrar clase")),
      clases.length ? h("ul.lista.lista-cobros", clases.map((c) => h("li",
        h("div.crece", h("strong", nombreCompleto(E[c.estudiante_id] || {})), h("div.tenue", c.concepto.replace(/^Clase particular · /, ""))),
        h("strong.num", dinero(Number(c.monto) - Number(c.descuento), ctx.cuenta.moneda)),
        c.estado === "pagado" ? h("span.estado.ok", "Pagada")
          : h("button.btn.btn-sm", { type: "button", onclick: () => registrarPago(ctx, c, E[c.estudiante_id] || {}, ctx.recargar) }, "Registrar pago"))))
        : h("div.vacio", h("p", "Aún no registras clases particulares."), h("p.suave", "Cada vez que das una clase, regístrala aquí: si ya te pagó, queda con su recibo; si no, aparece en «Quién debe»."))));
  }

  async function vistaMovimientos() {
    cuerpo.replaceChildren(h("p.tenue", "Cargando…"));
    const movs = await q(sb.from("movimientos").select("*").eq("cuenta_id", ctx.id).order("fecha", { ascending: false }).limit(200));
    cuerpo.replaceChildren(h("section.hoja",
      h("div.hoja-titulo", h("h2", "Gastos e ingresos"),
        h("div", { style: "display:flex;gap:.5rem;flex-wrap:wrap" },
          h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => movimiento(ctx, "ingreso") }, "+ Ingreso"),
          h("button.btn.btn-sm", { type: "button", onclick: () => movimiento(ctx, "gasto") }, "+ Gasto"))),
      h("p.suave", "Lo que cobras a tus estudiantes se suma solo. Aquí anotas lo demás: tus gastos de las clases y otros ingresos (talleres, venta de guías…)."),
      movs.length ? tabla([
        { t: "Fecha", v: (m) => fecha(m.fecha) },
        { t: "Concepto", v: (m) => [h("strong", m.concepto), h("div.tenue", m.categoria)] },
        { t: "Monto", clase: "derecha", v: (m) => h("strong.num" + (m.tipo === "gasto" ? ".nota-baja" : ""), (m.tipo === "gasto" ? "− " : "+ ") + dinero(m.monto, ctx.cuenta.moneda)) },
        { t: "", clase: "acciones", v: (m) => [
          h("button.btn.btn-texto.btn-sm", { onclick: () => movimiento(ctx, m.tipo, m) }, "Editar"),
          h("button.btn.btn-texto.btn-sm", { onclick: async () => {
            if (!(await confirmar("Borrar", `¿Borrar «${m.concepto}»?`, { boton: "Borrar", peligro: true }))) return;
            try { await q(sb.from("movimientos").delete().eq("id", m.id)); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
          } }, "Borrar")] },
      ], movs) : h("p.suave", "Todavía no anotas gastos ni otros ingresos.")));
  }

  function vistaMensualidades() {
    const filas = activos.map((g) => {
      const inp = h("input", { type: "number", min: 0, step: "0.01", value: Number(g.mensualidad) || "", placeholder: "0", style: "max-width:9rem", "aria-label": `Mensualidad de ${g.nombre}` });
      const btn = h("button.btn.btn-sec.btn-sm", { type: "button", onclick: async () => {
        btn.disabled = true;
        try { await q(sb.from("grupos").update({ mensualidad: Number(inp.value) || 0 }).eq("id", g.id)); g.mensualidad = Number(inp.value) || 0; ctx.datos.invalidar("grupos"); ctx.toast("Mensualidad guardada"); }
        catch (e) { ctx.toast(e.message, "mal"); } finally { btn.disabled = false; }
      } }, "Guardar");
      return h("li", h("div.crece", h("strong", g.nombre), h("div.tenue", `${ctx.cuenta.moneda === "USD" ? "US$" : "C$"} por estudiante al mes · 0 si no cobras por este grupo`)), inp, btn);
    });
    cuerpo.replaceChildren(h("section.hoja",
      h("p.suave", "Pon cuánto cobras al mes en cada grupo. Si a un estudiante le haces descuento (por ejemplo, hermanos), ponlo en su ficha con «Editar»."),
      filas.length ? h("ul.lista.lista-cobros", filas) : h("p.suave", "No tienes grupos activos.")));
  }

  pintar();
}

/** Registrar un gasto o un ingreso propio. */
function movimiento(ctx, tipo, m) {
  const cats = tipo === "gasto" ? CAT_GASTO : CAT_INGRESO;
  formularioModal(m ? (tipo === "gasto" ? "Editar gasto" : "Editar ingreso") : (tipo === "gasto" ? "Registrar gasto" : "Registrar otro ingreso"), [
    { name: "concepto", label: "Concepto", required: true, maxlength: 140, full: true, placeholder: tipo === "gasto" ? "Ej.: Fotocopias de la guía 3" : "Ej.: Taller de repaso del sábado" },
    { name: "monto", label: `Monto (${ctx.cuenta.moneda})`, type: "number", min: 0.01, step: "0.01", required: true },
    { name: "fecha", label: "Fecha", type: "date", required: true, value: hoyISO() },
    { name: "categoria", label: "Categoría", type: "select", options: cats.map((c) => [c, c]), value: cats[0] },
    { name: "nota", label: "Nota (opcional)", maxlength: 500, full: true },
  ], m || null, async (d, cerrar) => {
    const fila = { tipo, concepto: d.concepto.trim(), monto: Number(d.monto), fecha: d.fecha, categoria: d.categoria, nota: d.nota?.trim() || null };
    if (m) await q(sb.from("movimientos").update(fila).eq("id", m.id));
    else await q(sb.from("movimientos").insert({ ...fila, cuenta_id: ctx.id }));
    cerrar(); ctx.toast(tipo === "gasto" ? "Gasto guardado" : "Ingreso guardado"); ctx.recargar();
  }, { boton: "Guardar" });
}

/** Registrar una clase particular cobrada (pagada al momento o pendiente). */
function registrarClase(ctx, estudiantes) {
  const activos = estudiantes.filter((e) => e.estado === "activo");
  if (!activos.length) { ctx.toast("Primero registra a tus estudiantes.", "mal"); return; }
  formularioModal("Registrar clase particular", [
    { name: "estudiante_id", label: "Estudiante", type: "select", required: true, options: activos.map((e) => [e.id, nombreCompleto(e) + (Number(e.tarifa_clase) ? ` · ${dinero(e.tarifa_clase, ctx.cuenta.moneda)}` : "")]), full: true },
    { name: "fecha", label: "Fecha de la clase", type: "date", required: true, value: hoyISO() },
    { name: "monto", label: `Cobro (${ctx.cuenta.moneda})`, type: "number", min: 0.01, step: "0.01", required: true, help: "Si el estudiante tiene tarifa por clase, se usa esa." },
    { name: "detalle", label: "Tema o detalle (opcional)", maxlength: 120, full: true, placeholder: "Ej.: Repaso de fracciones · 1 hora" },
    { name: "pagado", label: "Ya me pagó", type: "checkbox", value: true },
    { name: "metodo", label: "Forma de pago", type: "select", options: [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["deposito", "Depósito"], ["tarjeta", "Tarjeta"], ["otro", "Otro"]] },
  ], {}, async (d, cerrar) => {
    const r = await q(sb.rpc("d360_cobro_clase", { p_cuenta: ctx.id, p_estudiante: d.estudiante_id, p_fecha: d.fecha, p_detalle: d.detalle || null,
      p_monto: Number(d.monto), p_pagado: !!d.pagado, p_metodo: d.metodo || "efectivo" }));
    cerrar(); ctx.toast(r.recibo ? `Clase registrada y pagada · recibo N.º ${r.recibo}` : "Clase registrada: queda en «Quién debe»");
    ctx.recargar();
  }, { boton: "Registrar" });
  // Tarifa del estudiante elegido
  setTimeout(() => {
    const dlg = document.querySelector("dialog.modal:last-of-type");
    const sel = dlg?.querySelector("[name=estudiante_id]"), monto = dlg?.querySelector("[name=monto]");
    const poner = () => { const e = activos.find((x) => x.id === sel.value); if (e && Number(e.tarifa_clase) && monto) monto.value = Number(e.tarifa_clase); };
    sel?.addEventListener("change", poner); poner();
  }, 30);
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
  if (ctx.guia?.cobro === "no" && !cargos.length) return null;   // no cobra: la ficha no muestra pagos vacíos
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
