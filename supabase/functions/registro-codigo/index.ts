// =====================================================================
// DOCENCIA360 · registro-codigo
// Crea la cuenta de un cliente nuevo con el código de acceso que le dio
// el administrador, SIN correo de confirmación (el código ya prueba que
// está autorizado). Pasos:
//  1. Valida el código en la base, con límite de intentos por IP.
//  2. Crea el usuario de Auth ya confirmado (correo + contraseña).
//  3. Abre su sesión y crea la cuenta con d360_crear_cuenta, que vuelve
//     a validar el código y lo gasta en la misma transacción.
//  4. Si algo falla después de crear el usuario, lo borra (no quedan
//     usuarios huérfanos) y devuelve el error.
// Devuelve los tokens de sesión: el navegador entra de inmediato.
// La clave service_role solo vive en este servidor.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGENES = (Deno.env.get("D360_ORIGENES") ?? "*").split(",").map((s) => s.trim());

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const permitido = ORIGENES.includes("*") || ORIGENES.includes(origin) ? (origin || "*") : ORIGENES[0];
  return {
    "Access-Control-Allow-Origin": permitido,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const MOTIVOS: Record<string, string> = {
  invalido: "Ese código de acceso no existe. Revísalo: tiene la forma D360-XXXX-XXXX.",
  usado: "Ese código de acceso ya fue utilizado. Solicita uno nuevo.",
  vencido: "Ese código de acceso venció. Solicita uno nuevo.",
  desactivado: "Ese código de acceso fue desactivado. Solicita uno nuevo.",
};
const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Método no permitido" });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(req, 400, { error: "Datos incompletos." }); }

  const codigo = texto(b.codigo, 30);
  const email = texto(b.email, 254).toLowerCase();
  const clave = String(b.clave ?? "");
  const d = {
    modalidad: texto(b.modalidad, 20), plan: texto(b.plan, 40), nombre: texto(b.nombre, 120), tu_nombre: texto(b.tu_nombre, 120),
    telefono: texto(b.telefono, 40) || null, moneda: b.moneda === "USD" ? "USD" : "NIO", terminos: texto(b.terminos, 40),
  };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(req, 400, { error: "Escribe un correo válido." });
  if (clave.length < 8 || clave.length > 72) return json(req, 400, { error: "La contraseña debe tener al menos 8 caracteres." });
  if (d.nombre.length < 2 || d.tu_nombre.length < 2) return json(req, 400, { error: "Escribe tu nombre y el nombre de tu espacio." });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";

  // 1. Código (con límite de intentos por IP)
  const { data: v, error: ev } = await admin.rpc("d360_srv_validar_codigo", { p_codigo: codigo, p_origen: ip });
  if (ev) { console.error("validar", ev.message); return json(req, 500, { error: "No pudimos validar el código. Intenta de nuevo." }); }
  if (!v?.ok) {
    const msg = v?.motivo === "bloqueado" ? `Demasiados intentos. Espera ${v.minutos ?? 15} minutos y vuelve a intentarlo.` : MOTIVOS[v?.motivo] ?? MOTIVOS.invalido;
    return json(req, v?.motivo === "bloqueado" ? 429 : 400, { error: msg, motivo: v?.motivo, codigo_registro: true });
  }
  if (v.requiere === false) return json(req, 400, { error: "El registro no exige código: usa el registro normal.", motivo: "sin_requisito" });
  if (v.modalidad && v.modalidad !== d.modalidad) return json(req, 400, { error: "Tu código de acceso es para otro tipo de cuenta.", codigo_registro: true });

  // 2. Usuario ya confirmado (sin correo de confirmación)
  const { data: nuevo, error: e1 } = await admin.auth.admin.createUser({
    email, password: clave, email_confirm: true, user_metadata: { nombre: d.tu_nombre },
  });
  if (e1 || !nuevo?.user) {
    const existe = /already|registered|exists/i.test(e1?.message ?? "");
    if (!existe) console.error("createUser", e1?.message);
    return json(req, existe ? 409 : 500, existe
      ? { error: "Ese correo ya tiene usuario en Docencia360. Entra con ese correo y su contraseña para terminar tu registro con el código.", motivo: "correo_existe" }
      : { error: "No pudimos crear tu usuario. Intenta de nuevo." });
  }
  const uid = nuevo.user.id;
  const deshacer = async () => { const { error } = await admin.auth.admin.deleteUser(uid); if (error) console.error("deleteUser", error.message); };

  // 3. Sesión del usuario y cuenta (d360_crear_cuenta valida y gasta el código)
  const usuario = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: ses, error: e2 } = await usuario.auth.signInWithPassword({ email, password: clave });
  if (e2 || !ses?.session) { console.error("signIn", e2?.message); await deshacer(); return json(req, 500, { error: "No pudimos abrir tu sesión. Intenta de nuevo." }); }

  const { data: r, error: e3 } = await usuario.rpc("d360_crear_cuenta", {
    p_modalidad: d.modalidad, p_nombre: d.nombre, p_tu_nombre: d.tu_nombre, p_plan: d.plan,
    p_telefono: d.telefono, p_moneda: d.moneda, p_terminos: d.terminos, p_codigo: codigo,
  });
  if (e3 || !r || r.error) {
    await deshacer();
    return json(req, 400, { error: e3?.message ?? r?.error ?? "No pudimos crear la cuenta.", codigo_registro: !!r?.error });
  }

  return json(req, 200, {
    cuenta: r,
    sesion: { access_token: ses.session.access_token, refresh_token: ses.session.refresh_token },
  });
});
