// Reporte a padres por WhatsApp: arma un mensaje claro con la asistencia,
// el promedio y la última observación del estudiante, lo muestra para que el
// profesor lo revise o corrija, y abre WhatsApp. Nada se envía solo.
import { sb, q } from "../core/sb.js";
import { h, modal, nombreCompleto } from "../core/ui.js";

/** Número para wa.me: solo dígitos; los de 8 dígitos se toman como de Nicaragua (+505). */
export function numeroWhatsApp(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 8) return "505" + d;
  return d.replace(/^00/, "");
}

/** Texto del reporte. Solo incluye lo que hay registrado. */
export function textoReporte({ ctx, estudiante, asistencia, promedios = [], observacion }) {
  const contacto = (estudiante.contacto_nombre || "").trim();
  const nombre = nombreCompleto(estudiante);
  const lineas = [`Hola${contacto ? " " + contacto : ""}, le saluda ${ctx.cuenta.miembro_nombre} (${ctx.cuenta.nombre}).`, "", `Le comparto el avance de ${nombre}:`];
  if (asistencia && Number(asistencia.total) > 0) {
    lineas.push(`• Asistencia: ${asistencia.porcentaje}% (${asistencia.ausentes} ausencia${Number(asistencia.ausentes) === 1 ? "" : "s"}, ${asistencia.tardes} tardanza${Number(asistencia.tardes) === 1 ? "" : "s"}).`);
  }
  for (const p of promedios.filter((x) => x.promedio != null)) {
    lineas.push(`• Promedio${promedios.length > 1 ? " en " + p.nombre : ""}: ${Number(p.promedio)} de 100.`);
  }
  if (observacion?.texto) lineas.push(`• Observación: ${observacion.texto}`);
  if (lineas.length === 3) lineas.push("• Aún no hay asistencia ni notas registradas.");
  lineas.push("", "Quedo atento a cualquier consulta. ¡Gracias!");
  return lineas.join("\n");
}

/** Ventana con el mensaje editable y el botón para abrir WhatsApp. */
export function abrirReporte(ctx, estudiante, texto) {
  const tel = numeroWhatsApp(estudiante.contacto_telefono || estudiante.telefono);
  const area = h("textarea", { rows: 10, value: texto, "aria-label": "Mensaje" });
  const destino = tel
    ? h("p.suave", `Se enviará a ${estudiante.contacto_nombre || "el contacto"} (+${tel}). Puedes cambiar el mensaje antes de enviarlo.`)
    : h("div.aviso.ojo", "Este estudiante no tiene teléfono de contacto. WhatsApp te pedirá elegir a quién enviarlo. Puedes agregar el teléfono en «Editar».");
  modal("Reporte por WhatsApp", h("div.reporte-wa", destino, h("label.campo", h("span", "Mensaje"), area)), [
    { texto: "Cancelar", clase: "btn-sec" },
    { texto: "Abrir WhatsApp", onclick: (cerrar) => {
      const url = `https://wa.me/${tel}?text=${encodeURIComponent(area.value.trim())}`;
      window.open(url, "_blank", "noopener");
      cerrar();
    } },
  ]);
}

/** Reúne los datos de un estudiante (lo que el usuario ya puede ver) y abre el reporte. */
export async function reportePorEstudiante(ctx, estudiante, { grupo = null } = {}) {
  const [asis, inscritos, obs] = await Promise.all([
    q(sb.rpc("d360_resumen_asistencia", { p_cuenta: ctx.id, ...(grupo ? { p_grupo: grupo } : {}) }).eq("estudiante_id", estudiante.id)),
    q(sb.from("grupo_estudiantes").select("grupo_id, grupos(nombre,estado)").eq("estudiante_id", estudiante.id).eq("estado", "activo")),
    q(sb.from("observaciones").select("texto,creado").eq("estudiante_id", estudiante.id).order("creado", { ascending: false }).limit(1)),
  ]);
  const grupos = inscritos.filter((g) => g.grupos?.estado === "activo" && (!grupo || g.grupo_id === grupo));
  const promedios = await Promise.all(grupos.map(async (g) => {
    const p = await q(sb.rpc("d360_promedios_grupo", { p_grupo: g.grupo_id }));
    return { nombre: g.grupos.nombre, promedio: p.find((x) => x.estudiante_id === estudiante.id)?.promedio ?? null };
  }));
  abrirReporte(ctx, estudiante, textoReporte({ ctx, estudiante, asistencia: asis[0], promedios, observacion: obs[0] }));
}

/** Botón listo para usar: si el plan no lo incluye, muestra el aviso de mejora (solo al dueño). */
export function botonReporte(ctx, estudiante, opciones = {}) {
  if (!ctx.f("reporte_whatsapp")) return ctx.mejora("Reporte por WhatsApp");
  return h("button.btn.btn-sec" + (opciones.chico ? ".btn-sm" : ""), { type: "button", onclick: async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await reportePorEstudiante(ctx, estudiante, opciones); } catch (err) { ctx.toast(err.message, "mal"); } finally { b.disabled = false; }
  } }, opciones.chico ? "WhatsApp" : "Enviar reporte por WhatsApp");
}
