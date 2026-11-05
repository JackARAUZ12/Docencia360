// Páginas legales: completa titular, contacto y versión con la configuración pública.
import { sb } from "../core/sb.js";
import { marca } from "../core/ui.js";
import { botonTema } from "../core/tema.js";

document.getElementById("marca")?.append(marca("index.html"));
{ const b = botonTema(); b.style.cssText = "position:fixed;top:12px;right:12px;z-index:50"; document.body.append(b); }

const { data } = await sb.from("config_global").select("clave,valor").in("clave",
  ["publico.titular", "publico.correo_contacto", "publico.contacto_whatsapp", "publico.terminos_version"]);
const cfg = Object.fromEntries((data || []).map((c) => [c.clave.replace("publico.", ""), String(c.valor ?? "").trim()]));
const titular = cfg.titular || "el titular del servicio Docencia360";
document.querySelectorAll("[data-titular]").forEach((e) => (e.textContent = titular));
if (cfg.terminos_version) {
  const [a, m, d] = cfg.terminos_version.split("-");
  const txt = a && m && d ? new Intl.DateTimeFormat("es-NI", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(+a, +m - 1, +d))) : cfg.terminos_version;
  document.querySelectorAll("[data-version]").forEach((e) => (e.textContent = txt));
}
const contacto = [];
if (cfg.correo_contacto) contacto.push(Object.assign(document.createElement("a"), { href: `mailto:${cfg.correo_contacto}`, textContent: cfg.correo_contacto }));
const wa = (cfg.contacto_whatsapp || "").replace(/\D/g, "");
if (wa) contacto.push(Object.assign(document.createElement("a"), { href: `https://wa.me/${wa}`, textContent: `WhatsApp +${wa}`, rel: "noopener" }));
document.querySelectorAll("[data-contacto]").forEach((e) => {
  if (!contacto.length) { e.textContent = "los datos de contacto que aparecen en la página principal"; return; }
  e.replaceChildren(...contacto.flatMap((a, i) => (i ? [" o ", a.cloneNode(true)] : [a.cloneNode(true)])));
});
