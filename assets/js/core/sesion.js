// Sesión, cuenta activa y protección de páginas.
import { sb, q } from "./sb.js";
import { CONFIG } from "../config.js";
import { usuarioLocal, estado as estadoConexion, borrarCopias, PRECARGA } from "./offline.js";

/** Raíz del sitio (funciona en dominio propio o en subcarpeta de GitHub Pages). */
export const RAIZ = new URL("../../../", import.meta.url).href;
export const ruta = (p) => RAIZ + p.replace(/^\//, "");
/** ¿Se está usando el programa de escritorio (Windows)? */
export const enEscritorio = () => !!window.d360Escritorio;
/**
 * Enlace para los correos (confirmar cuenta, recuperar contraseña). En el programa de
 * escritorio apunta a la página web (un correo no puede abrir el programa).
 */
export const rutaCorreo = (p) => (enEscritorio() ? (CONFIG.sitioWeb ? CONFIG.sitioWeb.replace(/\/?$/, "/") + p.replace(/^\//, "") : undefined) : ruta(p));

export const RUTA_MODALIDAD = {
  profesor: "app/profesor.html",
  academia: "app/academia.html",
  colegio: "app/colegio.html",
};

const CLAVE_CUENTA = "d360-cuenta";
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const leer = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

export async function sesionActual() {
  const { data, error } = await sb.auth.getSession();
  if (data.session) return data.session;
  // Sin internet la sesión no se puede renovar, pero sigue guardada en este equipo:
  // se usa para abrir la copia local. Al volver el internet se renueva sola.
  const sinRed = navigator.onLine === false || !estadoConexion().enLinea || /fetch|network/i.test(error?.message || "") || error?.name === "AuthRetryableFetchError";
  const u = sinRed ? usuarioLocal() : null;
  return u ? { user: u, sinConexion: true } : null;
}

export async function misCuentas() {
  return (await q(sb.rpc("d360_mis_cuentas"))) || [];
}

export function elegirCuenta(id) { guardar(CLAVE_CUENTA, id); }

/** Decide a dónde ir después de iniciar sesión. */
export async function destinoTrasLogin(cuentaPreferida) {
  const cuentas = await misCuentas();
  if (!cuentas.length) {
    const { data } = await sb.rpc("d360_es_plataforma_admin");
    return data ? ruta("admin/index.html") : ruta("registro.html?paso=cuenta");
  }
  const c = cuentas.find((x) => x.cuenta_id === cuentaPreferida)
        || cuentas.find((x) => x.cuenta_id === leer(CLAVE_CUENTA))
        || cuentas[0];
  if (cuentas.length > 1 && !cuentaPreferida && !leer(CLAVE_CUENTA)) return ruta("cuentas.html");
  elegirCuenta(c.cuenta_id);
  return ruta(RUTA_MODALIDAD[c.modalidad]);
}

/**
 * Protege una página de modalidad. Devuelve { user, cuenta, cuentas }.
 * Si no corresponde, redirige y nunca resuelve.
 */
export async function protegerModalidad(modalidad) {
  const s = await sesionActual();
  if (!s) { location.replace(ruta("entrar.html")); return new Promise(() => {}); }
  const cuentas = await misCuentas();
  const id = leer(CLAVE_CUENTA);
  const cuenta = cuentas.find((c) => c.cuenta_id === id) || cuentas[0];
  if (!cuenta) { location.replace(ruta("registro.html?paso=cuenta")); return new Promise(() => {}); }
  if (![].concat(modalidad).includes(cuenta.modalidad)) { elegirCuenta(cuenta.cuenta_id); location.replace(ruta(RUTA_MODALIDAD[cuenta.modalidad])); return new Promise(() => {}); }
  elegirCuenta(cuenta.cuenta_id);
  sb.rpc("d360_marcar_acceso", { p_cuenta: cuenta.cuenta_id }).then(() => {});
  vigilarInactividad();
  return { user: s.user, cuenta, cuentas };
}

export async function salir(motivo, destino = "entrar.html") {
  if (PRECARGA) return;
  const est = estadoConexion();
  if (!motivo && est.pendientes > 0 && !confirm(`Tienes ${est.pendientes} cambio(s) guardados en este equipo que todavía no se subieron a internet.\n\nSi sales ahora se subirán la próxima vez que entres con tu cuenta en este mismo equipo. ¿Salir de todos modos?`)) return;
  await borrarCopias();   // la copia de consulta no queda en el equipo (privacidad)
  // Sin internet no se puede avisar al servidor: se cierra la sesión solo en este equipo
  const r = await sb.auth.signOut(est.enLinea && navigator.onLine !== false ? undefined : { scope: "local" }).catch((e) => ({ error: e }));
  if (r?.error) await sb.auth.signOut({ scope: "local" }).catch(() => {});
  try { localStorage.removeItem(CLAVE_CUENTA); } catch (_) {}
  location.replace(ruta(destino + (motivo ? `?motivo=${motivo}` : "")));
}

/** Cierra la sesión tras N minutos sin actividad (computadoras compartidas). */
let temporizador;
export async function vigilarInactividad() {
  if (PRECARGA) return;   // la copia oculta que prepara el equipo nunca cierra la sesión
  let minutos = 60;
  try {
    const { data } = await sb.from("config_global").select("valor").eq("clave", "publico.inactividad_minutos").maybeSingle();
    if (data?.valor) minutos = Number(data.valor) || 60;
  } catch (_) {}
  const reiniciar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => salir("inactividad"), minutos * 60000);
  };
  ["pointerdown", "keydown", "scroll", "visibilitychange"].forEach((ev) => addEventListener(ev, reiniciar, { passive: true }));
  reiniciar();
}

// Si otra pestaña cierra la sesión, esta también
sb.auth.onAuthStateChange((evento) => {
  if (PRECARGA) return;
  if (evento === "SIGNED_OUT" && !/entrar|registro|recuperar|index|nueva-clave/.test(location.pathname) && location.pathname !== "/") {
    location.replace(ruta("entrar.html"));
  }
});
