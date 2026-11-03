// Panel de academias y centros de cursos.
// El menú cambia según el rol: dirección/administración ven todo;
// finanzas ve matrículas y cobros; un instructor ve solo sus grupos.
import { h, marca } from "../core/ui.js";
import { salir, ruta } from "../core/sesion.js";
import { ICONOS } from "../core/iconos.js";
import { crearContexto, avisoPlan, textoPlan, iniciarEnrutador } from "../core/panel.js";
import { accionMatricular, seccionMatriculasFicha, seccionEstadoCuenta } from "./matriculas.js";

const ctx = await crearContexto("academia");

// Extensiones del expediente del estudiante (módulo común)
ctx.accionesFicha = [(c, e) => (c.esGestor || c.esFinanzas) && e.estado === "activo" ? accionMatricular(c, e) : null];
ctx.seccionesFicha = [seccionMatriculasFicha, (c, e) => (c.esFinanzas && c.f("finanzas") ? seccionEstadoCuenta(c, e) : null)];

const G = ctx.esGestor, F = ctx.esFinanzas, D = ctx.esDocente;
const AREAS = [
  ["General", [
    { r: "inicio", t: "Inicio", i: "inicio", m: () => import("./inicio.js"), ver: true },
  ]],
  ["Académico", [
    { r: "estudiantes", t: "Estudiantes", i: "estudiantes", m: () => import("../comun/estudiantes.js"), ver: true },
    { r: "cursos", t: "Cursos y programas", i: "cursos", m: () => import("./cursos.js"), ver: G },
    { r: "grupos", t: D ? "Mis grupos" : "Grupos", i: "grupos", m: () => import("../comun/grupos.js"), ver: G || D },
    { r: "instructores", t: "Instructores", i: "instructores", m: () => import("./instructores.js"), ver: G },
    { r: "asistencia", t: "Asistencia", i: "asistencia", m: () => import("../comun/asistencia.js"), ver: G || D },
    { r: "calificaciones", t: "Evaluaciones", i: "notas", m: () => import("../comun/calificaciones.js"), ver: G || D },
    { r: "tareas", t: "Actividades", i: "tareas", m: () => import("../comun/tareas.js"), ver: G || D },
    { r: "calendario", t: "Calendario", i: "calendario", m: () => import("../comun/calendario.js"), ver: true },
  ]],
  ["Operación", [
    { r: "matriculas", t: "Matrículas", i: "matriculas", m: () => import("./matriculas.js"), ver: G || F },
    { r: "finanzas", t: "Finanzas", i: "finanzas", m: () => import("./finanzas.js"), ver: F },
    { r: "certificados", t: "Certificados", i: "certificados", m: () => import("./certificados.js"), ver: G },
  ]],
  ["Administración", [
    { r: "informes", t: "Informes", i: "informes", m: () => import("./informes.js"), ver: G || F },
    { r: "equipo", t: "Equipo y accesos", i: "equipo", m: () => import("./equipo.js"), ver: G },
    { r: "cuenta", t: ctx.esDueno ? "Plan y cuenta" : "Mi acceso", i: "cuenta", m: () => import("../comun/cuenta.js"), ver: true },
  ]],
];
const RUTAS = AREAS.flatMap(([, rs]) => rs.filter((x) => x.ver));

const icono = (n) => h("span", { html: ICONOS[n] });
const main = h("main.a-main", { id: "contenido", tabIndex: -1 });
const tituloRuta = h("div.ruta", "Inicio");
const ROLES = { propietario: "Propietario", director: "Dirección", subdirector: "Subdirección", coordinador: "Coordinación", administrativo: "Administración", finanzas: "Finanzas", docente: "Instructor" };

const app = h("div.a-app",
  h("div.a-velo", { onclick: () => app.classList.remove("abierto") }),
  h("nav.a-lateral", { "aria-label": "Menú principal" },
    marca(ruta("app/academia.html")),
    h("div.a-inst", h("strong", ctx.cuenta.nombre), h("span.tenue", `${ctx.cuenta.miembro_nombre} · ${ROLES[ctx.rol] || ctx.rol}`)),
    AREAS.map(([area, rs]) => {
      const vis = rs.filter((x) => x.ver);
      return vis.length ? h("div.a-grupo-nav", h("span", area), vis.map((x) =>
        h("a", { href: "#/" + x.r, dataset: { r: x.r }, onclick: () => app.classList.remove("abierto") }, icono(x.i), h("span", x.t)))) : null;
    }),
    h("div.pie", h("p.tenue", { style: "margin:0 .6rem .5rem" }, textoPlan(ctx.cuenta)),
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); salir(); } }, icono("salir"), h("span", "Salir")))),
  h("div",
    h("header.a-cabecera",
      h("button.a-menu", { type: "button", "aria-label": "Abrir menú", onclick: () => app.classList.add("abierto"), html: ICONOS.menu }),
      h("div.crece", tituloRuta, h("div.tenue", ctx.cuenta.nombre))),
    h("div", { style: "padding:1rem 16px 0;max-width:1240px" }, avisoPlan(ctx)),
    main));
document.getElementById("app").replaceChildren(app);

iniciarEnrutador(ctx, main, RUTAS, {
  alNavegar: (r) => { tituloRuta.textContent = RUTAS.find((x) => x.r === r)?.t || ""; },
});
