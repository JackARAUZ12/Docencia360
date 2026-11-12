// En línea: tareas y exámenes que el estudiante responde desde su teléfono.
// El profesor crea la actividad y sus preguntas, la publica y comparte un
// enlace o QR. Cada estudiante entra con su código personal de 6 dígitos.
// Las notas de opción múltiple, verdadero/falso y respuesta corta se
// calculan solas; el desarrollo lo revisa el profesor. La nota final pasa
// sola a Calificaciones. Permisos y cálculo: en el servidor (migración 24).
import { sb, q } from "../core/sb.js";
import { h, tabla, modal, confirmar, formularioModal, toast, fecha, nombreCompleto, imprimir } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { ruta } from "../core/sesion.js";

const TIPO_P = { opcion: "Opción múltiple", vf: "Verdadero o falso", corta: "Respuesta corta", desarrollo: "Desarrollo" };
const AUTO = (t) => t !== "desarrollo";
const enlaceAlumno = (token) => new URL(ruta(`alumno.html?a=${encodeURIComponent(token)}`), location.href).href;
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString("es-NI", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const aLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const aISO = (local) => (local ? new Date(local).toISOString() : null);
const pts = (n) => (n == null ? "—" : Number(n).toLocaleString("es-NI", { maximumFractionDigits: 2 }));

function estadoActividad(a) {
  const ahora = new Date();
  if (a.estado === "borrador") return ["", "Borrador"];
  if (a.estado === "cerrada" || (a.cierra && new Date(a.cierra) < ahora)) return ["mal", "Cerrada"];
  if (a.abre && new Date(a.abre) > ahora) return ["info", "Programada"];
  return ["ok", "Abierta"];
}

// ---------- QR (librería incluida en assets/vendor) ----------
let qrListo;
const cargarQR = () => (qrListo ??= new Promise((ok, mal) => {
  if (window.qrcode) return ok();
  const s = h("script", { src: ruta("assets/vendor/qrcode.js") });
  s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar el generador de QR."));
  document.head.append(s);
}));
async function svgQR(texto) {
  await cargarQR();
  const c = window.qrcode(0, "M"); c.addData(texto); c.make();
  return c.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

async function compartir(a, grupo) {
  const url = enlaceAlumno(a.token);
  const svg = await svgQR(url);
  const msj = `${a.tipo === "examen" ? "Examen" : "Tarea"} en línea: ${a.titulo}\nEntra aquí con tu código personal: ${url}`;
  const proyectar = () => {
    const capa = h("div.qr-proyectar", { role: "dialog", "aria-label": "Código QR para proyectar", onclick: () => capa.remove() },
      h("div", h("p.tenue", grupo?.nombre || ""), h("h2", a.titulo), h("div.qr-grande", { html: svg }), h("p.qr-url", url),
        h("p.tenue", "Escanea con la cámara del teléfono y escribe tu código personal. Toca la pantalla para cerrar.")));
    document.body.append(capa);
  };
  modal("Compartir con los estudiantes", h("div.compartir-act",
    h("div.qr-caja", { html: svg }),
    h("div",
      h("p", "Los estudiantes escanean el QR o abren el enlace, y entran con su ", h("strong", "código personal de 6 dígitos"), "."),
      h("p", { style: "word-break:break-all" }, h("a", { href: url, target: "_blank", rel: "noopener" }, url)),
      h("div.botones",
        h("button.btn", { type: "button", onclick: proyectar }, "Mostrar en pantalla grande"),
        h("button.btn.btn-sec", { type: "button", onclick: async () => { try { await navigator.clipboard.writeText(url); toast("Enlace copiado"); } catch { toast("Copia el enlace manualmente", "mal"); } } }, "Copiar enlace"),
        h("a.btn.btn-sec", { href: `https://wa.me/?text=${encodeURIComponent(msj)}`, target: "_blank", rel: "noopener" }, "Enviar por WhatsApp")),
      h("p.tenue", "¿Algún estudiante no tiene código? Actívalo en «Accesos de estudiantes»."))),
    [{ texto: "Cerrar" }]);
}

// ---------- Vista principal ----------
export async function render(el, ctx, { partes, params }) {
  if (!ctx.f("portal_estudiantes")) return sinPlan(el, ctx);
  if (partes[0] === "accesos") return accesos(el, ctx, params);
  if (partes[0]) return detalle(el, ctx, partes[0]);
  const [acts, grupos, cupo] = await Promise.all([
    q(sb.from("actividades").select("id,titulo,tipo,estado,abre,cierra,grupo_id,token,creado").eq("cuenta_id", ctx.id).order("creado", { ascending: false })),
    ctx.gruposVisibles(),
    ctx.esGestor ? usoAccesos(ctx) : null,
  ]);
  const entregas = acts.length ? await q(sb.from("entregas").select("actividad_id,estudiante_id,estado,pendiente").in("actividad_id", acts.map((a) => a.id))) : [];
  const porAct = {};
  for (const e of entregas) {
    const x = (porAct[e.actividad_id] ??= { enviadas: new Set(), pendientes: 0 });
    if (e.estado === "enviada") x.enviadas.add(e.estudiante_id);
    if (e.pendiente) x.pendientes += 1;
  }
  const gNombre = Object.fromEntries(grupos.map((g) => [g.id, g.nombre]));
  if (params.get("nueva") === "1") { history.replaceState(null, "", "#/enlinea"); setTimeout(() => editarActividad(ctx, null, grupos), 50); }

  el.append(
    ctx.titulo("Tareas y exámenes en línea",
      ctx.esGestor ? h("a.btn.btn-sec", { href: "#/enlinea/accesos" }, "Accesos de estudiantes") : null,
      grupos.length ? h("button.btn", { onclick: () => editarActividad(ctx, null, grupos) }, h("span", { html: ICONOS.mas_add }), "Nueva actividad") : null),
    h("p.suave", "Creas el examen o la tarea, lo publicas y compartes un QR. Cada estudiante responde desde su teléfono con su código personal; la nota llega sola a Calificaciones."),
    cupo,
    !grupos.length ? h("div.vacio", h("p", "Primero crea un grupo con estudiantes."), h("a.btn", { href: "#/grupos?nuevo=1" }, "Crear grupo")) :
    h("section.hoja", tabla([
      { t: "Actividad", v: (a) => [h("a", { href: `#/enlinea/${a.id}` }, h("strong", a.titulo)), h("div.tenue", `${a.tipo === "examen" ? "Examen" : "Tarea"} · ${gNombre[a.grupo_id] || ""}`)] },
      { t: "Estado", v: (a) => { const [c, t] = estadoActividad(a); return h("span.estado" + (c ? "." + c : ""), t); } },
      { t: "Cierra", v: (a) => (a.cierra ? fechaHora(a.cierra) : "Sin fecha") },
      { t: "Entregas", v: (a) => [String(porAct[a.id]?.enviadas.size || 0), porAct[a.id]?.pendientes ? h("div", h("span.estado.ojo", `${porAct[a.id].pendientes} por revisar`)) : null], clase: "derecha" },
      { t: "", clase: "acciones", v: (a) => h("a.btn.btn-texto.btn-sm", { href: `#/enlinea/${a.id}` }, "Abrir") },
    ], acts, { vacio: "Aún no hay actividades. Crea la primera con «Nueva actividad»." })));
}

function sinPlan(el, ctx) {
  el.append(ctx.titulo("Tareas y exámenes en línea"),
    h("section.hoja",
      h("h2", "Tus estudiantes responden desde su teléfono"),
      h("ul.lista-simple",
        h("li", "Creas exámenes y tareas con opción múltiple, verdadero o falso, respuesta corta y desarrollo."),
        h("li", "Compartes un QR o un enlace; cada estudiante entra con su propio código."),
        h("li", "El sistema califica solo y la nota llega a Calificaciones.")),
      h("p", "Incluido en los planes ", h("strong", "Profesional"), " (hasta 250 estudiantes con acceso) y ", h("strong", "Premium"), " (hasta 600)."),
      h("p.tenue", "Si antes tenías esta función, tus exámenes, notas y los códigos de tus estudiantes siguen guardados y vuelven a funcionar al cambiar de plan."),
      ctx.esDueno ? h("a.btn", { href: "#/cuenta" }, "Ver planes") : h("p.tenue", "Pídele a quien administra la cuenta que active esta función.")));
}

async function usoAccesos(ctx) {
  const [{ count }, plan] = await Promise.all([
    sb.from("estudiantes_acceso").select("estudiante_id", { count: "exact", head: true }).eq("cuenta_id", ctx.id).eq("activo", true),
    q(sb.from("planes").select("max_estudiantes_portal").eq("id", ctx.cuenta.plan_id).maybeSingle()),
  ]);
  const max = plan?.max_estudiantes_portal ?? 0;
  return h("div.cifras-mini", h("span", h("b", `${count ?? 0} de ${max}`), " estudiantes con acceso en línea"),
    h("a", { href: "#/enlinea/accesos" }, (count ?? 0) ? "Gestionar accesos" : "Activar accesos"));
}

// ---------- Crear o editar los datos de la actividad ----------
function editarActividad(ctx, a, grupos) {
  return formularioModal(a ? "Editar actividad" : "Nueva actividad en línea", [
    { name: "titulo", label: "Título", required: true, full: true, maxlength: 140, placeholder: "Ej.: Examen de cinemática" },
    { name: "grupo_id", label: "Grupo", type: "select", required: true, options: grupos.filter((g) => g.estado === "activo" || g.id === a?.grupo_id).map((g) => [g.id, g.nombre]) },
    { name: "tipo", label: "Tipo", type: "select", options: [["examen", "Examen"], ["tarea", "Tarea"]], value: "examen" },
    { name: "instrucciones", label: "Instrucciones", type: "textarea", full: true, max: 4000 },
    { type: "seccion", label: "Cuándo y cómo" },
    { name: "abre", label: "Abre", type: "datetime-local", help: "Vacío = desde que la publiques." },
    { name: "cierra", label: "Cierra", type: "datetime-local", help: "Vacío = sin fecha de cierre." },
    { name: "duracion_min", label: "Tiempo para responder (minutos)", type: "number", min: 1, max: 600, help: "Vacío = sin límite de tiempo." },
    { name: "intentos", label: "Intentos", type: "number", min: 1, max: 5, value: 1, required: true },
    { name: "peso", label: "Peso en el promedio (%)", type: "number", min: 0, max: 100, step: "0.5", value: 0, required: true, help: "Igual que en Calificaciones." },
    { name: "mostrar_nota", label: "Mostrar la nota al estudiante al enviar", type: "checkbox", value: true },
  ], a ? { ...a, abre: aLocal(a.abre), cierra: aLocal(a.cierra) } : null, async (d, cerrar) => {
    const fila = { ...d, abre: aISO(d.abre), cierra: aISO(d.cierra), duracion_min: d.duracion_min || null, intentos: d.intentos || 1, peso: d.peso ?? 0 };
    if (fila.abre && fila.cierra && fila.cierra <= fila.abre) throw new Error("La fecha de cierre debe ser posterior a la de apertura.");
    if (a) { await q(sb.from("actividades").update(fila).eq("id", a.id)); cerrar(); ctx.recargar(); }
    else {
      const n = await q(sb.from("actividades").insert({ ...fila, cuenta_id: ctx.id }).select("id").single());
      cerrar(); location.hash = `#/enlinea/${n.id}`;
    }
  }, { boton: a ? "Guardar" : "Crear y agregar preguntas" });
}

// ---------- Editor de una pregunta ----------
function editarPregunta(ctx, act, p, orden, alGuardar) {
  let tipo = p?.tipo || "opcion";
  let opciones = p?.tipo === "opcion" ? [...p.opciones] : ["", "", ""];
  let correcta = p?.tipo === "opcion" ? Number(p.correcta) : 0;
  let vf = p?.tipo === "vf" ? p.correcta === true : true;
  const err = h("div.aviso.mal.oculto", { role: "alert" });
  const enun = h("textarea", { rows: 3, maxLength: 2000, placeholder: "Escribe la pregunta…" }, p?.enunciado || "");
  const puntos = h("input", { type: "number", min: 0.5, max: 100, step: "0.5", value: p?.puntos ?? 1 });
  const aceptadas = h("input", { placeholder: "Ej.: París; Paris", value: p?.tipo === "corta" ? p.correcta.join("; ") : "" });
  const zona = h("div");
  const selTipo = h("div.segmentos", { role: "group", "aria-label": "Tipo de pregunta" }, Object.entries(TIPO_P).map(([v, t]) =>
    h("button", { type: "button", "aria-pressed": String(v === tipo), onclick: (e) => { tipo = v; selTipo.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); pintar(); } }, t)));
  function pintar() {
    if (tipo === "opcion") {
      zona.replaceChildren(h("p.etiqueta", "Opciones · marca la correcta"),
        h("div.opciones-preg", opciones.map((o, i) => h("div.op",
          h("input", { type: "radio", name: "correcta", checked: i === correcta, "aria-label": `La opción ${i + 1} es la correcta`, onchange: () => { correcta = i; } }),
          h("input", { value: o, placeholder: `Opción ${i + 1}`, maxLength: 300, oninput: (e) => { opciones[i] = e.target.value; } }),
          opciones.length > 2 ? h("button.btn.btn-texto.btn-sm", { type: "button", "aria-label": "Quitar opción", onclick: () => { opciones.splice(i, 1); if (correcta >= opciones.length) correcta = 0; pintar(); } }, "✕") : null))),
        opciones.length < 8 ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => { opciones.push(""); pintar(); } }, "+ Agregar opción") : null);
    } else if (tipo === "vf") {
      zona.replaceChildren(h("p.etiqueta", "Respuesta correcta"), h("div.segmentos", [[true, "Verdadero"], [false, "Falso"]].map(([v, t]) =>
        h("button", { type: "button", "aria-pressed": String(vf === v), onclick: (e) => { vf = v; e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); } }, t))));
    } else if (tipo === "corta") {
      zona.replaceChildren(h("label.campo", h("span", "Respuestas aceptadas"), aceptadas,
        h("small", "Sepáralas con punto y coma. No importan mayúsculas ni tildes; en números, 3,5 y 3.5 valen igual.")));
    } else {
      zona.replaceChildren(h("p.suave", "El estudiante escribe libremente. Tú la revisas y le pones los puntos desde los resultados."));
    }
  }
  pintar();
  const m = modal(p ? "Editar pregunta" : "Nueva pregunta", h("div.editor-preg", err, selTipo,
    h("label.campo", h("span", "Pregunta"), enun), zona, h("label.campo", { style: "max-width:160px" }, h("span", "Puntos"), puntos)), [
    { texto: "Cancelar", clase: "btn-sec" },
    { texto: "Guardar pregunta", onclick: async (cerrar) => {
      err.classList.add("oculto");
      try {
        const fila = { tipo, enunciado: enun.value.trim(), puntos: Number(puntos.value) || 1, opciones: [], correcta: null };
        if (!fila.enunciado) throw new Error("Escribe la pregunta.");
        if (tipo === "opcion") {
          const ops = opciones.map((o) => o.trim());
          if (ops.some((o) => !o)) throw new Error("Completa todas las opciones o quita las vacías.");
          fila.opciones = ops; fila.correcta = correcta;
        } else if (tipo === "vf") fila.correcta = vf;
        else if (tipo === "corta") {
          const acc = aceptadas.value.split(";").map((x) => x.trim()).filter(Boolean);
          if (!acc.length) throw new Error("Escribe al menos una respuesta aceptada.");
          fila.correcta = acc;
        }
        if (p) await q(sb.from("preguntas").update(fila).eq("id", p.id));
        else await q(sb.from("preguntas").insert({ ...fila, cuenta_id: ctx.id, actividad_id: act.id, orden }));
        cerrar(); alGuardar();
      } catch (e) { err.textContent = e.message; err.classList.remove("oculto"); }
      return false;
    } },
  ]);
  setTimeout(() => enun.focus(), 30);
  return m;
}

// ---------- Detalle: preguntas y resultados ----------
async function detalle(el, ctx, id) {
  const [a, grupos] = await Promise.all([
    q(sb.from("actividades").select("*").eq("id", id).maybeSingle()),
    ctx.gruposVisibles(),
  ]);
  if (!a) { el.append(h("div.vacio", h("p", "Esta actividad no existe o no tienes acceso."), h("a.btn", { href: "#/enlinea" }, "Volver"))); return; }
  const preguntas = await q(sb.from("preguntas").select("*").eq("actividad_id", id).order("orden").order("id"));
  const res = a.estado === "borrador" ? [] : await q(sb.rpc("d360_actividad_resultados", { p_actividad: id }));
  const grupo = grupos.find((g) => g.id === a.grupo_id);
  const hayEntregas = res.some((r) => r.entrega);
  const editable = !hayEntregas;
  const total = preguntas.reduce((s, p) => s + Number(p.puntos), 0);
  const [cl, tx] = estadoActividad(a);

  const publicar = async () => {
    try { const tok = await q(sb.rpc("d360_actividad_publicar", { p_actividad: id })); toast("Publicada"); await compartir({ ...a, token: tok }, grupo); ctx.recargar(); }
    catch (e) { toast(e.message, "mal"); }
  };
  const cerrarAct = async (reabrir) => {
    if (!reabrir && !(await confirmar("Cerrar actividad", "Nadie más podrá entrar. Quien esté respondiendo se entregará con lo que tenga guardado.", { boton: "Cerrar ahora" }))) return;
    try { await q(sb.rpc("d360_actividad_cerrar", { p_actividad: id, p_reabrir: reabrir })); toast(reabrir ? "Reabierta" : "Cerrada"); ctx.recargar(); }
    catch (e) { toast(e.message, "mal"); }
  };
  const borrar = async () => {
    if (!(await confirmar("Eliminar actividad", hayEntregas ? "Se borrarán también las respuestas de los estudiantes. Las notas ya pasadas a Calificaciones se conservan." : "¿Eliminar esta actividad y sus preguntas?", { boton: "Eliminar", peligro: true }))) return;
    try { await q(sb.from("actividades").delete().eq("id", id)); toast("Eliminada"); location.hash = "#/enlinea"; }
    catch (e) { toast(e.message, "mal"); }
  };
  const mover = async (p, d) => {
    const i = preguntas.indexOf(p), j = i + d; if (j < 0 || j >= preguntas.length) return;
    await Promise.all([q(sb.from("preguntas").update({ orden: j }).eq("id", p.id)), q(sb.from("preguntas").update({ orden: i }).eq("id", preguntas[j].id))]);
    ctx.recargar();
  };
  const respuestaCorrecta = (p) => p.tipo === "opcion" ? `Correcta: ${p.opciones[p.correcta]}` : p.tipo === "vf" ? `Correcta: ${p.correcta ? "Verdadero" : "Falso"}` : p.tipo === "corta" ? `Se acepta: ${p.correcta.join(" · ")}` : "La revisas tú";

  const enviadas = res.filter((r) => r.entrega?.estado === "enviada");
  const conNota = enviadas.filter((r) => !r.entrega.pendiente && r.entrega.puntaje_max);
  const prom = conNota.length ? conNota.reduce((s, r) => s + (r.entrega.puntaje / r.entrega.puntaje_max) * 100, 0) / conNota.length : null;

  el.append(
    h("p", h("a", { href: "#/enlinea" }, "← En línea")),
    ctx.titulo(a.titulo,
      a.estado === "borrador" ? h("button.btn", { onclick: publicar, disabled: !preguntas.length }, "Publicar") : null,
      a.estado !== "borrador" && a.token ? h("button.btn", { onclick: () => compartir(a, grupo) }, "Compartir (QR)") : null,
      a.estado === "publicada" ? h("button.btn.btn-sec", { onclick: () => cerrarAct(false) }, "Cerrar") : null,
      a.estado === "cerrada" ? h("button.btn.btn-sec", { onclick: () => cerrarAct(true) }, "Reabrir") : null,
      h("button.btn.btn-sec", { onclick: () => editarActividad(ctx, a, grupos) }, "Editar datos"),
      h("button.btn.btn-texto", { onclick: borrar }, "Eliminar")),
    h("p.suave", h("span.estado" + (cl ? "." + cl : ""), tx), " ",
      [a.tipo === "examen" ? "Examen" : "Tarea", grupo?.nombre, `${preguntas.length} pregunta(s) · ${pts(total)} puntos`,
       a.duracion_min ? `${a.duracion_min} min para responder` : "sin límite de tiempo", a.intentos > 1 ? `${a.intentos} intentos` : "1 intento",
       a.cierra ? `cierra ${fechaHora(a.cierra)}` : null].filter(Boolean).join(" · ")),
    a.estado === "borrador" ? h("div.aviso", "Es un borrador: los estudiantes todavía no la ven. Agrega las preguntas y pulsa «Publicar».") : null,

    // Resultados
    a.estado !== "borrador" ? h("section.hoja",
      h("div.hoja-titulo", h("h2", "Resultados"), h("span.tenue", `${enviadas.length} de ${res.length} entregaron` + (prom != null ? ` · promedio ${pts(prom)} / 100` : ""))),
      tabla([
        { t: "Estudiante", v: (r) => [h("strong", r.nombre), !r.acceso ? h("div", h("a.tenue", { href: "#/enlinea/accesos" }, "Sin código de acceso")) : null] },
        { t: "Estado", v: (r) => {
          const e = r.entrega;
          if (!e) return h("span.tenue", "No ha entrado");
          if (e.estado === "en_curso") return h("span.estado.info", "Respondiendo");
          if (e.pendiente) return h("span.estado.ojo", "Por revisar");
          return [h("span.estado.ok", "Enviada"), e.origen === "tiempo agotado" ? h("div.tenue", "Se acabó el tiempo") : null];
        } },
        { t: "Nota", v: (r) => (r.entrega?.estado === "enviada" ? `${pts(r.entrega.puntaje)} / ${pts(r.entrega.puntaje_max)}` : "—"), clase: "derecha" },
        { t: "Enviada", v: (r) => (r.entrega?.enviada ? fechaHora(r.entrega.enviada) : "—") },
        { t: "", clase: "acciones", v: (r) => (r.entrega?.estado === "enviada" ? h("button.btn.btn-texto.btn-sm", { onclick: () => verEntrega(ctx, a, preguntas, r) }, r.entrega.pendiente ? "Revisar" : "Ver") : null) },
      ], res, { vacio: "El grupo no tiene estudiantes activos." })) : null,

    // Preguntas
    h("section.hoja",
      h("div.hoja-titulo", h("h2", "Preguntas"),
        editable ? h("button.btn.btn-sm", { onclick: () => editarPregunta(ctx, a, null, preguntas.length, ctx.recargar) }, h("span", { html: ICONOS.mas_add }), "Agregar pregunta") : null),
      !editable ? h("p.tenue", "Ya hay respuestas de estudiantes: las preguntas no se pueden cambiar para que las notas cuadren.") : null,
      preguntas.length ? h("ol.lista-preguntas", preguntas.map((p, i) => h("li",
        h("div.crece",
          h("div.tenue", `${TIPO_P[p.tipo]} · ${pts(p.puntos)} punto(s)${AUTO(p.tipo) ? " · se califica sola" : ""}`),
          h("div.enunciado", p.enunciado),
          p.tipo === "opcion" ? h("ol.ops", p.opciones.map((o, k) => h("li" + (k === Number(p.correcta) ? ".correcta" : ""), o))) : null,
          h("div.tenue.correcta-txt", respuestaCorrecta(p))),
        editable ? h("div.acciones-preg",
          h("button.btn.btn-texto.btn-sm", { "aria-label": "Subir", disabled: i === 0, onclick: () => mover(p, -1) }, "↑"),
          h("button.btn.btn-texto.btn-sm", { "aria-label": "Bajar", disabled: i === preguntas.length - 1, onclick: () => mover(p, 1) }, "↓"),
          h("button.btn.btn-texto.btn-sm", { onclick: () => editarPregunta(ctx, a, p, p.orden, ctx.recargar) }, "Editar"),
          h("button.btn.btn-texto.btn-sm", { onclick: async () => { if (await confirmar("Quitar pregunta", "¿Quitar esta pregunta?", { boton: "Quitar", peligro: true })) { try { await q(sb.from("preguntas").delete().eq("id", p.id)); ctx.recargar(); } catch (e) { toast(e.message, "mal"); } } } }, "Quitar")) : null)))
        : h("div.vacio", h("p", "Todavía no hay preguntas."), editable ? h("button.btn", { onclick: () => editarPregunta(ctx, a, null, 0, ctx.recargar) }, "Agregar la primera") : null)),
  );
}

// ---------- Ver y revisar una entrega ----------
async function verEntrega(ctx, a, preguntas, r) {
  const e = await q(sb.from("entregas").select("id,respuestas,puntos_auto,puntos_manual,puntaje,puntaje_max,pendiente,comentario,enviada,intento").eq("id", r.entrega.id).single());
  const inputs = {};
  const comentario = h("textarea", { rows: 2, maxLength: 1000, placeholder: "Comentario para el estudiante (opcional)" }, e.comentario || "");
  const fila = (p, i) => {
    const resp = e.respuestas[p.id];
    let txt = resp == null || resp === "" ? h("em.tenue", "Sin responder") : p.tipo === "opcion" ? p.opciones[resp] : p.tipo === "vf" ? (resp ? "Verdadero" : "Falso") : String(resp);
    let marca;
    if (AUTO(p.tipo)) {
      const ok = Number(e.puntos_auto[p.id] || 0) > 0;
      marca = h("span.estado" + (ok ? ".ok" : ".mal"), `${ok ? "Correcta" : "Incorrecta"} · ${pts(e.puntos_auto[p.id] || 0)} / ${pts(p.puntos)}`);
    } else {
      inputs[p.id] = h("input", { type: "number", min: 0, max: p.puntos, step: "0.5", value: e.puntos_manual[p.id] ?? "", style: "width:6rem", "aria-label": "Puntos" });
      marca = h("label.puntos-dev", inputs[p.id], ` / ${pts(p.puntos)} pts`);
    }
    return h("li", h("div.tenue", `${i + 1}. ${TIPO_P[p.tipo]}`), h("div.enunciado", p.enunciado),
      h("div.respuesta" + (p.tipo === "desarrollo" ? ".larga" : ""), txt), marca);
  };
  const cuerpo = h("div.revision",
    h("p", h("strong", r.nombre), h("span.tenue", ` · intento ${e.intento} · enviada ${fechaHora(e.enviada)}`)),
    h("p", "Nota: ", h("strong", `${pts(e.puntaje)} / ${pts(e.puntaje_max)}`), e.pendiente ? h("span.estado.ojo", { style: "margin-left:.5rem" }, "Falta revisar el desarrollo") : null),
    h("ol.lista-preguntas", preguntas.map(fila)),
    Object.keys(inputs).length ? h("label.campo", h("span", "Comentario"), comentario) : null);
  const tieneDesarrollo = Object.keys(inputs).length > 0;
  modal("Respuestas", cuerpo, tieneDesarrollo ? [
    { texto: "Cerrar", clase: "btn-sec" },
    { texto: "Guardar revisión", onclick: async (cerrar) => {
      const puntos = {};
      for (const [k, inp] of Object.entries(inputs)) if (inp.value !== "") puntos[k] = Number(inp.value);
      try { const x = await q(sb.rpc("d360_entrega_revisar", { p_entrega: e.id, p_puntos: puntos, p_comentario: comentario.value || null }));
        toast(x.pendiente ? "Guardado. Aún falta revisar alguna pregunta." : `Nota final: ${pts(x.puntaje)} / ${pts(x.puntaje_max)}. Ya está en Calificaciones.`);
        cerrar(); ctx.recargar(); }
      catch (err) { toast(err.message, "mal"); }
      return false;
    } }] : [{ texto: "Cerrar" }]);
}

// ---------- Accesos de estudiantes ----------
async function accesos(el, ctx, params) {
  if (!ctx.esGestor) { el.append(h("div.vacio", h("p", "Solo la administración de la cuenta gestiona los accesos."))); return; }
  const [est, acc, grupos, ge, plan] = await Promise.all([
    ctx.datos.estudiantes(true),
    q(sb.from("estudiantes_acceso").select("estudiante_id,activo,ultimos,ultimo_acceso").eq("cuenta_id", ctx.id)),
    ctx.gruposVisibles(),
    q(sb.from("grupo_estudiantes").select("grupo_id,estudiante_id").eq("cuenta_id", ctx.id).eq("estado", "activo")),
    q(sb.from("planes").select("nombre,max_estudiantes_portal").eq("id", ctx.cuenta.plan_id).maybeSingle()),
  ]);
  const A = Object.fromEntries(acc.map((x) => [x.estudiante_id, x]));
  const activos = est.filter((e) => e.estado === "activo");
  const usados = acc.filter((x) => x.activo).length, max = plan?.max_estudiantes_portal ?? 0;
  let grupo = params.get("grupo") || "";
  const sel = new Set();
  const cont = h("div");
  const resumen = h("p.suave");
  const btnActivar = h("button.btn", { disabled: true, onclick: () => activar(false) }, "Activar acceso");
  const btnNuevo = h("button.btn.btn-sec", { disabled: true, onclick: () => activar(true) }, "Nuevo código");
  const btnQuitar = h("button.btn.btn-texto", { disabled: true, onclick: quitar }, "Quitar acceso");
  const actualizarBotones = () => {
    const ids = [...sel];
    btnActivar.disabled = !ids.some((i) => !A[i]?.activo);
    btnNuevo.disabled = !ids.some((i) => A[i]?.activo);
    btnQuitar.disabled = !ids.some((i) => A[i]?.activo);
    resumen.textContent = `${usados} de ${max} estudiantes con acceso en tu plan ${plan?.nombre || ""}.` + (ids.length ? ` Seleccionados: ${ids.length}.` : "");
  };
  async function activar(regenerar) {
    const ids = [...sel].filter((i) => (regenerar ? A[i]?.activo : !A[i]?.activo));
    if (regenerar && !(await confirmar("Nuevos códigos", `Los ${ids.length} código(s) actuales dejarán de funcionar.`, { boton: "Generar" }))) return;
    try {
      const r = await q(sb.rpc("d360_alumnos_activar", { p_cuenta: ctx.id, p_estudiantes: ids, p_regenerar: regenerar }));
      mostrarCodigos(r, ctx);
    } catch (e) { toast(e.message, "mal"); }
  }
  async function quitar() {
    const ids = [...sel].filter((i) => A[i]?.activo);
    if (!(await confirmar("Quitar acceso", `${ids.length} estudiante(s) ya no podrán entrar a tareas y exámenes en línea. Su historial se conserva.`, { boton: "Quitar", peligro: true }))) return;
    try { await q(sb.rpc("d360_alumnos_desactivar", { p_cuenta: ctx.id, p_estudiantes: ids })); toast("Acceso quitado"); ctx.recargar(); }
    catch (e) { toast(e.message, "mal"); }
  }
  function pintar() {
    const ids = grupo ? new Set(ge.filter((x) => x.grupo_id === grupo).map((x) => x.estudiante_id)) : null;
    const lista = activos.filter((e) => !ids || ids.has(e.id));
    const todos = h("input", { type: "checkbox", "aria-label": "Seleccionar todos", onchange: (ev) => { lista.forEach((e) => (ev.target.checked ? sel.add(e.id) : sel.delete(e.id))); pintar(); } });
    todos.checked = lista.length > 0 && lista.every((e) => sel.has(e.id));
    cont.replaceChildren(h("section.hoja", tabla([
      { t: todos, v: (e) => h("input", { type: "checkbox", checked: sel.has(e.id), "aria-label": nombreCompleto(e), onchange: (ev) => { ev.target.checked ? sel.add(e.id) : sel.delete(e.id); actualizarBotones(); } }) },
      { t: "Estudiante", v: (e) => h("strong", nombreCompleto(e)) },
      { t: "Acceso", v: (e) => (A[e.id]?.activo ? [h("span.estado.ok", "Activo"), h("span.tenue", ` código ··${A[e.id].ultimos}`)] : h("span.tenue", "Sin acceso")) },
      { t: "Última entrada", v: (e) => (A[e.id]?.ultimo_acceso ? fechaHora(A[e.id].ultimo_acceso) : "—") },
    ], lista, { vacio: "No hay estudiantes activos en este grupo." })));
    actualizarBotones();
  }
  el.append(
    h("p", h("a", { href: "#/enlinea" }, "← En línea")),
    ctx.titulo("Accesos de estudiantes"),
    h("p.suave", "Cada estudiante con acceso recibe un código personal de 6 dígitos para entrar a tus tareas y exámenes en línea. Entrégaselo impreso o por mensaje privado."),
    resumen,
    h("div.barra-filtros",
      h("select", { "aria-label": "Grupo", onchange: (e) => { grupo = e.target.value; pintar(); } },
        h("option", { value: "" }, "Todos los estudiantes"), grupos.map((g) => h("option", { value: g.id, selected: g.id === grupo }, g.nombre))),
      btnActivar, btnNuevo, btnQuitar),
    cont);
  pintar();
}

function mostrarCodigos(lista, ctx) {
  if (!lista.length) { toast("No había estudiantes nuevos para activar."); ctx.recargar(); return; }
  const tarjetas = h("div.tarjetas-codigo", lista.map((x) => h("div.tarjeta-codigo",
    h("div.tenue", ctx.cuenta.nombre), h("strong", x.nombre), h("div.cod", x.codigo),
    h("div.tenue", "Tu código para tareas y exámenes en línea. No lo compartas."))));
  modal("Códigos de acceso", h("div",
    h("p", "Estos códigos ", h("strong", "solo se muestran ahora"), ". Imprímelos o entrégalos uno por uno."), tarjetas), [
    { texto: "Listo", clase: "btn-sec", onclick: (c) => { c(); ctx.recargar(); } },
    { texto: "Imprimir tarjetas", onclick: () => { imprimir(tarjetas); return false; } },
  ]);
}
