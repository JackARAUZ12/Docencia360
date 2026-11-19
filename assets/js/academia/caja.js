// Cierre de caja: lo cobrado en el día por forma de pago (y por cajero), los
// recibos emitidos, los anulados y el cierre con el efectivo contado. Los
// totales del cierre los calcula el servidor y el cierre no se puede editar.
import { sb, q } from "../core/sb.js";
import { h, tabla, modal, fecha, hoyISO, sumarDias, dinero, toast } from "../core/ui.js";

const METODO = { efectivo: "Efectivo", transferencia: "Transferencia", deposito: "Depósito", tarjeta: "Tarjeta", otro: "Otro" };
const hora = (iso) => new Date(iso).toLocaleTimeString("es-NI", { hour: "numeric", minute: "2-digit" });

export async function render(el, ctx, { params }) {
  if (!ctx.f("finanzas") || !ctx.esFinanzas) { el.append(ctx.titulo("Cierre de caja"), h("div.aviso.ojo", "Solo quien maneja finanzas ve la caja.")); return; }
  const hoy = hoyISO();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(params.get("fecha") || "") && params.get("fecha") <= hoy ? params.get("fecha") : hoy;
  // La cajera ve su propia caja por defecto; la dirección, toda la caja
  const miUser = (await sb.auth.getUser()).data?.user?.id || null;
  const soloMia = ctx.rol === "finanzas";
  const cajeroParam = params.get("cajero");
  const cajero = cajeroParam === "todos" ? null : cajeroParam || (soloMia ? miUser : null);
  const d = await q(sb.rpc("d360_caja_dia", { p_cuenta: ctx.id, p_fecha: dia, p_cajero: cajero }));
  const M = (n) => dinero(n, ctx.cuenta.moneda);
  const cierre = (d.cierres || []).find((k) => (k.cajero || null) === (cajero || null));
  const posteriores = cierre ? d.pagos.filter((p) => !p.anulado && new Date(p.hora) > new Date(cierre.creado)) : [];
  const ir = (f, c) => ctx.ir(`#/caja?fecha=${f}${c !== undefined ? `&cajero=${c ?? "todos"}` : cajero ? `&cajero=${cajero}` : "&cajero=todos"}`);

  const selFecha = h("input", { type: "date", value: dia, max: hoy, "aria-label": "Día", onchange: (e) => e.target.value && ir(e.target.value) });
  const opcionesCajero = [["todos", "Toda la caja"], ...d.cajeros.map((c) => [c.id, c.id === miUser ? `${c.nombre} (yo)` : c.nombre])];
  if (cajero && !opcionesCajero.some(([v]) => v === cajero)) opcionesCajero.push([cajero, cajero === miUser ? "Mi caja" : "Cajero"]);
  const selCajero = h("select", { "aria-label": "Cajero", onchange: (e) => ir(dia, e.target.value === "todos" ? null : e.target.value) },
    opcionesCajero.map(([v, t]) => h("option", { value: v, selected: (cajero || "todos") === v }, t)));

  const resumenCierre = (k) => h("div.cierre-resumen",
    h("div.t-fila", h("span", "Esperado en efectivo"), h("b", M(k.por_metodo?.efectivo || 0))),
    h("div.t-fila", h("span", "Efectivo contado"), h("b", M(k.efectivo_contado))),
    h("div.t-fila", h("span", "Diferencia"), h("b", { className: Number(k.diferencia) < 0 ? "nota-baja" : "" }, `${Number(k.diferencia) > 0 ? "+" : ""}${M(k.diferencia)}`)),
    h("p.tenue", `Cerrado por ${k.cerrado_por_nombre || "—"} a las ${hora(k.creado)}${k.nota ? ` · ${k.nota}` : ""}`));

  // Documento del cierre para imprimir (ticket o carta), mismo formato que los comprobantes
  const imprimirCierre = async (k) => {
    const { datosTicket, imprimirTicket, ANCHOS, escpos, enviarBluetooth, hayBluetooth } = await import("../comun/ticket.js");
    const cfg = await datosTicket(ctx);
    let ancho = (() => { try { return localStorage.getItem("d360-ticket-ancho") || "80"; } catch (_) { return "80"; } })();
    const doc = () => h(`div.ticket.ticket-${ancho}`,
      h("div.t-centro", h("div.t-nombre", cfg.nombre), cfg.ruc ? h("div", `RUC ${cfg.ruc}`) : null),
      h("div.t-raya"), h("div.t-centro.t-titulo", "CIERRE DE CAJA"),
      h("div.t-fila", h("span", "Día"), h("b", fecha(k.fecha))),
      h("div.t-fila", h("span", "Caja"), h("span", k.cajero_nombre || "Toda la caja")),
      h("div.t-raya"),
      Object.entries(k.por_metodo || {}).map(([m, v]) => h("div.t-fila", h("span", METODO[m] || m), h("b", M(v)))),
      h("div.t-raya"),
      h("div.t-fila.t-total", h("span", "TOTAL"), h("b", M(k.total))),
      h("div.t-fila", h("span", "Recibos"), h("span", String(k.recibos))),
      Number(k.anulados) ? h("div.t-fila", h("span", "Anulados (no suman)"), h("span", M(k.anulados))) : null,
      h("div.t-raya"),
      h("div.t-fila", h("span", "Efectivo esperado"), h("span", M(k.por_metodo?.efectivo || 0))),
      h("div.t-fila", h("span", "Efectivo contado"), h("span", M(k.efectivo_contado))),
      h("div.t-fila.t-total", h("span", "Diferencia"), h("b", M(k.diferencia))),
      k.nota ? h("div", `Nota: ${k.nota}`) : null,
      h("div.t-raya"),
      h("div", `Cerró: ${k.cerrado_por_nombre || "—"} · ${hora(k.creado)}`),
      h("div.t-firmas", h("span", "Entrega"), h("span", "Recibe")));
    const lineas = (cols) => {
      const dos = (a, b) => { a = String(a); b = String(b); const e = cols - a.length - b.length; return e >= 1 ? a + " ".repeat(e) + b : `${a}\n${" ".repeat(Math.max(cols - b.length, 0))}${b}`; };
      const raya = "-".repeat(cols), c = (x) => " ".repeat(Math.max(Math.floor((cols - x.length) / 2), 0)) + x.slice(0, cols);
      return [c(cfg.nombre), raya, c("CIERRE DE CAJA"), dos("Dia:", fecha(k.fecha)), dos("Caja:", k.cajero_nombre || "Toda la caja"), raya,
        ...Object.entries(k.por_metodo || {}).map(([m, v]) => dos(METODO[m] || m, M(v))), raya, dos("TOTAL", M(k.total)), dos("Recibos:", k.recibos),
        ...(Number(k.anulados) ? [dos("Anulados:", M(k.anulados))] : []), raya, dos("Efectivo esperado:", M(k.por_metodo?.efectivo || 0)),
        dos("Efectivo contado:", M(k.efectivo_contado)), dos("Diferencia:", M(k.diferencia)), ...(k.nota ? [`Nota: ${k.nota}`] : []), raya,
        `Cerro: ${k.cerrado_por_nombre || "-"} ${hora(k.creado)}`, "", "Entrega: ______________", "", "Recibe:  ______________"].join("\n").split("\n");
    };
    const vista = h("div.ticket-vista");
    const chips = h("div.chips", ANCHOS.map(([v, t]) => h("button.chip", { type: "button", "aria-pressed": String(v === ancho), onclick: (e) => {
      ancho = v; try { localStorage.setItem("d360-ticket-ancho", v); } catch (_) {}
      chips.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); pintar(); } }, t)));
    const pintar = () => vista.replaceChildren(h(`div.ticket-hoja.hoja-${ancho}`, doc()));
    pintar();
    modal("Cierre de caja", h("div", h("p.etiqueta", "Tamaño del papel"), chips, vista), [
      { texto: "Cerrar", clase: "btn-sec" },
      hayBluetooth() ? { texto: "Bluetooth directo", clase: "btn-sec", onclick: async () => {
        try { await enviarBluetooth(escpos(lineas(ANCHOS.find((a) => a[0] === (ancho === "carta" ? "80" : ancho))[2]))); toast("Enviado a la impresora"); }
        catch (e) { if (e?.name !== "NotFoundError") toast(e.message, "mal"); }
        return false; } } : null,
      { texto: "Imprimir", onclick: () => { imprimirTicket(doc(), ancho); return false; } },
    ].filter(Boolean)).el?.classList.add("modal-ticket");
  };

  const cerrarCaja = () => {
    const esperado = Number(d.por_metodo?.efectivo || 0);
    const contado = h("input", { type: "number", min: 0, step: "0.01", required: true, inputMode: "decimal", "aria-label": "Efectivo contado", placeholder: "0.00" });
    const dif = h("p.cierre-dif");
    const pintarDif = () => { const v = Number(contado.value); if (contado.value === "") { dif.textContent = ""; return; }
      const x = Math.round((v - esperado) * 100) / 100; dif.textContent = x === 0 ? "✓ Cuadra exacto" : x > 0 ? `Sobran ${M(x)}` : `Faltan ${M(-x)}`; dif.className = "cierre-dif " + (x === 0 ? "ok" : "mal"); };
    contado.addEventListener("input", pintarDif);
    const nota = h("input", { maxLength: 300, placeholder: "Ej.: Faltó cambio de C$50", "aria-label": "Nota" });
    const err = h("div.aviso.mal.oculto", { role: "alert" });
    modal(`Cerrar caja · ${fecha(dia)}`, h("div",
      h("p.suave", `${cajero ? (d.cajeros.find((c) => c.id === cajero)?.nombre || "Esta caja") : "Toda la caja"}. Cuenta el efectivo y escríbelo: el sistema calcula la diferencia. Una vez cerrada no se modifica.`),
      err,
      h("div.cierre-resumen", Object.entries(d.por_metodo || {}).map(([m, v]) => h("div.t-fila", h("span", METODO[m] || m), h("b", M(v)))),
        h("div.t-fila.t-total", h("span", "Total del día"), h("b", M(d.total)))),
      h("label.campo", h("span", `Efectivo contado (esperado: ${M(esperado)})`), contado), dif,
      h("label.campo", h("span", "Nota (opcional)"), nota)), [
      { texto: "Cancelar", clase: "btn-sec" },
      { texto: "Cerrar caja", onclick: async (cerrarM) => {
        err.classList.add("oculto");
        if (contado.value === "" || Number(contado.value) < 0) { err.textContent = "Escribe el efectivo contado (0 si no hubo efectivo)."; err.classList.remove("oculto"); return false; }
        try {
          const k = await q(sb.rpc("d360_caja_cerrar", { p_cuenta: ctx.id, p_fecha: dia, p_cajero: cajero, p_efectivo_contado: Number(contado.value), p_nota: nota.value.trim() || null }));
          cerrarM(); ctx.toast("Caja cerrada"); await imprimirCierre(k); ctx.recargar();
        } catch (e) { err.textContent = e.message; err.classList.remove("oculto"); }
        return false;
      } },
    ]);
    setTimeout(() => contado.focus(), 50);
  };

  const reimprimir = async (p) => {
    const { verRecibo } = await import("./finanzas.js");
    verRecibo(ctx, { ...p, fecha: dia, creado: p.hora, cargos: { concepto: p.concepto } }, null, { id: p.estudiante_id, nombres: p.estudiante, apellidos: "" });
  };

  el.append(
    ctx.titulo("Cierre de caja", !cierre && d.pagos.length && dia <= hoy ? h("button.btn", { onclick: cerrarCaja }, "Cerrar caja") : null),
    h("div.barra-filtros", selFecha, selCajero,
      h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => ir(sumarDias(dia, -1)) }, "← Día anterior"),
      dia < hoy ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => ir(sumarDias(dia, 1)) }, "Día siguiente →") : null),
    h("section.cifras",
      h("div.cifra", h("b", M(d.total)), h("span", `cobrado · ${d.recibos} recibo(s)`)),
      ...Object.keys(METODO).filter((m) => Number(d.por_metodo?.[m])).map((m) => h("div.cifra", h("b", M(d.por_metodo[m])), h("span", METODO[m].toLowerCase()))),
      Number(d.anulados) ? h("div.cifra.alerta", h("b", M(d.anulados)), h("span", "anulado (no suma)")) : null),
    cierre ? h("section.hoja.cierre-hecho", { style: "margin-top:1rem" }, h("div.hoja-titulo", h("h2", "✓ Caja cerrada"), h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => imprimirCierre(cierre) }, "Imprimir cierre")),
      resumenCierre(cierre),
      posteriores.length ? h("div.aviso.ojo", `Después del cierre se registraron ${posteriores.length} pago(s) por ${M(posteriores.reduce((s, p) => s + Number(p.monto), 0))}. Quedan en el día, pero no en este cierre.`) : null) : null,
    h("section.hoja", { style: "margin-top:1rem" }, h("h2", "Recibos del día"),
      tabla([
        { t: "Recibo", v: (p) => h("strong.num", String(p.recibo).padStart(6, "0")) },
        { t: "Hora", v: (p) => hora(p.hora) },
        { t: "Estudiante", v: (p) => h("div.celda-doble", h("strong", p.estudiante), h("div.tenue", p.concepto)) },
        { t: "Forma", v: (p) => METODO[p.metodo] || p.metodo },
        { t: "Cobró", v: (p) => p.cajero_nombre },
        { t: "Monto", clase: "derecha", v: (p) => p.anulado ? h("span", { style: "text-decoration:line-through" }, M(p.monto)) : h("strong.num", M(p.monto)) },
        { t: "", clase: "acciones", v: (p) => p.anulado ? h("span.estado.mal", "Anulado") : h("button.btn.btn-texto.btn-sm", { onclick: () => reimprimir(p) }, "Reimprimir") },
      ], d.pagos, { vacio: "No hay cobros este día." })),
    (d.cierres || []).filter((k) => k !== cierre).length ? h("section.hoja", h("h2", "Otros cierres de este día"),
      h("ul.lista", d.cierres.filter((k) => k !== cierre).map((k) => h("li", h("div.crece", h("strong", k.cajero_nombre || "Toda la caja"), h("div.tenue", `${M(k.total)} · diferencia ${M(k.diferencia)}`)),
        h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => imprimirCierre(k) }, "Imprimir"))))) : null);
}
