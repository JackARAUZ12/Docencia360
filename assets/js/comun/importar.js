// Importar estudiantes desde Excel (.xlsx) o CSV.
// 1) Se lee el archivo en el navegador. 2) Se reconocen las columnas (editable).
// 3) Se revisa cada fila. 4) El servidor (d360_importar_estudiantes) valida otra vez,
// omite duplicados, respeta el límite del plan y, si se eligió, inscribe o matricula.
import { sb, q, mensajeError } from "../core/sb.js";
import { h, modal, tabla, descargarCSV } from "../core/ui.js";
import { leerHoja, aFechaISO } from "../core/hoja.js";

const CAMPOS = [
  { k: "nombres", t: "Nombres", alias: ["nombres", "nombre", "primer nombre", "nombres del estudiante", "nombre del estudiante"] },
  { k: "apellidos", t: "Apellidos", alias: ["apellidos", "apellido", "apellidos del estudiante"] },
  { k: "nombre_completo", t: "Nombre completo (se separa solo)", alias: ["nombre completo", "estudiante", "alumno", "alumna", "nombres y apellidos", "apellidos y nombres", "nombre y apellido"] },
  { k: "fecha_nacimiento", t: "Fecha de nacimiento", alias: ["fecha de nacimiento", "fecha nacimiento", "nacimiento", "fecha nac", "f nacimiento", "f de nacimiento"] },
  { k: "genero", t: "Género / sexo", alias: ["genero", "sexo"] },
  { k: "documento", t: "Cédula / documento", alias: ["cedula", "documento", "identificacion", "n de cedula", "numero de cedula"] },
  { k: "codigo", t: "Código / carné", alias: ["codigo", "carne", "carnet", "codigo estudiante", "codigo del estudiante", "codigo mined", "numero de matricula"] },
  { k: "telefono", t: "Teléfono del estudiante", alias: ["telefono", "celular", "telefono del estudiante", "tel"] },
  { k: "email", t: "Correo", alias: ["correo", "email", "correo electronico", "e mail"] },
  { k: "direccion", t: "Dirección", alias: ["direccion", "domicilio"] },
  { k: "contacto_nombre", t: "Responsable (madre, padre, tutor)", alias: ["responsable", "tutor", "padre o madre", "madre o padre", "nombre del tutor", "nombre del responsable", "encargado", "madre", "padre", "nombre de la madre", "nombre del padre"] },
  { k: "contacto_telefono", t: "Teléfono del responsable", alias: ["telefono del responsable", "telefono responsable", "telefono del tutor", "telefono tutor", "celular del tutor", "telefono de la madre", "telefono del padre", "telefono encargado", "tel responsable", "tel tutor"] },
  { k: "contacto_parentesco", t: "Parentesco", alias: ["parentesco"] },
  { k: "observaciones", t: "Observaciones", alias: ["observaciones", "notas", "comentarios"] },
];
const POR_ENVIO = 200;
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();
const letra = (i) => { let s = ""; i++; while (i) { s = String.fromCharCode(65 + ((i - 1) % 26)) + s; i = Math.floor((i - 1) / 26); } return s; };

/** Reconoce qué columna corresponde a cada campo. Devuelve { campo: índice }. */
export function reconocer(cabecera) {
  const cols = cabecera.map(norm), mapa = {}, usadas = new Set();
  for (const c of CAMPOS) {                      // 1) coincidencia exacta
    const i = cols.findIndex((x, j) => !usadas.has(j) && c.alias.includes(x));
    if (i >= 0) { mapa[c.k] = i; usadas.add(i); }
  }
  const parciales = CAMPOS.flatMap((c) => c.alias.map((a) => ({ c, a }))).sort((x, y) => y.a.length - x.a.length);
  for (const { c, a } of parciales) {            // 2) la columna contiene el alias (el alias más largo gana)
    if (mapa[c.k] != null || a.length < 4) continue;
    const i = cols.findIndex((x, j) => !usadas.has(j) && (` ${x} `).includes(` ${a} `));
    if (i >= 0) { mapa[c.k] = i; usadas.add(i); }
  }
  return mapa;
}

/** Separa un nombre completo en nombres y apellidos. */
export function separarNombre(txt, orden = "nombres") {
  const s = String(txt ?? "").trim().replace(/\s+/g, " ");
  if (!s) return { nombres: "", apellidos: "" };
  if (s.includes(",")) { const [a, n] = s.split(",", 2).map((x) => x.trim()); return { nombres: n, apellidos: a }; }
  const p = s.split(" ");
  if (p.length === 1) return { nombres: p[0], apellidos: "" };
  const nN = p.length === 2 ? 1 : p.length === 3 ? (orden === "nombres" ? 1 : 2) : 2;
  if (orden === "apellidos") { const nA = p.length - nN; return { apellidos: p.slice(0, nA).join(" "), nombres: p.slice(nA).join(" ") }; }
  return { nombres: p.slice(0, nN).join(" "), apellidos: p.slice(nN).join(" ") };
}

function genero(v) {
  const s = norm(v);
  if (!s) return null;
  if (/^(f|fem|femenino|mujer|nina|female)$/.test(s)) return "F";
  if (/^(m|masc|masculino|hombre|varon|nino|male)$/.test(s)) return "M";
  if (/^(o|otro)$/.test(s)) return "O";
  return null;
}

const texto = (v) => (v == null ? "" : typeof v === "number" ? String(v) : String(v).trim());

/** Convierte las filas del archivo en registros listos para enviar, con avisos por fila. */
export function preparar(filas, mapa, { cabecera = true, orden = "nombres" } = {}) {
  const datos = cabecera ? filas.slice(1) : filas;
  return datos.map((f, i) => {
    const v = (k) => (mapa[k] == null ? "" : f[mapa[k]]);
    const reg = { _fila: i + (cabecera ? 2 : 1) };
    for (const c of CAMPOS) if (!["nombre_completo", "fecha_nacimiento", "genero"].includes(c.k)) reg[c.k] = texto(v(c.k));
    if (!reg.nombres && mapa.nombre_completo != null) Object.assign(reg, separarNombre(v("nombre_completo"), orden));
    const avisos = [], errores = [];
    const fv = v("fecha_nacimiento");
    reg.fecha_nacimiento = aFechaISO(fv);
    if (texto(fv) && !reg.fecha_nacimiento) avisos.push("fecha no reconocida (queda vacía)");
    reg.genero = genero(v("genero"));
    if (texto(v("genero")) && !reg.genero) avisos.push("género no reconocido");
    if (reg.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(reg.email)) { avisos.push("correo no válido (queda vacío)"); reg.email = ""; }
    if (!reg.nombres) errores.push("falta el nombre");
    if (reg.nombres.length > 80 || reg.apellidos.length > 80) errores.push("nombre demasiado largo");
    return { reg, avisos, errores };
  });
}

export function plantillaCSV() {
  descargarCSV("plantilla-estudiantes.csv", [["Nombres", "Apellidos", "Fecha de nacimiento", "Sexo", "Cédula", "Código", "Teléfono", "Correo", "Dirección",
    "Responsable", "Teléfono del responsable", "Parentesco", "Observaciones"]]);
}

/** Abre el asistente de importación. */
export async function abrirImportacion(ctx, alTerminar, { grupo = null } = {}) {
  const cuerpo = h("div.importar");
  const m = modal("Importar estudiantes", cuerpo);
  m.el.classList.add("ancho");
  const err = h("div.aviso.mal.oculto", { role: "alert" });
  const fallo = (e) => { err.textContent = mensajeError(e); err.classList.remove("oculto"); };

  // ---- Paso 1: elegir archivo ----
  const entrada = h("input", { type: "file", accept: ".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv", "aria-label": "Archivo de Excel o CSV" });
  entrada.addEventListener("change", async () => {
    const f = entrada.files?.[0]; if (!f) return;
    err.classList.add("oculto");
    try {
      const filas = await leerHoja(f);
      if (filas.length < 1) throw new Error("El archivo está vacío.");
      paso2(f.name, filas);
    } catch (e) { fallo(e); entrada.value = ""; }
  });
  cuerpo.replaceChildren(err,
    h("p", "Sube tu lista de estudiantes en Excel (.xlsx) o CSV. La primera fila debe tener los títulos de las columnas, por ejemplo «Nombres», «Apellidos», «Fecha de nacimiento»."),
    h("ul.suave", h("li", "Reconocemos las columnas solas; puedes corregirlas antes de importar."),
      h("li", "Si tu lista tiene el nombre completo en una sola columna, lo separamos en nombres y apellidos."),
      h("li", "No se crean duplicados: se omiten estudiantes con la misma cédula, código o nombre y fecha de nacimiento."),
      h("li", "El archivo se lee en tu navegador; solo se guardan los estudiantes que importes.")),
    h("label.campo", h("span", "Archivo"), entrada),
    h("p", h("button.btn.btn-texto.btn-sm", { type: "button", onclick: plantillaCSV }, "Descargar una plantilla vacía (CSV)")));

  // ---- Paso 2: columnas, destino y revisión ----
  async function paso2(nombreArchivo, filas) {
    const ancho = Math.max(...filas.map((f) => f.length));
    let mapa = reconocer(filas[0].map(texto));
    let cabecera = Object.keys(mapa).length > 0;
    if (!cabecera) mapa = {};
    let orden = "nombres";
    const destino = await opcionesDestino(ctx, grupo);

    const titulos = () => Array.from({ length: ancho }, (_, i) => `${letra(i)}${cabecera && texto(filas[0][i]) ? " · " + texto(filas[0][i]) : ""}`);
    const resumen = h("div"), revision = h("div");
    const selectores = h("div.importar-columnas");
    const pintarSelectores = () => selectores.replaceChildren(...CAMPOS.map((c) => h("label.campo",
      h("span", c.t),
      h("select", { onchange: (e) => { const v = e.target.value; if (v === "") delete mapa[c.k]; else mapa[c.k] = Number(v); revisar(); } },
        h("option", { value: "" }, "— No importar —"),
        titulos().map((t, i) => h("option", { value: i, selected: mapa[c.k] === i }, t))))));

    let preparados = [];
    const revisar = () => {
      preparados = preparar(filas, mapa, { cabecera, orden });
      const conError = preparados.filter((p) => p.errores.length), conAviso = preparados.filter((p) => !p.errores.length && p.avisos.length);
      const validos = preparados.length - conError.length;
      selectorOrden.classList.toggle("oculto", !(mapa.nombre_completo != null && mapa.nombres == null));
      resumen.replaceChildren(h("div.cifras-mini",
        h("span", h("b", validos), " listos para importar"),
        conError.length ? h("span.mal", h("b", conError.length), " con errores (no se importan)") : null,
        conAviso.length ? h("span.ojo", h("b", conAviso.length), " con avisos") : null));
      const muestra = [...conError, ...conAviso, ...preparados.filter((p) => !p.errores.length && !p.avisos.length)].slice(0, 8);
      revision.replaceChildren(
        mapa.nombres == null && mapa.nombre_completo == null ? h("div.aviso.mal", "Elige qué columna tiene el nombre de los estudiantes.") : null,
        tabla([
          { t: "Fila", v: (p) => `Fila ${p.reg._fila}` },
          { t: "Nombres", v: (p) => p.reg.nombres || "—" },
          { t: "Apellidos", v: (p) => p.reg.apellidos || "—" },
          { t: "Nacimiento", v: (p) => p.reg.fecha_nacimiento || "—" },
          { t: "Revisión", v: (p) => p.errores.length ? h("span.estado.mal", p.errores.join(", ")) : p.avisos.length ? h("span.estado.ojo", p.avisos.join(", ")) : h("span.estado.ok", "Bien") },
        ], muestra, { vacio: "El archivo no tiene filas de datos." }),
        preparados.length > muestra.length ? h("p.tenue", `Vista previa de ${muestra.length} de ${preparados.length} filas (primero las que tienen errores o avisos).`) : null);
      botonImportar.disabled = !validos;
      botonImportar.textContent = validos ? `Importar ${validos} estudiante${validos === 1 ? "" : "s"}` : "Importar";
    };

    const selectorOrden = h("label.campo.oculto", h("span", "¿Cómo está escrito el nombre completo?"),
      h("select", { onchange: (e) => { orden = e.target.value; revisar(); } },
        h("option", { value: "nombres" }, "Nombres y luego apellidos (Ana María López Pérez)"),
        h("option", { value: "apellidos" }, "Apellidos y luego nombres (López Pérez Ana María)")));
    const casillaCabecera = h("label.casilla", h("input", { type: "checkbox", checked: cabecera,
      onchange: (e) => { cabecera = e.target.checked; pintarSelectores(); revisar(); } }), " La primera fila son títulos de columnas");

    const botonImportar = h("button.btn", { type: "button", onclick: () => importar(preparados.filter((p) => !p.errores.length).map((p) => p.reg), destino) }, "Importar");
    cuerpo.replaceChildren(err,
      h("p.suave", `Archivo: ${nombreArchivo} · ${filas.length - (cabecera ? 1 : 0)} filas`),
      h("details.importar-mapa", { open: !cabecera || mapa.nombres == null && mapa.nombre_completo == null },
        h("summary", `Columnas reconocidas: ${Object.keys(mapa).length} — revisar o cambiar`), casillaCabecera, selectores),
      selectorOrden,
      destino.nodo,
      h("h3", "Revisión"), resumen, revision,
      h("div.modal-pie", h("button.btn.btn-sec", { type: "button", onclick: m.cerrar }, "Cancelar"), botonImportar));
    pintarSelectores(); revisar();
  }

  // ---- Paso 3: envío por partes y resultado ----
  async function importar(registros, destino) {
    const total = registros.length;
    const barra = h("progress", { max: total, value: 0, style: "width:100%" }), estado = h("p", "Preparando…");
    cuerpo.replaceChildren(h("h3", "Importando…"), barra, estado);
    let creados = 0, inscritos = 0, omitidos = [], detenido = null;
    const opciones = destino.valor();
    for (let i = 0; i < total; i += POR_ENVIO) {
      const parte = registros.slice(i, i + POR_ENVIO);
      estado.textContent = `Guardando ${Math.min(i + parte.length, total)} de ${total}…`;
      try {
        const r = await q(sb.rpc("d360_importar_estudiantes", { p_cuenta: ctx.id, p_filas: parte, p_grupo: opciones.grupo || null, p_opciones: opciones.extra || {} }));
        creados += r.creados; inscritos += r.inscritos; omitidos = omitidos.concat(r.omitidos || []);
      } catch (e) { detenido = { desde: i, error: mensajeError(e) }; break; }
      barra.value = Math.min(i + parte.length, total);
    }
    ctx.datos.invalidar();
    const pendientes = detenido ? total - detenido.desde : 0;
    cuerpo.replaceChildren(
      h("div.aviso." + (detenido ? "mal" : omitidos.length ? "ojo" : "ok"), { role: "status" },
        h("p", h("strong", `${creados} estudiante${creados === 1 ? "" : "s"} importado${creados === 1 ? "" : "s"}.`),
          inscritos ? ` ${inscritos} ${ctx.modalidad === "colegio" ? "matriculados en la sección" : "inscritos en el grupo"}.` : "",
          omitidos.length ? ` ${omitidos.length} omitido${omitidos.length === 1 ? "" : "s"}.` : ""),
        detenido ? h("p", `Se detuvo la importación: ${detenido.error} Quedaron ${pendientes} filas sin enviar.`) : null),
      omitidos.length ? [
        h("div.hoja-titulo", h("h3", "Filas omitidas"),
          h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => descargarCSV("estudiantes-omitidos.csv", [["Fila", "Estudiante", "Motivo"], ...omitidos.map((o) => [o.fila, o.nombre, o.motivo])]) }, "Descargar lista")),
        tabla([{ t: "Fila", v: (o) => `Fila ${o.fila}` }, { t: "Estudiante", v: (o) => o.nombre || "—" }, { t: "Motivo", v: (o) => o.motivo }], omitidos.slice(0, 50)),
        omitidos.length > 50 ? h("p.tenue", `Se muestran 50 de ${omitidos.length}. Descarga la lista completa.`) : null] : null,
      h("div.modal-pie", h("button.btn", { type: "button", onclick: () => { m.cerrar(); alTerminar?.(); } }, "Listo")));
  }
}

/** Opciones de destino según la modalidad: grupo (profesor), sección con matrícula (colegio) o nada (academia). */
async function opcionesDestino(ctx, grupoInicial = null) {
  if (ctx.modalidad === "academia") {
    return { nodo: h("p.aviso", "Los estudiantes quedan registrados. Después, inscríbelos desde ", h("strong", "Matrículas"), " para generar sus cobros."), valor: () => ({}) };
  }
  if (ctx.modalidad === "colegio") {
    const { estructura } = await import("../colegio/util.js");
    const E = await estructura(ctx);
    const secs = E.secciones.filter((s) => ["activo", "planificado"].includes(s.estado));
    const finanzas = ctx.f("finanzas");
    const mesHoy = new Date().getMonth() + 1;
    const ini = Math.min(Math.max(2, mesHoy), 11);
    const sel = h("select", { name: "grupo" }, h("option", { value: "" }, "No matricular por ahora"),
      secs.map((s) => h("option", { value: s.id }, `${s.nombre}${E.grado(s.grado_id) ? " · " + E.grado(s.grado_id).nombre : ""}`)));
    const mes = h("select", ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
      .map((t, i) => h("option", { value: i + 1, selected: i + 1 === ini }, t)));
    const meses = h("input", { type: "number", min: 0, max: 12, value: Math.max(0, 11 - ini + 1) });
    const dia = h("input", { type: "number", min: 1, max: 28, value: 10 });
    const extra = h("div.fila.oculto",
      h("label.campo", h("span", "Primera colegiatura"), mes),
      h("label.campo", h("span", "Cantidad de colegiaturas"), meses),
      h("label.campo", h("span", "Día de pago"), dia));
    sel.addEventListener("change", () => extra.classList.toggle("oculto", !sel.value || !finanzas));
    return {
      nodo: h("div", h("label.campo", h("span", "Matricular en la sección"), sel,
        h("small", finanzas ? "Al matricular se generan la matrícula y las colegiaturas según el arancel del grado." : "Cada estudiante queda matriculado en la sección elegida.")), extra),
      valor: () => ({ grupo: sel.value, extra: { mes_inicio: Number(mes.value), meses: Number(meses.value || 0), dia: Number(dia.value || 10) } }),
    };
  }
  const grupos = (await ctx.datos.grupos()).filter((g) => ["activo", "planificado"].includes(g.estado));
  const sel = h("select", h("option", { value: "" }, "Ninguno por ahora"), grupos.map((g) => h("option", { value: g.id, selected: g.id === grupoInicial }, g.nombre)));
  return { nodo: h("label.campo", h("span", "Inscribir en el grupo"), sel), valor: () => ({ grupo: sel.value }) };
}
