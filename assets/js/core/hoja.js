// Lectura de hojas de cálculo en el navegador, sin librerías externas.
// Soporta .xlsx (Excel 2007+, LibreOffice, Google Sheets descargado) y .csv/.txt.
// El archivo nunca sale del navegador: solo se envían las filas ya validadas.

/** Devuelve una matriz de filas (arreglos de valores: texto o número). */
export async function leerHoja(file) {
  const nombre = (file.name || "").toLowerCase();
  if (/\.(xls|ods|numbers)$/.test(nombre)) throw new Error("Ese formato no se puede leer. Ábrelo en Excel y usa «Guardar como» → Libro de Excel (.xlsx) o CSV.");
  if (file.size > 8 * 1024 * 1024) throw new Error("El archivo pesa más de 8 MB. Divide la lista en varios archivos.");
  const buf = new Uint8Array(await file.arrayBuffer());
  const esZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (esZip || nombre.endsWith(".xlsx")) return leerXlsx(buf);
  return leerCsv(decodificarTexto(buf));
}

// ---------------- CSV ----------------
function decodificarTexto(buf) {
  let txt = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (txt.includes("�")) txt = new TextDecoder("windows-1252").decode(buf);   // Excel en Windows guarda CSV en ANSI
  return txt.replace(/^﻿/, "");
}

export function leerCsv(txt) {
  const primera = txt.split(/\r?\n/, 1)[0] || "";
  const sep = [";", ",", "\t"].map((s) => [s, primera.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = []; let fila = [], campo = "", comillas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (comillas) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += c;
    } else if (c === '"' && campo === "") comillas = true;
    else if (c === sep) { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && txt[i + 1] === "\n") i++;
      fila.push(campo); filas.push(fila); fila = []; campo = "";
    } else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((v) => String(v).trim() !== ""));
}

// ---------------- XLSX (ZIP + XML) ----------------
async function leerXlsx(buf) {
  const zip = indiceZip(buf);
  const xml = async (ruta) => (zip[ruta] ? new DOMParser().parseFromString(await extraer(buf, zip[ruta]), "application/xml") : null);
  const todos = (doc, tag) => Array.from(doc.getElementsByTagNameNS("*", tag));

  // Primera hoja del libro
  let rutaHoja = "xl/worksheets/sheet1.xml";
  const libro = await xml("xl/workbook.xml"), rels = await xml("xl/_rels/workbook.xml.rels");
  if (libro && rels) {
    const hoja = todos(libro, "sheet")[0];
    const rid = hoja?.getAttribute("r:id") || hoja?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = todos(rels, "Relationship").find((r) => r.getAttribute("Id") === rid);
    if (rel) { const t = rel.getAttribute("Target").replace(/^\//, ""); rutaHoja = t.startsWith("xl/") ? t : "xl/" + t; }
  }
  if (!zip[rutaHoja]) throw new Error("No se encontró ninguna hoja en el archivo de Excel.");

  const ss = await xml("xl/sharedStrings.xml");
  const textos = ss ? todos(ss, "si").map((si) => todos(si, "t").map((t) => t.textContent).join("")) : [];
  const doc = await xml(rutaHoja);
  const filas = [];
  for (const row of todos(doc, "row")) {
    const fila = [];
    for (const c of todos(row, "c")) {
      const col = indiceColumna(c.getAttribute("r")) ?? fila.length;
      const t = c.getAttribute("t"); const v = todos(c, "v")[0]?.textContent ?? "";
      let valor;
      if (t === "s") valor = textos[Number(v)] ?? "";
      else if (t === "inlineStr") valor = todos(c, "t").map((x) => x.textContent).join("");
      else if (t === "b") valor = v === "1" ? "Sí" : "No";
      else if (t === "str" || t === "e") valor = v;
      else valor = v === "" ? "" : Number(v);
      fila[col] = valor;
    }
    for (let i = 0; i < fila.length; i++) if (fila[i] === undefined) fila[i] = "";
    if (fila.some((x) => String(x).trim() !== "")) filas.push(fila);
  }
  return filas;
}

function indiceColumna(ref) {
  const m = /^([A-Z]+)/.exec(ref || ""); if (!m) return null;
  let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function indiceZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("El archivo de Excel está dañado o no es un .xlsx.");
  const total = dv.getUint16(fin + 10, true); let p = dv.getUint32(fin + 16, true);
  const dec = new TextDecoder(); const idx = {};
  for (let i = 0; i < total; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    idx[dec.decode(buf.subarray(p + 46, p + 46 + ln))] = { metodo, tam, local };
    p += 46 + ln + le + lc;
  }
  return idx;
}

async function extraer(buf, e) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ini = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
  const datos = buf.subarray(ini, ini + e.tam);
  if (e.metodo === 0) return new TextDecoder().decode(datos);
  if (e.metodo !== 8) throw new Error("El archivo de Excel usa una compresión no compatible. Guárdalo de nuevo como .xlsx o CSV.");
  if (typeof DecompressionStream === "undefined") throw new Error("Tu navegador no puede abrir archivos .xlsx. Actualízalo o guarda la lista como CSV.");
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(flujo).text();
}

// ---------------- Fechas ----------------
/** Convierte un valor de celda a AAAA-MM-DD, o null si no es una fecha reconocible. Prefiere día/mes/año. */
export function aFechaISO(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "number" || /^\d{4,5}(\.\d+)?$/.test(String(v).trim())) {
    const n = Number(v);
    if (n > 365 && n < 80000) { const d = new Date(Math.round((n - 25569) * 86400000)); return d.toISOString().slice(0, 10); }
    return null;
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  let a, mes, dia;
  if (m) [, a, mes, dia] = m;
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) {
    [, dia, mes, a] = m;
    if (a.length === 2) a = (Number(a) > (new Date().getFullYear() % 100) ? "19" : "20") + a;
  } else return null;
  const d = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(dia)));
  if (d.getUTCMonth() !== Number(mes) - 1 || d.getUTCDate() !== Number(dia)) return null;
  return d.toISOString().slice(0, 10);
}
