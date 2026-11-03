// =====================================================================
// DOCENCIA360 · acceso-demo
// Abre una sesión en una cuenta de demostración según el perfil elegido
// (profesor, academia-direccion, academia-caja, academia-instructor).
// No hay contraseñas en el navegador: el servidor genera un token de un
// solo uso. Límite: 40 accesos por hora por IP.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGENES = (Deno.env.get("D360_ORIGENES") ?? "*").split(",").map((s) => s.trim());
function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const permitido = ORIGENES.includes("*") || ORIGENES.includes(origin) ? (origin || "*") : ORIGENES[0];
  return { "Access-Control-Allow-Origin": permitido, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
           "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Método no permitido" });
  let perfil = "";
  try { perfil = String((await req.json())?.perfil ?? "").slice(0, 40); } catch { /* vacío */ }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: r, error } = await admin.rpc("d360_demo_miembro", { p_perfil: perfil, p_origen: ip });
  if (error) { console.error("demo_miembro", error.message); return json(req, 500, { error: "La demostración no está disponible ahora. Intenta en un momento." }); }
  if (!r?.ok) {
    const msg = r?.motivo === "limite" ? "Abriste muchas demostraciones seguidas. Espera unos minutos."
      : r?.motivo === "perfil" ? "Esa demostración no existe." : "La demostración no está disponible ahora. Intenta en un momento.";
    return json(req, r?.motivo === "limite" ? 429 : 404, { error: msg });
  }

  // Usuario interno de la demo (se crea la primera vez y se reutiliza)
  if (!r.user_id) {
    const { error: e1 } = await admin.auth.admin.createUser({ email: r.email, email_confirm: true, app_metadata: { d360_demo: perfil } });
    if (e1 && !/already|registered|exists/i.test(e1.message)) { console.error("createUser", e1.message); return json(req, 500, { error: "No pudimos preparar la demostración." }); }
  }
  const { data: link, error: e2 } = await admin.auth.admin.generateLink({ type: "magiclink", email: r.email });
  if (e2 || !link?.properties?.hashed_token || !link.user) { console.error("generateLink", e2?.message); return json(req, 500, { error: "No pudimos abrir la demostración." }); }
  if (r.user_id !== link.user.id) {
    const { error: e3 } = await admin.rpc("d360_demo_vincular", { p_miembro: r.miembro_id, p_user: link.user.id });
    if (e3) { console.error("vincular", e3.message); return json(req, 500, { error: "No pudimos preparar la demostración." }); }
  }
  return json(req, 200, { token_hash: link.properties.hashed_token, cuenta_id: r.cuenta_id, modalidad: r.modalidad });
});
