// Utilidades del colegio: estructura académica, escala cualitativa y archivos.
import { sb, q } from "../core/sb.js";
import { h } from "../core/ui.js";

/** Escala cualitativa del MINED (Nicaragua) */
export function cualitativa(n) {
  if (n == null) return null;
  const v = Number(n);
  return v >= 90 ? "AA" : v >= 76 ? "AS" : v >= 60 ? "AF" : "AI";
}
export const CUALI_TEXTO = { AA: "Aprendizaje avanzado", AS: "Aprendizaje satisfactorio", AF: "Aprendizaje fundamental", AI: "Aprendizaje inicial" };

export function notaCelda(n, minima = 60, conCuali = true) {
  if (n == null) return h("span.tenue", "—");
  const v = Number(n);
  return h("span", { style: "white-space:nowrap" }, h("span", { className: v < minima ? "nota-baja num" : "num" }, v.toFixed(0)),
    conCuali ? [" ", h("span.cuali." + cualitativa(v), cualitativa(v))] : null);
}

/** Carga (con caché en ctx) la estructura del colegio */
export async function estructura(ctx, forzar) {
  if (ctx._est && !forzar) return ctx._est;
  const [cuenta, niveles, grados, secciones, asignaturas, periodos, aulas, docentes, asignaciones, sedes] = await Promise.all([
    q(sb.from("cuentas").select("id,nombre,codigo,config,logo_url,direccion,telefono,email,moneda").eq("id", ctx.id).single()),
    q(sb.from("niveles").select("*").eq("cuenta_id", ctx.id).order("orden")),
    q(sb.from("grados").select("*").eq("cuenta_id", ctx.id).order("orden")),
    q(sb.from("grupos").select("*").eq("cuenta_id", ctx.id).not("grado_id", "is", null).order("nombre")),
    q(sb.from("asignaturas").select("*").eq("cuenta_id", ctx.id).order("nombre")),
    q(sb.from("periodos").select("*").eq("cuenta_id", ctx.id).order("orden")),
    q(sb.from("aulas").select("*").eq("cuenta_id", ctx.id).order("nombre")),
    q(sb.from("miembros").select("id,nombre,especialidad,activo,telefono,email,user_id").eq("cuenta_id", ctx.id).eq("rol", "docente").order("nombre")),
    q(sb.from("grupo_docentes").select("*").eq("cuenta_id", ctx.id)),
    q(sb.from("sedes").select("*").eq("cuenta_id", ctx.id).order("nombre")),
  ]);
  const cfg = cuenta.config || {};
  const E = {
    cuenta, cfg, niveles, grados, secciones, asignaturas, periodos, aulas, docentes, asignaciones, sedes,
    minima: Number(cfg.nota_minima ?? 60),
    cuali: cfg.escala_cualitativa !== false,
    grado: (id) => grados.find((g) => g.id === id),
    nivel: (id) => niveles.find((n) => n.id === id),
    seccion: (id) => secciones.find((s) => s.id === id),
    asignatura: (id) => asignaturas.find((a) => a.id === id),
    docente: (id) => docentes.find((d) => d.id === id),
    planDe: (gradoId) => asignaturas.filter((a) => a.grado_id === gradoId && a.activo),
    docenteDe: (seccionId, asigId) => asignaciones.find((x) => x.grupo_id === seccionId && x.asignatura_id === asigId),
    guiaDe: (seccionId) => asignaciones.find((x) => x.grupo_id === seccionId && x.es_guia),
    periodoActual() {
      const hoy = new Date().toISOString().slice(0, 10);
      return periodos.find((p) => p.inicio <= hoy && p.fin >= hoy) || [...periodos].reverse().find((p) => p.fin < hoy) || periodos[0];
    },
    /** Secciones visibles para el usuario (un docente: solo donde enseña) */
    misSecciones() {
      if (!ctx.esDocente) return secciones;
      const ids = new Set(asignaciones.filter((x) => x.miembro_id === ctx.cuenta.miembro_id).map((x) => x.grupo_id));
      return secciones.filter((s) => ids.has(s.id));
    },
    /** Asignaturas de una sección que el usuario puede calificar */
    misAsignaturas(seccionId) {
      const sec = secciones.find((s) => s.id === seccionId);
      const plan = asignaturas.filter((a) => a.grado_id === sec?.grado_id);
      if (!ctx.esDocente) return plan;
      const ids = new Set(asignaciones.filter((x) => x.grupo_id === seccionId && x.miembro_id === ctx.cuenta.miembro_id).map((x) => x.asignatura_id));
      return plan.filter((a) => ids.has(a.id));
    },
    nombreSeccion: (s) => s ? `${s.nombre}` : "—",
  };
  ctx._est = E;
  return E;
}
export function invalidarEstructura(ctx) { delete ctx._est; ctx.datos.invalidar(); }

/** URL firmada de un archivo privado (foto o logo) */
const cacheUrls = new Map();
export async function urlArchivo(ruta) {
  if (!ruta) return null;
  if (cacheUrls.has(ruta)) return cacheUrls.get(ruta);
  const { data } = await sb.storage.from("d360").createSignedUrl(ruta, 3600);
  const url = data?.signedUrl || null;
  cacheUrls.set(ruta, url);
  return url;
}

/** Sube una imagen reducida (máx. 600 px, JPEG) y devuelve su ruta */
export async function subirImagen(ctx, archivo, ruta) {
  if (!/^image\//.test(archivo.type)) throw new Error("Elige una imagen (JPG o PNG).");
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, 600 / Math.max(img.width, img.height));
  const lienzo = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * escala), height: Math.round(img.height * escala) });
  lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
  const camino = `${ctx.id}/${ruta}.jpg`;
  const { error } = await sb.storage.from("d360").upload(camino, blob, { upsert: true, contentType: "image/jpeg" });
  if (error) throw new Error(/row-level|denied|policy/i.test(error.message) ? "No tienes permiso para subir archivos (en la demostración no se permite)." : error.message);
  cacheUrls.delete(camino);
  return camino;
}

export function selector(opciones, valor, alCambiar, etiqueta) {
  return h("select", { "aria-label": etiqueta, style: "width:auto;min-width:180px", onchange: (e) => alCambiar(e.target.value) },
    opciones.map(([v, t]) => h("option", { value: v, selected: String(v) === String(valor) }, t)));
}
