// Panel del profesor independiente: riel lateral en computadora y barra
// inferior en el teléfono. Sencillo a propósito.
import { h, marca } from "../core/ui.js";
import { salir, ruta } from "../core/sesion.js";
import { ICONOS } from "../core/iconos.js";
import { botonTema } from "../core/tema.js";
import { crearContexto, avisoPlan, textoPlan, iniciarEnrutador } from "../core/panel.js";
import { cargarGuia, botonGuia, bienvenida } from "../core/guia.js";

const ctx = await crearContexto("profesor");
await cargarGuia(ctx);

// Consejos de una línea: aparecen la primera vez que se entra a cada sección
const AYUDAS = {
  asistencia: "elige el grupo y toca P (presente), A (ausente), T (tarde) o J (justificado). «Todos presentes» marca a todo el grupo de una vez.",
  calificaciones: "crea una evaluación (examen, tarea, proyecto) con su peso y escribe las notas. El promedio se calcula solo. Las tareas con fecha de entrega están en «Tareas y entregas».",
  estudiantes: "toca un nombre para ver su asistencia, sus notas y tus observaciones.",
  grupos: "un grupo es una clase. Dentro de cada grupo agregas a los estudiantes y el horario.",
  tareas: "aquí ves las tareas con fecha de entrega: quién entregó y quién falta.",
  enlinea: "crea un examen o una tarea, publícalo y compártelo con un enlace o QR. Cada estudiante entra con su código personal y la nota se calcula sola.",
  calendario: "agrega reuniones, feriados y fechas importantes. Las evaluaciones aparecen solas.",
  informes: "resumen de asistencia y promedios por grupo, listo para imprimir o compartir.",
  cobros: "aquí ves cuánto entró, cuánto gastaste y cuánto ganaste en el mes. Registras pagos con recibo, clases particulares, gastos y otros ingresos.",
  aula: "publica avisos y materiales (PDF, fotos o enlaces) por grupo. Tus estudiantes los ven en su aula junto con sus tareas, exámenes y notas.",
};

// Menú en tres bloques. «Tareas» vive dentro de Notas y «Asignaturas y
// cursos» dentro de Grupos: siguen existiendo, pero no ocupan el menú.
const RUTAS = [
  { r: "inicio", t: "Inicio", i: "inicio", b: "dia", m: () => import("./inicio.js") },
  { r: "asistencia", t: "Asistencia", i: "asistencia", b: "dia", m: () => import("../comun/asistencia.js") },
  { r: "calificaciones", t: "Notas y tareas", corto: "Notas", i: "notas", b: "dia", m: () => import("../comun/calificaciones.js") },
  { r: "enlinea", t: "Exámenes en línea", corto: "En línea", i: "enlinea", b: "dia", plan: "portal_estudiantes", m: () => import("../comun/enlinea.js") },
  { r: "aula", t: "Aula virtual", i: "aula", b: "dia", plan: "portal_estudiantes", m: () => import("../comun/aula.js") },
  { r: "grupos", t: "Grupos y horarios", corto: "Grupos", i: "grupos", b: "clases", m: () => import("../comun/grupos.js") },
  { r: "estudiantes", t: "Estudiantes", i: "estudiantes", b: "clases", m: () => import("../comun/estudiantes.js") },
  { r: "calendario", t: "Calendario", i: "calendario", b: "clases", m: () => import("../comun/calendario.js") },
  { r: "cobros", t: "Finanzas", i: "cobros", b: "clases", plan: "finanzas", solo: (c) => c.esFinanzas, m: () => import("./cobros.js") },
  { r: "informes", t: "Informes", i: "informes", b: "mas", m: () => import("./informes.js") },
  { r: "cuenta", t: "Mi cuenta", i: "cuenta", b: "mas", m: () => import("../comun/cuenta.js") },
  { r: "tareas", t: "Tareas", i: "tareas", padre: "calificaciones", m: () => import("../comun/tareas.js") },
  { r: "rubricas", t: "Rúbricas", i: "notas", padre: "calificaciones", m: () => import("../comun/rubricas.js") },
  { r: "banco", t: "Banco de preguntas", i: "enlinea", padre: "enlinea", m: () => import("../comun/banco.js") },
  { r: "cursos", t: "Asignaturas y cursos", i: "cursos", padre: "grupos", m: () => import("./cursos.js") },
];
const BLOQUES = [["dia", "Día a día"], ["clases", "Mis clases"], ["mas", "Más"]];
const EN_BARRA = ["inicio", "asistencia", "calificaciones", "estudiantes"];

const icono = (n) => h("span", { html: ICONOS[n] });
// Función que el plan no incluye: se ve con candado y lleva a una vista previa honesta
const bloqueada = (x) => x.plan && !ctx.f(x.plan);
const enlace = (x) => h("a", { href: "#/" + x.r, dataset: { r: x.r }, title: bloqueada(x) ? "No incluido en tu plan: toca para ver qué hace" : null },
  icono(x.i), h("span", x.t), bloqueada(x) ? h("span.candado", { html: ICONOS.candado, "aria-label": "No incluido en tu plan" }) : null);
const menuPorBloques = (filtro = () => true) => BLOQUES.map(([b, titulo]) => {
  const items = RUTAS.filter((x) => x.b === b && filtro(x) && (!x.solo || x.solo(ctx)));
  return items.length ? h("div.bloque-menu", h("p.titulo-bloque", titulo), items.map(enlace)) : null;
});
const enlaceSalir = () => h("a", { href: "#", onclick: (e) => { e.preventDefault(); salir(); } }, icono("salir"), h("span", "Salir"));
const main = h("main.p-main", { id: "contenido", tabIndex: -1 });

document.getElementById("app").replaceChildren(
  h("div.p-app",
    h("nav.p-riel", { "aria-label": "Menú principal" },
      marca(ruta("app/profesor.html")), menuPorBloques(),
      h("div.pie", h("div.tenue", { style: "padding:0 .7rem .5rem" }, textoPlan(ctx.cuenta)), enlaceSalir())),
    h("div",
      h("header.p-cabecera", marca(ruta("app/profesor.html")),
        h("div", { style: "display:flex;align-items:center;gap:.75rem;min-width:0" },
          h("div.cuenta", h("strong", ctx.cuenta.nombre), h("span.tenue", ctx.cuenta.miembro_nombre)), botonTema())),
      h("div.franja-panel", avisoPlan(ctx)),
      main)),
  h("nav.p-barra", { "aria-label": "Menú rápido" },
    RUTAS.filter((x) => EN_BARRA.includes(x.r)).map((x) => h("a", { href: "#/" + x.r, dataset: { r: x.r } }, icono(x.i), x.corto || x.t)),
    h("a", { href: "#/mas", dataset: { r: "mas" } }, icono("mas"), "Más")));

// Extensiones de la ficha del estudiante: pagos y descuento (control de pagos)
ctx.seccionesFicha = [(c, e) => (c.esFinanzas && c.f("finanzas") ? import("./cobros.js").then((m) => m.seccionPagosFicha(c, e)) : null)];
ctx.camposEstudianteExtra = ctx.f("finanzas") && ctx.esFinanzas
  ? [{ name: "descuento_pct", label: "Descuento en mensualidades (%)", type: "number", min: 0, max: 100, step: "0.5", help: "Por ejemplo, 50 para media beca. Se aplica al generar las mensualidades." },
     { name: "tarifa_clase", label: `Tarifa por clase particular (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", help: "Opcional. Se propone sola al registrar una clase de este estudiante." }] : [];

const guia = botonGuia(ctx);
document.body.append(guia);
ctx.botonGuia = guia;

iniciarEnrutador(ctx, main, RUTAS, {
  ayudas: AYUDAS,
  alNavegar: (r) => {
    // Secciones internas marcan en el menú a su sección principal
    const padre = RUTAS.find((x) => x.r === r)?.padre;
    if (padre) document.querySelectorAll(`[data-r="${padre}"]`).forEach((a) => a.setAttribute("aria-current", "page"));
    if (r !== "mas" && !EN_BARRA.includes(padre || r)) document.querySelector('.p-barra [data-r="mas"]')?.setAttribute("aria-current", "page");
    guia.actualizar();
  },
  especiales: {
    mas: (m) => {
      document.title = "Más · Docencia360";
      m.replaceChildren(h("h1", "Más"), h("nav.p-mas", menuPorBloques((x) => !EN_BARRA.includes(x.r)), h("div.bloque-menu", enlaceSalir())));
    },
  },
});

// Primera vez: bienvenida guiada (solo el dueño, si aún no tiene grupos)
if (ctx.esDueno && !ctx.cuenta.es_demo && !ctx.guia.bienvenida) {
  ctx.datos.grupos().then((g) => { if (!g.some((x) => x.estado === "activo")) bienvenida(ctx); }).catch(() => {});
}
