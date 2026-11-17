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
  calificaciones: "crea una evaluación (examen, tarea, proyecto) con su peso y escribe las notas. El promedio de cada estudiante se calcula solo.",
  estudiantes: "toca un nombre para ver su asistencia, sus notas y tus observaciones.",
  grupos: "un grupo es una clase. Dentro de cada grupo agregas a los estudiantes y el horario.",
  tareas: "aquí ves las tareas con fecha de entrega: quién entregó y quién falta.",
  enlinea: "crea un examen o una tarea, publícalo y compártelo con un enlace o QR. Cada estudiante entra con su código personal y la nota se calcula sola.",
  calendario: "agrega reuniones, feriados y fechas importantes. Las evaluaciones aparecen solas.",
  informes: "resumen de asistencia y promedios por grupo, listo para imprimir o compartir.",
};

const RUTAS = [
  { r: "inicio", t: "Inicio", i: "inicio", m: () => import("./inicio.js") },
  { r: "asistencia", t: "Asistencia", i: "asistencia", m: () => import("../comun/asistencia.js") },
  { r: "calificaciones", t: "Calificaciones", corto: "Notas", i: "notas", m: () => import("../comun/calificaciones.js") },
  { r: "estudiantes", t: "Estudiantes", i: "estudiantes", m: () => import("../comun/estudiantes.js") },
  { r: "grupos", t: "Grupos y horarios", corto: "Grupos", i: "grupos", m: () => import("../comun/grupos.js") },
  { r: "tareas", t: "Tareas", i: "tareas", m: () => import("../comun/tareas.js") },
  { r: "enlinea", t: "Exámenes en línea", corto: "En línea", i: "enlinea", m: () => import("../comun/enlinea.js") },
  { r: "cursos", t: "Asignaturas y cursos", corto: "Cursos", i: "cursos", m: () => import("./cursos.js") },
  { r: "calendario", t: "Calendario", i: "calendario", m: () => import("../comun/calendario.js") },
  { r: "informes", t: "Informes", i: "informes", m: () => import("./informes.js") },
  { r: "cuenta", t: "Mi cuenta", i: "cuenta", m: () => import("../comun/cuenta.js") },
];
const EN_BARRA = ["inicio", "asistencia", "calificaciones", "estudiantes"];

const icono = (n) => h("span", { html: ICONOS[n] });
const enlace = (x) => h("a", { href: "#/" + x.r, dataset: { r: x.r } }, icono(x.i), h("span", x.t));
const enlaceSalir = () => h("a", { href: "#", onclick: (e) => { e.preventDefault(); salir(); } }, icono("salir"), h("span", "Salir"));
const main = h("main.p-main", { id: "contenido", tabIndex: -1 });

document.getElementById("app").replaceChildren(
  h("div.p-app",
    h("nav.p-riel", { "aria-label": "Menú principal" },
      marca(ruta("app/profesor.html")), RUTAS.map(enlace),
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

const guia = botonGuia(ctx);
document.body.append(guia);
ctx.botonGuia = guia;

iniciarEnrutador(ctx, main, RUTAS, {
  ayudas: AYUDAS,
  alNavegar: () => guia.actualizar(),
  especiales: {
    mas: (m) => {
      document.title = "Más · Docencia360";
      m.replaceChildren(h("h1", "Más"), h("nav.p-mas", RUTAS.filter((x) => !EN_BARRA.includes(x.r)).map(enlace), enlaceSalir()));
    },
  },
});

// Primera vez: bienvenida guiada (solo el dueño, si aún no tiene grupos)
if (ctx.esDueno && !ctx.cuenta.es_demo && !ctx.guia.bienvenida) {
  ctx.datos.grupos().then((g) => { if (!g.some((x) => x.estado === "activo")) bienvenida(ctx); }).catch(() => {});
}
