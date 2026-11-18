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

// ---------------------------------------------------------------------
// Escritura de .xlsx sin librerías (para la plantilla de estudiantes).
// Genera un ZIP sin compresión con las piezas mínimas de Excel; se abre en
// Excel, LibreOffice, Google Sheets y Números.
// ---------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipSinCompresion(archivos) {
  const enc = new TextEncoder(); const partes = []; const centro = []; let off = 0;
  for (const [nombre, texto] of archivos) {
    const n = enc.encode(nombre), d = enc.encode(texto), crc = crc32(d);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
    loc.setUint32(14, crc, true); loc.setUint32(18, d.length, true); loc.setUint32(22, d.length, true); loc.setUint16(26, n.length, true);
    partes.push(new Uint8Array(loc.buffer), n, d);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, d.length, true); cen.setUint32(24, d.length, true); cen.setUint16(28, n.length, true); cen.setUint32(42, off, true);
    centro.push(new Uint8Array(cen.buffer), n);
    off += 30 + n.length + d.length;
  }
  const tam = centro.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tam, true); fin.setUint32(16, off, true);
  return new Blob([...partes, ...centro, new Uint8Array(fin.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const xmlEsc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const col = (i) => { let s = ""; i++; while (i) { s = String.fromCharCode(65 + ((i - 1) % 26)) + s; i = Math.floor((i - 1) / 26); } return s; };
function hojaXml(filas, anchos = []) {
  const cols = anchos.length ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const datos = filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => `<c r="${col(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${datos}</sheetData></worksheet>`;
}
/** hojas: [{ nombre, filas: [[...]], anchos: [n...] }] → Blob .xlsx (la primera fila de cada hoja va en negrita). */
export function crearXlsx(hojas) {
  const a = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${xmlEsc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`],
    ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h.filas, h.anchos)]),
  ];
  return zipSinCompresion(a);
}
