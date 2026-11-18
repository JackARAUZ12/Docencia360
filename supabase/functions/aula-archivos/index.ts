// =====================================================================
// DOCENCIA360 · aula-archivos
// Archivos del aula virtual del estudiante (que no tiene cuenta de correo).
// La base de datos decide si puede (d360_srv_archivo_*); esta función solo
// entrega URLs firmadas y de corta duración para subir o ver ese archivo.
//   subir     { entrega, nombre, tamano, tipo }  → { id, path, token }
//   quitar    { entrega, id }                    → { ok }
//   ver       { sesion, material? , archivo? }   → { url }
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
const texto = (v: unknown, max = 200) => String(v ?? "").slice(0, max);
const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Método no permitido" });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json(req, 400, { error: "Solicitud inválida." }); }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = admin.storage.from("d360");
  const accion = texto(b.accion, 20);

  if (accion === "subir") {
    const { data: r, error } = await admin.rpc("d360_srv_archivo_subir", {
      p_entrega_sesion: texto(b.entrega, 64), p_nombre: texto(b.nombre, 160), p_tamano: Number(b.tamano) || 0, p_tipo: texto(b.tipo, 60) });
    if (error) { console.error("subir", error.message); return json(req, 500, { error: "No pudimos preparar la subida. Intenta otra vez." }); }
    if (!r?.ok) return json(req, 400, { error: r?.error ?? "No se puede subir este archivo." });
    const { data: firmado, error: e2 } = await bucket.createSignedUploadUrl(r.path);
    if (e2 || !firmado) {
      console.error("firmar subida", e2?.message);
      await admin.rpc("d360_srv_archivo_quitar", { p_entrega_sesion: texto(b.entrega, 64), p_id: r.id });
      return json(req, 500, { error: "No pudimos preparar la subida. Intenta otra vez." });
    }
    return json(req, 200, { id: r.id, path: r.path, token: firmado.token });
  }

  if (accion === "quitar") {
    if (!UUID.test(texto(b.id, 40))) return json(req, 400, { error: "Archivo inválido." });
    const { data: r, error } = await admin.rpc("d360_srv_archivo_quitar", { p_entrega_sesion: texto(b.entrega, 64), p_id: texto(b.id, 40) });
    if (error) { console.error("quitar", error.message); return json(req, 500, { error: "No pudimos quitar el archivo." }); }
    if (!r?.ok) return json(req, 400, { error: r?.error ?? "No se pudo quitar." });
    await bucket.remove([r.path]);
    return json(req, 200, { ok: true });
  }

  if (accion === "ver") {
    const material = UUID.test(texto(b.material, 40)) ? texto(b.material, 40) : null;
    const archivo = UUID.test(texto(b.archivo, 40)) ? texto(b.archivo, 40) : null;
    const { data: r, error } = await admin.rpc("d360_srv_archivo_ver", { p_sesion: texto(b.sesion, 64), p_material: material, p_archivo: archivo });
    if (error) { console.error("ver", error.message); return json(req, 500, { error: "No pudimos abrir el archivo." }); }
    if (!r?.ok) return json(req, 403, { error: r?.error ?? "No puedes ver este archivo." });
    const { data: url, error: e2 } = await bucket.createSignedUrl(r.path, 600, { download: r.nombre });
    if (e2 || !url) return json(req, 404, { error: "El archivo ya no está disponible." });
    return json(req, 200, { url: url.signedUrl });
  }

  return json(req, 400, { error: "Acción no válida." });
});
