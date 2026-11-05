// Datos del colegio: identidad (logo, lema, contacto), año lectivo, escala de
// calificación, cortes evaluativos y sedes.
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, confirmar, fecha } from "../core/ui.js";
import { estructura, invalidarEstructura, urlArchivo, subirImagen } from "./util.js";

export async function render(el, ctx) {
  const E = await estructura(ctx, true);
  const c = E.cuenta, cfg = E.cfg;
  const logo = await urlArchivo(c.logo_url);
  const guardarCuenta = async (cambios, cerrar) => {
    await q(sb.from("cuentas").update(cambios).eq("id", ctx.id));
    invalidarEstructura(ctx); cerrar?.(); ctx.toast("Guardado"); ctx.recargar();
  };
  const inputLogo = h("input", { type: "file", accept: "image/*", className: "oculto", onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const camino = await subirImagen(ctx, f, "institucion/logo"); await guardarCuenta({ logo_url: camino }); } catch (x) { ctx.toast(x.message, "mal"); }
  } });

  const editarDatos = () => formularioModal("Datos del colegio", [
    { name: "nombre", label: "Nombre oficial", required: true, full: true },
    { name: "lema", label: "Lema (aparece en boletines)", full: true },
    { name: "telefono", label: "Teléfono", type: "tel" },
    { name: "email", label: "Correo", type: "email" },
    { name: "direccion", label: "Dirección", full: true },
  ], { nombre: c.nombre, lema: cfg.lema, telefono: c.telefono, email: c.email, direccion: c.direccion }, (d, cerrar) =>
    guardarCuenta({ nombre: d.nombre, telefono: d.telefono, email: d.email, direccion: d.direccion, config: { ...cfg, lema: d.lema } }, cerrar));

  const editarEscala = () => formularioModal("Año lectivo y escala", [
    { name: "anio_lectivo", label: "Año lectivo", type: "number", min: 2020, max: 2100, value: new Date().getFullYear() },
    { name: "nota_minima", label: "Nota mínima de aprobación (0–100)", type: "number", min: 1, max: 100, value: 60 },
    { name: "escala_cualitativa", label: "Mostrar escala cualitativa del MINED (AA, AS, AF, AI) en notas y boletines", type: "checkbox", value: true },
  ], { anio_lectivo: cfg.anio_lectivo, nota_minima: cfg.nota_minima ?? 60, escala_cualitativa: cfg.escala_cualitativa !== false }, (d, cerrar) =>
    guardarCuenta({ config: { ...cfg, anio_lectivo: d.anio_lectivo, nota_minima: d.nota_minima, escala_cualitativa: d.escala_cualitativa } }, cerrar));

  const editarCorte = (p) => formularioModal(p ? `Editar ${p.nombre}` : "Nuevo corte evaluativo", [
    { name: "nombre", label: "Nombre", required: true, placeholder: "Ej.: I Corte, I Semestre, I Bimestre" },
    { name: "orden", label: "Orden", type: "number", min: 1, value: E.periodos.length + 1 },
    { name: "inicio", label: "Inicia", type: "date", required: true },
    { name: "fin", label: "Termina", type: "date", required: true },
    { name: "cerrado", label: "Cerrado (solo la dirección puede cambiar notas)", type: "checkbox" },
  ], p, async (d, cerrar) => {
    if (d.fin < d.inicio) throw new Error("La fecha final no puede ser anterior al inicio.");
    d.anio = String(d.inicio).slice(0, 4);
    if (p) await q(sb.from("periodos").update(d).eq("id", p.id)); else await q(sb.from("periodos").insert({ ...d, cuenta_id: ctx.id }));
    invalidarEstructura(ctx); cerrar(); ctx.toast("Guardado"); ctx.recargar();
  });

  const editarSede = (s) => formularioModal(s ? "Editar sede" : "Nueva sede", [
    { name: "nombre", label: "Nombre", required: true }, { name: "telefono", label: "Teléfono" }, { name: "direccion", label: "Dirección", full: true },
  ], s, async (d, cerrar) => {
    if (s) await q(sb.from("sedes").update(d).eq("id", s.id)); else await q(sb.from("sedes").insert({ ...d, cuenta_id: ctx.id }));
    invalidarEstructura(ctx); cerrar(); ctx.toast("Guardado"); ctx.recargar();
  });

  el.append(ctx.titulo("Datos del colegio"),
    h("div.dos-col",
      h("div",
        h("section.hoja", h("div.hoja-titulo", h("h2", "Identidad"), h("button.btn.btn-sec.btn-sm", { onclick: editarDatos }, "Editar")),
          h("div", { style: "display:flex;gap:1rem;align-items:center" },
            logo ? h("img.foto-est", { src: logo, alt: "Logo del colegio", style: "object-fit:contain;background:#fff" }) : h("div.foto-est", "Logo"),
            h("div", h("strong", { style: "font-family:var(--display);font-size:1.2rem" }, c.nombre), h("div.suave", cfg.lema || "Sin lema"),
              h("button.btn.btn-sec.btn-sm", { style: "margin-top:.5rem", onclick: () => inputLogo.click() }, logo ? "Cambiar logo" : "Subir logo"), inputLogo)),
          h("p", { style: "margin-top:1rem" }, [c.direccion, c.telefono, c.email].filter(Boolean).join(" · ") || h("span.tenue", "Sin datos de contacto")),
          h("p.tenue", `Código de la institución: ${c.codigo}`)),
        h("section.hoja", h("div.hoja-titulo", h("h2", "Cortes evaluativos"), h("button.btn.btn-sm", { onclick: () => editarCorte(null) }, "Nuevo corte")),
          tabla([
            { t: "Corte", v: (p) => h("strong", p.nombre) },
            { t: "Fechas", v: (p) => `${fecha(p.inicio)} – ${fecha(p.fin)}` },
            { t: "", v: (p) => p.cerrado ? h("span.estado", "Cerrado") : E.periodoActual()?.id === p.id ? h("span.estado.ok", "En curso") : null },
            { t: "", clase: "acciones", v: (p) => [h("button.btn.btn-texto.btn-sm", { onclick: () => editarCorte(p) }, "Editar"),
              h("button.btn.btn-texto.btn-sm", { onclick: async () => { if (await confirmar("Eliminar corte", `¿Eliminar ${p.nombre}? Sus evaluaciones quedan sin corte.`, { boton: "Eliminar", peligro: true })) { try { await q(sb.from("periodos").delete().eq("id", p.id)); invalidarEstructura(ctx); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); } } } }, "Eliminar")] },
          ], E.periodos, { vacio: "Define los cortes (por ejemplo, cuatro cortes o dos semestres)." }))),
      h("div",
        h("section.hoja", h("div.hoja-titulo", h("h2", "Año lectivo y escala"), h("button.btn.btn-sec.btn-sm", { onclick: editarEscala }, "Editar")),
          h("dl", { style: "margin:0" },
            h("dt.tenue", "Año lectivo"), h("dd", { style: "margin:0 0 .6rem;font-weight:700" }, cfg.anio_lectivo || new Date().getFullYear()),
            h("dt.tenue", "Nota mínima de aprobación"), h("dd", { style: "margin:0 0 .6rem;font-weight:700" }, E.minima),
            h("dt.tenue", "Escala cualitativa"), h("dd", { style: "margin:0;font-weight:700" }, E.cuali ? "AA 90–100 · AS 76–89 · AF 60–75 · AI <60" : "No se muestra"))),
        h("section.hoja", h("div.hoja-titulo", h("h2", "Sedes"), ctx.f("sedes") ? h("button.btn.btn-sec.btn-sm", { onclick: () => editarSede(null) }, "Nueva sede") : null),
          ctx.f("sedes") ? tabla([{ t: "Sede", v: (s) => [h("strong", s.nombre), h("div.tenue", [s.direccion, s.telefono].filter(Boolean).join(" · "))] },
            { t: "", clase: "acciones", v: (s) => h("button.btn.btn-texto.btn-sm", { onclick: () => editarSede(s) }, "Editar") }], E.sedes, { vacio: "Una sola sede." })
            : h("p.suave", "Varias sedes está disponible en el plan Institucional.")))));
}
