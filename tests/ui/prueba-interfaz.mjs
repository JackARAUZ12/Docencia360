// Prueba de humo de la interfaz: abre cada pantalla en teléfono y computadora
// con respuestas simuladas de Supabase y reporta errores de JavaScript.
// Uso: node tests/ui/prueba-interfaz.mjs  (requiere servidor estático en :8080)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:8080";
const OUT = process.env.OUT || "tests/ui/capturas";
fs.mkdirSync(OUT, { recursive: true });
import { preparar, registro, hoy, U, C, G1, G2, E, EV1, EV2, planes, sesion } from "./simulacion.mjs";
const errores = [];
const ACAD = ["inicio", "estudiantes", `estudiantes/${E(1)}`, "cursos", "grupos", `grupos/${G1}`, "instructores", "asistencia", "calificaciones", "tareas", "calendario", "matriculas", "finanzas", "finanzas?vista=pagos", "certificados", "informes", "informes?tipo=matriculas", "informes?tipo=academico", "equipo", "cuenta"];
const COL = ["inicio", "estructura", "estructura?vista=plan", "estructura?vista=docentes", "estructura?vista=aulas", "institucion", "estudiantes", `estudiantes/${E(1)}`, "matriculas", "docentes", "docentes?vista=asistencia", "horarios", "asistencia", "calificaciones", "calificaciones?vista=cuadro", "boletines", "boletines?vista=comentarios", "familias", "comunicados", "informes", "informes?tipo=asistencia", "informes?tipo=matricula", "informes?tipo=finanzas", "finanzas", "certificados", "equipo", "cuenta"];
const PANTALLAS = [
  ...COL.map((r) => [`colegio-${r.replace(/[/?=]/g, "_").slice(0, 40)}`, `/app/colegio.html#/${r}`, true, "colegio", "director"]),
  ...["inicio", "calificaciones", "boletines", "horarios"].map((r) => [`colegio-docente-${r}`, `/app/colegio.html#/${r}`, true, "colegio", "docente"]),
  ...["inicio", "notas", "asistencia", "avisos", "pagos"].map((r) => [`familias-${r}`, `/app/familias.html#/${r}`, true, "colegio", "tutor"]),
  ...ACAD.map((r) => [`academia-${r.replace(/[/?=]/g, "_").slice(0, 40)}`, `/app/academia.html#/${r}`, true, "academia", "propietario"]),
  ...["inicio", "finanzas", "matriculas", "informes"].map((r) => [`academia-finanzas-${r}`, `/app/academia.html#/${r}`, true, "academia", "finanzas"]),
  ...["inicio", "grupos", "asistencia", "calificaciones"].map((r) => [`academia-instructor-${r}`, `/app/academia.html#/${r}`, true, "academia", "docente"]),
  ["verificar", "/verificar.html?folio=K7M2QP-26-ABC123", false],
  ["index", "/index.html", false], ["terminos", "/terminos.html", false], ["privacidad", "/privacidad.html", false], ["entrar", "/entrar.html", false], ["admin-entrar", "/admin/entrar.html", false], ["registro", "/registro.html?modalidad=profesor", false],
  ...["inicio", "asistencia", "calificaciones", "estudiantes", `estudiantes/${E(1)}`, "grupos", `grupos/${G1}`, "tareas", "cursos", "calendario", "informes", `informes?estudiante=${E(1)}`, "cuenta", "mas"]
    .map((r) => [`profesor-${r.replace(/[/?=]/g, "_").slice(0, 40)}`, `/app/profesor.html#/${r}`, true]),
  ...["resumen", "cuentas", "codigos", "planes", "promociones", "actividad", "parametros"].map((r) => [`admin-${r}`, `/admin/index.html#/${r}`, true]),
];
const browser = await chromium.launch();
const VISTAS = process.env.ANCHOS ? process.env.ANCHOS.split(",").map((x) => { const [w, hh, t] = x.split(/[x:]/); return [Number(w), Number(hh), t]; })
  : [[390, 844, "movil"], [1366, 900, "pc"]];
for (const [ancho, alto, tag] of VISTAS) {
  const ctxB = await browser.newContext({ viewport: { width: ancho, height: alto } });
  for (const [nombre, url, conSesion, modalidad, rol] of PANTALLAS.filter(([n]) => !process.env.SOLO || process.env.SOLO.split(",").some((x) => n.startsWith(x)))) {
    const page = await ctxB.newPage();
    page.on("pageerror", (e) => errores.push(`${tag} ${nombre}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !/fonts|favicon|ERR_|Failed to load resource/.test(m.text())) errores.push(`${tag} ${nombre} console: ${m.text()}`); });
    await preparar(page, conSesion, modalidad, rol);
    await page.goto(BASE + url, { waitUntil: "load", timeout: 20000 }).catch((e) => errores.push(`${tag} ${nombre}: ${e.message}`));
    await page.waitForTimeout(900);
    const alerta = await page.locator(".aviso.mal").first().textContent().catch(() => null);
    if (alerta && !/vencido|reprobadas/.test(alerta)) errores.push(`${tag} ${nombre} muestra error: ${alerta.slice(0, 160)}`);
    const anchoDoc = await page.evaluate(() => document.documentElement.scrollWidth);
    if (anchoDoc > ancho + 1) errores.push(`${tag} ${nombre}: desborde horizontal (${anchoDoc}px)`);
    await page.screenshot({ path: `${OUT}/${tag}-${nombre}.png`, fullPage: true, timeout: 5000 }).catch(() => {});
    await page.close();
  }
  await ctxB.close();
}
// Registro con código de acceso: sin código no avanza; con código salta a «Tus datos» con el plan del código
{
  const ctxB = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`registro-codigo: ${e.message}`));
  await preparar(page, false);
  await page.goto(BASE + "/registro.html", { waitUntil: "load" });
  await page.waitForSelector("input.codigo-acceso", { timeout: 8000 }).catch(() => errores.push("registro-codigo: no pide el código de acceso"));
  await page.locator("input.codigo-acceso").fill("D360-USAD-O999");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForTimeout(400);
  if (!/ya fue utilizado/.test(await page.locator("#aviso").innerText())) errores.push("registro-codigo: no avisa del código usado");
  await page.screenshot({ path: `${OUT}/registro-codigo-error.png`, fullPage: true });
  await page.locator("input.codigo-acceso").fill("d360-prue-ba01");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForTimeout(400);
  const txt = await page.locator("body").innerText();
  if (!/Tus datos/.test(txt) || !/D360-PRUE-BA01/.test(txt) || !/Básico/.test(txt) || !/Ya pagado: 1 mes/.test(txt)) errores.push("registro-codigo: con código bueno no pasa a «Tus datos» con su plan: " + txt.slice(0, 300));
  await page.screenshot({ path: `${OUT}/registro-codigo-datos.png`, fullPage: true });
  // Completar datos: entra directo, sin «Revisa tu correo»
  await page.locator("input[name=tu_nombre]").fill("Marta Ruiz");
  await page.locator("input[name=nombre]").fill("Clases de Marta");
  await page.locator("input[name=email]").fill("marta@ejemplo.com");
  await page.locator("input[name=clave]").fill("clave-segura-1");
  await page.locator("input[name=acepto]").check();
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await page.waitForTimeout(800);
  const fin = await page.locator("body").innerText();
  if (/Revisa tu correo|Falta activarla/.test(fin) || !/Tu cuenta está lista/.test(fin) || !/Todo activo/.test(fin) || !/482915/.test(fin)) errores.push("registro-codigo: no entra directo tras crear la cuenta: " + fin.slice(0, 300));
  if (registro.enviado?.codigo !== "D360-PRUE-BA01" || registro.enviado?.plan !== "prof_basico" || registro.enviado?.email !== "marta@ejemplo.com") errores.push("registro-codigo: datos enviados al servidor incorrectos: " + JSON.stringify(registro.enviado));
  await page.screenshot({ path: `${OUT}/registro-codigo-creada.png`, fullPage: true });
  await page.evaluate(() => localStorage.clear());   // volver a empezar sin la sesión recién abierta
  await page.goto(BASE + "/registro.html", { waitUntil: "load" });
  await page.locator("input.codigo-acceso").fill("D360-PRUE-BA01");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Atrás" }).click();
  if (!(await page.locator("input.codigo-acceso").count())) errores.push("registro-codigo: «Atrás» no vuelve al código cuando el código fija tipo y plan");
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 361) errores.push(`registro-codigo: desborde horizontal (${ancho}px)`);
  // Panel maestro: generar un código y ver cómo compartirlo
  const adm = await ctxB.newPage();
  adm.on("pageerror", (e) => errores.push(`admin-codigos: ${e.message}`));
  await preparar(adm, true);
  await adm.goto(BASE + "/admin/index.html#/codigos", { waitUntil: "load" });
  await adm.getByRole("button", { name: "Generar código" }).first().click();
  await adm.locator("dialog [name=usos]").fill("1");
  await adm.locator("dialog").getByRole("button", { name: "Generar código" }).click();   // sin plan y con 1 mes pagado: debe avisar
  await adm.waitForTimeout(300);
  if (!/Elige el plan que pagó/.test(await adm.locator("dialog").innerText())) errores.push("admin-codigos: no exige el plan para un código pagado");
  await adm.locator("dialog [name=plan]").selectOption("prof_basico");
  await adm.locator("dialog").getByRole("button", { name: "Generar código" }).click();
  await adm.waitForTimeout(600);
  const dlg = await adm.locator("dialog").last().innerText().catch(() => "");
  if (!/D360-NUEV-O001/.test(dlg) || !/Enviar por WhatsApp/.test(dlg) || !/Ya pagado/.test(dlg)) errores.push("admin-codigos: no muestra el código generado para compartir: " + dlg.slice(0, 200));
  await adm.screenshot({ path: `${OUT}/admin-codigo-generado.png`, fullPage: false });
  const anchoA = await adm.evaluate(() => document.documentElement.scrollWidth);
  if (anchoA > 361) errores.push(`admin-codigos: desborde horizontal (${anchoA}px)`);
  await ctxB.close();
}
// Flujo de importación (profesor): elegir CSV, revisar, importar y ver el resultado
{
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`importar: ${e.message}`));
  await preparar(page, true, "profesor", "propietario");
  await page.goto(BASE + "/app/profesor.html#/estudiantes", { waitUntil: "load" });
  await page.getByRole("button", { name: "Importar Excel" }).click();
  const csv = "Nombre completo;Fecha de nacimiento;Sexo\r\nAna María López Pérez;04/03/2013;F\r\nLuis Mora;31/02/2012;M\r\n;;\r\nYa Existe;;\r\n";
  await page.locator("dialog input[type=file]").setInputFiles({ name: "lista.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.waitForTimeout(400);
  const txt = await page.locator("dialog").innerText();
  if (!/3 listos para importar/.test(txt)) errores.push("importar: no reconoce las filas: " + txt.slice(0, 300));
  if (!/fecha no reconocida/.test(txt)) errores.push("importar: no avisa la fecha inválida");
  await page.screenshot({ path: `${OUT}/movil-importar-revision.png`, fullPage: true });
  await page.getByRole("button", { name: /Importar 3 estudiantes/ }).click();
  await page.waitForTimeout(500);
  const fin = await page.locator("dialog").innerText();
  if (!/2 estudiantes importados/.test(fin) || !/Filas omitidas/.test(fin)) errores.push("importar: resultado incorrecto: " + fin.slice(0, 300));
  await page.screenshot({ path: `${OUT}/movil-importar-resultado.png`, fullPage: true });
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 391) errores.push(`importar: desborde horizontal (${ancho}px)`);
  await ctxB.close();
}
// Ciclo del profesor en el teléfono: calificar por evaluación, agregar al grupo, aviso de cambios sin guardar
{
  const ctxB = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`ciclo: ${e.message}`));
  await preparar(page, true, "profesor", "propietario");
  await page.goto(BASE + "/app/profesor.html#/calificaciones", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".calificar li", { timeout: 8000 }).catch(() => errores.push("ciclo: en el teléfono no abre «Por evaluación»"));
  const filas = await page.locator(".calificar li").count();
  if (filas < 1) errores.push("ciclo: la vista por evaluación no lista estudiantes");
  await page.locator(".calificar input").first().fill("77");
  if (!/Guardar 1 nota/.test(await page.locator(".pie-fijo .btn").innerText())) errores.push("ciclo: no cuenta la nota cambiada");
  await page.screenshot({ path: `${OUT}/ciclo-calificar.png`, fullPage: false });
  await page.getByRole("button", { name: "Cuadro completo" }).click();
  await page.waitForTimeout(300);
  if (!(await page.getByText("Notas sin guardar").isVisible())) errores.push("ciclo: no avisa notas sin guardar al cambiar de vista");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.goto(BASE + `/app/profesor.html#/grupos/${G1}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Agregar", exact: true }).first().click();
  await page.waitForTimeout(300);
  if (!(await page.getByRole("button", { name: "Registrar un estudiante nuevo" }).isVisible())) errores.push("ciclo: el grupo no ofrece registrar un estudiante nuevo");
  if (!(await page.getByRole("button", { name: /Importar una lista/ }).isVisible())) errores.push("ciclo: el grupo no ofrece importar");
  await page.screenshot({ path: `${OUT}/ciclo-agregar.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/app/profesor.html#/asistencia", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pase li", { timeout: 8000 }).catch(() => {});
  await page.locator(".pase .opc button").first().click();
  const opciones = await page.locator(".barra-filtros select option").count();
  if (opciones > 1) {
    await page.locator(".barra-filtros select").selectOption({ index: 1 });
    await page.waitForTimeout(300);
    if (!(await page.getByText("Cambios sin guardar").isVisible())) errores.push("ciclo: no avisa asistencia sin guardar al cambiar de grupo");
  }
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 361) errores.push(`ciclo: desborde horizontal (${ancho}px)`);
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "OK: todas las pantallas renderizan sin errores");
