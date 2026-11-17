// Primeros pasos: bienvenida guiada la primera vez, lista de pasos según el
// plan (marcados con datos reales), botón flotante con el avance y ayudas
// cortas la primera vez que se entra a cada sección.
// El avance se guarda en el servidor (d360_guia_guardar), así se respeta en
// cualquier equipo. En la demostración se guarda solo en esta pestaña.
import { sb, q, mensajeError } from "./sb.js";
import { h, modal, DIAS } from "./ui.js";

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
  return ctx.guia;
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
    pasos.push({ k: "asistente", hecho: asistente, t: "Invita a tu asistente", d: "Tendrá su propio acceso y verá solo los grupos que le asignes.", href: "#/cuenta", b: "Invitar" });
  }
  return { pasos, hechos: pasos.filter((p) => p.hecho).length, grupo: g1 };
}

/** Lista de pasos (se usa en Inicio y en el panel del botón flotante). */
export function listaPasos({ pasos, hechos }, alElegir) {
  const siguiente = pasos.findIndex((p) => !p.hecho);
  return h("div",
    h("div.barra-progreso", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": pasos.length, "aria-valuenow": hechos, "aria-label": "Avance de los primeros pasos" },
      h("span", { style: `width:${(hechos / pasos.length) * 100}%` })),
    h("ol.pasos-guia", pasos.map((p, i) => h("li" + (p.hecho ? ".hecho" : ""),
      h("span.num", p.hecho ? "✓" : String(i + 1)),
      h("div.crece", h("div.titulo", p.t), p.hecho ? null : h("div.tenue", p.d)),
      p.hecho ? null : h("a.btn.btn-sm" + (i === siguiente ? "" : ".btn-sec"), { href: p.href, onclick: () => alElegir?.() }, p.b)))));
}

/** Botón flotante «Primeros pasos» con su avance. Se oculta al terminar o si el usuario lo oculta. */
export function botonGuia(ctx) {
  const btn = h("button.guia-flotante", { type: "button", "aria-haspopup": "dialog" });
  btn.hidden = true;
  let ultimo = null;
  const abrir = () => {
    if (!ultimo) return;
    modal(`Primeros pasos · ${ultimo.hechos} de ${ultimo.pasos.length}`, h("div",
      h("p.suave", "Sigue estos pasos para dejar lista tu cuenta. Se marcan solos cuando los haces."),
      listaPasos(ultimo, cerrarDialogo),
      h("div", { style: "display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem" },
        h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => { cerrarDialogo(); bienvenida(ctx, { forzar: true }); } }, "Ver la bienvenida otra vez"),
        h("button.btn.btn-texto.btn-sm", { type: "button", onclick: async () => { await ctx.guiaGuardar({ oculta: true }); cerrarDialogo(); btn.hidden = true; ctx.toast("Guía oculta. Puedes volver a verla en Mi cuenta."); } }, "Ocultar la guía"))),
      [{ texto: "Cerrar", clase: "btn-sec" }]);
  };
  btn.addEventListener("click", abrir);
  btn.actualizar = async () => {
    if (!ctx.esDueno || ctx.guia?.oculta) { btn.hidden = true; return; }
    try { ultimo = await pasosProfesor(ctx); } catch (_) { return; }
    const { hechos, pasos } = ultimo;
    if (hechos >= pasos.length) {
      btn.hidden = true;
      if (!ctx.guia.completa) { ctx.guiaGuardar({ completa: true }); ctx.toast("¡Completaste los primeros pasos! Tu cuenta está lista."); }
      return;
    }
    btn.replaceChildren(
      h("span.anillo", { style: `--avance:${Math.round((hechos / pasos.length) * 100)}`, "aria-hidden": "true" }, h("b", `${hechos}/${pasos.length}`)),
      h("span", "Primeros pasos"));
    btn.setAttribute("aria-label", `Primeros pasos: ${hechos} de ${pasos.length} completados`);
    btn.hidden = false;
  };
  return btn;
}
function cerrarDialogo() { document.querySelectorAll("dialog.modal").forEach((d) => { d.close(); d.remove(); }); }

/**
 * Bienvenida guiada: qué enseñas → tu primer grupo con horario → tus
 * estudiantes → listo. Todo se guarda de verdad en cada paso.
 */
export async function bienvenida(ctx, { forzar = false } = {}) {
  if (!ctx.esDueno || (!forzar && (ctx.guia?.bienvenida || ctx.cuenta.es_demo))) return;
  const nombre = (ctx.cuenta.miembro_nombre || "").split(" ")[0];
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
    const dias = h("div.bv-dias", [1, 2, 3, 4, 5, 6, 7].map((d) => h("label.bv-dia", h("input", { type: "checkbox", value: d }), h("span", DIAS[d].slice(0, 3)))));
    const ini = h("input", { type: "time", value: "16:00" });
    const fin = h("input", { type: "time", value: "17:30" });
    const err = error();
    const btn = h("button.btn", { type: "submit" }, "Crear mi grupo");
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "Tu primer grupo"),
      h("p.suave", "Un grupo es una clase: los estudiantes que ves juntos. Elige los días y la hora para que Inicio te avise cuándo pasar lista."),
      h("form.bv-form", { onsubmit: async (e) => {
        e.preventDefault();
        const marcados = [...dias.querySelectorAll("input:checked")].map((x) => Number(x.value));
        if (!nom.value.trim()) return nom.focus();
        if (marcados.length && (!ini.value || !fin.value || fin.value <= ini.value)) return mostrarError(err, new Error("La hora de fin debe ser después de la de inicio."));
        btn.disabled = true; err.classList.add("oculto");
        try {
          const asigs = await ctx.datos.asignaturas(true);
          const ex = asigs.find((a) => a.nombre.toLowerCase() === asignatura.toLowerCase());
          const asigId = ex ? ex.id : (await q(sb.from("asignaturas").insert({ cuenta_id: ctx.id, nombre: asignatura }).select("id").single())).id;
          const g = await q(sb.from("grupos").insert({ cuenta_id: ctx.id, nombre: nom.value.trim(), asignatura_id: asigId, estado: "activo" }).select("id,nombre").single());
          estado.grupo = g.id; estado.grupoNombre = g.nombre;
          if (marcados.length) {
            await q(sb.from("horarios").insert(marcados.map((d) => ({ cuenta_id: ctx.id, grupo_id: g.id, miembro_id: ctx.cuenta.miembro_id, dia: d, hora_inicio: ini.value, hora_fin: fin.value }))));
          }
          ctx.datos.invalidar("grupos", "asignaturas");
          paso3();
        } catch (ex) { mostrarError(err, ex); btn.disabled = false; }
      } },
        h("label.campo", h("span", "Nombre del grupo"), nom),
        h("fieldset.campo", h("legend", "Días de clase (opcional)"), dias),
        h("div.bv-horas", h("label.campo", h("span", "Empieza"), ini), h("label.campo", h("span", "Termina"), fin)),
        err,
        h("div.bv-pie", h("button.btn.btn-sec", { type: "button", onclick: paso1 }, "Atrás"), btn)));
    nom.focus();
  };

  // Paso 3 · estudiantes (lista escrita o pegada, Excel, o después)
  const paso3 = () => {
    marcar(2);
    const area = h("textarea", { rows: 7, placeholder: "Ana Sofía López\nCarlos Pérez Ruiz\nMaría José Gutiérrez", "aria-describedby": "bv-ayuda-lista" });
    const cuenta = h("span.tenue", "0 estudiantes");
    const lineas = () => area.value.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 1);
    area.addEventListener("input", () => { const n = lineas().length; cuenta.textContent = `${n} estudiante${n === 1 ? "" : "s"}`; });
    const err = error();
    const btn = h("button.btn", { type: "submit" }, "Agregar al grupo");
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "Tus estudiantes"),
      h("p.suave", `Escribe o pega un nombre por línea. Se agregan a «${estado.grupoNombre}».`),
      h("form.bv-form", { onsubmit: async (e) => {
        e.preventDefault();
        const { separarNombre } = await import("../comun/importar.js");
        const filas = lineas().map((l, i) => ({ ...separarNombre(l), _fila: i + 1 }));
        if (!filas.length) return area.focus();
        btn.disabled = true; err.classList.add("oculto");
        try {
          const r = await q(sb.rpc("d360_importar_estudiantes", { p_cuenta: ctx.id, p_filas: filas, p_grupo: estado.grupo }));
          estado.agregados = r.inscritos ?? r.creados ?? 0;
          ctx.datos.invalidar("estudiantes");
          paso4(r.omitidos || []);
        } catch (ex) { mostrarError(err, ex); btn.disabled = false; }
      } },
        h("label.campo", h("span", "Lista de estudiantes"), area),
        h("p.tenue", { id: "bv-ayuda-lista" }, "Formato: nombres y apellidos. También sirve «Apellidos, Nombres». ", cuenta),
        err,
        h("div.bv-pie",
          h("button.btn.btn-texto", { type: "button", onclick: async () => {
            dlg.close(); dlg.remove(); await ctx.guiaGuardar({ bienvenida: "hecha" });
            (await import("../comun/importar.js")).abrirImportacion(ctx, () => { ctx.datos.invalidar(); ctx.ir(`#/grupos/${estado.grupo}`); }, { grupo: estado.grupo });
          } }, "Prefiero subir un Excel"),
          h("button.btn.btn-sec", { type: "button", onclick: () => paso4([]) }, "Lo hago después"),
          btn)));
    area.focus();
  };

  // Paso 4 · listo
  const paso4 = (omitidos) => {
    marcar(3);
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "¡Listo! Tu clase está creada"),
      h("ul.bv-resumen",
        h("li", "✓ Grupo «", estado.grupoNombre, "»"),
        estado.agregados ? h("li", `✓ ${estado.agregados} estudiante${estado.agregados === 1 ? "" : "s"} agregado${estado.agregados === 1 ? "" : "s"}`) : h("li.tenue", "Aún sin estudiantes: agrégalos desde el grupo cuando quieras.")),
      omitidos.length ? h("div.aviso.ojo", `${omitidos.length} nombre(s) no se agregaron: `, omitidos.slice(0, 5).map((o) => `${o.nombre || "fila " + o.fila} (${o.motivo})`).join("; "), omitidos.length > 5 ? "…" : "") : null,
      h("p.suave", "Lo siguiente es pasar tu primera lista. El botón «Primeros pasos» te acompaña con lo que falta."),
      h("div.bv-pie",
        h("button.btn.btn-sec", { type: "button", onclick: () => salir("hecha") }, "Ir a Inicio"),
        h("button.btn", { type: "button", onclick: async () => { await salir("hecha"); ctx.ir(`#/asistencia?grupo=${estado.grupo}`); } }, "Pasar mi primera lista")));
  };

  paso1();
}
