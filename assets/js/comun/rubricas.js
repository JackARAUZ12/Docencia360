// Rúbricas: criterios con niveles y puntos. Se usan al calificar en Notas
// (una evaluación puede tener rúbrica) y al revisar entregas en línea.
// La nota se calcula sola: puntos obtenidos / puntos máximos × puntaje de la evaluación.
import { sb, q } from "../core/sb.js";
import { h, modal, confirmar } from "../core/ui.js";

export const PLANTILLAS = [
  { nombre: "Exposición oral", criterios: [
    { nombre: "Dominio del tema", niveles: niv() }, { nombre: "Claridad y orden", niveles: niv() },
    { nombre: "Material de apoyo", niveles: niv() }, { nombre: "Tiempo y respuesta a preguntas", niveles: niv() }] },
  { nombre: "Proyecto o trabajo escrito", criterios: [
    { nombre: "Contenido y exactitud", niveles: niv() }, { nombre: "Organización", niveles: niv() },
    { nombre: "Ortografía y presentación", niveles: niv() }, { nombre: "Entrega a tiempo", niveles: [{ nombre: "A tiempo", puntos: 4 }, { nombre: "Tarde", puntos: 2 }, { nombre: "No entregó", puntos: 0 }] }] },
  { nombre: "Tarea en el cuaderno", criterios: [
    { nombre: "Ejercicios completos", niveles: niv() }, { nombre: "Procedimiento correcto", niveles: niv() }, { nombre: "Orden y limpieza", niveles: niv() }] },
];
function niv() { return [{ nombre: "Excelente", puntos: 4 }, { nombre: "Bueno", puntos: 3 }, { nombre: "Regular", puntos: 2 }, { nombre: "Por mejorar", puntos: 1 }]; }

export const maxRubrica = (r) => r.criterios.reduce((s, c) => s + Math.max(...c.niveles.map((n) => Number(n.puntos) || 0)), 0);

export async function cargarRubricas(ctx) {
  if (!ctx.f("rubricas")) return [];
  return q(sb.from("rubricas").select("*").eq("cuenta_id", ctx.id).order("nombre"));
}

/** Editor de una rúbrica (nueva, desde plantilla o existente). */
export function editarRubrica(ctx, r, alGuardar) {
  const base = r ? structuredClone(r) : { nombre: "", descripcion: "", criterios: [{ nombre: "", niveles: niv() }] };
  const nombre = h("input", { maxLength: 120, value: base.nombre, placeholder: "Ej.: Exposición oral", "aria-label": "Nombre de la rúbrica" });
  const lista = h("div.rub-criterios");
  const total = h("p.tenue");
  const err = h("div.aviso.mal.oculto", { role: "alert" });
  const pintar = () => {
    lista.replaceChildren(...base.criterios.map((c, i) => h("section.rub-criterio",
      h("div.rub-cab",
        h("input", { value: c.nombre, maxLength: 120, placeholder: `Criterio ${i + 1} (ej.: Claridad)`, "aria-label": `Criterio ${i + 1}`, oninput: (e) => { c.nombre = e.target.value; } }),
        base.criterios.length > 1 ? h("button.btn.btn-texto.btn-sm", { type: "button", "aria-label": "Quitar criterio", onclick: () => { base.criterios.splice(i, 1); pintar(); } }, "Quitar") : null),
      h("div.rub-niveles", c.niveles.map((n, j) => h("div.rub-nivel",
        h("input", { value: n.nombre, maxLength: 60, placeholder: "Nivel", "aria-label": `Nivel ${j + 1} de ${c.nombre || "criterio"}`, oninput: (e) => { n.nombre = e.target.value; } }),
        h("input", { type: "number", min: 0, max: 100, step: "0.5", value: n.puntos, "aria-label": "Puntos", style: "width:5rem", oninput: (e) => { n.puntos = Number(e.target.value); totalTxt(); } }),
        c.niveles.length > 2 ? h("button.btn.btn-texto.btn-sm", { type: "button", "aria-label": "Quitar nivel", onclick: () => { c.niveles.splice(j, 1); pintar(); } }, "✕") : null)),
        c.niveles.length < 6 ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => { c.niveles.push({ nombre: "", puntos: 0 }); pintar(); } }, "+ Nivel") : null))));
    totalTxt();
  };
  const totalTxt = () => { total.textContent = `Puntaje máximo de la rúbrica: ${maxRubrica(base)} puntos. Al calificar se convierte a la escala de la evaluación.`; };
  pintar();
  modal(r ? "Editar rúbrica" : "Nueva rúbrica", h("div.rub-editor", err,
    h("label.campo", h("span", "Nombre"), nombre), lista,
    base.criterios.length < 12 ? h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => { base.criterios.push({ nombre: "", niveles: niv() }); pintar(); } }, "+ Agregar criterio") : null,
    total), [
    { texto: "Cancelar", clase: "btn-sec" },
    { texto: "Guardar rúbrica", onclick: async (cerrar) => {
      err.classList.add("oculto");
      try {
        base.nombre = nombre.value.trim();
        if (base.nombre.length < 2) throw new Error("Ponle nombre a la rúbrica.");
        for (const c of base.criterios) {
          c.nombre = (c.nombre || "").trim();
          if (!c.nombre) throw new Error("Cada criterio necesita un nombre.");
          for (const n of c.niveles) { n.nombre = (n.nombre || "").trim(); n.puntos = Number(n.puntos) || 0; if (!n.nombre) throw new Error(`Ponle nombre a cada nivel de «${c.nombre}».`); }
        }
        const fila = { nombre: base.nombre, criterios: base.criterios };
        if (r?.id) await q(sb.from("rubricas").update(fila).eq("id", r.id));
        else await q(sb.from("rubricas").insert({ ...fila, cuenta_id: ctx.id }));
        cerrar(); ctx.toast("Rúbrica guardada"); alGuardar?.();
      } catch (e) { err.textContent = e.message; err.classList.remove("oculto"); }
      return false;
    } },
  ]);
}

/**
 * Calificar con rúbrica: el profesor elige un nivel por criterio.
 * Devuelve { detalle, obtenidos, maximo } o null si cancela.
 */
export function calificarConRubrica(rubrica, previo, titulo) {
  return new Promise((resolver) => {
    const elegido = {};
    for (const d of previo || []) elegido[d.criterio] = d.nivel;
    const resumen = h("p.rub-resumen");
    const calc = () => {
      let pts = 0, todos = true;
      for (const c of rubrica.criterios) { const n = c.niveles.find((x) => x.nombre === elegido[c.nombre]); if (n) pts += Number(n.puntos); else todos = false; }
      resumen.textContent = `${pts} de ${maxRubrica(rubrica)} puntos` + (todos ? "" : " · falta elegir algún criterio");
      return { pts, todos };
    };
    const cuerpo = h("div.rub-calificar", rubrica.criterios.map((c) => h("fieldset.rub-fila",
      h("legend", c.nombre),
      h("div.chips", c.niveles.map((n) => h("button.chip", { type: "button", "aria-pressed": String(elegido[c.nombre] === n.nombre), onclick: (e) => {
        elegido[c.nombre] = n.nombre;
        e.currentTarget.parentElement.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
        calc();
      } }, `${n.nombre} · ${Number(n.puntos)}`))))), resumen);
    calc();
    let listo = false;
    const m = modal(titulo || `Calificar con «${rubrica.nombre}»`, cuerpo, [
      { texto: "Cancelar", clase: "btn-sec" },
      { texto: "Aplicar", onclick: (cerrar) => {
        const { pts, todos } = calc();
        if (!todos) { resumen.classList.add("nota-baja"); return false; }
        listo = true; cerrar();
        resolver({ obtenidos: pts, maximo: maxRubrica(rubrica),
          detalle: rubrica.criterios.map((c) => { const n = c.niveles.find((x) => x.nombre === elegido[c.nombre]); return { criterio: c.nombre, nivel: n.nombre, puntos: Number(n.puntos) }; }) });
      } },
    ]);
    m.el.addEventListener("close", () => { if (!listo) resolver(null); });
  });
}

/** Pantalla de rúbricas (dentro de Notas). */
export async function render(el, ctx) {
  el.append(h("p", h("a", { href: "#/calificaciones" }, "← Notas y tareas")));
  if (!ctx.f("rubricas")) {
    el.append(ctx.titulo("Rúbricas"), h("section.hoja",
      h("p", "Califica exposiciones, proyectos y tareas con criterios claros: eliges un nivel por criterio y la nota se calcula sola. El estudiante ve el detalle en su aula."),
      h("p.suave", "Disponible en los planes Profesional y Premium."), ctx.mejora("Rúbricas")));
    return;
  }
  const rubs = await cargarRubricas(ctx);
  el.append(
    ctx.titulo("Rúbricas", h("button.btn", { onclick: () => editarRubrica(ctx, null, ctx.recargar) }, "Nueva rúbrica")),
    h("p.suave", "Asigna una rúbrica a una evaluación al crearla o editarla. Al poner notas aparece el botón «Rúbrica» junto a cada estudiante."),
    h("section.hoja", h("h2", "Empezar con una plantilla"),
      h("div.chips", PLANTILLAS.map((p) => h("button.chip", { type: "button", onclick: () => editarRubrica(ctx, { ...structuredClone(p), id: null }, ctx.recargar) }, p.nombre)))),
    h("section.hoja", h("h2", "Tus rúbricas"),
      rubs.length ? h("ul.lista", rubs.map((r) => h("li",
        h("div.crece", h("strong", r.nombre), h("div.tenue", `${r.criterios.length} criterio(s) · ${maxRubrica(r)} puntos · ${r.criterios.map((c) => c.nombre).join(", ")}`)),
        h("button.btn.btn-texto.btn-sm", { onclick: () => editarRubrica(ctx, r, ctx.recargar) }, "Editar"),
        h("button.btn.btn-texto.btn-sm", { onclick: () => editarRubrica(ctx, { ...structuredClone(r), id: null, nombre: r.nombre + " (copia)" }, ctx.recargar) }, "Duplicar"),
        h("button.btn.btn-texto.btn-sm", { onclick: async () => {
          if (!(await confirmar("Borrar rúbrica", "Las notas ya puestas se conservan. Las evaluaciones que la usaban quedan sin rúbrica.", { boton: "Borrar", peligro: true }))) return;
          try { await q(sb.from("rubricas").delete().eq("id", r.id)); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
        } }, "Borrar")))) : h("p.suave", "Todavía no tienes rúbricas. Empieza con una plantilla.")));
}
