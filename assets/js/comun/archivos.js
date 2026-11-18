// Archivos del aula virtual (modo ahorro): fotos comprimidas en el navegador
// y PDF de hasta 5 MB. El estudiante no tiene cuenta de correo, así que sube
// con una URL firmada que entrega la función «aula-archivos» después de que
// la base de datos valida su entrega en curso.
import { CONFIG } from "../config.js";
import { sb } from "../core/sb.js";

export const MAX_BYTES = 5 * 1024 * 1024;
export const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const ACEPTA = ".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf";

export const tamanoLegible = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Reduce las fotos a 1600 px de lado y JPG de calidad 0,8 (una foto de celular pasa de ~4 MB a ~300 KB). */
export async function comprimir(archivo) {
  if (!archivo.type.startsWith("image/") || archivo.type === "image/gif") return archivo;
  if (archivo.size < 350 * 1024 && archivo.type === "image/jpeg") return archivo;
  try {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bmp.width * escala); lienzo.height = Math.round(bmp.height * escala);
    lienzo.getContext("2d").drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.8));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (_) { return archivo; }
}

/** Revisa tipo y tamaño antes de subir. Devuelve un mensaje de error o null. */
export function revisar(archivo) {
  if (!TIPOS.includes(archivo.type)) return `«${archivo.name}» no es una foto ni un PDF.`;
  if (archivo.size > MAX_BYTES) return `«${archivo.name}» pesa ${tamanoLegible(archivo.size)}; el máximo es 5 MB.`;
  return null;
}

async function llamar(cuerpo) {
  let r;
  try {
    r = await fetch(`${CONFIG.supabaseUrl}/functions/v1/aula-archivos`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: CONFIG.supabaseKey }, body: JSON.stringify(cuerpo) });
  } catch (_) { throw new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "No se pudo completar. Intenta otra vez.");
  return d;
}

/** Sube un archivo a la entrega en curso. Devuelve { id, nombre, tamano, tipo }. */
export async function subirAEntrega(sesionEntrega, original) {
  const archivo = await comprimir(original);
  const error = revisar(archivo);
  if (error) throw new Error(error);
  const r = await llamar({ accion: "subir", entrega: sesionEntrega, nombre: archivo.name, tamano: archivo.size, tipo: archivo.type });
  const { error: e } = await sb.storage.from("d360").uploadToSignedUrl(r.path, r.token, archivo, { contentType: archivo.type });
  if (e) {
    await llamar({ accion: "quitar", entrega: sesionEntrega, id: r.id }).catch(() => {});
    throw new Error("No se pudo subir «" + archivo.name + "». Revisa tu conexión e intenta otra vez.");
  }
  return { id: r.id, nombre: archivo.name, tamano: archivo.size, tipo: archivo.type };
}

export const quitarDeEntrega = (sesionEntrega, id) => llamar({ accion: "quitar", entrega: sesionEntrega, id });

/** URL temporal (10 min) para que el estudiante abra un material o su propio archivo. */
export const urlParaEstudiante = async (sesionAula, { material, archivo }) => (await llamar({ accion: "ver", sesion: sesionAula, material, archivo })).url;

/** URL temporal para el profesor (usa su propia sesión y las reglas del almacenamiento). */
export async function urlParaProfesor(path, nombre) {
  const { data, error } = await sb.storage.from("d360").createSignedUrl(path, 600, nombre ? { download: nombre } : undefined);
  if (error) throw new Error("El archivo ya no está disponible.");
  return data.signedUrl;
}

/** Sube un material del profesor a la carpeta privada de su cuenta. */
export async function subirMaterial(cuentaId, original) {
  const archivo = await comprimir(original);
  const error = revisar(archivo);
  if (error) throw new Error(error);
  const ext = archivo.type === "application/pdf" ? "pdf" : archivo.type === "image/png" ? "png" : archivo.type === "image/webp" ? "webp" : "jpg";
  const path = `${cuentaId}/materiales/${crypto.randomUUID()}.${ext}`;
  const { error: e } = await sb.storage.from("d360").upload(path, archivo, { contentType: archivo.type, upsert: false });
  if (e) throw new Error(/row-level|security|denied/i.test(e.message) ? "No tienes permiso para subir materiales." : "No se pudo subir el archivo. Intenta otra vez.");
  return { path, nombre: archivo.name, tamano: archivo.size, tipo: archivo.type };
}
