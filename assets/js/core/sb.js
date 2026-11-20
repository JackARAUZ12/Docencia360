// Cliente único de Supabase (librería servida desde /assets/vendor).
import { CONFIG } from "../config.js";
import { fetchHibrido, SIN_COPIA, REQUIERE_INTERNET } from "./offline.js";

if (!window.supabase?.createClient) {
  throw new Error("No se cargó la librería de Supabase");
}

export const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "d360-sesion" },
  // Con internet va directo; sin internet usa la copia local y guarda los cambios para subirlos después
  global: { fetch: fetchHibrido },
});

// La aplicación se guarda en el equipo para abrir sin internet (service worker).
// En pruebas automáticas se activa solo si la prueba lo pide.
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && (!navigator.webdriver || window.__D360_SW)) {
  const registrar = () => navigator.serviceWorker.register(new URL("../../../sw.js", import.meta.url)).catch(() => {});
  document.readyState === "complete" ? registrar() : addEventListener("load", registrar);
}

/** Traduce errores de Postgres/Supabase a mensajes comprensibles. */
export function mensajeError(e) {
  if (!e) return "Ocurrió un error.";
  const m = e.message || String(e);
  if (e.code === SIN_COPIA || m.includes(SIN_COPIA)) return "Sin conexión: esta información todavía no se abrió con internet en este dispositivo. Conéctate una vez y quedará guardada.";
  if (e.code === REQUIERE_INTERNET || m.includes(REQUIERE_INTERNET)) return "Esto necesita internet. Conéctate para hacerlo; lo demás puedes seguir usándolo sin conexión.";
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
  avisarCambio(promesa);
  return data;
}

// Cuando algo se guarda (crear, editar, borrar o una acción que cambia datos),
// se avisa a la página con el evento «d360:cambio». Así, por ejemplo, la guía de
// Primeros pasos se actualiza sola sin tener que cambiar de pantalla.
const RPC_QUE_CAMBIAN = /\/rpc\/d360_(importar_estudiantes|alumnos_activar|actividad_publicar|matricular|crear_miembro|cobrar_varios|cobro_clase|cobros_generar|inscripcion_enlace|interesado_matricular|instructor_pagar|banco_a_actividad|actividad_a_banco|promover|vincular_tutor|caja_cerrar)\b/;
let tCambio;
function avisarCambio(b) {
  try {
    const metodo = b?.method, url = String(b?.url || "");
    if (!metodo || metodo === "GET" || metodo === "HEAD") return;
    if (url.includes("/rpc/") && !RPC_QUE_CAMBIAN.test(url)) return;   // las consultas por RPC no cambian datos
    clearTimeout(tCambio);
    tCambio = setTimeout(() => dispatchEvent(new CustomEvent("d360:cambio")), 300);
  } catch (_) { /* nunca interrumpe el guardado */ }
}
