// Horario por día: cada día de clase tiene su propia hora de inicio y de fin
// (por ejemplo, lunes de 4:00 a 5:30 y sábado de 8:00 a 10:00).
// Al marcar un día se copia la hora del último día marcado, así que si todos los
// días son a la misma hora sigue siendo rápido.
import { h, DIAS } from "../core/ui.js";

/**
 * Devuelve { el, valores(), error() }.
 * valores(): [{ dia, hora_inicio, hora_fin }] de los días marcados.
 * error(): texto del problema (o null si está bien).
 */
export function selectorHorario({ inicio = "16:00", fin = "17:30", diasMarcados = [] } = {}) {
  let ultimo = { ini: inicio, fin };
  const filas = [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const chk = h("input", { type: "checkbox", value: d, "aria-label": DIAS[d] });
    const ini = h("input", { type: "time", value: ultimo.ini, disabled: true, "aria-label": `${DIAS[d]}: empieza` });
    const fi = h("input", { type: "time", value: ultimo.fin, disabled: true, "aria-label": `${DIAS[d]}: termina` });
    const fila = h("div.hd-fila", h("label.hd-dia", chk, h("span", DIAS[d])), h("span.hd-horas", ini, h("span.tenue", "a"), fi));
    chk.addEventListener("change", () => {
      if (chk.checked) { ini.value = ultimo.ini; fi.value = ultimo.fin; }   // copia la hora del último día marcado
      ini.disabled = fi.disabled = !chk.checked;
      fila.classList.toggle("activa", chk.checked);
      if (chk.checked) ini.focus();
    });
    const recordar = () => { if (chk.checked && ini.value && fi.value) ultimo = { ini: ini.value, fin: fi.value }; };
    ini.addEventListener("change", recordar); fi.addEventListener("change", recordar);
    if (diasMarcados.includes(d)) { chk.checked = true; ini.disabled = fi.disabled = false; fila.classList.add("activa"); }
    return { d, chk, ini, fi, fila };
  });
  const copiar = h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => {
    const base = filas.find((f) => f.chk.checked);
    if (!base) return;
    filas.filter((f) => f.chk.checked).forEach((f) => { f.ini.value = base.ini.value; f.fi.value = base.fi.value; });
  } }, "Poner a todos la hora del primer día");
  const el = h("div.horario-dias", filas.map((f) => f.fila), h("div.hd-pie", copiar));
  const valores = () => filas.filter((f) => f.chk.checked).map((f) => ({ dia: f.d, hora_inicio: f.ini.value, hora_fin: f.fi.value }));
  const error = () => {
    const malo = valores().find((v) => !v.hora_inicio || !v.hora_fin || v.hora_fin <= v.hora_inicio);
    return malo ? `${DIAS[malo.dia]}: la hora de fin debe ser después de la de inicio.` : null;
  };
  return { el, valores, error };
}
