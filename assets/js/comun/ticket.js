// Comprobantes de pago para impresora térmica o de hoja:
//  · 58 mm (32 caracteres), 76 mm (40, matricial/rollo de caja), 80 mm (48) y Carta/A4.
//  · «Imprimir»: usa el diálogo del navegador. Sirve para impresoras USB, de red,
//    las Bluetooth ya emparejadas en la computadora, y en Android con el servicio
//    de impresión de la impresora (por ejemplo RawBT o la app del fabricante).
//  · «Bluetooth directo»: envía el ticket en ESC/POS a impresoras térmicas BLE
//    desde Chrome o Edge (Android, Windows, Mac). iPhone/iPad no lo permiten.
//  · «WhatsApp»: el mismo comprobante en texto.
// El tamaño elegido se recuerda en este equipo (cada caja tiene su impresora).
import { sb, q } from "../core/sb.js";
import { h, modal, toast, dinero, fecha, imprimir } from "../core/ui.js";
import { numeroWhatsApp } from "./reporte.js";

export const ANCHOS = [["58", "58 mm", 32], ["76", "76 mm", 40], ["80", "80 mm", 48], ["carta", "Carta / A4", 0]];
const CLAVE = "d360-ticket-ancho";
const METODO = { efectivo: "Efectivo", transferencia: "Transferencia", deposito: "Depósito", tarjeta: "Tarjeta", otro: "Otro" };
const anchoGuardado = () => { try { const v = localStorage.getItem(CLAVE); return ANCHOS.some((a) => a[0] === v) ? v : "80"; } catch (_) { return "80"; } };
const guardarAncho = (v) => { try { localStorage.setItem(CLAVE, v); } catch (_) {} };

let cfgCache = null;
/** Datos de la cuenta para el encabezado (nombre, RUC, dirección, teléfono, pie). */
export async function datosTicket(ctx, refrescar = false) {
  if (cfgCache && cfgCache.id === ctx.id && !refrescar) return cfgCache;
  let c = {};
  try { c = await q(sb.from("cuentas").select("nombre,telefono,direccion,config").eq("id", ctx.id).single()); } catch (_) {}
  const t = c.config?.ticket || {};
  cfgCache = { id: ctx.id, nombre: c.nombre || ctx.cuenta.nombre, ruc: t.ruc || "", direccion: t.direccion || c.direccion || "", telefono: t.telefono || c.telefono || "",
    pie: t.pie || "¡Gracias por su pago!", mostrar_saldo: t.mostrar_saldo !== false };
  return cfgCache;
}

const n2 = (x) => Number(x || 0);
const recibosTxt = (t) => t.recibos.map((r) => String(r).padStart(6, "0")).join(", ");
const horaTxt = (t) => (t.hora ? new Date(t.hora).toLocaleTimeString("es-NI", { hour: "numeric", minute: "2-digit" }) : "");

/** Líneas de texto del ticket ajustadas a N columnas (para ESC/POS y WhatsApp). */
export function lineasTicket(ctx, t, cfg, cols = 32) {
  const M = (v) => dinero(v, ctx.cuenta.moneda);
  const centro = (s) => { s = String(s); return s.length >= cols ? s.slice(0, cols) : " ".repeat(Math.floor((cols - s.length) / 2)) + s; };
  const partir = (s) => { const out = []; let linea = ""; for (const p of String(s).split(/\s+/)) { if ((linea + " " + p).trim().length > cols) { if (linea) out.push(linea); linea = p.length > cols ? p.slice(0, cols) : p; } else linea = (linea + " " + p).trim(); } if (linea) out.push(linea); return out; };
  const dos = (a, b) => { a = String(a); b = String(b); const esp = cols - a.length - b.length; return esp >= 1 ? a + " ".repeat(esp) + b : [...partir(a), " ".repeat(Math.max(cols - b.length, 0)) + b]; };
  const raya = "-".repeat(cols);
  const L = [];
  const add = (x) => (Array.isArray(x) ? L.push(...x) : L.push(x));
  partir(cfg.nombre).forEach((x) => add(centro(x)));
  if (cfg.ruc) add(centro(`RUC ${cfg.ruc}`));
  if (cfg.direccion) partir(cfg.direccion).forEach((x) => add(centro(x)));
  if (cfg.telefono) add(centro(`Tel. ${cfg.telefono}`));
  add(raya);
  add(centro(t.anulado ? "*** ANULADO ***" : "COMPROBANTE DE PAGO"));
  add(dos(t.recibos.length > 1 ? "Recibos N.º" : "Recibo N.º", "")); partir(recibosTxt(t)).forEach(add);
  add(dos("Fecha:", `${fecha(t.fecha)}${horaTxt(t) ? " " + horaTxt(t) : ""}`));
  add("Estudiante:"); partir(t.estudiante).forEach(add);
  add(raya);
  for (const it of t.items) { add(dos(it.concepto, M(it.monto))); }
  add(raya);
  add(dos("TOTAL", M(t.total)));
  add(dos("Forma de pago:", METODO[t.metodo] || t.metodo || ""));
  if (t.referencia) add(dos("Referencia:", t.referencia));
  if (cfg.mostrar_saldo && t.saldoPendiente != null) add(dos("Saldo pendiente:", M(t.saldoPendiente)));
  if (t.cajero) add(dos("Atendió:", t.cajero));
  add(raya);
  partir(cfg.pie).forEach((x) => add(centro(x)));
  return L;
}

/** Ticket en HTML (vista previa e impresión). */
export function htmlTicket(ctx, t, cfg, ancho) {
  const M = (v) => dinero(v, ctx.cuenta.moneda);
  return h(`div.ticket.ticket-${ancho}`,
    h("div.t-centro",
      h("div.t-nombre", cfg.nombre),
      cfg.ruc ? h("div", `RUC ${cfg.ruc}`) : null,
      cfg.direccion ? h("div", cfg.direccion) : null,
      cfg.telefono ? h("div", `Tel. ${cfg.telefono}`) : null),
    h("div.t-raya"),
    h("div.t-centro.t-titulo", t.anulado ? "*** ANULADO ***" : "COMPROBANTE DE PAGO"),
    h("div.t-fila", h("span", t.recibos.length > 1 ? "Recibos N.º" : "Recibo N.º"), h("b", recibosTxt(t))),
    h("div.t-fila", h("span", "Fecha"), h("span", `${fecha(t.fecha)}${horaTxt(t) ? " · " + horaTxt(t) : ""}`)),
    h("div.t-est", h("span", "Estudiante"), h("b", t.estudiante)),
    h("div.t-raya"),
    t.items.map((it) => h("div.t-fila.t-item", h("span", it.concepto), h("b", M(it.monto)))),
    h("div.t-raya"),
    h("div.t-fila.t-total", h("span", "TOTAL"), h("b", M(t.total))),
    h("div.t-fila", h("span", "Forma de pago"), h("span", METODO[t.metodo] || t.metodo || "")),
    t.referencia ? h("div.t-fila", h("span", "Referencia"), h("span", t.referencia)) : null,
    cfg.mostrar_saldo && t.saldoPendiente != null ? h("div.t-fila", h("span", "Saldo pendiente"), h("span", M(t.saldoPendiente))) : null,
    t.cajero ? h("div.t-fila", h("span", "Atendió"), h("span", t.cajero)) : null,
    h("div.t-raya"),
    h("div.t-centro", cfg.pie),
    ancho === "carta" ? h("div.t-firmas", h("span", "Recibido por"), h("span", "Firma")) : null);
}

// Estilos del ticket para imprimir en un documento aparte (no toca la página)
const CSS_TICKET = (ancho) => {
  const mm = { 58: 58, 76: 76, 80: 80 }[ancho];
  const area = { 58: 48, 76: 66, 80: 72 }[ancho];
  return `
  @page { ${mm ? `size: ${mm}mm auto;` : "size: auto;"} margin: ${mm ? "0" : "15mm"}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: ${mm ? '"Courier New", ui-monospace, monospace' : "system-ui, sans-serif"}; font-size: ${mm === 58 ? "11px" : mm ? "12px" : "14px"}; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ticket { width: ${mm ? area + "mm" : "100%"}; max-width: ${mm ? "none" : "150mm"}; margin: 0 auto; padding: ${mm ? "2mm 0 6mm" : "0"}; }
  .t-centro { text-align: center; } .t-nombre { font-weight: 700; font-size: 1.25em; } .t-titulo { font-weight: 700; margin: 2px 0; letter-spacing: .03em; }
  .t-raya { border-top: 1px dashed #000; margin: 4px 0; }
  .t-fila { display: flex; justify-content: space-between; gap: 6px; } .t-fila > :first-child { flex: 1; min-width: 0; overflow-wrap: anywhere; } .t-fila > :last-child { text-align: right; white-space: nowrap; }
  .t-est { display: flex; flex-direction: column; } .t-est b { overflow-wrap: anywhere; }
  .t-total { font-size: 1.2em; font-weight: 700; }
  .t-firmas { display: flex; justify-content: space-between; margin-top: 40px; } .t-firmas span { border-top: 1px solid #000; padding-top: 4px; width: 40%; text-align: center; }`;
};

/** Imprime el ticket en un marco aparte con el tamaño de papel correcto. */
export function imprimirTicket(nodo, ancho) {
  const marco = h("iframe", { title: "Impresión del comprobante", style: "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden" });
  document.body.append(marco);
  const doc = marco.contentDocument;
  doc.open(); doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante</title><style>${CSS_TICKET(ancho)}</style></head><body></body></html>`); doc.close();
  doc.body.append(doc.importNode(nodo, true));
  setTimeout(() => {
    try { marco.contentWindow.focus(); marco.contentWindow.print(); }
    catch (_) { imprimir(nodo); }   // si el navegador no imprime marcos, se usa la impresión normal
    setTimeout(() => marco.remove(), 60000);
  }, 120);
}

// ---------- Bluetooth directo (ESC/POS) ----------
const SERVICIOS = [
  ["000018f0-0000-1000-8000-00805f9b34fb", "00002af1-0000-1000-8000-00805f9b34fb"],
  ["e7810a71-73ae-499d-8c15-faa9aef0c3f2", "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f"],
  ["49535343-fe7d-4ae5-8fa9-9fafd205e455", "49535343-8841-43f4-a8d4-ecbe34729bb3"],
  ["0000ffe0-0000-1000-8000-00805f9b34fb", "0000ffe1-0000-1000-8000-00805f9b34fb"],
  ["0000ff00-0000-1000-8000-00805f9b34fb", "0000ff02-0000-1000-8000-00805f9b34fb"],
];
// Página de códigos 850 (español): ESC t 2
const CP850 = { "á": 0xa0, "é": 0x82, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "Á": 0xb5, "É": 0x90, "Í": 0xd6, "Ó": 0xe0, "Ú": 0xe9, "ü": 0x81, "Ü": 0x9a, "¿": 0xa8, "¡": 0xad, "º": 0xa7, "ª": 0xa6, "°": 0xf8, "·": 0xfa, "€": 0xd5, "–": 0x2d, "—": 0x2d };
const bytesTexto = (s) => { const out = []; for (const ch of s) { const c = ch.charCodeAt(0); if (c < 128) out.push(c); else if (CP850[ch] != null) out.push(CP850[ch]); else out.push(0x3f); } return out; };
export function escpos(lineas, { corte = true } = {}) {
  const b = [0x1b, 0x40, 0x1b, 0x74, 0x02];   // iniciar + página de códigos 850
  lineas.forEach((l, i) => {
    const titulo = i === 0 || /COMPROBANTE DE PAGO|ANULADO/.test(l) || /^TOTAL/.test(l);
    if (titulo) b.push(0x1b, 0x45, 0x01);
    b.push(...bytesTexto(l), 0x0a);
    if (titulo) b.push(0x1b, 0x45, 0x00);
  });
  b.push(0x0a, 0x0a, 0x0a, 0x0a);
  if (corte) b.push(0x1d, 0x56, 0x42, 0x00);    // corte parcial (si la impresora tiene cuchilla)
  return new Uint8Array(b);
}
let impresoraBT = null;   // se recuerda mientras la página esté abierta
export const hayBluetooth = () => !!(navigator.bluetooth && window.isSecureContext);
export async function enviarBluetooth(datos) {
  if (!hayBluetooth()) throw new Error("Este navegador no permite Bluetooth directo. Usa «Imprimir».");
  let car = impresoraBT?.car;
  if (!car || !impresoraBT.dev.gatt.connected) {
    const dev = impresoraBT?.dev || await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS.map((s) => s[0]) });
    const gatt = await dev.gatt.connect();
    car = null;
    for (const [srv, ch] of SERVICIOS) {
      try { const s = await gatt.getPrimaryService(srv); car = await s.getCharacteristic(ch); break; } catch (_) {}
    }
    if (!car) {   // última opción: cualquier característica en la que se pueda escribir
      for (const s of await gatt.getPrimaryServices().catch(() => [])) {
        for (const c of await s.getCharacteristics().catch(() => [])) if (c.properties.write || c.properties.writeWithoutResponse) { car = c; break; }
        if (car) break;
      }
    }
    if (!car) { gatt.disconnect(); throw new Error("Esa impresora no acepta impresión directa. Usa «Imprimir» con la app de la impresora."); }
    impresoraBT = { dev, car };
  }
  for (let i = 0; i < datos.length; i += 120) {
    const parte = datos.slice(i, i + 120);
    if (car.properties.writeWithoutResponse && car.writeValueWithoutResponse) await car.writeValueWithoutResponse(parte);
    else await car.writeValue(parte);
    await new Promise((r) => setTimeout(r, 30));
  }
}

/**
 * Muestra el comprobante con vista previa y opciones de impresión.
 * t = { recibos:[n], fecha, hora, estudiante, telefono, items:[{concepto, monto}], total, metodo, referencia, cajero, saldoPendiente, anulado }
 */
export async function mostrarComprobante(ctx, t, { titulo } = {}) {
  const cfg = await datosTicket(ctx);
  // Saldo pendiente total del estudiante (después de este pago), si se muestra en el ticket
  if (cfg.mostrar_saldo && t.saldoPendiente === undefined && t.estudiante_id) {
    try {
      const cs = await q(sb.from("cargos").select("monto,descuento,pagado").eq("estudiante_id", t.estudiante_id).in("estado", ["pendiente", "parcial"]));
      t.saldoPendiente = Math.round(cs.reduce((s, c) => s + n2(c.monto) - n2(c.descuento) - n2(c.pagado), 0) * 100) / 100;
    } catch (_) { t.saldoPendiente = null; }
  }
  let ancho = anchoGuardado();
  const vista = h("div.ticket-vista");
  const chips = h("div.chips", { role: "group", "aria-label": "Tamaño del papel" }, ANCHOS.map(([v, txt]) => h("button.chip", { type: "button", "aria-pressed": String(v === ancho),
    onclick: (e) => { ancho = v; guardarAncho(v); chips.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); pintar(); } }, txt)));
  const pintar = () => vista.replaceChildren(h(`div.ticket-hoja.hoja-${ancho}`, htmlTicket(ctx, t, cfg, ancho)));
  pintar();
  const tel = numeroWhatsApp(t.telefono);
  const nota = h("p.tenue", { style: "font-size:.85rem;margin:.6rem 0 0" },
    hayBluetooth() ? "«Bluetooth directo» funciona con impresoras térmicas Bluetooth en Chrome o Edge. Si tu impresora no aparece, usa «Imprimir»."
      : "Para impresoras Bluetooth en Android usa «Imprimir» con la app de la impresora (p. ej. RawBT). En iPhone, con AirPrint o la app de la impresora.");
  const m = modal(titulo || (t.recibos.length > 1 ? `Recibos N.º ${recibosTxt(t)}` : `Recibo N.º ${t.recibos[0]}`), h("div",
    h("p.etiqueta", "Tamaño del papel"), chips, vista, nota), [
    { texto: "Cerrar", clase: "btn-sec" },
    tel ? { texto: "WhatsApp", clase: "btn-sec", onclick: () => {
      const txt = lineasTicket(ctx, t, cfg, 32).join("\n");
      window.open(`https://wa.me/${tel}?text=${encodeURIComponent("```\n" + txt + "\n```")}`, "_blank", "noopener");
      return false;
    } } : null,
    hayBluetooth() ? { texto: "Bluetooth directo", clase: "btn-sec", onclick: async () => {
      try { await enviarBluetooth(escpos(lineasTicket(ctx, t, cfg, ANCHOS.find((a) => a[0] === (ancho === "carta" ? "80" : ancho))[2]))); toast("Enviado a la impresora"); }
      catch (e) { if (e?.name !== "NotFoundError") toast(e.message || "No se pudo imprimir por Bluetooth", "mal"); }
      return false;
    } } : null,
    { texto: "Imprimir", onclick: () => { imprimirTicket(htmlTicket(ctx, t, cfg, ancho), ancho); return false; } },
  ].filter(Boolean));
  m.el?.classList.add("modal-ticket");
  return m;
}

/** Datos del encabezado y pie del comprobante (RUC, dirección, teléfono, mensaje). */
export async function configurarTicket(ctx) {
  const cfg = await datosTicket(ctx, true);
  const { formularioModal } = await import("../core/ui.js");
  formularioModal("Datos del comprobante", [
    { name: "ruc", label: "RUC o cédula (opcional)", maxlength: 80 },
    { name: "telefono", label: "Teléfono", maxlength: 80 },
    { name: "direccion", label: "Dirección", maxlength: 80, full: true },
    { name: "pie", label: "Mensaje al pie", maxlength: 160, full: true, placeholder: "¡Gracias por su pago!" },
    { name: "mostrar_saldo", label: "Mostrar el saldo pendiente del estudiante", type: "checkbox" },
  ], { ruc: cfg.ruc, telefono: cfg.telefono, direccion: cfg.direccion, pie: cfg.pie, mostrar_saldo: cfg.mostrar_saldo }, async (d, cerrar) => {
    await q(sb.rpc("d360_ticket_guardar", { p_cuenta: ctx.id, p_cfg: { ruc: d.ruc || "", telefono: d.telefono || "", direccion: d.direccion || "", pie: d.pie || "", mostrar_saldo: !!d.mostrar_saldo } }));
    await datosTicket(ctx, true);
    cerrar(); toast(ctx.cuenta.es_demo ? "En la demostración no se guardan estos datos." : "Datos del comprobante guardados");
  }, { boton: "Guardar" });
}
