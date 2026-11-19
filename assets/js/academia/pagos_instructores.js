// Pagos a instructores: cada instructor tiene su forma de pago (por hora, por
// clase o salario fijo). Las clases dadas salen de la asistencia que se pasó
// y las horas, del horario del grupo. Cada pago queda como gasto en Finanzas.
// Un instructor ve aquí solo lo suyo («Mis pagos»).
import { sb, q } from "../core/sb.js";
import { h, tabla, modal, formularioModal, fecha, hoyISO, dinero, descargarCSV, imprimir } from "../core/ui.js";
import { nombreMes, ultimosMeses, mesISO } from "../comun/movimientos.js";

const FORMAS = { hora: "Por hora", clase: "Por clase", fijo: "Salario fijo" };
const METODOS = [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["deposito", "Depósito"], ["otro", "Otro"]];
const r2 = (n) => Math.round(Number(n) * 100) / 100;

export async function render(el, ctx, { params }) {
  const propio = !ctx.esFinanzas;
  const titulo = propio ? "Mis pagos" : "Pagos a instructores";
  if (!ctx.f("finanzas")) { el.append(ctx.titulo(titulo), h("div.aviso.ojo", "Tu plan no incluye finanzas.")); return; }
  const meses = ultimosMeses(6);
  const mes = meses.includes(params.get("mes")) ? params.get("mes") : mesISO();
  const L = await q(sb.rpc("d360_instructores_liquidacion", { p_cuenta: ctx.id, p_periodo: mes }));
  const M = (v) => dinero(v, ctx.cuenta.moneda);
  const lista = L.instructores || [];
  const calc = (i) => (i.calculado == null ? null : r2(i.calculado));
  const saldo = (i) => (i.calculado == null ? 0 : Math.max(r2(i.calculado - i.pagado), 0));
  const totCalc = lista.reduce((s, i) => s + (calc(i) || 0), 0), totPag = lista.reduce((s, i) => s + Number(i.pagado), 0);
  const totPend = lista.reduce((s, i) => s + saldo(i), 0);
  const sinForma = lista.filter((i) => !i.forma && i.activo);

  const forma = (i) => !i.forma ? "Sin forma de pago" : i.forma === "fijo" ? `Salario fijo · ${M(i.tarifa)} al mes` : `${M(i.tarifa)} ${i.forma === "hora" ? "por hora" : "por clase"}`;
  const cuenta = (i) => `${i.clases} clase${i.clases === 1 ? "" : "s"}` + (Number(i.horas) ? ` · ${Number(i.horas).toLocaleString("es")} h` : "");

  const tarifa = (i) => formularioModal(`Cómo se le paga a ${i.nombre}`, [
    { name: "forma", label: "Forma de pago", type: "select", required: true, options: Object.entries(FORMAS), value: i.forma || "hora", full: true,
      help: "Por hora: horas de clase dadas × tarifa. Por clase: clases dadas × tarifa. Salario fijo: el mismo monto cada mes." },
    { name: "monto", label: `Monto (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", required: true, value: i.tarifa ?? "",
      help: "Tarifa por hora o por clase, o el salario del mes." },
  ], {}, async (d, cerrar) => {
    await q(sb.from("tarifas_instructor").upsert({ miembro_id: i.id, cuenta_id: ctx.id, forma: d.forma, monto: Number(d.monto), actualizado: new Date().toISOString() }, { onConflict: "miembro_id" }));
    cerrar(); ctx.toast("Forma de pago guardada"); ctx.recargar();
  }, { boton: "Guardar" });

  const comprobante = (i, p) => h("div.recibo",
    h("div.cab", h("div", h("strong", ctx.cuenta.nombre), h("div", { style: "font-size:.85rem" }, "Comprobante de pago a instructor")),
      h("div", { style: "text-align:right" }, h("strong", nombreMes(mes)), h("div", { style: "font-size:.85rem" }, fecha(p.fecha)))),
    h("p", "Se pagó a ", h("strong", i.nombre), " la cantidad de:"),
    h("p.monto", M(p.monto)),
    h("p", `Por: ${forma(i)} · ${cuenta(i)} en ${nombreMes(mes)}`),
    p.nota ? h("p", `Nota: ${p.nota}`) : null,
    h("p", { style: "font-size:.9rem" }, `Forma de pago: ${METODOS.find((x) => x[0] === p.detalle?.metodo)?.[1] || "Efectivo"}`),
    h("p", { style: "margin-top:3rem;display:flex;justify-content:space-between;gap:1rem;font-size:.9rem" },
      h("span", "_____________________", h("br"), "Entregado por"), h("span", "_____________________", h("br"), "Recibido (firma)")));
  const verComprobante = (i, p) => { const doc = comprobante(i, p); modal("Comprobante", doc, [{ texto: "Cerrar", clase: "btn-sec" }, { texto: "Imprimir / PDF", onclick: () => { imprimir(doc); return false; } }]); };

  const pagar = (i) => {
    const s = saldo(i);
    const expl = i.forma === "fijo" ? `Salario de ${nombreMes(mes)}: ${M(i.tarifa)}.`
      : `${i.forma === "hora" ? `${Number(i.horas)} h` : `${i.clases} clases`} × ${M(i.tarifa)} = ${M(calc(i))}.`;
    formularioModal(`Pagar a ${i.nombre} · ${nombreMes(mes)}`, [
      { name: "monto", label: `Monto (${ctx.cuenta.moneda})`, type: "number", min: 0.01, step: "0.01", required: true, value: s || "", full: true,
        help: `${expl} Ya pagado: ${M(i.pagado)}. Puedes pagar un adelanto, el resto o agregar un bono.` },
      { name: "fecha", label: "Fecha", type: "date", required: true, value: hoyISO() },
      { name: "metodo", label: "Forma de pago", type: "select", required: true, options: METODOS },
      { name: "nota", label: "Nota", maxlength: 300, full: true, placeholder: "Ej.: Adelanto, bono por taller, descuento por falta" },
    ], {}, async (d, cerrar) => {
      const id = await q(sb.rpc("d360_instructor_pagar", { p_cuenta: ctx.id, p_miembro: i.id, p_periodo: mes, p_monto: Number(d.monto), p_fecha: d.fecha, p_metodo: d.metodo, p_nota: d.nota || null,
        p_detalle: { forma: i.forma, tarifa: i.tarifa, clases: i.clases, horas: i.horas, calculado: calc(i) } }));
      cerrar(); ctx.toast("Pago registrado");
      verComprobante(i, { id, fecha: d.fecha, monto: Number(d.monto), nota: d.nota, detalle: { metodo: d.metodo } });
      setTimeout(ctx.recargar, 300);
    }, { boton: "Registrar pago" });
  };

  const detalle = (i) => modal(`${i.nombre} · ${nombreMes(mes)}`, h("div",
    h("p", h("strong", forma(i)), ` · ${cuenta(i)}`),
    i.sin_horario && i.forma === "hora" ? h("div.aviso.ojo", `${i.sin_horario} clase(s) no tienen horario ese día y no suman horas. Pon el horario del grupo para que se cuenten.`) : null,
    h("h3", "Clases dadas"),
    i.detalle.length ? tabla([{ t: "Fecha", v: (c) => fecha(c.fecha) }, { t: "Grupo", v: (c) => c.grupo }, { t: "Horas", clase: "derecha", v: (c) => c.horas == null ? h("span.tenue", "sin horario") : Number(c.horas) }], i.detalle)
      : h("p.suave", "No hay clases con lista en este mes."),
    h("h3", "Pagos de este mes"),
    i.pagos.length ? h("ul.lista", i.pagos.map((p) => h("li", h("div.crece", h("strong", M(p.monto)), h("div.tenue", [fecha(p.fecha), p.nota].filter(Boolean).join(" · "))),
      h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => verComprobante(i, p) }, "Comprobante")))) : h("p.suave", "Aún sin pagos."),
    propio ? h("p.tenue", "Las clases se cuentan con la asistencia que pasas. Si algo no cuadra, avísale a la administración.") : null),
    [{ texto: "Cerrar", clase: "btn-sec" }]).el?.classList.add("ancho");

  const selMes = h("select", { "aria-label": "Mes", onchange: (e) => ctx.ir(`#/${propio ? "mis-pagos" : "pagos-instructores"}?mes=${e.target.value}`) }, meses.map((x) => h("option", { value: x, selected: x === mes }, nombreMes(x))));
  el.append(
    ctx.titulo(titulo, !propio && ctx.f("exportar") && lista.length ? h("button.btn.btn-sec", { onclick: () => descargarCSV(`pagos-instructores-${mes}.csv`,
      [["Instructor", "Forma", "Tarifa", "Clases", "Horas", "Calculado", "Pagado", "Pendiente"], ...lista.map((i) => [i.nombre, FORMAS[i.forma] || "", i.tarifa ?? "", i.clases, i.horas, calc(i) ?? "", i.pagado, saldo(i)])]) }, "Exportar") : null),
    h("div.barra-filtros", selMes),
    h("section.cifras",
      h("div.cifra", h("b", M(totCalc)), h("span", propio ? "te corresponde" : "a pagar en el mes")),
      h("div.cifra", h("b", M(totPag)), h("span", "pagado")),
      h("div.cifra" + (totPend > 0 ? ".alerta" : ""), h("b", M(totPend)), h("span", "pendiente"))),
    !propio && sinForma.length ? h("div.aviso.ojo", { style: "margin-top:1rem" }, `${sinForma.length} instructor(es) sin forma de pago. Toca «Definir pago» para indicar si se le paga por hora, por clase o salario fijo.`) : null,
    !propio && (L.sin_instructor || []).length ? h("div.aviso.ojo", { style: "margin-top:1rem" }, `${L.sin_instructor.length} clase(s) con lista no tienen instructor asignado (${[...new Set(L.sin_instructor.map((x) => x.grupo))].join(", ")}). `,
      h("a", { href: "#/grupos" }, "Asignar instructor en el grupo")) : null,
    h("section.hoja", { style: "margin-top:1rem" },
      lista.length ? h("ul.lista.lista-cobros.lista-pagos-inst", lista.map((i) => h("li",
        h("div.crece",
          h("strong", i.nombre, i.activo ? null : h("span.tenue", " (sin acceso)")),
          h("div.tenue", `${forma(i)} · ${cuenta(i)}`),
          i.sin_horario && i.forma === "hora" ? h("span.estado.ojo", `${i.sin_horario} clase(s) sin horario`) : null),
        h("div.montos",
          calc(i) == null ? h("span.tenue", "—") : h("strong.num", M(calc(i))),
          h("div.tenue", Number(i.pagado) ? (saldo(i) > 0 ? `pagado ${M(i.pagado)} · falta ${M(saldo(i))}` : `pagado ${M(i.pagado)}`) : "sin pagos")),
        h("div.acciones-cobro",
          !propio && L.puede_pagar && !i.forma ? h("button.btn.btn-sm", { type: "button", onclick: () => tarifa(i) }, "Definir pago") : null,
          !propio && L.puede_pagar && i.forma ? h("button.btn.btn-sm" + (saldo(i) > 0 ? "" : ".btn-sec"), { type: "button", onclick: () => pagar(i) }, saldo(i) > 0 ? "Pagar" : "Otro pago") : null,
          h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => detalle(i) }, "Detalle"),
          !propio && L.puede_pagar && i.forma ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => tarifa(i) }, "Tarifa") : null))))
        : h("div.vacio", h("p", propio ? "Aún no hay datos de este mes." : "Aún no registras instructores."), !propio ? h("p.suave", h("a", { href: "#/instructores" }, "Registrar instructores")) : null)),
    h("p.tenue", { style: "margin-top:1rem" }, "Una clase cuenta cuando se pasa lista en el grupo ese día. La duración sale del horario del grupo. Los pagos aparecen como gasto en Finanzas."));
}
