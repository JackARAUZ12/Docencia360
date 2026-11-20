// Aviso de conexión: «Sin internet», «N cambios por subir», «Subiendo…» y la lista de
// lo guardado en este equipo (con lo que el servidor no aceptó, para decidir qué hacer).
import { h, modal, toast, fecha } from "./ui.js";
import { mostrarComprobante } from "../comun/ticket.js";
import { estado, bandeja, sincronizar, descartar, reintentar, probarConexion, cobrosSubidos, fechaUltimaCopia } from "./offline.js";

const hora = (t) => new Date(t).toLocaleString("es-NI", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export const codigoProvisional = (clave) => "P-" + String(clave || "").replace(/-/g, "").slice(0, 6).toUpperCase();

export function barraConexion(ctx) {
  const barra = h("div.conexion.no-imprimir", { role: "status", "aria-live": "polite", hidden: true });
  const pintar = (e = estado()) => {
    let clase = "", texto = "", accion = "Ver";
    if (!e.enLinea) {
      clase = "sin-red";
      const copia = fechaUltimaCopia();
      texto = `Sin internet · ves lo último guardado en este equipo${copia ? ` (${hora(copia)})` : ""}` + (e.pendientes ? ` · ${e.pendientes} cambio(s) por subir` : " · lo que guardes se sube solo al volver la conexión");
    } else if (e.sincronizando) { clase = "subiendo"; texto = "Subiendo los cambios hechos sin internet…"; accion = null; }
    else if (e.errores) { clase = "con-error"; texto = `${e.errores} cambio(s) hechos sin internet no se pudieron subir · revisa qué pasó`; }
    else if (e.pendientes) { clase = "pendiente"; texto = `${e.pendientes} cambio(s) por subir`; accion = "Subir ahora"; }
    if (!texto) { barra.hidden = true; barra.replaceChildren(); return; }
    barra.className = `conexion no-imprimir ${clase}`;
    barra.replaceChildren(h("span.conexion-punto", { "aria-hidden": "true" }), h("span.conexion-texto", texto),
      accion ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => (accion === "Subir ahora" ? sincronizar() : verBandeja(ctx)) }, accion) : null);
    barra.hidden = false;
  };
  addEventListener("d360:conexion", (ev) => pintar(ev.detail));
  pintar();
  return barra;
}

// Avisos al terminar de subir
let instalado = false;
export function avisosSincronizacion(ctx) {
  if (instalado) return; instalado = true;
  addEventListener("d360:sincronizado", (ev) => {
    const { subidos, conError, resultados } = ev.detail;
    if (subidos) toast(`✓ Se subieron ${subidos} cambio(s) hechos sin internet`);
    if (conError) toast(`${conError} cambio(s) no se pudieron subir. Toca el aviso de arriba para ver por qué.`, "mal");
    const ajustados = resultados.filter((r) => r.resultado?.ajustes);
    if (ajustados.length) toast("Un cobro sin internet ya estaba pagado en otro equipo: el dinero quedó como saldo a favor del estudiante.", "mal");
    // Se vuelven a leer los datos (ahora con los números definitivos), sin interrumpir un formulario abierto
    ctx.datos?.invalidar();
    if (!document.querySelector("dialog[open]") && !ctx.pendiente?.hay?.()) ctx.recargar?.();
  });
}

/** Lista de lo guardado en este equipo que falta subir (o que el servidor no aceptó). */
export async function verBandeja(ctx) {
  const cuerpo = h("div");
  const pintar = async () => {
    const items = (await bandeja()).sort((a, b) => a.n - b.n);
    const subidos = (await cobrosSubidos()).slice(0, 10);
    const e = estado();
    cuerpo.replaceChildren(
      h("p.suave", e.enLinea ? "Hay internet. Los cambios se suben solos, en el orden en que se hicieron." : "No hay internet. Todo lo que guardes queda en este equipo y se sube solo cuando vuelva la conexión. No cierres sesión hasta entonces."),
      items.length ? h("ul.lista.lista-bandeja", items.map((it) => h("li", { class: it.estado === "error" ? "mal" : "" },
        h("div.crece", h("strong", it.resumen), h("div.tenue", `${hora(it.t)} · ${it.estado === "error" ? "No se pudo subir" : "Por subir"}`),
          it.estado === "error" ? h("div.aviso.mal", { style: "margin-top:.4rem" }, explicar(it)) : null),
        it.estado === "error" ? h("div.acciones",
          h("button.btn.btn-sec.btn-sm", { type: "button", onclick: async () => { await reintentar(it.n); pintar(); } }, "Reintentar"),
          h("button.btn.btn-texto.btn-sm", { type: "button", onclick: async () => {
            if (!confirm(it.rpc ? "Este cobro no quedará registrado en el sistema. Si recibiste el dinero, regístralo de nuevo con internet. ¿Descartarlo?" : "Este cambio no se guardará. ¿Descartarlo?")) return;
            await descartar(it.n); pintar(); } }, "Descartar")) : null)))
        : h("p", "✓ No hay nada pendiente: todo está guardado en internet."),
      subidos.length ? h("div", { style: "margin-top:1rem" }, h("h3", { style: "font-size:1rem;margin:0 0 .4rem" }, "Cobros sin internet ya confirmados"),
        h("p.tenue", { style: "margin:0 0 .5rem" }, "Ya tienen su número de recibo definitivo. Puedes imprimir el comprobante final."),
        h("ul.lista", subidos.map((c) => h("li", h("div.crece", h("strong", c.resumen), h("div.tenue", `Cobrado ${hora(c.t)} · ${codigoProvisional(c.clave)} → recibo ${recibosDe(c).join(", ") || "—"}`)),
          c.extra?.ticket ? h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => imprimirDefinitivo(ctx, c) }, "Comprobante final") : null)))) : null,
    );
  };
  await pintar();
  const m = modal("Cambios guardados en este equipo", cuerpo, [
    { texto: "Probar conexión", clase: "btn-sec", onclick: async () => { const e = await probarConexion(); toast(e.enLinea ? "Hay internet" : "Todavía no hay internet", e.enLinea ? "" : "mal"); await pintar(); return false; } },
    { texto: "Cerrar", clase: "btn-sec" },
  ]);
  const al = () => { if (!m.el.isConnected) return removeEventListener("d360:conexion", al); pintar(); };
  addEventListener("d360:conexion", al);
  return m;
}

function explicar(it) {
  const m = it.error || "";
  if (it.codigo === "42501" || /permission|permiso|row-level/i.test(m)) return "El servidor no lo aceptó: no tienes permiso para esto o el plan está vencido.";
  if (it.codigo === "23503") return "No se pudo: depende de algo que ya no existe (por ejemplo, un estudiante o grupo borrado en otro equipo).";
  if (it.codigo === "23505") return "Ya existía un registro igual.";
  return `El servidor no lo aceptó: ${m}`;
}
const recibosDe = (c) => (c.resultado?.pagos || []).map((p) => p.recibo).filter(Boolean).concat(c.resultado?.recibo ? [c.resultado.recibo] : []);

async function imprimirDefinitivo(ctx, c) {
  const t = { ...c.extra.ticket, provisional: null, recibos: recibosDe(c) };
  if (c.resultado?.pagos) { t.items = c.resultado.pagos.map((p) => ({ concepto: p.concepto || "Abono a cuenta", monto: p.monto })); t.total = c.resultado.total; }
  t.saldoPendiente = undefined;
  return mostrarComprobante(ctx, t);
}
