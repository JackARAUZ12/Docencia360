// Certificados y constancias con folio único verificable en línea.
import { sb, q } from "../core/sb.js";
import { h, tabla, modal, formularioModal, confirmar, fecha, nombreCompleto, imprimir } from "../core/ui.js";
import { ruta } from "../core/sesion.js";
import { ICONOS } from "../core/iconos.js";

const TIPOS = { certificado: "Certificado", constancia: "Constancia", diploma: "Diploma" };
const PLANTILLA = {
  encabezado: "otorga el presente",
  texto: "por haber completado satisfactoriamente el curso",
  firma1: "", cargo1: "Dirección",
  firma2: "", cargo2: "Coordinación académica",
};

export function documento(ctx, c, est, plantilla) {
  const p = { ...PLANTILLA, ...plantilla };
  const urlVerif = ruta(`verificar.html?folio=${encodeURIComponent(c.folio)}`);
  return h("div.certificado",
    h("div",
      h("div", { style: "font-weight:700;font-size:clamp(1rem,2.4vw,1.5rem)" }, ctx.cuenta.nombre),
      h("div", { style: "margin-top:.25rem" }, p.encabezado)),
    h("div",
      h("div.tipo", (TIPOS[c.tipo] || c.tipo).toUpperCase()),
      h("div", { style: "margin-top:.75rem" }, "a"),
      h("div.nombre", nombreCompleto(est)),
      h("div", { style: "margin-top:.75rem;max-width:60ch;margin-inline:auto" }, p.texto),
      h("div", { style: "font-weight:700;font-size:clamp(1rem,2.6vw,1.6rem);margin-top:.4rem" }, c.datos?.curso || c.titulo),
      c.datos?.detalle ? h("div", { style: "margin-top:.4rem" }, c.datos.detalle) : null,
      h("div", { style: "margin-top:.75rem" }, `Emitido el ${fecha(c.emitido)}`)),
    h("div",
      h("div.firmas",
        h("span", p.firma1 || " ", h("br"), p.cargo1),
        h("span", p.firma2 || " ", h("br"), p.cargo2)),
      h("div.folio", { style: "margin-top:1rem" }, `Folio ${c.folio} · Verifica su autenticidad en ${urlVerif}`)));
}

export async function render(el, ctx) {
  if (!ctx.f("certificados")) {
    el.append(ctx.titulo("Certificados"), h("div.aviso.ojo", "Tu plan no incluye certificados. Están disponibles desde el plan Profesional."));
    return;
  }
  const [certs, est, cursos, completadas, cuenta] = await Promise.all([
    q(sb.from("certificados").select("*").eq("cuenta_id", ctx.id).order("creado", { ascending: false })),
    ctx.datos.estudiantes(), ctx.datos.cursos(),
    q(sb.from("matriculas").select("estudiante_id, curso_id, fecha").eq("cuenta_id", ctx.id).eq("estado", "completada")),
    q(sb.from("cuentas").select("config").eq("id", ctx.id).single()),
  ]);
  const E = Object.fromEntries(est.map((e) => [e.id, e]));
  const C = Object.fromEntries(cursos.map((c) => [c.id, c]));
  const plantilla = cuenta.config?.certificado || {};
  const yaEmitido = new Set(certs.filter((c) => !c.anulado).map((c) => `${c.estudiante_id}|${c.curso_id}`));
  const pendientes = completadas.filter((m) => C[m.curso_id]?.certifica && !yaEmitido.has(`${m.estudiante_id}|${m.curso_id}`));

  const ver = (c) => {
    const doc = documento(ctx, c, E[c.estudiante_id] || {}, plantilla);
    modal(`${TIPOS[c.tipo]} · ${c.folio}`, doc, [{ texto: "Cerrar", clase: "btn-sec" }, { texto: "Imprimir / PDF", onclick: () => { imprimir(doc); return false; } }])
      .el.style.width = "min(96vw, 980px)";
  };

  const emitir = (pre = {}) => formularioModal("Emitir certificado", [
    { name: "estudiante", label: "Estudiante", type: "select", required: true, full: true, placeholder: "Elige", options: est.map((e) => [e.id, nombreCompleto(e)]), value: pre.estudiante },
    { name: "curso", label: "Curso", type: "select", placeholder: "Sin curso (constancia general)", options: cursos.map((c) => [c.id, c.nombre]), value: pre.curso, full: true },
    { name: "tipo", label: "Tipo", type: "select", options: Object.entries(TIPOS) },
    { name: "horas", label: "Horas (opcional)", type: "number", min: 1 },
    { name: "titulo", label: "Título que aparecerá", full: true, help: "Si lo dejas vacío, se usa el nombre del curso." },
    { name: "detalle", label: "Detalle adicional", full: true, placeholder: "Ej.: con mención de honor" },
  ], {}, async (d, cerrar) => {
    const curso = C[d.curso];
    const titulo = d.titulo || curso?.nombre;
    if (!titulo) throw new Error("Escribe el título o elige un curso.");
    const horas = d.horas || curso?.horas_totales;
    const r = await q(sb.rpc("d360_emitir_certificado", { p_cuenta: ctx.id, p_estudiante: d.estudiante, p_curso: d.curso, p_tipo: d.tipo, p_titulo: titulo,
      p_datos: { curso: titulo, detalle: [horas ? `Duración: ${horas} horas` : null, d.detalle].filter(Boolean).join(" · ") || null } }));
    cerrar(); ctx.toast(`Emitido con folio ${r.folio}`);
    const nuevo = await q(sb.from("certificados").select("*").eq("id", r.id).single());
    ver(nuevo); setTimeout(ctx.recargar, 500);
  }, { boton: "Emitir" });

  const editarPlantilla = () => formularioModal("Plantilla de certificados", [
    { name: "encabezado", label: "Frase de encabezado", full: true },
    { name: "texto", label: "Texto principal", type: "textarea", full: true },
    { name: "firma1", label: "Firma 1: nombre" }, { name: "cargo1", label: "Firma 1: cargo" },
    { name: "firma2", label: "Firma 2: nombre" }, { name: "cargo2", label: "Firma 2: cargo" },
  ], { ...PLANTILLA, ...plantilla }, async (d, cerrar) => {
    const actual = (await q(sb.from("cuentas").select("config").eq("id", ctx.id).single())).config || {};
    await q(sb.from("cuentas").update({ config: { ...actual, certificado: d } }).eq("id", ctx.id));
    cerrar(); ctx.toast("Plantilla guardada"); ctx.recargar();
  });

  el.append(
    ctx.titulo("Certificados",
      ["propietario", "director"].includes(ctx.rol) ? h("button.btn.btn-sec", { onclick: editarPlantilla }, "Plantilla") : null,
      h("button.btn", { onclick: () => emitir() }, h("span", { html: ICONOS.mas_add }), "Emitir certificado")),
    pendientes.length ? h("section.hoja",
      h("div.hoja-titulo", h("h2", `Por emitir (${pendientes.length})`)),
      h("p.suave", "Estudiantes que completaron un curso con certificado y aún no lo tienen."),
      tabla([
        { t: "Estudiante", v: (m) => nombreCompleto(E[m.estudiante_id] || {}) },
        { t: "Curso", v: (m) => C[m.curso_id]?.nombre },
        { t: "", clase: "acciones", v: (m) => h("button.btn.btn-sm", { onclick: () => emitir({ estudiante: m.estudiante_id, curso: m.curso_id }) }, "Emitir") },
      ], pendientes)) : null,
    h("section.hoja",
      h("div.hoja-titulo", h("h2", "Emitidos")),
      tabla([
        { t: "Folio", v: (c) => h("strong.num", c.folio) },
        { t: "Estudiante", v: (c) => nombreCompleto(E[c.estudiante_id] || {}) },
        { t: "Título", v: (c) => [c.titulo, h("div.tenue", TIPOS[c.tipo])] },
        { t: "Emitido", v: (c) => fecha(c.emitido) },
        { t: "", v: (c) => h("span.estado" + (c.anulado ? ".mal" : ".ok"), c.anulado ? "Anulado" : "Válido") },
        { t: "", clase: "acciones", v: (c) => [
          h("button.btn.btn-texto.btn-sm", { onclick: () => ver(c) }, "Ver"),
          c.anulado ? null : h("button.btn.btn-texto.btn-sm", { onclick: async () => {
            if (!(await confirmar("Anular certificado", `El folio ${c.folio} aparecerá como ANULADO en la verificación pública.`, { boton: "Anular", peligro: true }))) return;
            try { await q(sb.from("certificados").update({ anulado: true }).eq("id", c.id)); ctx.toast("Certificado anulado"); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
          } }, "Anular")] },
      ], certs, { vacio: "Aún no se han emitido certificados." })),
    h("p.tenue", "Cualquier persona puede comprobar un certificado en ", h("a", { href: ruta("verificar.html"), target: "_blank" }, "la página de verificación"), " escribiendo su folio."),
  );
}
