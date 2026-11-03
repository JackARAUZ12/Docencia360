// Panel maestro de Docencia360 (solo plataforma_admins).
// Cada acción está protegida en el servidor: RLS + funciones que
// verifican d360_es_plataforma_admin(). Esta interfaz no decide permisos.
import { sb, q } from "../core/sb.js";
import { h, marca, tabla, formularioModal, confirmar, modal, toast, fecha, dinero, hoyISO, sumarDias, errorEn, cargando } from "../core/ui.js";
import { sesionActual, salir, ruta } from "../core/sesion.js";
import { botonTema } from "../core/tema.js";

if (!(await sesionActual())) location.replace(ruta("entrar.html?modo=correo"));
const { data: esAdmin } = await sb.rpc("d360_es_plataforma_admin");
if (!esAdmin) { document.getElementById("app").replaceChildren(h("main", h("div.aviso.mal", "No tienes acceso a esta sección."), h("a", { href: ruta("entrar.html") }, "Volver"))); throw new Error("sin acceso"); }

const MOD = { profesor: "Profesor", academia: "Academia", colegio: "Colegio" };
const EST = { pendiente: "ojo", prueba: "info", activa: "ok", vencida: "ojo", suspendida: "mal", cancelada: "mal" };
const FUNCIONES = [["tareas", "Tareas"], ["calendario", "Calendario"], ["reportes_pdf", "Informes PDF"], ["exportar", "Exportar CSV"], ["asistentes", "Asistentes"],
  ["finanzas", "Finanzas"], ["certificados", "Certificados"], ["comunicados", "Comunicados"], ["portal_familias", "Portal familias"], ["horarios", "Horarios"],
  ["boletines", "Boletines"], ["auditoria", "Auditoría"], ["sedes", "Sedes"]];

const main = h("main", { id: "contenido" });
const SECCIONES = [["resumen", "Resumen"], ["cuentas", "Cuentas"], ["planes", "Planes y precios"], ["promociones", "Promociones"], ["actividad", "Actividad"], ["parametros", "Parámetros"]];
document.getElementById("app").replaceChildren(
  h("header.adm-cab", h("div", marca(ruta("admin/index.html")), h("span.sello", "Panel maestro")),
    h("nav", SECCIONES.map(([r, t]) => h("a", { href: "#/" + r, dataset: { r } }, t)),
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); salir(); } }, "Salir"), botonTema())),
  main);

let planesCache;
const planes = async (f) => (planesCache && !f ? planesCache : (planesCache = await q(sb.from("planes").select("*").order("modalidad").order("orden"))));

// ---------------- Resumen ----------------
async function resumen(el) {
  const [m, cuentas] = await Promise.all([q(sb.rpc("d360_admin_metricas")), q(sb.rpc("d360_admin_cuentas"))]);
  const hoy = hoyISO();
  const proximas = cuentas.filter((c) => !c.es_demo && ["activa", "prueba"].includes(c.estado) && c.vence >= hoy && c.vence <= sumarDias(hoy, 7));
  const ingresos = Object.entries(m.ingresos_mes || {}).map(([mon, t]) => dinero(t, mon)).join(" + ") || dinero(0, "USD");
  el.append(h("h1", "Resumen"),
    h("section.cifras",
      h("div.cifra", h("b", m.cuentas), h("span", "cuentas registradas")),
      h("div.cifra", h("b", m.por_estado?.activa || 0), h("span", "activas (pagando)")),
      h("div.cifra", h("b", m.por_estado?.pendiente || 0), h("span", "pendientes de activar")),
      h("div.cifra.alerta", h("b", (m.por_estado?.vencida || 0) + (m.por_estado?.suspendida || 0)), h("span", "vencidas o suspendidas")),
      h("div.cifra", h("b", dinero(m.mrr_usd, "USD")), h("span", "ingreso mensual recurrente (precio de lista)")),
      h("div.cifra", h("b", { style: "font-size:1.3rem" }, ingresos), h("span", "cobrado este mes")),
      h("div.cifra", h("b", m.demo_accesos_7d ?? 0), h("span", "visitas a la demo (7 días)"))),
    h("section.hoja", { style: "margin-top:1rem" },
      h("div.hoja-titulo", h("h2", "Cuentas de demostración"),
        h("button.btn.btn-sec.btn-sm", { onclick: async (e) => {
          if (!(await confirmar("Reiniciar demostraciones", "Se borran los cambios hechos por visitantes y se cargan de nuevo los datos de ejemplo. También ocurre solo cada noche.", { boton: "Reiniciar" }))) return;
          e.target.disabled = true;
          try { const r = await q(sb.rpc("d360_admin_reiniciar_demos")); toast(`Demostraciones reiniciadas (${r.estudiantes} estudiantes de ejemplo)`); navegar(); }
          catch (x) { toast(x.message, "mal"); e.target.disabled = false; }
        } }, "Reiniciar ahora")),
      tabla([{ t: "Cuenta", v: (c) => [h("strong", c.nombre), h("div.tenue", `Código ${c.codigo}`)] }, { t: "Modalidad", v: (c) => MOD[c.modalidad] }, { t: "Estudiantes", v: (c) => c.estudiantes, clase: "derecha" }, { t: "Última visita", v: (c) => c.ultimo_acceso ? fecha(c.ultimo_acceso) : "—" }],
        cuentas.filter((c) => c.es_demo), { vacio: "Las demostraciones se crean al aplicar la migración y reiniciarlas." })),
    h("div", { style: "display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:1.5rem" },
      h("section.hoja", h("h2", "Por modalidad"), tabla([{ t: "Modalidad", v: ([k]) => MOD[k] }, { t: "Cuentas", v: ([, n]) => n, clase: "derecha" }], Object.entries(m.por_modalidad || {}))),
      h("section.hoja", h("h2", "Vencen en 7 días"), tabla([
        { t: "Cuenta", v: (c) => c.nombre }, { t: "Vence", v: (c) => fecha(c.vence) }, { t: "Estado", v: (c) => h("span.estado." + EST[c.estado], c.estado) },
      ], proximas, { vacio: "Ninguna." }))),
    h("section.hoja", { style: "margin-top:1rem" }, h("h2", "Ingresos de los últimos 12 meses"),
      tabla([{ t: "Mes", v: (x) => x.mes }, { t: "Moneda", v: (x) => x.moneda }, { t: "Total", v: (x) => dinero(x.total, x.moneda), clase: "derecha" }], m.ingresos_12m || [], { vacio: "Aún no hay pagos registrados." })));
}

// ---------------- Cuentas ----------------
async function cuentas(el) {
  const [lista, ps] = await Promise.all([q(sb.rpc("d360_admin_cuentas")), planes()]);
  let fMod = "", fEst = "", texto = "";
  const cont = h("div");
  const pintar = () => {
    const t = texto.toLowerCase();
    const filas = lista.filter((c) => (!fMod || c.modalidad === fMod) && (!fEst || c.estado === fEst) &&
      (!t || [c.nombre, c.codigo, c.propietario_email, c.telefono].some((x) => (x || "").toLowerCase().includes(t))));
    cont.replaceChildren(tabla([
      { t: "Cuenta", v: (c) => [h("strong", c.nombre), c.es_demo ? h("span.estado.info", { style: "margin-left:.4rem" }, "Demo") : null, h("div.tenue", `${c.codigo} · ${c.propietario_email || ""}`)] },
      { t: "Modalidad", v: (c) => MOD[c.modalidad] },
      { t: "Plan", v: (c) => c.plan_nombre },
      { t: "Estado", v: (c) => h("span.estado." + EST[c.estado], c.estado) },
      { t: "Vence", v: (c) => fecha(c.vence) },
      { t: "Estud.", v: (c) => c.estudiantes, clase: "derecha" },
      { t: "Último acceso", v: (c) => c.ultimo_acceso ? fecha(c.ultimo_acceso) : "—" },
      { t: "", clase: "acciones", v: (c) => h("button.btn.btn-sec.btn-sm", { onclick: () => gestionar(c, ps) }, "Gestionar") },
    ], filas, { vacio: "No hay cuentas con esos filtros." }));
  };
  el.append(h("h1", "Cuentas"),
    h("div.filtros",
      h("input", { type: "search", placeholder: "Buscar nombre, código, correo", style: "max-width:280px", oninput: (e) => { texto = e.target.value; pintar(); } }),
      h("select", { onchange: (e) => { fMod = e.target.value; pintar(); } }, h("option", { value: "" }, "Todas las modalidades"), Object.entries(MOD).map(([k, v]) => h("option", { value: k }, v))),
      h("select", { onchange: (e) => { fEst = e.target.value; pintar(); } }, h("option", { value: "" }, "Todos los estados"), Object.keys(EST).map((k) => h("option", { value: k }, k)))),
    h("section.hoja", cont));
  pintar();
}

function gestionar(c, ps) {
  const delPlan = ps.filter((p) => p.modalidad === c.modalidad);
  const cuerpo = h("div",
    h("p", h("strong", c.nombre), h("br"), h("span.tenue", `${MOD[c.modalidad]} · código ${c.codigo} · ${c.propietario_email || ""} ${c.telefono || ""}`)),
    h("p", `Plan ${c.plan_nombre} · `, h("span.estado." + EST[c.estado], c.estado), ` · vence ${fecha(c.vence)} · ${c.dias_gracia} días de gracia`),
    h("p.tenue", `${c.estudiantes} estudiantes activos · ${c.miembros} usuarios · creada ${fecha(c.creado)}`));
  const m = modal("Gestionar cuenta", cuerpo, [
    { texto: "Registrar pago", onclick: (cerrar) => { cerrar(); registrarPago(c, delPlan); } },
    { texto: "Editar suscripción", clase: "btn-sec", onclick: (cerrar) => { cerrar(); editarSus(c, delPlan); } },
    c.estado === "suspendida" || c.estado === "cancelada"
      ? { texto: "Reactivar", clase: "btn-sec", onclick: async (cerrar) => {
          await actualizarSus(c.cuenta_id, { estado: c.vence >= hoyISO() ? "activa" : "vencida" }); cerrar(); }
        }
      : { texto: "Suspender", clase: "btn-peligro", onclick: async (cerrar) => {
          if (!(await confirmar("Suspender cuenta", `${c.nombre} quedará sin acceso hasta reactivarla. No se borra ningún dato.`, { boton: "Suspender", peligro: true }))) return;
          await actualizarSus(c.cuenta_id, { estado: "suspendida" }); cerrar(); } },
  ]);
  return m;
}

async function actualizarSus(cuentaId, cambios) {
  try { await q(sb.from("suscripciones").update({ ...cambios, actualizado: new Date().toISOString() }).eq("cuenta_id", cuentaId)); toast("Suscripción actualizada"); navegar(); }
  catch (e) { toast(e.message, "mal"); }
}

function editarSus(c, delPlan) {
  formularioModal("Editar suscripción", [
    { name: "plan_id", label: "Plan", type: "select", options: delPlan.map((p) => [p.id, p.nombre]) },
    { name: "estado", label: "Estado", type: "select", options: Object.keys(EST).map((k) => [k, k]) },
    { name: "vence", label: "Vence", type: "date", required: true, help: "Para extender una prueba, mueve esta fecha." },
    { name: "dias_gracia", label: "Días de gracia", type: "number", min: 0, max: 60 },
    { name: "notas", label: "Notas internas", type: "textarea", full: true },
  ], { plan_id: c.plan_id, estado: c.estado, vence: c.vence, dias_gracia: c.dias_gracia }, async (d, cerrar) => {
    await q(sb.from("suscripciones").update({ ...d, actualizado: new Date().toISOString() }).eq("cuenta_id", c.cuenta_id));
    cerrar(); toast("Suscripción actualizada"); navegar();
  });
}

function registrarPago(c, delPlan) {
  const p = delPlan.find((x) => x.id === c.plan_id) || delPlan[0];
  formularioModal(`Registrar pago · ${c.nombre}`, [
    { name: "plan", label: "Plan", type: "select", options: delPlan.map((x) => [x.id, `${x.nombre} (${dinero(x.precio_nio, "NIO")} / ${dinero(x.precio_usd, "USD")})`]) },
    { name: "meses", label: "Meses pagados", type: "number", min: 1, max: 24, required: true, value: 1 },
    { name: "moneda", label: "Moneda", type: "select", options: [["NIO", "Córdobas"], ["USD", "Dólares"]] },
    { name: "monto", label: "Monto recibido", type: "number", min: 0, step: "0.01", required: true, value: p?.precio_nio },
    { name: "metodo", label: "Método", type: "select", options: [["transferencia", "Transferencia"], ["deposito", "Depósito"], ["efectivo", "Efectivo"], ["tarjeta", "Tarjeta"], ["otro", "Otro"]] },
    { name: "referencia", label: "Referencia / comprobante" },
  ], { plan: c.plan_id }, async (d, cerrar) => {
    const hasta = await q(sb.rpc("d360_admin_registrar_pago", { p_cuenta: c.cuenta_id, p_plan: d.plan, p_meses: d.meses, p_monto: d.monto, p_moneda: d.moneda, p_metodo: d.metodo, p_referencia: d.referencia }));
    cerrar(); toast(`Pago registrado. Activa hasta ${fecha(hasta)}`); navegar();
  }, { boton: "Registrar pago" });
}

// ---------------- Planes ----------------
async function seccionPlanes(el) {
  const ps = await planes(true);
  const cfg = await q(sb.from("config_global").select("valor").eq("clave", "publico.tipo_cambio").maybeSingle());
  const tc = Number(cfg?.valor) || 36.62;
  el.append(h("h1", "Planes y precios"),
    h("p.suave", `Los cambios se aplican de inmediato a la página de precios, al registro y a los límites de cada cuenta. Vacío = sin límite. Tipo de cambio de referencia: C$ ${tc}.`),
    ["profesor", "academia", "colegio"].map((mod) => h("section.hoja", h("h2", MOD[mod]),
      tabla([
        { t: "Plan", v: (p) => [h("strong", p.nombre), h("div.tenue", p.id)] },
        { t: "US$", v: (p) => campo(p, "precio_usd", "precio") },
        { t: "C$", v: (p) => campo(p, "precio_nio", "precio") },
        { t: "Estud.", v: (p) => campo(p, "max_estudiantes", "lim") },
        { t: mod === "profesor" ? "Asist." : "Docentes", v: (p) => campo(p, "max_docentes", "lim") },
        { t: "Grupos", v: (p) => campo(p, "max_grupos", "lim") },
        { t: "Admins", v: (p) => campo(p, "max_admins", "lim") },
        { t: "MB", v: (p) => campo(p, "almacenamiento_mb", "lim", true) },
        { t: "", clase: "acciones", v: (p) => h("button.btn.btn-texto.btn-sm", { onclick: () => funciones(p) }, "Funciones") },
      ], ps.filter((p) => p.modalidad === mod)))));

  function campo(p, k, clase, obligatorio) {
    return h("input." + clase, { type: "number", min: 0, step: clase === "precio" ? "0.01" : "1", value: p[k] ?? "", "aria-label": `${p.nombre} ${k}`,
      onchange: async (e) => {
        const v = e.target.value === "" ? null : Number(e.target.value);
        if (v == null && (obligatorio || clase === "precio")) { toast("Este valor es obligatorio", "mal"); e.target.value = p[k]; return; }
        try { await q(sb.from("planes").update({ [k]: v, actualizado: new Date().toISOString() }).eq("id", p.id)); p[k] = v; toast(`${p.nombre}: guardado`); }
        catch (err) { toast(err.message, "mal"); e.target.value = p[k] ?? ""; }
      } });
  }

  function funciones(p) {
    formularioModal(`Funciones · ${p.nombre}`, [
      { name: "nombre", label: "Nombre visible", required: true },
      { name: "resumen", label: "Resumen", full: true },
      ...FUNCIONES.map(([k, t]) => ({ name: "f_" + k, label: t, type: "checkbox" })),
      { name: "activo", label: "Plan disponible para nuevas cuentas", type: "checkbox" },
    ], { nombre: p.nombre, resumen: p.resumen, activo: p.activo, ...Object.fromEntries(FUNCIONES.map(([k]) => ["f_" + k, p.funciones?.[k] === true])) },
    async (d, cerrar) => {
      const f = { ...p.funciones };
      FUNCIONES.forEach(([k]) => (f[k] = !!d["f_" + k]));
      await q(sb.from("planes").update({ nombre: d.nombre, resumen: d.resumen, activo: d.activo, funciones: f, actualizado: new Date().toISOString() }).eq("id", p.id));
      cerrar(); toast("Plan actualizado"); navegar();
    });
  }
}

// ---------------- Promociones ----------------
async function promociones(el) {
  const ps = await q(sb.from("promociones").select("*").order("creado", { ascending: false }));
  const editar = (p) => formularioModal(p ? "Editar promoción" : "Nueva promoción", [
    { name: "codigo", label: "Código", required: true, help: "Mayúsculas, números y guiones. Ej.: REGRESO2027" },
    { name: "descuento_pct", label: "Descuento (%)", type: "number", min: 1, max: 100, required: true },
    { name: "meses", label: "Meses que aplica", type: "number", min: 1, max: 24, value: 1 },
    { name: "modalidad", label: "Modalidad", type: "select", placeholder: "Todas", options: Object.entries(MOD) },
    { name: "valido_hasta", label: "Válido hasta", type: "date" },
    { name: "usos_max", label: "Usos máximos", type: "number", min: 1 },
    { name: "descripcion", label: "Descripción", full: true },
    { name: "activo", label: "Activa", type: "checkbox", value: true },
  ], p, async (d, cerrar) => {
    d.codigo = (d.codigo || "").toUpperCase();
    if (p) await q(sb.from("promociones").update(d).eq("id", p.id)); else await q(sb.from("promociones").insert(d));
    cerrar(); toast("Guardado"); navegar();
  });
  el.append(h("div.hoja-titulo", h("h1", "Promociones"), h("button.btn", { onclick: () => editar(null) }, "Nueva promoción")),
    h("div.aviso", "El descuento se aplica al registrar el pago desde «Cuentas»: escribe el monto con el descuento ya aplicado. El cobro automático con códigos de promoción aún no está implementado."),
    h("section.hoja", tabla([
      { t: "Código", v: (p) => h("strong", p.codigo) },
      { t: "Descuento", v: (p) => `${Number(p.descuento_pct)}% × ${p.meses} mes(es)` },
      { t: "Modalidad", v: (p) => MOD[p.modalidad] || "Todas" },
      { t: "Vigencia", v: (p) => p.valido_hasta ? fecha(p.valido_hasta) : "Sin fecha" },
      { t: "Usos", v: (p) => `${p.usos}${p.usos_max ? ` / ${p.usos_max}` : ""}` },
      { t: "Estado", v: (p) => h("span.estado" + (p.activo ? ".ok" : ""), p.activo ? "Activa" : "Inactiva") },
      { t: "", clase: "acciones", v: (p) => h("button.btn.btn-texto.btn-sm", { onclick: () => editar(p) }, "Editar") },
    ], ps, { vacio: "Sin promociones." })));
}

// ---------------- Actividad ----------------
async function actividad(el) {
  const filas = await q(sb.rpc("d360_admin_actividad", { p_limite: 200 }));
  el.append(h("h1", "Registro de actividad"), h("p.suave", "Últimas 200 operaciones sensibles: accesos, pagos, cambios de plan, usuarios y calificaciones modificadas."),
    h("section.hoja", tabla([
      { t: "Fecha", v: (a) => new Date(a.creado).toLocaleString("es-NI") },
      { t: "Cuenta", v: (a) => a.cuenta || h("span.tenue", "Plataforma") },
      { t: "Acción", v: (a) => h("span.estado" + (/fallido|delete|suspend/.test(a.accion) ? ".mal" : ""), a.accion) },
      { t: "Sobre", v: (a) => a.entidad },
      { t: "Quién", v: (a) => a.usuario },
      { t: "", clase: "acciones", v: (a) => a.detalle ? h("button.btn.btn-texto.btn-sm", { onclick: () => modal("Detalle", h("pre.det", JSON.stringify(a.detalle, null, 2)), [{ texto: "Cerrar" }]) }, "Ver") : null },
    ], filas, { vacio: "Sin actividad registrada." })));
}

// ---------------- Parámetros ----------------
async function parametros(el) {
  const cfg = await q(sb.from("config_global").select("*").order("clave"));
  el.append(h("h1", "Parámetros generales"), h("p.suave", "Las claves que empiezan por «publico.» se pueden leer desde la página pública."),
    h("section.hoja", tabla([
      { t: "Parámetro", v: (c) => [h("strong", c.descripcion || c.clave), h("div.tenue", c.clave)] },
      { t: "Valor", v: (c) => h("input", { value: typeof c.valor === "string" ? c.valor : JSON.stringify(c.valor), style: "max-width:240px",
          onchange: async (e) => {
            let v = e.target.value.trim();
            let json;
            try { json = JSON.parse(v); } catch { json = v; }
            try { await q(sb.from("config_global").update({ valor: json, actualizado: new Date().toISOString() }).eq("clave", c.clave)); toast("Guardado"); }
            catch (err) { toast(err.message, "mal"); }
          } }) },
      { t: "Actualizado", v: (c) => fecha(c.actualizado) },
    ], cfg)));
}

// ---------------- Router ----------------
const VISTAS = { resumen, cuentas, planes: seccionPlanes, promociones, actividad, parametros };
let nav = 0;
async function navegar() {
  const r = location.hash.replace(/^#\/?/, "").split("?")[0] || "resumen";
  const fn = VISTAS[r] || resumen;
  document.querySelectorAll("[data-r]").forEach((a) => (a.dataset.r === r ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  const n = ++nav; cargando(main);
  try { const v = h("div"); v.append = (...xs) => Element.prototype.append.apply(v, xs.flat(Infinity).filter((x) => x != null && x !== false)); await fn(v); if (n === nav) main.replaceChildren(v); }
  catch (e) { console.error(e); if (n === nav) errorEn(main, e, navegar); }
}
addEventListener("hashchange", navegar);
navegar();
