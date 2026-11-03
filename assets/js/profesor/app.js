// Panel del profesor independiente: riel lateral en computadora y barra
// inferior en el teléfono. Sencillo a propósito.
import { h, marca } from "../core/ui.js";
import { salir, ruta } from "../core/sesion.js";
import { ICONOS } from "../core/iconos.js";
import { crearContexto, avisoPlan, textoPlan, iniciarEnrutador } from "../core/panel.js";

const ctx = await crearContexto("profesor");

const RUTAS = [
  { r: "inicio", t: "Inicio", i: "inicio", m: () => import("./inicio.js") },
  { r: "asistencia", t: "Asistencia", i: "asistencia", m: () => import("../comun/asistencia.js") },
  { r: "calificaciones", t: "Calificaciones", corto: "Notas", i: "notas", m: () => import("../comun/calificaciones.js") },
  { r: "estudiantes", t: "Estudiantes", i: "estudiantes", m: () => import("../comun/estudiantes.js") },
  { r: "grupos", t: "Grupos y horarios", corto: "Grupos", i: "grupos", m: () => import("../comun/grupos.js") },
  { r: "tareas", t: "Tareas", i: "tareas", m: () => import("../comun/tareas.js") },
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
        h("div.cuenta", h("strong", ctx.cuenta.nombre), h("span.tenue", ctx.cuenta.miembro_nombre))),
      h("div", { style: "padding:1rem 16px 0;max-width:1100px" }, avisoPlan(ctx)),
      main)),
  h("nav.p-barra", { "aria-label": "Menú rápido" },
    RUTAS.filter((x) => EN_BARRA.includes(x.r)).map((x) => h("a", { href: "#/" + x.r, dataset: { r: x.r } }, icono(x.i), x.corto || x.t)),
    h("a", { href: "#/mas", dataset: { r: "mas" } }, icono("mas"), "Más")));

iniciarEnrutador(ctx, main, RUTAS, {
  especiales: {
    mas: (m) => {
      document.title = "Más · Docencia360";
      m.replaceChildren(h("h1", "Más"), h("nav.p-mas", RUTAS.filter((x) => !EN_BARRA.includes(x.r)).map(enlace), enlaceSalir()));
    },
  },
});
