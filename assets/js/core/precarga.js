// Preparar el equipo para trabajar sin internet.
//
// Con internet, una copia oculta de la aplicación (en modo «solo leer») recorre en segundo
// plano todas las pantallas del menú y las de cada grupo (lista, notas, ficha…). Todo lo
// que consulta queda guardado en el equipo, así que después, sin internet, se abre todo,
// aunque la persona nunca lo haya visitado. Se repite cada 6 horas mientras haya internet.
import { PRECARGA, estado, usuarioLocal } from "./offline.js";

const CADA = 6 * 3600000;                 // se repite cada 6 horas
const MAX_PANTALLAS = 160;
const clave = (ctx) => `d360-precarga-${usuarioLocal()?.id || "anon"}-${ctx.id}`;
const leer = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

let corriendo = false;
export const precargaInfo = (ctx) => leer(clave(ctx));
const avisar = (detail) => dispatchEvent(new CustomEvent("d360:precarga", { detail }));

/** Arranca la preparación si hace falta (o si se pide «forzar»). */
export async function prepararEquipo(ctx, { forzar = false } = {}) {
  if (PRECARGA || corriendo || !estado().enLinea || navigator.onLine === false) return;
  const ultima = leer(clave(ctx));
  if (!forzar && ultima?.t && Date.now() - ultima.t < CADA) return;
  corriendo = true;
  const marco = document.createElement("iframe");
  marco.title = "Preparando el equipo"; marco.setAttribute("aria-hidden", "true"); marco.tabIndex = -1;
  Object.assign(marco.style, { position: "fixed", left: "-20000px", top: "0", width: "1366px", height: "900px", border: "0", visibility: "hidden", pointerEvents: "none" });
  const base = location.pathname.split("/").pop() || "index.html";
  marco.src = `${base}?precarga=1#/inicio`;
  document.body.append(marco);
  const hechas = [];
  try {
    await new Promise((ok) => { marco.onload = ok; setTimeout(ok, 15000); });
    const w = marco.contentWindow;
    await listo(w);
    // Pantallas del menú
    const ver = new Set(), cola = [];
    const agregar = (href, nivel) => {
      if (!href || !href.startsWith("#/") || /nuevo=1|salir|imprimir/.test(href)) return;
      const k = href.replace(/[?&]v=\d+/, "");
      if (ver.has(k) || ver.size >= MAX_PANTALLAS) return;
      ver.add(k); cola.push({ href: k, nivel });
    };
    [...w.document.querySelectorAll("nav a[href^='#/'], [data-r]")].forEach((a) => agregar(a.getAttribute("href") || (a.dataset.r ? `#/${a.dataset.r}` : ""), 0));
    agregar("#/inicio", 0);
    for (let i = 0; i < cola.length; i++) {
      if (!estado().enLinea) break;     // se fue el internet: se sigue la próxima vez
      const { href, nivel } = cola[i];
      w.location.hash = href;
      await listo(w);
      hechas.push(href);
      avisar({ hechas: hechas.length, total: cola.length });
      // Desde las pantallas del menú, también cada grupo, su lista y sus notas, etc.
      if (nivel < 1) [...w.document.querySelectorAll("main a[href^='#/']")].forEach((a) => agregar(a.getAttribute("href"), nivel + 1));
    }
    const completa = hechas.length === cola.length;
    guardar(clave(ctx), { t: Date.now(), pantallas: hechas.length, completa });
    avisar({ hechas: hechas.length, total: cola.length, fin: true, completa });
  } catch (_) {
    avisar({ fin: true, completa: false });
  } finally {
    marco.remove();
    corriendo = false;
  }
}

/** Espera a que la pantalla de la copia oculta termine de cargar sus datos. */
async function listo(w) {
  const inicio = Date.now();
  await espera(350);
  while (Date.now() - inicio < 12000) {
    const main = w.document.querySelector("main");
    if (main && !main.querySelector(".cargando, [aria-busy='true']") && main.children.length) break;
    await espera(150);
  }
  await espera(500);   // consultas que la pantalla hace después de dibujarse
}
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Revisa cada 30 minutos si toca volver a preparar el equipo. */
export function programarPrecarga(ctx) {
  if (PRECARGA) return;
  if (navigator.webdriver && !window.__D360_PRECARGA_PRUEBA) return;   // en pruebas automáticas, solo si la prueba lo pide
  setTimeout(() => prepararEquipo(ctx), 4000);
  setInterval(() => prepararEquipo(ctx), 30 * 60000);
  addEventListener("online", () => setTimeout(() => prepararEquipo(ctx), 8000));
}
