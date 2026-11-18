// =====================================================================
// DOCENCIA360 · aula-limpieza
// La llama cada noche la tarea programada «d360-limpiar-archivos» (pg_cron +
// pg_net) con una clave que solo conoce la base de datos. Quita del
// almacenamiento los archivos de entregas de más de un año y los que dejaron
// de usarse (entregas, materiales, grupos o cuentas borrados).
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  let clave = "";
  try { clave = String((await req.json())?.clave ?? "").slice(0, 100); } catch { /* vacío */ }
  if (clave.length < 20) return json(401, { error: "Sin autorización" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let borrados = 0, vencidos = 0;
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const { data: r, error } = await admin.rpc("d360_srv_limpieza", { p_clave: clave });
    if (error) return json(error.code === "42501" ? 401 : 500, { error: error.code === "42501" ? "Sin autorización" : "Error al consultar" });
    vencidos += r?.vencidos ?? 0;
    const paths: string[] = r?.paths ?? [];
    if (!paths.length) break;
    const { error: e2 } = await admin.storage.from("d360").remove(paths);
    if (e2) { console.error("remove", e2.message); break; }
    await admin.rpc("d360_srv_limpieza_hecha", { p_clave: clave, p_paths: paths });
    borrados += paths.length;
    if (paths.length < 500) break;
  }
  console.log(`limpieza: ${vencidos} vencidos, ${borrados} archivos quitados`);
  return json(200, { vencidos, borrados });
});
