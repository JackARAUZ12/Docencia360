// Primeros pasos: bienvenida guiada la primera vez, lista de pasos según el
// plan (marcados con datos reales), botón flotante con el avance y ayudas
// cortas la primera vez que se entra a cada sección.
// El avance se guarda en el servidor (d360_guia_guardar), así se respeta en
// cualquier equipo. En la demostración se guarda solo en esta pestaña.
import { sb, q, mensajeError } from "./sb.js";
import { h, modal, DIAS } from "./ui.js";
import { selectorHorario } from "../comun/horario_dias.js";

const CLAVE_DEMO = (ctx) => `d360-guia-demo-${ctx.id}`;

export async function cargarGuia(ctx) {
  ctx.guia = {};
  if (ctx.cuenta.es_demo) {
    try { ctx.guia = JSON.parse(sessionStorage.getItem(CLAVE_DEMO(ctx)) || "{}"); } catch (_) {}
  } else {
    try { ctx.guia = (await q(sb.rpc("d360_guia", { p_cuenta: ctx.id }))) || {}; } catch (_) { ctx.guia = {}; }
  }
  ctx.guiaGuardar = async (cambios) => {
    const ay = { ...(ctx.guia.ayudas || {}), ...(cambios.ayudas || {}) };
    ctx.guia = { ...ctx.guia, ...cambios, ayudas: ay };
    if (ctx.cuenta.es_demo) { try { sessionStorage.setItem(CLAVE_DEMO(ctx), JSON.stringify(ctx.guia)); } catch (_) {} return; }
    try { const srv = await q(sb.rpc("d360_guia_guardar", { p_cuenta: ctx.id, p_cambios: cambios })); if (srv && typeof srv === "object") ctx.guia = { ...ctx.guia, ...srv, ayudas: { ...(ctx.guia.ayudas || {}), ...(srv.ayudas || {}) } }; } catch (_) { /* se reintenta la próxima vez */ }
  };
  if (ctx.cuenta.es_demo) escucharDemo(ctx);
  return ctx.guia;
}

// ---------- Recorrido de la demostración ----------
// En la demo ya hay datos de ejemplo, así que los pasos NO se marcan por los datos:
// se marcan cuando la persona HACE cada paso aquí (crear un grupo, pasar lista…).
// Lo que la demo no permite (crear usuarios o códigos) se marca al abrir esa pantalla.
const DEMO_ACCION = {
  grupo: ["POST grupos"], estudiantes: ["POST estudiantes", "POST d360_importar_estudiantes", "POST grupo_estudiantes"],
  horario: ["POST horarios", "POST grupo_docentes"], lista: ["POST asistencias"], nota: ["POST evaluaciones", "POST calificaciones"],
  examen: ["POST d360_actividad_publicar"], mensual: ["POST d360_cobros_generar"], clase: ["POST d360_cobro_clase"], gasto: ["POST movimientos"],
  rubrica: ["POST rubricas"], banco: ["POST banco_preguntas", "POST d360_actividad_a_banco"],
  curso: ["POST cursos"], matricula: ["POST d360_matricular", "POST d360_interesado_matricular"], tarifa: ["POST tarifas_instructor"],
  inscripcion: ["POST d360_inscripcion_enlace"], comunicado: ["POST comunicados"],
};
// La demo no deja crear usuarios ni códigos: estos pasos se completan al ver la pantalla
const DEMO_SOLO_VER = new Set(["acceso", "aula", "asistente", "instructor", "familia", "inscripcion"]);
const RUTA_DE = (href) => (href || "").replace(/^#\/?/, "").split("?")[0];
let ultimosHref = {};   // paso → pantalla (para marcar los de «solo ver»)
function escucharDemo(ctx) {
  const marcar = (k) => { if (ctx.guia.demo?.[k]) return; ctx.guiaGuardar({ demo: { ...(ctx.guia.demo || {}), [k]: true } }); dispatchEvent(new CustomEvent("d360:cambio")); };
  addEventListener("d360:escritura", (e) => {
    const a = `${e.detail.metodo} ${e.detail.nombre}`;
    for (const [k, lista] of Object.entries(DEMO_ACCION)) if (lista.includes(a)) marcar(k);
  });
  const alVer = () => {
    const r = RUTA_DE(location.hash);
    for (const [k, href] of Object.entries(ultimosHref)) if (DEMO_SOLO_VER.has(k) && href && (r === href || r.startsWith(href + "/"))) marcar(k);
  };
  addEventListener("hashchange", () => setTimeout(alVer, 50));
}
/** En la demo: los pasos se marcan por lo que la persona hizo aquí, no por los datos de ejemplo. */
function pasosDemo(ctx, res) {
  if (!ctx.cuenta.es_demo) return res;
  const hecho = ctx.guia.demo || {};
  for (const p of res.pasos) {
    if (p.k !== "cobro") p.hecho = !!hecho[p.k];
    if (DEMO_SOLO_VER.has(p.k)) { ultimosHref[p.k] = RUTA_DE(p.href); if (!p.hecho) { p.b = "Ver cómo es"; p.d += " En la demo solo se mira: se marca al abrir la pantalla."; } }
  }
  res.hechos = res.pasos.filter((p) => p.hecho).length;
  res.completa = res.pasos.every((p) => p.hecho);
  return res;
}

/** Ayuda de una línea que aparece solo la primera vez en una sección. */
export function ayuda(ctx, clave, texto) {
  if (!texto || ctx.guia?.ayudas?.[clave]) return null;
  const caja = h("div.aviso.info.ayuda-primera", { role: "note" },
    h("span", h("strong", "Consejo: "), texto),
    h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => { caja.remove(); ctx.guiaGuardar({ ayudas: { [clave]: true } }); } }, "Entendido"));
  return caja;
}

const existe = async (consulta) => ((await consulta).data || []).length > 0;

/** Pasos de la guía del profesor, según su plan, marcados con datos reales. */
export async function pasosProfesor(ctx) {
  const c = ctx.id;
  const uno = (t, col = "id") => sb.from(t).select(col).eq("cuenta_id", c).limit(1);
  const [grupos, est, hor, lista, ev, acceso, publicada, asistente] = await Promise.all([
    q(sb.from("grupos").select("id").eq("cuenta_id", c).eq("estado", "activo").order("creado").limit(1)),
    existe(uno("estudiantes").eq("estado", "activo")),
    existe(uno("horarios")),
    existe(uno("asistencias")),
    existe(uno("evaluaciones")),
    ctx.f("portal_estudiantes") ? existe(uno("estudiantes_acceso", "estudiante_id").eq("activo", true)) : false,
    ctx.f("portal_estudiantes") ? existe(uno("actividades").neq("estado", "borrador")) : false,
    ctx.f("asistentes") ? existe(uno("miembros").eq("rol", "docente")) : false,
  ]);
  const fin = ctx.f("finanzas") && ctx.esFinanzas;
  const [mensual, clase, gasto, rubrica, banco] = await Promise.all([
    fin ? existe(uno("cargos").eq("tipo", "mensualidad")) : false,
    fin ? existe(uno("cargos").eq("tipo", "clase")) : false,
    fin ? existe(uno("movimientos")) : false,
    ctx.f("rubricas") ? existe(uno("rubricas")) : false,
    ctx.f("banco_preguntas") ? existe(uno("banco_preguntas")) : false,
  ]);
  const extra = { mensual, clase, gasto, rubrica, banco };
  const g1 = grupos[0]?.id;
  const pasos = [
    { k: "grupo", hecho: !!g1, t: "Crea tu primer grupo", d: "Un grupo es una clase: reúne a los estudiantes que ves juntos.", href: "#/grupos?nuevo=1", b: "Crear grupo" },
    { k: "estudiantes", hecho: est, t: "Agrega a tus estudiantes", d: "Escribe la lista, pégala o súbela desde Excel.", href: g1 ? `#/grupos/${g1}` : "#/estudiantes", b: "Agregar" },
    { k: "horario", hecho: hor, t: "Ponle horario al grupo", d: "Así Inicio te avisa a qué grupo pasar lista cada día.", href: g1 ? `#/grupos/${g1}` : "#/grupos", b: "Poner horario" },
    { k: "lista", hecho: lista, t: "Pasa tu primera lista", d: "Toca P, A, T o J por estudiante, o marca a todos presentes.", href: g1 ? `#/asistencia?grupo=${g1}` : "#/asistencia", b: "Pasar lista" },
    { k: "nota", hecho: ev, t: "Crea una evaluación y pon notas", d: "El promedio de cada estudiante se calcula solo.", href: "#/calificaciones?nuevo=1", b: "Crear evaluación" },
  ];
  if (ctx.f("portal_estudiantes")) {
    pasos.push(
      { k: "acceso", hecho: acceso, t: "Da acceso en línea a tus estudiantes", d: "Cada uno recibe un código personal para entrar a exámenes y tareas.", href: "#/enlinea/accesos", b: "Dar acceso" },
      { k: "examen", hecho: publicada, t: "Publica tu primer examen en línea", d: "Compártelo con un enlace o QR; la nota se calcula sola.", href: "#/enlinea?nueva=1", b: "Crear examen" });
  }
  if (ctx.f("asistentes")) {
    pasos.push({ k: "asistente", hecho: asistente, t: "Invita a tu asistente", d: "Tendrá su propio acceso y verá solo los grupos que le asignes.", href: "#/cuenta", b: "Invitar", opcional: true });
  }
  // Finanzas: solo lo que aplica según cómo cobra (un profesor de colegio puede no cobrar)
  if (ctx.f("finanzas") && ctx.esFinanzas) {
    const forma = ctx.guia?.cobro;
    if (!forma) pasos.push({ k: "cobro", hecho: false, t: "Cuéntanos cómo cobras", d: "Por mes, por clase o no cobras: así Finanzas te muestra solo lo que te sirve.", href: "#/cobros", b: "Elegir", opcional: true });
    else {
      if (["mensual", "ambos"].includes(forma)) pasos.push({ k: "mensual", hecho: extra.mensual, t: "Pon la mensualidad y genera los cobros del mes", d: "En Finanzas → Mensualidades, y luego «Generar mensualidades».", href: "#/cobros?vista=mensualidades", b: "Ir", opcional: true });
      if (["clase", "ambos"].includes(forma)) pasos.push({ k: "clase", hecho: extra.clase, t: "Registra tu primera clase particular", d: "Si ya te pagó, queda con su recibo; si no, aparece en «Quién debe».", href: "#/cobros?vista=clases", b: "Registrar", opcional: true });
      pasos.push({ k: "gasto", hecho: extra.gasto, t: "Anota un gasto de tus clases", d: "Fotocopias, materiales, transporte… y verás tu ganancia real del mes.", href: "#/cobros?vista=movimientos", b: "Anotar", opcional: true });
    }
  }
  if (ctx.f("rubricas")) pasos.push({ k: "rubrica", hecho: extra.rubrica, t: "Crea tu primera rúbrica", d: "Empieza con una plantilla y califica exposiciones o proyectos eligiendo niveles.", href: "#/rubricas", b: "Crear", opcional: true });
  if (ctx.f("banco_preguntas")) pasos.push({ k: "banco", hecho: extra.banco, t: "Guarda preguntas en tu banco", d: "Desde un examen, «Guardar en el banco», para reusarlas en otros.", href: "#/banco", b: "Ver banco", opcional: true });
  const obligatorios = pasos.filter((p) => !p.opcional);
  // La guía sigue visible hasta completar TODOS los pasos (también los opcionales).
  return pasosDemo(ctx, { pasos, hechos: pasos.filter((p) => p.hecho).length, grupo: g1, obligatorios: obligatorios.every((p) => p.hecho), completa: pasos.every((p) => p.hecho) });
}

/** Pasos de la guía de la academia (dirección): de cero a la primera clase con lista y cobros. */
export async function pasosAcademia(ctx) {
  const c = ctx.id;
  const uno = (t, col = "id") => sb.from(t).select(col).eq("cuenta_id", c).limit(1);
  const fin = ctx.f("finanzas") && ctx.esFinanzas;
  const [cursos, inst, grupos, hor, asig, est, mat, lista, tarifa, gasto, acceso, comunicado, familia, insc] = await Promise.all([
    existe(uno("cursos")),
    existe(uno("miembros").eq("rol", "docente")),
    q(sb.from("grupos").select("id").eq("cuenta_id", c).eq("estado", "activo").order("creado").limit(1)),
    existe(uno("horarios")),
    existe(uno("grupo_docentes")),
    existe(uno("estudiantes").eq("estado", "activo")),
    existe(uno("matriculas")),
    existe(uno("asistencias")),
    fin ? existe(uno("tarifas_instructor")) : false,
    fin ? existe(uno("movimientos").is("miembro_id", null)) : false,
    ctx.f("portal_estudiantes") ? existe(uno("estudiantes_acceso", "estudiante_id").eq("activo", true)) : false,
    ctx.f("comunicados") ? existe(uno("comunicados")) : false,
    ctx.f("portal_familias") ? existe(uno("miembros").eq("rol", "tutor")) : false,
    existe(sb.from("inscripcion_publica").select("cuenta_id").eq("cuenta_id", c).eq("activo", true).limit(1)),
  ]);
  const g1 = grupos[0]?.id;
  const pasos = [
    { k: "curso", hecho: cursos, t: "Registra tus cursos", d: "Con su precio de matrícula, mensualidad y duración.", href: "#/cursos", b: "Ir a cursos" },
    { k: "instructor", hecho: inst, t: "Registra a tus instructores", d: "Cada uno recibe su código y ve solo sus grupos.", href: "#/instructores", b: "Registrar" },
    { k: "grupo", hecho: !!g1, t: "Abre tu primer grupo", d: "Un grupo es un curso en un horario: «Inglés A1 · sábado».", href: "#/grupos?nuevo=1", b: "Abrir grupo" },
    { k: "horario", hecho: hor && asig, t: "Ponle horario e instructor al grupo", d: "Así se sabe quién da cada clase y se calculan sus horas.", href: g1 ? `#/grupos/${g1}` : "#/grupos", b: "Completar" },
    { k: "estudiantes", hecho: est, t: "Registra a tus estudiantes", d: "Uno por uno, pegando una lista o con la plantilla de Excel.", href: "#/estudiantes", b: "Agregar" },
    { k: "matricula", hecho: mat, t: "Matricula a un estudiante", d: "La matrícula y las mensualidades se generan solas, con recibo al cobrar.", href: "#/matriculas", b: "Matricular" },
    { k: "lista", hecho: lista, t: "Pasa la primera lista", d: "Tú o el instructor. Con la lista se cuentan las clases dadas.", href: g1 ? `#/asistencia?grupo=${g1}` : "#/asistencia", b: "Pasar lista" },
  ];
  if (fin) pasos.push(
    { k: "tarifa", hecho: tarifa, t: "Define cómo le pagas a cada instructor", d: "Por hora, por clase o salario fijo: el pago del mes se calcula solo.", href: "#/pagos-instructores", b: "Definir", opcional: true },
    { k: "gasto", hecho: gasto, t: "Anota tus gastos fijos", d: "Alquiler, luz, internet, publicidad… y verás la ganancia real del mes.", href: "#/finanzas?vista=gastos", b: "Anotar", opcional: true });
  pasos.push({ k: "inscripcion", hecho: insc, t: "Comparte tu enlace de inscripción", d: "Quien lo llene aparece en «Interesados» y te llega un aviso.", href: "#/interesados", b: "Ver enlace", opcional: true });
  if (ctx.f("portal_estudiantes")) pasos.push({ k: "aula", hecho: acceso, t: "Abre el aula virtual a tus estudiantes", d: "Cada uno recibe su código para ver tareas, exámenes, notas y pagos.", href: "#/enlinea/accesos", b: "Dar acceso", opcional: true });
  if (ctx.f("comunicados")) pasos.push({ k: "comunicado", hecho: comunicado, t: "Publica tu primer comunicado", d: "Llega al aula de los estudiantes, a las familias o solo a instructores.", href: "#/comunicados", b: "Publicar", opcional: true });
  if (ctx.f("portal_familias")) pasos.push({ k: "familia", hecho: familia, t: "Da acceso a una familia", d: "Desde la ficha del estudiante: «Padres y tutores» → «Agregar».", href: "#/estudiantes", b: "Ir", opcional: true });
  const obligatorios = pasos.filter((p) => !p.opcional);
  return pasosDemo(ctx, { pasos, hechos: pasos.filter((p) => p.hecho).length, grupo: g1, obligatorios: obligatorios.every((p) => p.hecho), completa: pasos.every((p) => p.hecho) });
}
const pasosDe = (ctx) => (ctx.modalidad === "academia" ? pasosAcademia(ctx) : pasosProfesor(ctx));

/** Lista de pasos (se usa en Inicio y en el panel del botón flotante). */
export function listaPasos({ pasos, hechos }, alElegir) {
  const siguiente = pasos.findIndex((p) => !p.hecho);
  return h("div",
    h("div.barra-progreso", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": pasos.length, "aria-valuenow": hechos, "aria-label": "Avance de los primeros pasos" },
      h("span", { style: `width:${(hechos / pasos.length) * 100}%` })),
    h("ol.pasos-guia", pasos.map((p, i) => h("li" + (p.hecho ? ".hecho" : ""),
      h("span.num", p.hecho ? "✓" : String(i + 1)),
      h("div.crece", h("div.titulo", p.t, p.opcional && !p.hecho ? h("span.tenue", " (opcional)") : null), p.hecho ? null : h("div.tenue", p.d)),
      p.hecho ? null : h("a.btn.btn-sm" + (i === siguiente ? "" : ".btn-sec"), { href: p.href, onclick: () => alElegir?.() }, p.b)))));
}

/** Botón flotante «Primeros pasos» con su avance. Se oculta al terminar o si el usuario lo oculta. */
export function botonGuia(ctx) {
  const btn = h("button.guia-flotante", { type: "button", "aria-haspopup": "dialog" });
  btn.hidden = true;
  let ultimo = null, abierta = null, previos = null;
  const abrir = () => {
    if (!ultimo) return;
    const lista = h("div.guia-lista-viva", listaPasos(ultimo, cerrarDialogo));
    const m = modal(`Primeros pasos · ${ultimo.hechos} de ${ultimo.pasos.length}`, h("div",
      h("p.suave", ctx.cuenta.es_demo ? "Así empieza una cuenta nueva. Haz cada paso aquí, con datos de prueba: se marcan solos cuando los haces. Todo se borra cada noche."
        : "Sigue estos pasos para dejar lista tu cuenta. Se marcan solos cuando los haces."),
      lista,
      h("div", { style: "display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem" },
        ctx.modalidad === "profesor" ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => { cerrarDialogo(); bienvenida(ctx, { forzar: true }); } }, "Ver la bienvenida otra vez") : null,
        h("button.btn.btn-texto.btn-sm", { type: "button", onclick: async () => { await ctx.guiaGuardar({ oculta: true }); cerrarDialogo(); btn.hidden = true; ctx.toast("Guía oculta. Puedes volver a verla en Mi cuenta."); } }, "Ocultar la guía"))),
      [{ texto: "Cerrar", clase: "btn-sec" }]);
    abierta = { lista, titulo: m.el?.querySelector(".modal-cab h2") };
  };
  btn.addEventListener("click", abrir);
  let corriendo = false, otraVez = false;
  btn.actualizar = async () => {
    if (!ctx.esDueno || ctx.guia?.oculta) { btn.hidden = true; return; }
    if (corriendo) { otraVez = true; return; }   // una sola revisión a la vez
    corriendo = true;
    try { ultimo = await pasosDe(ctx); } catch (_) { corriendo = false; return; }
    corriendo = false;
    const { hechos, pasos } = ultimo;
    // Avisa qué paso se acaba de completar (no la primera vez que se revisa)
    const ahora = new Set(pasos.filter((p) => p.hecho).map((p) => p.k));
    // Si una acción completa varios pasos a la vez, se nombran todos
    if (previos && !(hechos >= pasos.length || ultimo.completa)) {
      const nuevos = pasos.filter((p) => p.hecho && !previos.has(p.k)).map((p) => p.t);
      if (nuevos.length === 1) ctx.toast(`✓ Paso completado: ${nuevos[0]}`);
      else if (nuevos.length > 1) ctx.toast(`✓ ${nuevos.length} pasos completados: ${nuevos.slice(0, -1).join(", ")} y ${nuevos.at(-1)}`);
    }
    previos = ahora;
    // La lista abierta y los paneles de Inicio se actualizan en el momento
    if (abierta?.lista.isConnected) { abierta.lista.replaceChildren(listaPasos(ultimo, cerrarDialogo)); if (abierta.titulo) abierta.titulo.textContent = `Primeros pasos · ${hechos} de ${pasos.length}`; }
    dispatchEvent(new CustomEvent("d360:guia", { detail: ultimo }));
    if (otraVez) { otraVez = false; setTimeout(btn.actualizar, 50); }
    if (hechos >= pasos.length || ultimo.completa) {
      btn.hidden = true;
      if (!ctx.guia.completa) { ctx.guiaGuardar({ completa: true }); ctx.toast(ctx.cuenta.es_demo ? "¡Terminaste el recorrido! Así de fácil es. Crea tu cuenta para empezar con tus datos." : "¡Completaste los primeros pasos! Tu cuenta está lista."); }
      return;
    }
    btn.replaceChildren(
      h("span.anillo", { style: `--avance:${Math.round((hechos / pasos.length) * 100)}`, "aria-hidden": "true" }, h("b", `${hechos}/${pasos.length}`)),
      h("span", "Primeros pasos"));
    btn.setAttribute("aria-label", `Primeros pasos: ${hechos} de ${pasos.length} completados`);
    btn.hidden = false;
  };
  // Cada vez que algo se guarda, se revisan los pasos (sin esperar a cambiar de pantalla)
  let t; addEventListener("d360:cambio", () => { clearTimeout(t); t = setTimeout(btn.actualizar, 400); });
  return btn;
}

/** Vuelve a pintar un panel de pasos cada vez que la guía se actualiza (mientras siga en pantalla). */
export function alActualizarGuia(nodo, fn) {
  const oir = (e) => { if (!nodo.isConnected) { removeEventListener("d360:guia", oir); return; } fn(e.detail); };
  addEventListener("d360:guia", oir);
}
/** Nota de la demostración al inicio de la bienvenida. */
export function avisoDemo() {
  return h("div.aviso.info", { style: "margin:0 0 1rem" }, h("strong", "Estás en la demostración. "),
    "Esto es lo mismo que verás al crear tu cuenta. Hazlo con datos de prueba (se borran cada noche) o toca «Saltar por ahora» para explorar.");
}
function cerrarDialogo() { document.querySelectorAll("dialog.modal").forEach((d) => { d.close(); d.remove(); }); }

/**
 * Bienvenida guiada: qué enseñas → tu primer grupo con horario → tus
 * estudiantes → listo. Todo se guarda de verdad en cada paso.
 */
export async function bienvenida(ctx, { forzar = false } = {}) {
  if (!ctx.esDueno || (!forzar && ctx.guia?.bienvenida)) return;
  const nombre = ctx.cuenta.es_demo ? "" : (ctx.cuenta.miembro_nombre || "").split(" ")[0];
  const estado = { grupo: null, grupoNombre: "", agregados: 0 };
  const dlg = h("dialog.modal.bienvenida", { "aria-labelledby": "bv-titulo" });
  const cuerpo = h("div.bv-cuerpo");
  const puntos = h("ol.bv-puntos", { "aria-hidden": "true" }, [1, 2, 3, 4].map(() => h("li")));
  dlg.append(h("div.bv-cabeza", puntos, h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => salir("omitida") }, "Saltar por ahora")), cuerpo);
  document.body.append(dlg);
  dlg.showModal();
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); salir("omitida"); });

  const salir = async (como) => {
    dlg.close(); dlg.remove();
    if (!ctx.guia?.bienvenida || como === "hecha") await ctx.guiaGuardar({ bienvenida: como });
    ctx.datos.invalidar();
    if (como === "omitida") ctx.toast("Puedes seguir los primeros pasos desde el botón de abajo.");
    ctx.recargar();
  };
  const marcar = (n) => [...puntos.children].forEach((li, i) => li.classList.toggle("activo", i <= n));
  const error = () => h("div.aviso.mal.oculto", { role: "alert" });
  const mostrarError = (caja, e) => { caja.textContent = mensajeError(e); caja.classList.remove("oculto"); };

  // Paso 1 · qué enseñas
  const paso1 = () => {
    marcar(0);
    const asig = h("input", { name: "asig", required: true, maxLength: 100, placeholder: "Ej.: Matemática", autocomplete: "off" });
    const nivel = h("input", { name: "nivel", maxLength: 60, placeholder: "Ej.: 9no grado, Inglés A1, Preuniversitario" });
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, `¡Bienvenido${nombre ? ", " + nombre : ""}!`),
      ctx.cuenta.es_demo ? avisoDemo() : null,
      h("p.suave", "En 3 pasos cortos dejamos lista tu primera clase. Todo lo puedes cambiar después."),
      h("form.bv-form", { onsubmit: (e) => { e.preventDefault(); if (!asig.value.trim()) return asig.focus(); paso2(asig.value.trim(), nivel.value.trim()); } },
        h("label.campo", h("span", "¿Qué enseñas?"), asig),
        h("label.campo", h("span", "¿A qué nivel o grupo? (opcional)"), nivel),
        h("div.bv-pie", h("button.btn", { type: "submit" }, "Continuar"))));
    asig.focus();
  };

  // Paso 2 · primer grupo con horario
  const paso2 = (asignatura, nivel) => {
    marcar(1);
    const nom = h("input", { required: true, maxLength: 100, value: [asignatura, nivel].filter(Boolean).join(" · ") });
    const horario = selectorHorario({ inicio: "16:00", fin: "17:30" });   // cada día con su propia hora
    const err = error();
    const btn = h("button.btn", { type: "submit" }, "Crear mi grupo");
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "Tu primer grupo"),
      h("p.suave", "Un grupo es una clase: los estudiantes que ves juntos. Elige los días y la hora para que Inicio te avise cuándo pasar lista."),
      h("form.bv-form", { onsubmit: async (e) => {
        e.preventDefault();
        const dias = horario.valores();
        if (!nom.value.trim()) return nom.focus();
        if (horario.error()) return mostrarError(err, new Error(horario.error()));
        btn.disabled = true; err.classList.add("oculto");
        try {
          const asigs = await ctx.datos.asignaturas(true);
          const ex = asigs.find((a) => a.nombre.toLowerCase() === asignatura.toLowerCase());
          const asigId = ex ? ex.id : (await q(sb.from("asignaturas").insert({ cuenta_id: ctx.id, nombre: asignatura }).select("id").single())).id;
          const g = await q(sb.from("grupos").insert({ cuenta_id: ctx.id, nombre: nom.value.trim(), asignatura_id: asigId, estado: "activo" }).select("id,nombre").single());
          estado.grupo = g.id; estado.grupoNombre = g.nombre;
          if (dias.length) {
            await q(sb.from("horarios").insert(dias.map((v) => ({ cuenta_id: ctx.id, grupo_id: g.id, miembro_id: ctx.cuenta.miembro_id, ...v }))));
          }
          ctx.datos.invalidar("grupos", "asignaturas");
          paso3();
        } catch (ex) { mostrarError(err, ex); btn.disabled = false; }
      } },
        h("label.campo", h("span", "Nombre del grupo"), nom),
        h("fieldset.campo", h("legend", "Días y horas de clase (opcional) · cada día puede tener su propia hora"), horario.el),
        err,
        h("div.bv-pie", h("button.btn.btn-sec", { type: "button", onclick: paso1 }, "Atrás"), btn)));
    nom.focus();
  };

  // Paso 3 · estudiantes: primero se elige cómo; cada camino va paso a paso
  const enviarFilas = async (filas, err, btn) => {
    btn.disabled = true; err.classList.add("oculto");
    try {
      const r = await q(sb.rpc("d360_importar_estudiantes", { p_cuenta: ctx.id, p_filas: filas, p_grupo: estado.grupo }));
      estado.agregados = r.inscritos ?? r.creados ?? 0;
      ctx.datos.invalidar("estudiantes");
      paso4(r.omitidos || []);
    } catch (ex) { mostrarError(err, ex); btn.disabled = false; }
  };
  const opcion = (titulo, detalle, accion, extra = "") => h("button.bv-opcion" + extra, { type: "button", onclick: accion },
    h("strong", titulo), h("span.tenue", detalle));

  const paso3 = () => {
    marcar(2);
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "Tus estudiantes"),
      h("p.suave", `¿Cómo quieres agregarlos a «${estado.grupoNombre}»? Elige una opción.`),
      h("div.bv-opciones",
        opcion("Escribir o pegar la lista", "Lo más rápido si son pocos: un nombre por línea, desde WhatsApp o Word.", paso3Lista),
        opcion("Con una plantilla de Excel", "Para listas largas: descargas la plantilla, la llenas y la subes.", () => paso3Excel())),
      h("div.bv-pie",
        h("button.btn.btn-sec", { type: "button", onclick: () => paso4([]) }, "Saltar: lo hago después")));
  };

  // 3A · escribir o pegar
  const paso3Lista = () => {
    const area = h("textarea", { rows: 7, placeholder: "Ana Sofía López\nCarlos Pérez Ruiz\nMaría José Gutiérrez", "aria-describedby": "bv-ayuda-lista" });
    const cuenta = h("span.tenue", "0 estudiantes");
    const lineas = () => area.value.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 1);
    area.addEventListener("input", () => { const n = lineas().length; cuenta.textContent = `${n} estudiante${n === 1 ? "" : "s"}`; });
    const err = error();
    const btn = h("button.btn", { type: "submit" }, "Agregar al grupo");
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "Escribe o pega la lista"),
      h("p.suave", "Un nombre por línea: nombres y luego apellidos."),
      h("form.bv-form", { onsubmit: async (e) => {
        e.preventDefault();
        const { separarNombre } = await import("../comun/importar.js");
        const filas = lineas().map((l, i) => ({ ...separarNombre(l), _fila: i + 1 }));
        if (!filas.length) return area.focus();
        enviarFilas(filas, err, btn);
      } },
        h("label.campo", h("span", "Lista de estudiantes"), area),
        h("p.tenue", { id: "bv-ayuda-lista" }, "También sirve «Apellidos, Nombres». ", cuenta),
        err,
        h("div.bv-pie", h("button.btn.btn-sec", { type: "button", onclick: paso3 }, "Atrás"), btn)));
    area.focus();
  };

  // 3B · plantilla de Excel: 1 descargar, 2 llenar, 3 subir
  const paso3Excel = () => {
    const err = error();
    const btn = h("button.btn", { type: "button", disabled: true }, "Agregar al grupo");
    const resumen = h("div.bv-archivo", { "aria-live": "polite" });
    const marcaPaso = (li) => li.classList.add("hecho");
    const p1 = h("li", h("span.num", "1"), h("div.crece", h("strong", "Descarga la plantilla"), h("div.tenue", "Es un archivo de Excel con las columnas listas."),
      h("button.btn.btn-sec.btn-sm", { type: "button", style: "margin-top:.4rem", onclick: async () => {
        (await import("../comun/importar.js")).plantillaExcel(); marcaPaso(p1); } }, "Descargar plantilla")));
    const p2 = h("li", h("span.num", "2"), h("div.crece", h("strong", "Llénala"), h("div.tenue", "Ábrela en Excel o Google Sheets y escribe un estudiante por fila. Solo «Nombres» es obligatorio. Guarda el archivo.")));
    const archivo = h("input", { type: "file", accept: ".xlsx,.csv,.txt", "aria-label": "Plantilla llena" });
    let filasListas = [];
    archivo.addEventListener("change", async () => {
      const f = archivo.files?.[0]; if (!f) return;
      err.classList.add("oculto"); btn.disabled = true; resumen.replaceChildren(h("p.tenue", "Leyendo el archivo…"));
      try {
        const [{ leerHoja }, imp] = await Promise.all([import("./hoja.js"), import("../comun/importar.js")]);
        const filas = await leerHoja(f);
        const mapa = imp.reconocer((filas[0] || []).map((v) => String(v ?? "")));
        if (mapa.nombres == null && mapa.nombre_completo == null) throw new Error("No encontramos la columna «Nombres». Usa la plantilla sin cambiar los títulos de la fila 1.");
        const revisadas = imp.preparar(filas, mapa).filter((x) => Object.values(x.reg).some((v, i) => i > 0 && v));
        const buenas = revisadas.filter((x) => !x.errores.length);
        const malas = revisadas.filter((x) => x.errores.length);
        if (!buenas.length) throw new Error("La plantilla no tiene estudiantes. Escribe al menos un nombre desde la fila 2.");
        if (buenas.length > 500) throw new Error("Sube como máximo 500 estudiantes a la vez.");
        filasListas = buenas.map((x) => x.reg);
        marcaPaso(p1); marcaPaso(p2); marcaPaso(p3);
        resumen.replaceChildren(
          h("p", h("strong", `${buenas.length} estudiante${buenas.length === 1 ? "" : "s"} listo${buenas.length === 1 ? "" : "s"} para agregar.`)),
          malas.length ? h("p.tenue", `${malas.length} fila(s) se omitirán: ` + malas.slice(0, 3).map((x) => `fila ${x.reg._fila} (${x.errores.join(", ")})`).join("; ")) : null);
        btn.disabled = false;
      } catch (ex) { resumen.replaceChildren(); mostrarError(err, ex); archivo.value = ""; }
    });
    const p3 = h("li", h("span.num", "3"), h("div.crece", h("strong", "Súbela"), h("div.tenue", "Elige el archivo que guardaste."), archivo, resumen));
    btn.addEventListener("click", () => filasListas.length && enviarFilas(filasListas, err, btn));
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "Con una plantilla de Excel"),
      h("p.suave", "Sigue estos tres pasos. Puedes volver cuando quieras."),
      h("ol.pasos-guia.bv-excel", p1, p2, p3),
      err,
      h("div.bv-pie",
        h("button.btn.btn-sec", { type: "button", onclick: paso3 }, "Atrás"),
        h("button.btn.btn-texto", { type: "button", onclick: () => paso4([]) }, "Saltar por ahora"),
        btn));
  };

  // Paso 4 · listo
  // Solo si el plan tiene Finanzas: cómo cobra (un profesor de colegio puede no cobrar).
  const FORMAS = [["mensual", "Mensualidad"], ["clase", "Por clase"], ["ambos", "Las dos"], ["no", "No cobro"]];
  const preguntaFinanzas = () => {
    if (!ctx.f("finanzas") || !ctx.esFinanzas) return null;
    const caja = h("fieldset.campo.bv-cobro", h("legend", "¿Cómo cobras a tus estudiantes? (opcional)"));
    const pintar = () => caja.replaceChildren(caja.firstChild, h("div.chips", FORMAS.map(([v, t]) => h("button.chip", { type: "button", "aria-pressed": String(ctx.guia?.cobro === v),
      onclick: async () => { await ctx.guiaGuardar({ cobro: v }); pintar(); } }, t))),
      h("p.tenue", ctx.guia?.cobro === "no" ? "Perfecto: en Finanzas solo anotarás tus gastos." : "Así Finanzas te muestra solo lo que usas. Puedes cambiarlo después."));
    pintar();
    return caja;
  };
  const paso4 = (omitidos) => {
    marcar(3);
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "¡Listo! Tu clase está creada"),
      h("ul.bv-resumen",
        h("li", "✓ Grupo «", estado.grupoNombre, "»"),
        estado.agregados ? h("li", `✓ ${estado.agregados} estudiante${estado.agregados === 1 ? "" : "s"} agregado${estado.agregados === 1 ? "" : "s"}`) : h("li.tenue", "Aún sin estudiantes: agrégalos desde el grupo cuando quieras.")),
      omitidos.length ? h("div.aviso.ojo", `${omitidos.length} nombre(s) no se agregaron: `, omitidos.slice(0, 5).map((o) => `${o.nombre || "fila " + o.fila} (${o.motivo})`).join("; "), omitidos.length > 5 ? "…" : "") : null,
      preguntaFinanzas(),
      h("p.suave", "Lo siguiente es pasar tu primera lista. El botón «Primeros pasos» te acompaña con lo que falta."),
      h("div.bv-pie",
        h("button.btn.btn-sec", { type: "button", onclick: () => salir("hecha") }, "Ir a Inicio"),
        h("button.btn", { type: "button", onclick: async () => { await salir("hecha"); ctx.ir(`#/asistencia?grupo=${estado.grupo}`); } }, "Pasar mi primera lista")));
  };

  paso1();
}
