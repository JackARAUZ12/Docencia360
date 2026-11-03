// Núcleo común de los paneles: contexto de la cuenta, caché de datos,
// avisos del plan y enrutador por hash. Cada modalidad arma su propia
// estructura visual y su propia lista de rutas encima de esto.
import { sb, q } from "./sb.js";
import { h, toast, errorEn, cargando, fecha } from "./ui.js";
import { protegerModalidad } from "./sesion.js";

const GESTORES = ["propietario", "director", "subdirector", "coordinador", "administrativo"];
const FINANZAS = ["propietario", "director", "administrativo", "finanzas"];

export async function crearContexto(modalidad) {
  const ctx = await protegerModalidad(modalidad);
  const rol = ctx.cuenta.rol;
  Object.assign(ctx, {
    id: ctx.cuenta.cuenta_id,
    modalidad,
    rol,
    f: (k) => ctx.cuenta.funciones?.[k] === true,
    esDueno: rol === "propietario",
    esGestor: GESTORES.includes(rol),
    esFinanzas: FINANZAS.includes(rol),
    esDocente: rol === "docente",
    puedeEscribir: () => ctx.cuenta.operativa,
    ir: (hash) => { location.hash = hash; },
    toast,
    titulo: (texto, ...acciones) => h("div.p-titulo", h("h1", texto), h("div.acciones", acciones)),
  });

  // Datos compartidos entre módulos, con caché que se invalida al guardar
  const cache = {};
  const cargar = (k, consulta) => async (forzar) => {
    if (!cache[k] || forzar) cache[k] = await q(consulta());
    return cache[k];
  };
  ctx.datos = {
    grupos: cargar("grupos", () => sb.from("grupos").select("*, asignaturas(nombre), cursos(nombre)").eq("cuenta_id", ctx.id).order("nombre")),
    asignaturas: cargar("asignaturas", () => sb.from("asignaturas").select("*").eq("cuenta_id", ctx.id).order("nombre")),
    cursos: cargar("cursos", () => sb.from("cursos").select("*").eq("cuenta_id", ctx.id).order("nombre")),
    estudiantes: cargar("estudiantes", () => sb.from("estudiantes").select("*").eq("cuenta_id", ctx.id).order("apellidos").order("nombres")),
    instructores: cargar("instructores", () => sb.from("miembros").select("id,nombre,especialidad,activo,telefono,email").eq("cuenta_id", ctx.id).eq("rol", "docente").order("nombre")),
    /** Grupos donde el usuario actual es docente (para limitar su vista) */
    misGrupos: cargar("misGrupos", () => sb.from("grupo_docentes").select("grupo_id").eq("miembro_id", ctx.cuenta.miembro_id)),
    invalidar(...claves) { (claves.length ? claves : Object.keys(cache)).forEach((k) => delete cache[k]); },
  };

  // Un docente solo trabaja con sus grupos
  ctx.gruposVisibles = async (forzar) => {
    const todos = await ctx.datos.grupos(forzar);
    if (!ctx.esDocente) return todos;
    const mios = new Set((await ctx.datos.misGrupos(forzar)).map((x) => x.grupo_id));
    return todos.filter((g) => mios.has(g.id));
  };
  return ctx;
}

/** Aviso de plan vencido, en gracia o por vencer. */
export function avisoPlan(ctx, rutaCuenta = "#/cuenta") {
  const c = ctx.cuenta;
  const dias = Math.ceil((new Date(c.vence + "T00:00:00") - new Date().setHours(0, 0, 0, 0)) / 864e5);
  const enlace = ctx.esDueno ? h("a", { href: rutaCuenta }, "Renovar") : null;
  if (!c.operativa) return h("div.aviso.mal", h("strong", "El plan está vencido. "), "Puedes consultar la información, pero no guardar cambios. ", enlace);
  if (c.estado === "vencida") return h("div.aviso.ojo", "El plan venció; estás en período de gracia. ", enlace);
  if (dias <= 5 && ctx.esDueno) return h("div.aviso.ojo", c.estado === "prueba" ? `La prueba termina en ${Math.max(dias, 0)} días. ` : `El plan vence en ${dias} días. `, h("a", { href: rutaCuenta }, "Ver opciones"));
  return null;
}

export function textoPlan(c) {
  const dias = Math.ceil((new Date(c.vence + "T00:00:00") - new Date().setHours(0, 0, 0, 0)) / 864e5);
  return `Plan ${c.plan_nombre} · ` + (c.estado === "prueba" ? `prueba: ${Math.max(dias, 0)} días` : `vence ${fecha(c.vence)}`);
}

/**
 * Enrutador por hash. rutas: [{r, t, m: () => import(...)}]
 * especiales: { [r]: (main) => void } para vistas sin módulo (p. ej. "mas").
 */
export function iniciarEnrutador(ctx, main, rutas, { inicio = "inicio", especiales = {}, alNavegar } = {}) {
  let n = 0;
  async function navegar() {
    const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
    const [r0, ...partes] = path.split("/");
    const r = r0 || inicio;
    const params = new URLSearchParams(query || "");
    const actual = ++n;
    document.querySelectorAll("[data-r]").forEach((a) => (a.dataset.r === r ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    alNavegar?.(r);
    if (especiales[r]) { especiales[r](main); return; }
    const def = rutas.find((x) => x.r === r);
    if (!def) { location.hash = "#/" + inicio; return; }
    document.title = `${def.t} · Docencia360`;
    cargando(main);
    try {
      const mod = await def.m();
      if (actual !== n) return;
      const vista = h("div");
      await mod.render(vista, ctx, { partes, params });
      if (actual !== n) return;
      main.replaceChildren(vista);
      main.focus({ preventScroll: true });
      scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      if (actual === n) errorEn(main, e, navegar);
    }
  }
  ctx.recargar = navegar;
  addEventListener("hashchange", navegar);
  navegar();
  return navegar;
}
