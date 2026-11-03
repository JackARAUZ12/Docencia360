// =====================================================================
// DOCENCIA360 · acceso-codigo
// Valida "código de institución + código personal" y entrega un token
// de un solo uso para abrir la sesión del miembro en Supabase Auth.
//  - El código se verifica en la base (HMAC + pepper), nunca aquí.
//  - Bloqueo por intentos: 5 por IP+institución, 30 por institución.
//  - Cada miembro tiene su propio usuario de Auth (RLS sabe quién es).
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
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const MENSAJES: Record<string, string> = {
  formato: "Revisa los códigos: la institución tiene 6 letras o números y tu código personal 6 números.",
  incorrecto: "El código no es correcto.",
  bloqueado: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
  inactivo: "Tu acceso está desactivado. Habla con la administración.",
  cuenta_suspendida: "La cuenta de esta institución está suspendida. Habla con la administración.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Método no permitido" });

  let body: { institucion?: string; codigo?: string };
  try { body = await req.json(); } catch { return json(req, 400, { error: MENSAJES.formato }); }

  const institucion = String(body.institucion ?? "").slice(0, 20);
  const codigo = String(body.codigo ?? "").replace(/\D/g, "").slice(0, 6);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: r, error } = await admin.rpc("d360_canjear_codigo", {
    p_institucion: institucion, p_pin: codigo, p_origen: ip,
  });
  if (error) {
    console.error("canjear", error.message);
    return json(req, 500, { error: "No pudimos validar el código. Intenta de nuevo." });
  }
  if (!r?.ok) {
    const msg = MENSAJES[r?.motivo] ?? MENSAJES.incorrecto;
    const extra = r?.motivo === "incorrecto" && r.restantes <= 2 ? ` Te quedan ${r.restantes} intentos.` : "";
    const minutos = r?.motivo === "bloqueado" && r.minutos ? ` (${r.minutos} min)` : "";
    return json(req, r?.motivo === "bloqueado" ? 429 : 401, { error: msg + extra + minutos, motivo: r?.motivo });
  }

  // Primer acceso: se crea su usuario de Auth (sin contraseña ni correo real)
  let email: string = r.email;
  if (!r.user_id) {
    email = `m-${r.miembro_id}@miembros.docencia360.app`;
    const { data: nuevo, error: e1 } = await admin.auth.admin.createUser({
      email, email_confirm: true, app_metadata: { d360_miembro: r.miembro_id },
    });
    if (e1 || !nuevo?.user) {
      console.error("createUser", e1?.message);
      return json(req, 500, { error: "No pudimos preparar tu acceso. Intenta de nuevo." });
    }
    const { error: e2 } = await admin.rpc("d360_vincular_usuario", { p_miembro: r.miembro_id, p_user: nuevo.user.id });
    if (e2) {
      console.error("vincular", e2.message);
      return json(req, 500, { error: "No pudimos preparar tu acceso. Intenta de nuevo." });
    }
  }

  // Token de un solo uso; el navegador lo canjea con verifyOtp. No se envía correo.
  const { data: link, error: e3 } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (e3 || !link?.properties?.hashed_token) {
    console.error("generateLink", e3?.message);
    return json(req, 500, { error: "No pudimos abrir la sesión. Intenta de nuevo." });
  }
  return json(req, 200, { token_hash: link.properties.hashed_token, cuenta_id: r.cuenta_id, modalidad: r.modalidad });
});
