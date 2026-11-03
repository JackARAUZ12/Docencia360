// Tema de color: claro por defecto; oscuro solo si la persona lo elige.
// La elección se recuerda en este navegador. Cada página aplica el tema
// guardado en <head> (antes de pintar) para evitar parpadeos.
const CLAVE = "d360-tema";
const SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
const LUNA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>';

export const temaActual = () => (document.documentElement.dataset.theme === "dark" ? "oscuro" : "claro");

export function aplicarTema(t) {
  if (t === "oscuro") document.documentElement.dataset.theme = "dark";
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem(CLAVE, t); } catch (_) {}
  document.querySelectorAll(".b-tema").forEach(pintar);
}

function pintar(b) {
  const oscuro = temaActual() === "oscuro";
  b.innerHTML = oscuro ? SOL : LUNA;
  b.setAttribute("aria-label", oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  b.title = oscuro ? "Modo claro" : "Modo oscuro";
}

/** Botón para alternar el tema. clase extra opcional para adaptarlo a cada cabecera. */
export function botonTema(claseExtra = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "b-tema" + (claseExtra ? " " + claseExtra : "");
  b.addEventListener("click", () => aplicarTema(temaActual() === "oscuro" ? "claro" : "oscuro"));
  pintar(b);
  return b;
}
