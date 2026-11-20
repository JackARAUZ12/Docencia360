// Modo híbrido: Docencia360 sigue funcionando sin internet.
//
// · Con internet todo va directo al servidor (como siempre) y se guarda una copia
//   de lo que se consulta en este dispositivo.
// · Sin internet se muestra la última copia guardada, y lo que se guarda (lista,
//   notas, estudiantes, grupos, cobros…) queda en una «bandeja» local.
// · Al volver el internet, la bandeja se sube sola y en orden. El servidor vuelve a
//   revisar permisos y reglas (RLS): sin conexión no se salta ninguna protección.
//
// Lo que necesita internet siempre (registro, entrar por primera vez, matricular,
// aula de estudiantes, cambiar de plan…) avisa con un mensaje claro.
import { CONFIG } from "../config.js";

const fetchRed = (...a) => fetch(...a);   // fetch real del navegador

// ---------- Qué funciona sin internet ----------
// Tablas que se pueden modificar sin conexión (se suben al volver el internet)
const TABLAS_OFFLINE = new Set(["asistencias", "calificaciones", "evaluaciones", "observaciones", "boletin_comentarios", "asistencia_docentes",
  "estudiantes", "grupos", "horarios", "grupo_estudiantes", "grupo_docentes", "recuperaciones"]);
// Tablas con «id» propio: el id se crea en el dispositivo para que, si un envío se
// repite, el servidor lo reconozca y no se duplique.
const SIN_ID = new Set(["grupo_estudiantes"]);
// Cobros que se pueden hacer sin conexión (con comprobante provisional)
const RPC_OFFLINE = new Set(["d360_cobrar_varios", "d360_cobro_clase"]);
// Consultas por RPC (solo leen): se guardan en copia como las tablas
const RPC_LECTURA = new Set(["d360_resumen_asistencia", "d360_promedios_grupo", "d360_notas_seccion", "d360_resumen_panel", "d360_resumen_colegio",
  "d360_informe_operativo", "d360_finanzas_resumen", "d360_es_plataforma_admin", "d360_carga_instructores", "d360_caja_dia", "d360_mis_cuentas",
  "d360_guia", "d360_instructores_liquidacion", "d360_actividad_resultados"]);
// Tablas de «marcas» del día: si no hay copia, se parte de vacío (p. ej. la lista de hoy aún no se pasó)
const MARCAS = new Set(["asistencias", "calificaciones", "observaciones", "asistencia_docentes", "recuperaciones"]);

const NOMBRES = { asistencias: "Asistencia", calificaciones: "Notas", evaluaciones: "Evaluación", observaciones: "Observación", boletin_comentarios: "Comentario de boletín",
  asistencia_docentes: "Asistencia de docentes", estudiantes: "Estudiante", grupos: "Grupo", horarios: "Horario", grupo_estudiantes: "Estudiantes del grupo",
  grupo_docentes: "Docente del grupo", recuperaciones: "Recuperación", d360_cobrar_varios: "Cobro", d360_cobro_clase: "Clase cobrada" };

// ---------- Base local (IndexedDB) ----------
let dbP;
function db() {
  return (dbP ||= new Promise((ok, mal) => {
    const r = indexedDB.open("d360-local", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("copias");
      d.createObjectStore("bandeja", { keyPath: "n", autoIncrement: true });
      d.createObjectStore("hechos", { keyPath: "clave" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  }));
}
async function tx(store, modo, fn) {
  const d = await db();
  return new Promise((ok, mal) => {
    const t = d.transaction(store, modo); const s = t.objectStore(store);
    let res; Promise.resolve(fn(s)).then((v) => { res = v; });
    t.oncomplete = () => ok(res); t.onerror = () => mal(t.error); t.onabort = () => mal(t.error);
  });
}
const req = (r) => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });

/** Usuario de la sesión guardada (sirve también sin internet). */
export function usuarioLocal() {
  try { const s = JSON.parse(localStorage.getItem("d360-sesion") || "null"); return s?.user || s?.currentSession?.user || null; } catch (_) { return null; }
}
const uid = () => usuarioLocal()?.id || "anon";

// ---------- Estado de conexión ----------
let enLinea = navigator.onLine !== false;
let sincronizando = false;
const avisar = () => dispatchEvent(new CustomEvent("d360:conexion", { detail: estadoActual }));
let estadoActual = { enLinea, pendientes: 0, errores: 0, sincronizando: false };
async function refrescarEstado() {
  const items = await bandeja().catch(() => []);
  estadoActual = { enLinea, pendientes: items.filter((x) => x.estado === "pendiente").length, errores: items.filter((x) => x.estado === "error").length, sincronizando };
  avisar();
  return estadoActual;
}
export const estado = () => estadoActual;
function marcarRed(v) {
  if (enLinea === v) return;
  enLinea = v; refrescarEstado();
  if (v) programarSync(300); else sondear();
}
// Si la red falla pero el equipo dice estar conectado (wifi sin internet), se prueba cada 20 s
let tSondeo;
function sondear() {
  clearTimeout(tSondeo);
  tSondeo = setTimeout(async () => {
    if (enLinea) return;
    if (navigator.onLine === false) return sondear();
    try { const r = await fetchRed(CONFIG.supabaseUrl + "/auth/v1/health", { headers: { apikey: CONFIG.supabaseKey }, cache: "no-store" }); if (r.status < 500) return marcarRed(true); } catch (_) {}
    sondear();
  }, 20000);
}
addEventListener("online", () => marcarRed(true));
addEventListener("offline", () => marcarRed(false));
/** Prueba la conexión ahora (botón «Reintentar»). */
export async function probarConexion() {
  try { const r = await fetchRed(CONFIG.supabaseUrl + "/auth/v1/health", { headers: { apikey: CONFIG.supabaseKey }, cache: "no-store" }); marcarRed(r.status < 500); }
  catch (_) { marcarRed(false); }
  if (enLinea) await sincronizar().catch(() => {});
  return estadoActual;
}

const errorRed = (e) => e instanceof TypeError || e?.name === "AbortError" || e?.name === "TimeoutError";
function errorD360(code, message) { return Object.assign(new Error(message), { code }); }
export const SIN_COPIA = "D360_SIN_COPIA", REQUIERE_INTERNET = "D360_REQUIERE_INTERNET";

// ---------- Filtros de PostgREST (para aplicar los cambios pendientes a la copia) ----------
const IGNORAR = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
function filtros(url) {
  const out = []; let desconocido = false;
  for (const [k, v] of url.searchParams) {
    if (IGNORAR.has(k)) continue;
    const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|in|is)\.(.*)$/s.exec(v);
    if (!m || k.includes(".") || k === "or" || k === "and") { desconocido = true; continue; }
    out.push({ col: k, no: !!m[1], op: m[2], val: m[3] });
  }
  return { lista: out, desconocido };
}
const comparar = (a, b) => { const na = Number(a), nb = Number(b); return a !== "" && b !== "" && !isNaN(na) && !isNaN(nb) ? na - nb : String(a).localeCompare(String(b)); };
function cumple(fila, f) {
  for (const { col, no, op, val } of f.lista) {
    if (!(col in fila)) return false;
    const x = fila[col]; const s = x == null ? null : String(x);
    let r;
    if (op === "is") r = val === "null" ? x == null : String(x) === val;
    else if (op === "in") r = val.replace(/^\(|\)$/g, "").split(",").map((t) => t.replace(/^"|"$/g, "")).includes(s);
    else if (s == null) r = false;
    else if (op === "eq") r = s === val; else if (op === "neq") r = s !== val;
    else { const c = comparar(s, val); r = op === "gt" ? c > 0 : op === "gte" ? c >= 0 : op === "lt" ? c < 0 : c <= 0; }
    if (no ? r : !r) return false;
  }
  return true;
}
// Relaciones pedidas en select=*,grupo_estudiantes(...),cursos(...): se rellenan vacías en filas nuevas
function relaciones(url) {
  const s = url.searchParams.get("select") || ""; const out = []; let nivel = 0, tok = "";
  for (const ch of s) {
    if (ch === "(") { if (nivel === 0) out.push(tok.trim().split(":")[0].replace(/!.*/, "")); nivel++; tok = ""; continue; }
    if (ch === ")") { nivel--; tok = ""; continue; }
    if (ch === "," && nivel === 0) { tok = ""; continue; }
    if (nivel === 0) tok += ch;
  }
  return out.filter(Boolean);
}

function ordenar(filas, url) {
  const o = url.searchParams.getAll("order").flatMap((x) => x.split(",")).map((x) => { const [col, dir] = x.split("."); return { col, desc: dir === "desc" }; });
  if (!o.length) return filas;
  return filas.slice().sort((a, b) => { for (const { col, desc } of o) { const c = comparar(a[col] ?? "", b[col] ?? ""); if (c) return desc ? -c : c; } return 0; });
}

/** Aplica a una copia guardada los cambios que siguen en la bandeja (para verlos sin internet). */
function superponer(url, tabla, datos, pend) {
  if (!pend.length) return datos;
  const esLista = Array.isArray(datos); let filas = esLista ? datos.map((x) => ({ ...x })) : datos && typeof datos === "object" ? [{ ...datos }] : null;
  if (!filas) return datos;
  const f = filtros(url); const rel = relaciones(url);
  const tocadas = new Set();
  for (const it of pend) {
    const u = new URL(it.url);
    if (it.tabla === tabla) {
      const cuerpo = it.body ? JSON.parse(it.body) : null;
      if (it.metodo === "POST") {
        const prefer = it.headers.Prefer || it.headers.prefer || "";
        const llaves = (u.searchParams.get("on_conflict") || (SIN_ID.has(tabla) ? "" : "id")).split(",").filter(Boolean);
        for (const fila of [].concat(cuerpo || [])) {
          const i = llaves.length ? filas.findIndex((x) => llaves.every((k) => k in fila && String(x[k]) === String(fila[k]))) : -1;
          if (i >= 0) { if (!/ignore-duplicates/.test(prefer)) { filas[i] = { ...filas[i], ...fila, _pendiente: true }; } }
          else if (esLista && !f.desconocido && cumple(fila, f)) { const n = { ...fila, _pendiente: true }; rel.forEach((r) => { if (!(r in n)) n[r] = /s$/.test(r) ? [] : null; }); filas.push(n); }
        }
      } else if (it.metodo === "PATCH") {
        const fp = filtros(u);
        filas = filas.map((x) => (cumple(x, fp) ? (tocadas.add(x), { ...x, ...cuerpo, _pendiente: true }) : x));
      } else if (it.metodo === "DELETE") {
        const fp = filtros(u);
        filas = filas.filter((x) => !cumple(x, fp));
      }
    }
    // Cobros sin conexión: el saldo de los conceptos ya baja aquí (evita cobrar dos veces)
    if (tabla === "cargos" && it.rpc === "d360_cobrar_varios") {
      const b = JSON.parse(it.body || "{}");
      for (const p of b.p_items || []) {
        const i = filas.findIndex((x) => x.id === p.cargo_id);
        if (i < 0 || !("pagado" in filas[i])) continue;
        const c = { ...filas[i], pagado: Number(filas[i].pagado || 0) + Number(p.monto || 0), _pendiente: true };
        const saldo = Number(c.monto || 0) - Number(c.descuento || 0) - c.pagado;
        if ("estado" in c) c.estado = saldo <= 0.005 ? "pagado" : "parcial";
        filas[i] = c; tocadas.add(c);
      }
      filas = filas.filter((x) => !tocadas.has(x) || f.desconocido || cumple(x, f));
    }
  }
  return esLista ? filas : filas[0];
}

// ---------- Copias de lo consultado ----------
const claveCopia = (metodo, url, body) => `${uid()}|${metodo} ${url.pathname}${url.search}${body ? "|" + body : ""}`;
// Clave «parecida»: misma tabla y mismos filtros, sin importar columnas ni orden. Sirve para
// usar sin internet una copia que trae más columnas (p. ej. la lista completa de instructores).
const clavePariente = (url) => {
  const f = [...url.searchParams].filter(([k]) => !["select", "order", "limit", "offset"].includes(k)).sort().map(([k, v]) => `${k}=${v}`).join("&");
  return `~${uid()}|${url.pathname}?${f}`;
};
function columnas(url) {
  const s = url.searchParams.get("select") || "*"; const cols = new Set(), rels = new Set(); let nivel = 0, tok = "";
  const cerrar = () => { const t = tok.trim(); if (t) cols.add(t.split(":").pop().replace(/::.*/, "")); tok = ""; };
  for (const ch of s) {
    if (ch === "(") { if (nivel === 0) { rels.add(tok.trim().split(":")[0].replace(/!.*/, "")); tok = ""; } nivel++; continue; }
    if (ch === ")") { nivel--; continue; }
    if (nivel > 0) continue;
    if (ch === ",") { cerrar(); continue; }
    tok += ch;
  }
  cerrar();
  return { cols, rels };
}
async function guardarCopia(k, resp, url, metodo) {
  try {
    const texto = await resp.clone().text();
    if (texto.length > 4_000_000) return;   // no guarda respuestas gigantes
    await tx("copias", "readwrite", (s) => {
      s.put({ s: resp.status, h: { "content-type": resp.headers.get("content-type") || "application/json", "content-range": resp.headers.get("content-range") || "" }, b: texto, t: Date.now() }, k);
      if (metodo === "GET" && !url.pathname.includes("/rpc/")) {
        const kp = clavePariente(url);
        return req(s.get(kp)).then((lista) => { const l = (lista || []).filter((x) => x.k !== k); l.push({ k, sel: url.searchParams.get("select") || "*" }); s.put(l.slice(-6), kp); });
      }
    });
  } catch (_) { /* sin espacio o modo privado: se sigue sin copia */ }
}
/** Busca una copia de la misma consulta que traiga al menos las columnas pedidas. */
async function copiaPariente(url) {
  const lista = await tx("copias", "readonly", (s) => req(s.get(clavePariente(url)))).catch(() => null);
  if (!lista?.length) return null;
  const pide = columnas(url);
  for (const { k, sel } of lista.slice().reverse()) {
    const tiene = columnas(new URL("http://x/?select=" + encodeURIComponent(sel)));
    const colsOk = tiene.cols.has("*") || [...pide.cols].every((c) => c === "*" ? false : tiene.cols.has(c));
    if (colsOk && [...pide.rels].every((r) => tiene.rels.has(r))) { const c = await leerCopia(k); if (c) return c; }
  }
  return null;
}
const leerCopia = (k) => tx("copias", "readonly", (s) => req(s.get(k))).catch(() => null);
let ultimaCopia = null;   // fecha de la copia mostrada (para «visto por última vez…»)
export const fechaUltimaCopia = () => ultimaCopia;

function respuesta(status, cuerpo, h = {}) {
  const sinCuerpo = status === 204 || cuerpo === undefined;
  return new Response(sinCuerpo ? null : typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json", ...h } });
}

async function leer(url, init, metodo, tabla) {
  const k = claveCopia(metodo, url, init?.body);
  if (enLinea) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    init?.signal?.addEventListener?.("abort", () => ctl.abort());
    try {
      const r = await fetchRed(url.href, { ...init, signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) guardarCopia(k, r, url, metodo);
      return r;
    } catch (e) {
      clearTimeout(t);
      if (init?.signal?.aborted) throw e;
      if (!errorRed(e)) throw e;
      marcarRed(false);
    }
  }
  // Sin conexión: última copia + cambios pendientes
  let c = await leerCopia(k);
  // Orden distinto de los datos: se reordena según «order» si se usa una copia parecida
  let pariente = false;
  if (!c && metodo === "GET" && tabla) { c = await copiaPariente(url); pariente = !!c; }
  const pend = (await bandeja().catch(() => [])).filter((x) => x.estado === "pendiente");
  if (c) {
    ultimaCopia = c.t;
    if (metodo === "HEAD" || !tabla) return new Response(metodo === "HEAD" ? null : c.b, { status: c.s, headers: c.h });
    let datos; try { datos = c.b ? JSON.parse(c.b) : null; } catch (_) { return new Response(c.b, { status: c.s, headers: c.h }); }
    if (pariente && Array.isArray(datos)) datos = ordenar(datos, url);
    return respuesta(c.s, superponer(url, tabla, datos, pend), c.h);
  }
  // Sin copia: se parte de vacío si son «marcas» del día, si hay registros nuevos de esa
  // o si se consulta algo que se creó sin internet (aún no tiene historia)
  const nuevos = new Set(pend.filter((x) => x.metodo === "POST" && x.tabla).flatMap((x) => { try { return [].concat(JSON.parse(x.body || "[]")).map((r) => r?.id).filter(Boolean); } catch (_) { return []; } }));
  const deAlgoNuevo = filtros(url).lista.some((f) => f.op === "eq" && nuevos.has(f.val));
  if (tabla && metodo === "GET" && (MARCAS.has(tabla) || deAlgoNuevo)) {
    const objeto = /vnd\.pgrst\.object/.test(new Headers(init?.headers).get("accept") || "");
    const datos = superponer(url, tabla, [], pend);
    if (objeto) return datos.length === 1 ? respuesta(200, datos[0]) : respuesta(406, { code: "PGRST116", message: "Sin datos guardados en este dispositivo." });
    return respuesta(200, datos);
  }
  if (globalThis.__D360_DEPURAR) console.warn("sin copia:", metodo, url.pathname + url.search);
  throw errorD360(SIN_COPIA, "Sin conexión: esta información todavía no se abrió con internet en este dispositivo.");
}

// ---------- Bandeja de cambios por subir ----------
export async function bandeja() {
  const u = uid();
  return (await tx("bandeja", "readonly", (s) => req(s.getAll()))).filter((x) => x.uid === u);
}
const ETIQ = "x-d360-etiqueta";
/**
 * Pone un texto entendible (y datos extra, p. ej. el comprobante) a una consulta, por si
 * queda en la bandeja: «Cobro a Ana · C$500». La marca nunca sale del navegador.
 */
export function etiquetar(builder, texto, extra = null) {
  try { builder.headers = { ...(builder.headers || {}), [ETIQ]: encodeURIComponent(JSON.stringify({ texto, extra })) }; } catch (_) {}
  return builder;
}
function sacarEtiqueta(init) {
  const hs = new Headers(init?.headers); const v = hs.get(ETIQ);
  if (!v) return { init, etiqueta: null };
  hs.delete(ETIQ);
  let etiqueta = null; try { etiqueta = JSON.parse(decodeURIComponent(v)); } catch (_) {}
  return { init: { ...init, headers: hs }, etiqueta };
}

function cabeceras(init) {
  const out = {}; new Headers(init?.headers).forEach((v, k) => { if (k !== "authorization") out[k] = v; });
  return out;
}

async function encolar(url, init, metodo, tabla, rpc, body, etiqueta) {
  const item = { uid: uid(), t: Date.now(), metodo, url: url.href, headers: cabeceras(init), body, tabla, rpc, estado: "pendiente", error: null, intentos: 0,
    resumen: etiqueta?.texto || describir(metodo, tabla || rpc, body), extra: etiqueta?.extra || null };
  await tx("bandeja", "readwrite", (s) => s.add(item));
  refrescarEstado();
  dispatchEvent(new CustomEvent("d360:encolado", { detail: item }));
  return item;
}
function describir(metodo, nombre, body) {
  const n = NOMBRES[nombre] || nombre;
  let cuantos = 1; try { const b = JSON.parse(body || "null"); if (Array.isArray(b)) cuantos = b.length; } catch (_) {}
  if (RPC_OFFLINE.has(nombre)) return n;
  const verbo = metodo === "DELETE" ? "borrado" : metodo === "PATCH" ? "cambio" : "guardado";
  return `${n} · ${verbo}${cuantos > 1 ? ` (${cuantos})` : ""}`;
}

/** Respuesta inmediata para un cambio que quedó en la bandeja (como si el servidor hubiera respondido). */
function respuestaLocal(url, init, metodo, rpc, body, item) {
  const h = new Headers(init?.headers);
  const objeto = /vnd\.pgrst\.object/.test(h.get("accept") || "");
  const conDatos = /return=representation/.test(h.get("prefer") || "");
  if (rpc) { const b = JSON.parse(body || "{}"); return respuesta(200, { _pendiente: true, clave: b.p_clave, n: item.n }); }
  let filas = [];
  if (metodo === "POST") filas = [].concat(JSON.parse(body || "[]")).map((x) => ({ ...x, _pendiente: true }));
  else if (metodo === "PATCH") { const extra = {}; for (const f of filtros(url).lista) if (f.op === "eq" && !f.no) extra[f.col] = f.val; filas = [{ ...extra, ...JSON.parse(body || "{}"), _pendiente: true }]; }
  if (!conDatos) return respuesta(metodo === "POST" ? 201 : 204);
  return respuesta(metodo === "POST" ? 201 : 200, objeto ? filas[0] || null : filas);
}

async function escribir(url, init, metodo, tabla, rpc, etiqueta) {
  const permitido = (tabla && TABLAS_OFFLINE.has(tabla)) || (rpc && RPC_OFFLINE.has(rpc));
  let body = init?.body;
  // Ids creados aquí (inserciones simples) y clave del cobro: así un reenvío nunca duplica
  try {
    const prefer = new Headers(init?.headers).get("prefer") || "";
    if (tabla && TABLAS_OFFLINE.has(tabla) && !SIN_ID.has(tabla) && metodo === "POST" && !/resolution=/.test(prefer) && typeof body === "string") {
      const b = JSON.parse(body); const conId = (x) => (x && typeof x === "object" && !x.id ? { ...x, id: crypto.randomUUID() } : x);
      body = JSON.stringify(Array.isArray(b) ? b.map(conId) : conId(b));
    }
    if (rpc && RPC_OFFLINE.has(rpc) && typeof body === "string") {
      const b = JSON.parse(body); if (!b.p_clave) { b.p_clave = crypto.randomUUID(); body = JSON.stringify(b); }
    }
  } catch (_) { /* cuerpo no JSON: se envía tal cual */ }
  const sinRed = async () => {
    if (!permitido) throw errorD360(REQUIERE_INTERNET, "Esto necesita internet. Conéctate para hacerlo; lo demás puedes seguir usándolo sin conexión.");
    if (rpc) { const b = JSON.parse(body || "{}"); b.p_cobrado_en ||= new Date().toISOString(); body = JSON.stringify(b); }
    const item = await encolar(url, init, metodo, tabla, rpc, body, etiqueta);
    return respuestaLocal(url, init, metodo, rpc, body, item);
  };
  if (!enLinea) return sinRed();
  // Si hay cambios anteriores sin subir, primero se suben (para respetar el orden)
  if (estadoActual.pendientes > 0) {
    await sincronizar().catch(() => {});
    if (estadoActual.pendientes > 0 && permitido) return sinRed();
  }
  try {
    return await fetchRed(url.href, { ...init, body });
  } catch (e) {
    if (init?.signal?.aborted || !errorRed(e)) throw e;
    marcarRed(false);
    return sinRed();
  }
}

/** fetch que usa el cliente de Supabase: con internet va directo; sin internet usa la copia y la bandeja. */
export async function fetchHibrido(input, init0 = {}) {
  const { init, etiqueta } = sacarEtiqueta(init0);
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!href.startsWith(CONFIG.supabaseUrl + "/rest/v1/")) {
    // Inicio de sesión, funciones y archivos: siempre por internet
    try { return await fetchRed(input, init); } catch (e) { if (errorRed(e) && !init?.signal?.aborted) marcarRed(false); throw e; }
  }
  const url = new URL(href);
  const metodo = (init.method || "GET").toUpperCase();
  const rpc = url.pathname.startsWith("/rest/v1/rpc/") ? url.pathname.slice(13) : null;
  const tabla = rpc ? null : url.pathname.slice(9);
  if (metodo === "GET" || metodo === "HEAD" || (rpc && RPC_LECTURA.has(rpc))) return leer(url, init, metodo, tabla);
  return escribir(url, init, metodo, tabla, rpc, etiqueta);
}

// ---------- Subir la bandeja ----------
let tSync;
function programarSync(ms = 30000) { clearTimeout(tSync); tSync = setTimeout(() => sincronizar().catch(() => {}), ms); }

async function actualizarItem(it) { await tx("bandeja", "readwrite", (s) => s.put(it)); }
async function quitarItem(n) { await tx("bandeja", "readwrite", (s) => s.delete(n)); }

/** Sube los cambios pendientes, en el orden en que se hicieron. */
export async function sincronizar() {
  if (sincronizando) return estadoActual;
  const correr = async () => {
    const pend = (await bandeja()).filter((x) => x.estado === "pendiente").sort((a, b) => a.n - b.n);
    if (!pend.length) return refrescarEstado();
    const { sb } = await import("./sb.js");
    let token = (await sb.auth.getSession()).data?.session?.access_token;
    if (!token) return refrescarEstado();   // sin sesión: se sube cuando vuelva a entrar
    sincronizando = true; await refrescarEstado();
    let subidos = 0, conError = 0;
    const resultados = [];
    try {
      for (const it of pend) {
        let r;
        const enviar = () => fetchRed(it.url, { method: it.metodo, headers: { ...it.headers, authorization: `Bearer ${token}` }, body: it.body });
        try { r = await enviar(); } catch (e) { marcarRed(false); break; }
        marcarRed(true);
        if (r.status === 401) {   // la sesión venció mientras no había internet: se renueva y se reintenta
          const s = await sb.auth.refreshSession().catch(() => null); token = s?.data?.session?.access_token;
          if (!token) break;
          try { r = await enviar(); } catch (_) { break; }
        }
        let cuerpo = null; try { const tx = await r.text(); cuerpo = tx ? JSON.parse(tx) : null; } catch (_) {}
        const duplicado = r.status === 409 && cuerpo?.code === "23505" && it.metodo === "POST";
        if (r.ok || duplicado) {
          await quitarItem(it.n); subidos++;
          if (it.rpc) { const reg = { clave: JSON.parse(it.body || "{}").p_clave, rpc: it.rpc, resumen: it.resumen, extra: it.extra, t: it.t, resultado: cuerpo, subido: Date.now(), uid: it.uid };
            if (reg.clave) await tx("hechos", "readwrite", (s) => s.put(reg)).catch(() => {}); resultados.push(reg); }
        } else if (r.status >= 500 || r.status === 401 || r.status === 429) {
          break;   // problema del servidor: se reintenta más tarde
        } else {
          it.estado = "error"; it.intentos++; it.error = cuerpo?.message || `Error ${r.status}`; it.codigo = cuerpo?.code || String(r.status);
          await actualizarItem(it); conError++;
        }
      }
    } finally { sincronizando = false; }
    await refrescarEstado();
    if (subidos || conError) dispatchEvent(new CustomEvent("d360:sincronizado", { detail: { subidos, conError, resultados } }));
    if (subidos) dispatchEvent(new CustomEvent("d360:cambio"));
    if (estadoActual.pendientes) programarSync(enLinea ? 30000 : 60000);
    return estadoActual;
  };
  return navigator.locks?.request ? navigator.locks.request("d360-sync", { ifAvailable: true }, (l) => (l ? correr() : estadoActual)) : correr();
}

/** Quita de la bandeja un cambio que el servidor rechazó (el usuario lo decide). */
export async function descartar(n) { await quitarItem(n); await refrescarEstado(); }
/** Vuelve a intentar un cambio rechazado. */
export async function reintentar(n) {
  const it = (await bandeja()).find((x) => x.n === n); if (!it) return;
  it.estado = "pendiente"; it.error = null; await actualizarItem(it); await refrescarEstado(); return sincronizar();
}
/** Cobros sin conexión ya subidos (para reimprimir con el número definitivo). */
export async function cobrosSubidos() {
  const u = uid();
  return (await tx("hechos", "readonly", (s) => req(s.getAll())).catch(() => [])).filter((x) => x.uid === u).sort((a, b) => b.t - a.t);
}
export async function cobroSubido(clave) { return clave ? tx("hechos", "readonly", (s) => req(s.get(clave))).catch(() => null) : null; }

/** Al cerrar sesión: se borran las copias de este usuario (privacidad). La bandeja se conserva para subirla luego. */
export async function borrarCopias() {
  const u = uid() + "|";
  try {
    await tx("copias", "readwrite", (s) => new Promise((ok) => {
      const r = s.openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return ok(); if (String(c.key).startsWith(u)) c.delete(); c.continue(); };
    }));
  } catch (_) {}
}

// Arranque: estado inicial y subir lo pendiente
refrescarEstado().then((e) => { if (e.pendientes && enLinea) programarSync(1500); });
setInterval(() => { if (enLinea && estadoActual.pendientes && !sincronizando) sincronizar().catch(() => {}); }, 45000);
