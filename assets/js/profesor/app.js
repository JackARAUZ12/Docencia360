// Panel del profesor independiente: estructura y navegación.
import { sb, q } from "../core/sb.js";
import { h, marca, toast, errorEn, cargando, fecha, esc } from "../core/ui.js";
import { protegerModalidad, salir, ruta } from "../core/sesion.js";
import { ICONOS } from "../core/iconos.js";

const ctx = await protegerModalidad("profesor");
ctx.id = ctx.cuenta.cuenta_id;
ctx.f = (k) => ctx.cuenta.funciones?.[k] === true;
ctx.esDueno = ctx.cuenta.rol === "propietario";

// Datos compartidos entre módulos, con caché simple que se invalida al guardar
const cache = {};
ctx.datos = {
  async grupos(forzar) {
    if (!cache.grupos || forzar) cache.grupos = await q(sb.from("grupos").select("*, asignaturas(nombre), cursos(nombre)").eq("cuenta_id", ctx.id).order("nombre"));
    return cache.grupos;
  },
  async asignaturas(forzar) {
    if (!cache.asignaturas || forzar) cache.asignaturas = await q(sb.from("asignaturas").select("*").eq("cuenta_id", ctx.id).order("nombre"));
    return cache.asignaturas;
  },
  async cursos(forzar) {
    if (!cache.cursos || forzar) cache.cursos = await q(sb.from("cursos").select("*").eq("cuenta_id", ctx.id).order("nombre"));
    return cache.cursos;
  },
  async estudiantes(forzar) {
    if (!cache.estudiantes || forzar) cache.estudiantes = await q(sb.from("estudiantes").select("*").eq("cuenta_id", ctx.id).order("apellidos").order("nombres"));
    return cache.estudiantes;
  },
  invalidar(...claves) { (claves.length ? claves : Object.keys(cache)).forEach((k) => delete cache[k]); },
};

const RUTAS = [
  { r: "inicio", t: "Inicio", i: "inicio", m: () => import("./inicio.js") },
  { r: "asistencia", t: "Asistencia", i: "asistencia", m: () => import("./asistencia.js") },
  { r: "calificaciones", t: "Calificaciones", corto: "Notas", i: "notas", m: () => import("./calificaciones.js") },
  { r: "estudiantes", t: "Estudiantes", i: "estudiantes", m: () => import("./estudiantes.js") },
  { r: "grupos", t: "Grupos y horarios", corto: "Grupos", i: "grupos", m: () => import("./grupos.js") },
  { r: "tareas", t: "Tareas", i: "tareas", m: () => import("./tareas.js") },
  { r: "cursos", t: "Asignaturas y cursos", corto: "Cursos", i: "cursos", m: () => import("./cursos.js") },
  { r: "calendario", t: "Calendario", i: "calendario", m: () => import("./calendario.js") },
  { r: "informes", t: "Informes", i: "informes", m: () => import("./informes.js") },
  { r: "cuenta", t: "Mi cuenta", i: "cuenta", m: () => import("./cuenta.js") },
];
const EN_BARRA = ["inicio", "asistencia", "calificaciones", "estudiantes"];

// ---------- Estructura ----------
const icono = (n) => h("span", { html: ICONOS[n] });
const enlace = (x) => h("a", { href: "#/" + x.r, dataset: { r: x.r } }, icono(x.i), h("span", x.t));
const main = h("main.p-main", { id: "contenido", tabIndex: -1 });
const estadoPlan = h("span");

const riel = h("nav.p-riel", { "aria-label": "Menú principal" },
  marca(ruta("app/profesor.html")),
  RUTAS.map(enlace),
  h("div.pie", estadoPlan, h("a", { href: "#", onclick: (e) => { e.preventDefault(); salir(); } }, icono("salir"), h("span", "Salir"))));

const barra = h("nav.p-barra", { "aria-label": "Menú rápido" },
  RUTAS.filter((x) => EN_BARRA.includes(x.r)).map((x) =>
    h("a", { href: "#/" + x.r, dataset: { r: x.r } }, icono(x.i), x.corto || x.t)),
  h("a", { href: "#/mas", dataset: { r: "mas" } }, icono("mas"), "Más"));

const cabecera = h("header.p-cabecera",
  marca(ruta("app/profesor.html")),
  h("div.cuenta", h("strong", ctx.cuenta.nombre), h("span.tenue", ctx.cuenta.miembro_nombre)));

const avisoPlan = h("div");
document.getElementById("app").replaceChildren(h("div.p-app", riel, h("div", cabecera, h("div", { style: "padding:0 16px;max-width:1100px" }, avisoPlan), main)), barra);

function pintarPlan() {
  const c = ctx.cuenta;
  const dias = Math.ceil((new Date(c.vence + "T00:00:00") - new Date().setHours(0, 0, 0, 0)) / 864e5);
  estadoPlan.replaceChildren(h("div.tenue", { style: "padding:0 .7rem .5rem" },
    `Plan ${c.plan_nombre}`, h("br"),
    c.estado === "prueba" ? `Prueba: ${Math.max(dias, 0)} días` : `Vence ${fecha(c.vence)}`));
  avisoPlan.replaceChildren();
  if (!c.operativa) {
    avisoPlan.append(h("div.aviso.mal", { style: "margin-top:1rem" }, h("strong", "Tu plan está vencido. "),
      "Puedes consultar tu información, pero no guardar cambios. ", h("a", { href: "#/cuenta" }, "Renovar")));
  } else if (c.estado === "vencida") {
    avisoPlan.append(h("div.aviso.ojo", { style: "margin-top:1rem" }, "Tu plan venció. Estás en período de gracia. ", h("a", { href: "#/cuenta" }, "Renovar")));
  } else if (dias <= 5) {
    avisoPlan.append(h("div.aviso.ojo", { style: "margin-top:1rem" }, c.estado === "prueba" ? `Tu prueba termina en ${Math.max(dias, 0)} días. ` : `Tu plan vence en ${dias} días. `, h("a", { href: "#/cuenta" }, "Ver opciones")));
  }
}
pintarPlan();

// ---------- Utilidades para los módulos ----------
/** Encabezado de página con acciones */
ctx.titulo = (texto, ...acciones) => h("div.p-titulo", h("h1", texto), h("div.acciones", acciones));
ctx.puedeEscribir = () => ctx.cuenta.operativa;
ctx.ir = (hash) => { location.hash = hash; };
ctx.toast = toast;

// Contenedor de vista: ignora null/false al agregar (los módulos usan condicionales)
function contenedor() {
  const v = h("div");
  v.append = (...xs) => Element.prototype.append.apply(v, xs.flat(Infinity).filter((x) => x != null && x !== false));
  return v;
}

// ---------- Router ----------
function leerHash() {
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  const [r, ...resto] = path.split("/");
  return { r: r || "inicio", partes: resto, params: new URLSearchParams(query || "") };
}

let navegacion = 0;
async function navegar() {
  const { r, partes, params } = leerHash();
  const n = ++navegacion;
  document.querySelectorAll("[data-r]").forEach((a) => { if (a.dataset.r === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (r === "mas") {
    main.replaceChildren(h("h1", "Más"), h("nav.p-mas", RUTAS.filter((x) => !EN_BARRA.includes(x.r)).map(enlace),
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); salir(); } }, icono("salir"), h("span", "Salir"))));
    document.title = "Más · Docencia360";
    return;
  }
  const def = RUTAS.find((x) => x.r === r);
  if (!def) { location.hash = "#/inicio"; return; }
  document.title = `${def.t} · Docencia360`;
  cargando(main);
  try {
    const mod = await def.m();
    if (n !== navegacion) return;
    const vista = contenedor();
    await mod.render(vista, ctx, { partes, params });
    if (n !== navegacion) return;
    main.replaceChildren(vista);
    main.focus({ preventScroll: true });
    scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (n === navegacion) errorEn(main, e, navegar);
  }
}
ctx.recargar = navegar;
addEventListener("hashchange", navegar);
navegar();
