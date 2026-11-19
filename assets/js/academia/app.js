// Panel de academias y centros de cursos.
// El menú cambia según el rol: dirección/administración ven todo;
// finanzas ve matrículas y cobros; un instructor ve solo sus grupos.
import { h, marca } from "../core/ui.js";
import { salir, ruta } from "../core/sesion.js";
import { ICONOS } from "../core/iconos.js";
import { botonTema } from "../core/tema.js";
import { crearContexto, avisoPlan, textoPlan, iniciarEnrutador } from "../core/panel.js";
import { accionMatricular, seccionMatriculasFicha, seccionEstadoCuenta } from "./matriculas.js";
import { cargarGuia, botonGuia } from "../core/guia.js";

const ctx = await crearContexto("academia");
if (ctx.rol === "tutor") { location.replace(ruta("app/familias.html")); await new Promise(() => {}); }
await cargarGuia(ctx);

// Extensiones del expediente del estudiante (módulo común)
ctx.accionesFicha = [(c, e) => (c.esGestor || c.esFinanzas) && e.estado === "activo" ? accionMatricular(c, e) : null];
ctx.seccionesFicha = [seccionMatriculasFicha, (c, e) => (c.esFinanzas && c.f("finanzas") ? seccionEstadoCuenta(c, e) : null),
  (c, e) => (c.esGestor && c.f("portal_familias") ? import("../colegio/fichas.js").then((m) => m.seccionTutores(c, e)) : null)];

const G = ctx.esGestor, F = ctx.esFinanzas, D = ctx.esDocente;
const AREAS = [
  ["General", [
    { r: "inicio", t: "Inicio", i: "inicio", m: () => import("./inicio.js"), ver: true },
    { r: "comunicados", t: "Comunicados", i: "notas", m: () => import("../colegio/comunicados.js"), ver: G || ctx.f("comunicados") },
  ]],
  ["Académico", [
    { r: "estudiantes", t: "Estudiantes", i: "estudiantes", m: () => import("../comun/estudiantes.js"), ver: true },
    { r: "cursos", t: "Cursos y programas", i: "cursos", m: () => import("./cursos.js"), ver: G },
    { r: "grupos", t: D ? "Mis grupos" : "Grupos", i: "grupos", m: () => import("../comun/grupos.js"), ver: G || D },
    { r: "instructores", t: "Instructores", i: "instructores", m: () => import("./instructores.js"), ver: G },
    { r: "asistencia", t: "Asistencia", i: "asistencia", m: () => import("../comun/asistencia.js"), ver: G || D },
    { r: "recuperaciones", t: "Recuperaciones", i: "calendario", m: () => import("./recuperaciones.js"), ver: G || D },
    { r: "calificaciones", t: "Evaluaciones", i: "notas", m: () => import("../comun/calificaciones.js"), ver: G || D },
    { r: "tareas", t: "Actividades", i: "tareas", m: () => import("../comun/tareas.js"), ver: G || D },
    { r: "rubricas", t: "Rúbricas", i: "notas", m: () => import("../comun/rubricas.js"), ver: (G || D) && ctx.f("rubricas") },
    { r: "enlinea", t: "Exámenes en línea", i: "enlinea", m: () => import("../comun/enlinea.js"), ver: (G || D) && ctx.f("portal_estudiantes") },
    { r: "aula", t: "Aula virtual", i: "aula", m: () => import("../comun/aula.js"), ver: (G || D) && ctx.f("portal_estudiantes") },
    { r: "banco", t: "Banco de preguntas", i: "enlinea", m: () => import("../comun/banco.js"), ver: (G || D) && ctx.f("portal_estudiantes"), oculto: true },
    { r: "calendario", t: "Calendario", i: "calendario", m: () => import("../comun/calendario.js"), ver: true },
  ]],
  ["Operación", [
    { r: "interesados", t: "Interesados", i: "estudiantes", m: () => import("./interesados.js"), ver: G || F },
    { r: "matriculas", t: "Matrículas", i: "matriculas", m: () => import("./matriculas.js"), ver: G || F },
    { r: "finanzas", t: "Finanzas", i: "finanzas", m: () => import("./finanzas.js"), ver: F },
    { r: "caja", t: "Cierre de caja", i: "cobros", m: () => import("./caja.js"), ver: F && ctx.f("finanzas") },
    { r: "pagos-instructores", t: "Pagos a instructores", i: "instructores", m: () => import("./pagos_instructores.js"), ver: F && ctx.f("finanzas") },
    { r: "mis-pagos", t: "Mis pagos", i: "finanzas", m: () => import("./pagos_instructores.js"), ver: D && ctx.f("finanzas") },
    { r: "certificados", t: "Certificados", i: "certificados", m: () => import("./certificados.js"), ver: G },
  ]],
  ["Administración", [
    { r: "informes", t: "Informes", i: "informes", m: () => import("./informes.js"), ver: G || F },
    { r: "familias", t: "Familias", i: "estudiantes", m: () => import("../colegio/familias.js"), ver: G },
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
      const vis = rs.filter((x) => x.ver && !x.oculto);
      return vis.length ? h("div.a-grupo-nav", h("span", area), vis.map((x) =>
        h("a", { href: "#/" + x.r, dataset: { r: x.r }, onclick: () => app.classList.remove("abierto") }, icono(x.i), h("span", x.t)))) : null;
    }),
    h("div.pie", h("p.tenue", { style: "margin:0 .6rem .5rem" }, textoPlan(ctx.cuenta)),
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); salir(); } }, icono("salir"), h("span", "Salir")))),
  h("div",
    h("header.a-cabecera",
      h("button.a-menu", { type: "button", "aria-label": "Abrir menú", onclick: () => app.classList.add("abierto"), html: ICONOS.menu }),
      h("div.crece", tituloRuta, h("div.tenue", ctx.cuenta.nombre)), botonTema()),
    h("div.franja-panel", avisoPlan(ctx)),
    main));
document.getElementById("app").replaceChildren(app);

// Primeros pasos de la dirección (botón flotante con avance real)
const guia = botonGuia(ctx);
guia.classList.add("en-academia");
document.body.append(guia);
ctx.botonGuia = guia;

iniciarEnrutador(ctx, main, RUTAS, {
  ayudas: {
    finanzas: "aquí cobras con recibo, ves quién debe y, en «Resumen del mes», cuánto entró, cuánto se gastó y la ganancia real.",
    "pagos-instructores": "define una vez si a cada instructor le pagas por hora, por clase o salario fijo; las clases salen de las listas que se pasan.",
    enlinea: "crea exámenes y tareas en línea. Cada estudiante entra con su código y la nota se calcula sola.",
    aula: "publica avisos y materiales por grupo. Los estudiantes los ven en su aula con sus tareas, notas y pagos.",
    comunicados: "un comunicado para todos o para un grupo llega al aula de los estudiantes y al portal de familias.",
    caja: "aquí ves lo cobrado hoy por forma de pago y cajero. Al terminar el día, cuenta el efectivo y toca «Cerrar caja»: el sistema calcula si cuadra.",
    interesados: "anota a quien pregunta, agéndale una clase de prueba y matricúlalo en un paso. Comparte tu enlace de inscripción en línea en redes y WhatsApp.",
    recuperaciones: "si alguien faltó, agenda que recupere la clase en otro grupo; el instructor de ese grupo lo verá al pasar lista.",
  },
  alNavegar: (r) => { tituloRuta.textContent = RUTAS.find((x) => x.r === r)?.t || ""; guia.actualizar(); },
});
