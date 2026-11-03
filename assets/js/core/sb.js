// Cliente único de Supabase (librería servida desde /assets/vendor).
import { CONFIG } from "../config.js";

if (!window.supabase?.createClient) {
  throw new Error("No se cargó la librería de Supabase");
}

export const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "d360-sesion" },
});

/** Traduce errores de Postgres/Supabase a mensajes comprensibles. */
export function mensajeError(e) {
  if (!e) return "Ocurrió un error.";
  const m = e.message || String(e);
  if (e.code === "42501" || /row-level security|permission denied/i.test(m)) {
    return "No tienes permiso para esta acción, o tu plan está vencido.";
  }
  if (e.code === "23505") return "Ya existe un registro con esos datos.";
  if (e.code === "23503") return "No se puede completar: hay registros relacionados.";
  if (e.code === "23514") return "Algún dato no es válido. Revisa el formulario.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
  if (/Email not confirmed/i.test(m)) return "Confirma tu correo: te enviamos un enlace al registrarte.";
  if (/User already registered/i.test(m)) return "Ese correo ya tiene una cuenta. Inicia sesión.";
  if (/Password should be/i.test(m)) return "La contraseña debe tener al menos 8 caracteres.";
  return m;
}

/** Ejecuta una consulta y lanza un error legible si falla. */
export async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw Object.assign(new Error(mensajeError(error)), { original: error });
  return data;
}
