// Selector y acceso a las cuentas de demostración (sin contraseñas:
// la Edge Function acceso-demo entrega un token de un solo uso).
import { CONFIG } from "../config.js";
import { sb, mensajeError } from "./sb.js";
import { h, modal } from "./ui.js";
import { destinoTrasLogin } from "./sesion.js";

const RESPALDO = [
  { perfil: "profesor", modalidad: "profesor", titulo: "Profesora independiente", detalle: "Clases de Matemática y Física: grupos, asistencia, notas y tareas." },
  { perfil: "academia-direccion", modalidad: "academia", titulo: "Academia · Dirección", detalle: "Ve todo: cursos, grupos, matrículas, finanzas, certificados e informes." },
  { perfil: "academia-caja", modalidad: "academia", titulo: "Academia · Caja", detalle: "Matrículas, cobros, recibos y morosidad, sin tocar notas." },
  { perfil: "academia-instructor", modalidad: "academia", titulo: "Academia · Instructor", detalle: "Solo sus grupos: pasa lista y califica." },
];

export async function entrarDemo(perfil) {
  const r = await fetch(`${CONFIG.supabaseUrl}/functions/v1/acceso-demo`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: CONFIG.supabaseKey }, body: JSON.stringify({ perfil }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "La demostración no está disponible ahora.");
  const { error } = await sb.auth.verifyOtp({ token_hash: d.token_hash, type: "magiclink" });
  if (error) throw error;
  location.replace(await destinoTrasLogin(d.cuenta_id));
}

/** Abre el selector de demostraciones. */
export async function abrirSelectorDemo() {
  let perfiles = RESPALDO;
  try {
    const { data } = await sb.from("demo_perfiles").select("perfil,modalidad,titulo,detalle,orden").order("orden");
    if (data?.length) perfiles = data;
  } catch (_) {}
  const err = h("div.aviso.mal.oculto", { role: "alert" });
  const grupo = (mod, titulo) => {
    const ps = perfiles.filter((p) => p.modalidad === mod);
    return ps.length ? h("div", { style: "margin-bottom:1rem" }, h("h3", { style: "font-size:1rem;margin-bottom:.4rem" }, titulo),
      ps.map((p) => h("button.demo-opcion", { type: "button", onclick: async (e) => {
        const b = e.currentTarget; m.el.querySelectorAll(".demo-opcion").forEach((x) => (x.disabled = true));
        b.classList.add("cargando"); err.classList.add("oculto");
        try { await entrarDemo(p.perfil); }
        catch (x) { err.textContent = mensajeError(x); err.classList.remove("oculto"); m.el.querySelectorAll(".demo-opcion").forEach((y) => (y.disabled = false)); b.classList.remove("cargando"); }
      } }, h("strong", p.titulo.replace(/^Academia · /, "")), h("span", p.detalle)))) : null;
  };
  const m = modal("Ver una demostración", h("div",
    h("p.suave", "Entra a una cuenta llena de datos de ejemplo. Puedes pasar lista, poner notas, matricular y cobrar. Los datos se reinician cada noche."),
    err,
    grupo("profesor", "Profesor independiente"),
    grupo("academia", "Academia (elige con qué rol entrar)"),
    h("div", h("h3", { style: "font-size:1rem;margin-bottom:.4rem" }, "Colegio"), h("p.tenue", "Muy pronto."))),
    [{ texto: "Cerrar", clase: "btn-sec" }]);
  setTimeout(() => m.el.querySelector(".demo-opcion")?.focus(), 30);
}
