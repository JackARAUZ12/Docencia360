// Primeros pasos: bienvenida de una cuenta nueva, botón flotante y consejos por sección.
// Uso: node tests/ui/guia.mjs  (requiere servidor estático en :8080)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = process.env.OUT || "tests/ui/capturas/guia";
fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
// Plantilla llena de prueba, generada con el mismo escritor de .xlsx del sistema
const { crearXlsx } = await import("../../assets/js/core/hoja.js");
const XLSX = `${OUT}/plantilla-llena.xlsx`;
fs.writeFileSync(XLSX, Buffer.from(await crearXlsx([{ nombre: "Estudiantes", filas: [
  ["Nombres", "Apellidos", "Fecha de nacimiento", "Sexo", "Teléfono", "Correo", "Responsable", "Teléfono del responsable", "Parentesco", "Observaciones"],
  ["Ana Sofía", "López Rivas", "15/03/2012", "F", "88887777", "", "María Rivas", "55554444", "Madre", ""],
  ["Carlos", "Pérez", "", "M", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", ""]] }]).arrayBuffer()));
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const browser = await chromium.launch();
for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  // 1) Cuenta nueva (sin grupos ni estudiantes): aparece la bienvenida
  let page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`${tag}: ${e.message}`));
  await preparar(page, true);
  const enviado = {};
  await page.route(/supabase\.co\/rest\/v1\/(grupos|estudiantes|horarios|asistencias|evaluaciones|estudiantes_acceso|actividades|grupo_estudiantes)/, async (route) => {
    const t = new URL(route.request().url()).pathname.split("/").pop();
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    enviado[t] = JSON.parse(route.request().postData() || "null");
    const fila = { id: "00000000-0000-0000-0000-0000000000a9", nombre: "Matemática · 9no grado" };
    const single = (route.request().headers()["accept"] || "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(single ? fila : [fila]) });
  });
  await page.goto(BASE + "/app/profesor.html#/inicio"); await page.waitForTimeout(1200);
  const bv = page.locator("dialog.bienvenida");
  ok(await bv.isVisible(), `${tag} la bienvenida aparece la primera vez`);
  await page.screenshot({ path: `${OUT}/${tag}-1-que-ensenas.png` });
  await bv.locator("input[name=asig]").fill("Matemática");
  await bv.locator("input[name=nivel]").fill("9no grado");
  await bv.getByRole("button", { name: "Continuar" }).click();
  await page.waitForTimeout(300);
  await bv.locator(".bv-dia", { hasText: "Lun" }).click();
  await bv.locator(".bv-dia", { hasText: "Mié" }).click();
  await page.screenshot({ path: `${OUT}/${tag}-2-grupo.png` });
  await bv.getByRole("button", { name: "Crear mi grupo" }).click();
  await page.waitForTimeout(600);
  ok(enviado.grupos?.nombre === "Matemática · 9no grado" && enviado.grupos?.estado === "activo", `${tag} se crea el grupo con nombre sugerido`);
  ok(Array.isArray(enviado.horarios) && enviado.horarios.length === 2 && enviado.horarios[0].hora_inicio === "16:00", `${tag} se guarda el horario de los días marcados`);
  ok(await bv.getByRole("button", { name: /Con una plantilla de Excel/ }).isVisible() && await bv.getByRole("button", { name: /Saltar: lo hago después/ }).isVisible(), `${tag} el paso de estudiantes ofrece lista, Excel o saltar`);
  await page.screenshot({ path: `${OUT}/${tag}-3-opciones.png` });
  // Camino Excel: descargar la plantilla, volver atrás y usar la lista (el Excel se prueba aparte)
  await bv.getByRole("button", { name: /Con una plantilla de Excel/ }).click(); await page.waitForTimeout(300);
  const [descarga] = await Promise.all([page.waitForEvent("download"), bv.getByRole("button", { name: "Descargar plantilla" }).click()]);
  ok(descarga.suggestedFilename().endsWith(".xlsx"), `${tag} la plantilla se descarga en Excel (${descarga.suggestedFilename()})`);
  ok(await bv.locator(".bv-excel li.hecho").count() === 1, `${tag} el paso 1 queda marcado al descargar`);
  ok(await bv.getByRole("button", { name: "Agregar al grupo" }).isDisabled(), `${tag} no deja continuar sin subir la plantilla`);
  await page.screenshot({ path: `${OUT}/${tag}-3b-excel.png` });
  await bv.getByRole("button", { name: "Atrás" }).click(); await page.waitForTimeout(200);
  await bv.getByRole("button", { name: /Escribir o pegar la lista/ }).click(); await page.waitForTimeout(200);
  await bv.locator("textarea").fill("Ana Sofía López\nPérez Ruiz, Carlos\nMaría José Gutiérrez");
  await page.screenshot({ path: `${OUT}/${tag}-3-estudiantes.png` });
  let rpcImport = null;
  page.on("request", (r) => { if (r.url().includes("rpc/d360_importar_estudiantes")) rpcImport = JSON.parse(r.postData() || "{}"); });
  await bv.getByRole("button", { name: "Agregar al grupo" }).click();
  await page.waitForTimeout(700);
  ok(rpcImport?.p_filas?.length === 3 && rpcImport.p_filas[1].nombres === "Carlos" && rpcImport.p_filas[1].apellidos === "Pérez Ruiz" && rpcImport.p_grupo, `${tag} la lista pegada se separa en nombres y apellidos y se inscribe en el grupo`);
  ok(await bv.getByText("¡Listo! Tu clase está creada").isVisible(), `${tag} el último paso confirma lo creado`);
  await page.screenshot({ path: `${OUT}/${tag}-4-listo.png` });
  let guardado = null;
  page.on("request", (r) => { if (r.url().includes("rpc/d360_guia_guardar")) guardado = JSON.parse(r.postData() || "{}"); });
  await bv.getByRole("button", { name: "Ir a Inicio" }).click();
  await page.waitForTimeout(900);
  ok(guardado?.p_cambios?.bienvenida === "hecha", `${tag} la bienvenida queda marcada en el servidor`);
  ok(await page.locator(".guia-flotante").isVisible(), `${tag} el botón «Primeros pasos» se muestra`);
  await page.screenshot({ path: `${OUT}/${tag}-5-inicio-nueva.png` });
  await page.close();

  // 1b) Camino Excel completo: subir la plantilla llena
  page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`${tag}: ${e.message}`));
  await preparar(page, true);
  await page.route(/supabase\.co\/rest\/v1\/(asignaturas|grupos|estudiantes|horarios|asistencias|evaluaciones|estudiantes_acceso|actividades|grupo_estudiantes)/, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    const fila = { id: "00000000-0000-0000-0000-0000000000a9", nombre: "Inglés" };
    const single = (route.request().headers()["accept"] || "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(single ? fila : [fila]) });
  });
  await page.goto(BASE + "/app/profesor.html#/inicio"); await page.waitForTimeout(1200);
  const bv2 = page.locator("dialog.bienvenida");
  await bv2.locator("input[name=asig]").fill("Inglés");
  await bv2.getByRole("button", { name: "Continuar" }).click(); await page.waitForTimeout(200);
  await bv2.getByRole("button", { name: "Crear mi grupo" }).click(); await page.waitForTimeout(600);
  await bv2.getByRole("button", { name: /Con una plantilla de Excel/ }).click(); await page.waitForTimeout(200);
  await bv2.locator("input[type=file]").setInputFiles(XLSX);
  await page.waitForTimeout(700);
  ok((await bv2.locator(".bv-archivo").innerText()).includes("2 estudiantes listos"), `${tag} la plantilla llena se lee (2 estudiantes)`);
  ok(await bv2.locator(".bv-excel li.hecho").count() >= 2, `${tag} los pasos 2 y 3 quedan marcados`);
  let imp = null; page.on("request", (r) => { if (r.url().includes("rpc/d360_importar_estudiantes")) imp = JSON.parse(r.postData() || "{}"); });
  await page.screenshot({ path: `${OUT}/${tag}-3c-excel-listo.png` });
  await bv2.getByRole("button", { name: "Agregar al grupo" }).click(); await page.waitForTimeout(700);
  ok(imp?.p_filas?.length === 2 && imp.p_filas[0].nombres === "Ana Sofía" && imp.p_filas[0].contacto_telefono === "55554444" && imp.p_filas[0].fecha_nacimiento === "2012-03-15", `${tag} se envían los datos de la plantilla (nombre, fecha y responsable)`);
  ok(await bv2.getByText("¡Listo! Tu clase está creada").isVisible(), `${tag} con Excel también termina en «Listo»`);
  await page.close();

  // 2) Cuenta con datos (Premium): botón con avance, panel de pasos y consejo de sección
  page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`${tag}: ${e.message}`));
  await preparar(page, true);
  await page.route(/supabase\.co\/rest\/v1\/(estudiantes_acceso|actividades)\?/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(BASE + "/app/profesor.html#/asistencia"); await page.waitForTimeout(1300);
  ok(!(await page.locator("dialog.bienvenida").count()), `${tag} una cuenta con grupos no ve la bienvenida`);
  ok(await page.locator(".ayuda-primera").isVisible(), `${tag} consejo de la sección la primera vez`);
  await page.screenshot({ path: `${OUT}/${tag}-6-consejo.png` });
  await page.locator(".ayuda-primera button").click();
  ok(!(await page.locator(".ayuda-primera").count()), `${tag} el consejo se cierra con «Entendido»`);
  const boton = page.locator(".guia-flotante");
  if (await boton.isVisible()) {
    await boton.click(); await page.waitForTimeout(300);
    const pasos = await page.locator("dialog.modal .pasos-guia li").count();
    ok(pasos >= 7, `${tag} plan Premium: la guía incluye portal y asistente (${pasos} pasos)`);
    await page.screenshot({ path: `${OUT}/${tag}-7-panel-pasos.png` });
  } else ok(false, `${tag} faltan pasos del portal: el botón debería verse`);
  await page.close();

  // 3) Plan Básico: sin pasos del portal ni del asistente
  page = await ctxB.newPage();
  process.env.PLAN = "prof_basico";
  await preparar(page, true);
  await page.goto(BASE + "/app/profesor.html#/inicio"); await page.waitForTimeout(1300);
  if (await page.locator(".guia-flotante").isVisible()) {
    await page.locator(".guia-flotante").click(); await page.waitForTimeout(300);
    ok((await page.locator("dialog.modal .pasos-guia li").count()) === 5, `${tag} plan Básico: 5 pasos, sin portal ni asistente`);
  } else ok(true, `${tag} Básico sin pasos pendientes`);
  delete process.env.PLAN;
  await page.close();
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
process.exit(fallos.length || errores.length ? 1 : 0);
