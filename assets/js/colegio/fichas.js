// Secciones del expediente del estudiante propias del colegio.
import { sb, q } from "../core/sb.js";
import { h, tabla, fecha, formularioModal, confirmar, modal, nombreCompleto } from "../core/ui.js";
import { estructura, urlArchivo, subirImagen } from "./util.js";
import { abrirMatriculaColegio, abrirTraslado } from "./matriculas.js";
import { mostrarCodigo } from "../academia/instructores.js";

const DOCS = [["partida", "Partida de nacimiento"], ["notas_anteriores", "Certificado de notas del año anterior"],
  ["fotos", "Fotografías tamaño carné"], ["cedula_tutor", "Copia de cédula del tutor"], ["vacunas", "Tarjeta de vacunas"], ["traslado", "Constancia de traslado (si aplica)"]];

export async function fotoFicha(ctx, e) {
  const url = await urlArchivo(e.foto_url);
  const ini = (e.nombres?.[0] || "") + (e.apellidos?.[0] || "");
  const input = h("input", { type: "file", accept: "image/*", className: "oculto", onchange: async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try { const camino = await subirImagen(ctx, f, `estudiantes/${e.id}`); await q(sb.from("estudiantes").update({ foto_url: camino }).eq("id", e.id)); ctx.toast("Foto guardada"); ctx.recargar(); }
    catch (x) { ctx.toast(x.message, "mal"); }
  } });
  return h("section.hoja", { style: "display:flex;gap:1rem;align-items:center" },
    url ? h("img.foto-est", { src: url, alt: `Foto de ${nombreCompleto(e)}` }) : h("div.foto-est", ini),
    h("div", h("strong", nombreCompleto(e)), h("div.tenue", e.codigo ? `Código ${e.codigo}` : "Sin código"),
      ctx.esGestor ? h("button.btn.btn-sec.btn-sm", { style: "margin-top:.5rem", onclick: () => input.click() }, url ? "Cambiar foto" : "Subir foto") : null, input));
}

export async function seccionMatriculaColegio(ctx, e) {
  const [E, ms] = await Promise.all([estructura(ctx), q(sb.from("matriculas").select("*").eq("estudiante_id", e.id).order("anio", { ascending: false }))]);
  const activa = ms.find((m) => m.estado === "activa");
  const puede = ctx.esGestor || ctx.esFinanzas;
  return h("section.hoja",
    h("div.hoja-titulo", h("h2", "Matrícula"),
      puede && !activa && e.estado === "activo" ? h("button.btn.btn-sm", { onclick: () => abrirMatriculaColegio(ctx, { estudianteId: e.id }) }, "Matricular") : null,
      puede && activa ? h("button.btn.btn-sec.btn-sm", { onclick: () => abrirTraslado(ctx, activa) }, "Trasladar de sección") : null),
    tabla([
      { t: "Año", v: (m) => m.anio },
      { t: "Sección", v: (m) => { const s = E.seccion(m.grupo_id); return s ? [h("strong", s.nombre), h("div.tenue", E.grado(s.grado_id)?.nombre || "")] : "—"; } },
      { t: "Beca", v: (m) => m.beca || (Number(m.descuento_pct) ? `${Number(m.descuento_pct)}%` : "—") },
      { t: "Estado", v: (m) => h("span.estado." + ({ activa: "ok", completada: "info", retirada: "mal" }[m.estado] || ""), m.estado) },
    ], ms, { vacio: "Sin matrícula registrada." }));
}

export async function seccionTutores(ctx, e) {
  const tut = await q(sb.from("tutores_estudiantes").select("parentesco, miembros(id,nombre,telefono,activo,ultimo_acceso,codigo_ultimos)").eq("estudiante_id", e.id));
  const portal = ctx.f("portal_familias");
  const agregar = () => formularioModal("Agregar padre, madre o tutor", [
    { name: "nombre", label: "Nombre completo", required: true, full: true, value: e.contacto_nombre || "" },
    { name: "telefono", label: "Teléfono", type: "tel", value: e.contacto_telefono || "" },
    { name: "parentesco", label: "Parentesco", type: "select", options: [["Madre", "Madre"], ["Padre", "Padre"], ["Tutor legal", "Tutor legal"], ["Abuelo/a", "Abuelo/a"], ["Otro", "Otro"]], value: e.contacto_parentesco },
  ], {}, async (d, cerrar) => {
    const r = await q(sb.rpc("d360_vincular_tutor", { p_cuenta: ctx.id, p_estudiante: e.id, p_nombre: d.nombre, p_telefono: d.telefono, p_parentesco: d.parentesco }));
    const cod = (await q(sb.from("cuentas").select("codigo").eq("id", ctx.id).single())).codigo;
    cerrar(); if (r.codigo_personal) mostrarCodigo(ctx, "Acceso para la familia", d.nombre, r.codigo_personal, cod);
    setTimeout(ctx.recargar, 300);
  }, { boton: "Crear acceso" });
  return h("section.hoja",
    h("div.hoja-titulo", h("h2", "Padres y tutores"), ctx.esGestor && portal ? h("button.btn.btn-sec.btn-sm", { onclick: agregar }, "Agregar") : null),
    tut.length ? h("ul.lista", tut.map((t) => h("li",
      h("div.crece", h("div.titulo", t.miembros?.nombre), h("div.tenue", [t.parentesco, t.miembros?.telefono, t.miembros?.ultimo_acceso ? `entró ${fecha(t.miembros.ultimo_acceso)}` : "aún no entra al portal"].filter(Boolean).join(" · "))),
      ctx.esGestor ? h("button.btn.btn-texto.btn-sm", { onclick: async () => {
        if (!(await confirmar("Quitar vínculo", `${t.miembros?.nombre} dejará de ver a ${e.nombres} en el portal.`, { boton: "Quitar" }))) return;
        try { await q(sb.from("tutores_estudiantes").delete().eq("estudiante_id", e.id).eq("miembro_id", t.miembros.id)); ctx.recargar(); } catch (x) { ctx.toast(x.message, "mal"); }
      } }, "Quitar") : null)))
      : h("p.suave", portal ? "Sin tutores con acceso al portal. Agrega uno para que la familia vea notas, asistencia y pagos." : "Contacto: " + ([e.contacto_nombre, e.contacto_telefono].filter(Boolean).join(" · ") || "sin registrar") + ". El portal de familias está disponible desde el plan Avanzado."));
}

export async function seccionDocumentos(ctx, e) {
  const docs = e.documentos || {};
  const entregados = DOCS.filter(([k]) => docs[k]).length;
  return h("section.hoja",
    h("div.hoja-titulo", h("h2", "Documentos entregados"), h("span.estado" + (entregados >= 4 ? ".ok" : ".ojo"), `${entregados} de ${DOCS.length}`)),
    DOCS.map(([k, t]) => h("label.check", h("input", { type: "checkbox", checked: !!docs[k], disabled: !ctx.esGestor, onchange: async (ev) => {
      try { await q(sb.from("estudiantes").update({ documentos: { ...docs, [k]: ev.target.checked } }).eq("id", e.id)); docs[k] = ev.target.checked; ctx.toast("Guardado"); }
      catch (x) { ev.target.checked = !ev.target.checked; ctx.toast(x.message, "mal"); }
    } }), t)));
}
