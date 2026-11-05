// Panel del colegio. Menú según el rol: dirección y coordinación ven la
// institución completa; finanzas, la caja; el docente, sus secciones;
// las familias (tutores) van a su propio portal.
import { h, marca } from "../core/ui.js";
import { salir, ruta } from "../core/sesion.js";
import { ICONOS } from "../core/iconos.js";
import { botonTema } from "../core/tema.js";
import { crearContexto, avisoPlan, textoPlan, iniciarEnrutador } from "../core/panel.js";
import { seccionMatriculaColegio, seccionTutores, seccionDocumentos, fotoFicha } from "./fichas.js";
import { seccionEstadoCuenta } from "../academia/matriculas.js";

const ctx = await crearContexto("colegio");
if (ctx.rol === "tutor") { location.replace(ruta("app/familias.html")); await new Promise(() => {}); }

// Extensiones del expediente del estudiante
ctx.accionesFicha = [];
ctx.seccionesFicha = [fotoFicha, seccionMatriculaColegio, seccionTutores, seccionDocumentos,
  (c, e) => (c.esFinanzas && c.f("finanzas") ? seccionEstadoCuenta(c, e) : null)];

const G = ctx.esGestor, F = ctx.esFinanzas, D = ctx.esDocente;
const DIR = ["propietario", "director", "subdirector"].includes(ctx.rol);
const AREAS = [
  ["General", [
    { r: "inicio", t: "Inicio", i: "inicio", m: () => import("./inicio.js"), ver: true },
    { r: "comunicados", t: "Comunicados", i: "notas", m: () => import("./comunicados.js"), ver: true },
    { r: "calendario", t: "Calendario", i: "calendario", m: () => import("../comun/calendario.js"), ver: true },
  ]],
  ["Académico", [
    { r: "estudiantes", t: "Estudiantes", i: "estudiantes", m: () => import("../comun/estudiantes.js"), ver: true },
    { r: "asistencia", t: "Asistencia", i: "asistencia", m: () => import("../comun/asistencia.js"), ver: G || D },
    { r: "calificaciones", t: "Calificaciones", i: "notas", m: () => import("./calificaciones.js"), ver: G || D },
    { r: "boletines", t: "Boletines", i: "certificados", m: () => import("./boletines.js"), ver: G || D },
    { r: "horarios", t: D ? "Mi horario" : "Horarios", i: "calendario", m: () => import("./horarios.js"), ver: G || D },
  ]],
  ["Institución", [
    { r: "estructura", t: "Grados y secciones", i: "grupos", m: () => import("./estructura.js"), ver: G },
    { r: "docentes", t: "Docentes", i: "instructores", m: () => import("./docentes.js"), ver: G },
    { r: "familias", t: "Padres y tutores", i: "equipo", m: () => import("./familias.js"), ver: G },
    { r: "institucion", t: "Datos del colegio", i: "cursos", m: () => import("./institucion.js"), ver: DIR },
  ]],
  ["Administración", [
    { r: "matriculas", t: "Matrícula", i: "matriculas", m: () => import("./matriculas.js"), ver: G || F },
    { r: "finanzas", t: "Colegiaturas y pagos", i: "finanzas", m: () => import("../academia/finanzas.js"), ver: F },
    { r: "certificados", t: "Constancias", i: "certificados", m: () => import("../academia/certificados.js"), ver: G },
    { r: "informes", t: "Informes", i: "informes", m: () => import("./informes.js"), ver: G || F },
    { r: "equipo", t: "Personal y accesos", i: "equipo", m: () => import("../academia/equipo.js"), ver: G },
    { r: "cuenta", t: ctx.esDueno ? "Plan y cuenta" : "Mi acceso", i: "cuenta", m: () => import("../comun/cuenta.js"), ver: true },
  ]],
];
const RUTAS = AREAS.flatMap(([, rs]) => rs.filter((x) => x.ver));
// Rutas internas sin entrada de menú
RUTAS.push({ r: "grupos", t: "Sección", m: () => import("../comun/grupos.js") });

const icono = (n) => h("span", { html: ICONOS[n] });
const main = h("main.a-main", { id: "contenido", tabIndex: -1 });
const tituloRuta = h("div.ruta", "Inicio");
const ROLES = { propietario: "Propietario", director: "Dirección", subdirector: "Subdirección", coordinador: "Coordinación", administrativo: "Secretaría", finanzas: "Finanzas", docente: "Docente" };

const app = h("div.a-app",
  h("div.a-velo", { onclick: () => app.classList.remove("abierto") }),
  h("nav.a-lateral", { "aria-label": "Menú principal" },
    marca(ruta("app/colegio.html")),
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
      h("div.crece", tituloRuta, h("div.tenue", ctx.cuenta.nombre)), botonTema()),
    h("div", { style: "padding:1rem 16px 0;max-width:1240px" }, avisoPlan(ctx)),
    main));
document.getElementById("app").replaceChildren(app);

iniciarEnrutador(ctx, main, RUTAS, {
  alNavegar: (r) => { tituloRuta.textContent = RUTAS.find((x) => x.r === r)?.t || ""; },
});
