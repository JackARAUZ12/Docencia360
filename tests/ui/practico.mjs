// Menú por bloques con candados, «Clase de ahora» y «Pegar una lista».
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar, G1 } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/practico"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const browser = await chromium.launch();
for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  for (const plan of ["prof_basico", "prof_premium"]) {
    process.env.PLAN = plan;
    const page = await ctxB.newPage();
    page.on("pageerror", (e) => errores.push(`${tag} ${plan}: ${e.message}`));
    await preparar(page, true);
    // Una clase que está ocurriendo ahora en G1
    const d = new Date(); const pad = (n) => String(n).padStart(2, "0");
    const ini = `${pad(Math.max(d.getHours() - 1, 0))}:00:00`, fin = `${pad(Math.min(d.getHours() + 1, 23))}:59:00`;
    await page.route(/rest\/v1\/horarios\?.*dia=eq/, (r) => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify([{ hora_inicio: ini, hora_fin: fin, grupo_id: G1, grupos: { nombre: "Matemática 9no", estado: "activo" } }]) }));
    await page.goto(BASE + "/app/profesor.html#/inicio"); await page.waitForTimeout(1300);
    ok(await page.locator(".clase-ahora.en-curso").isVisible(), `${tag} ${plan} Inicio muestra «Clase de ahora»`);
    ok(await page.locator(`.clase-ahora a[href="#/asistencia?grupo=${G1}"]`).count() === 1, `${tag} ${plan} un toque lleva a la lista de ese grupo`);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(ancho <= w + 1, `${tag} ${plan} Inicio sin desborde horizontal`);
    await page.screenshot({ path: `${OUT}/${tag}-${plan}-inicio.png`, fullPage: true });
    if (tag === "pc") {
      const titulos = await page.locator(".p-riel .titulo-bloque").allInnerTexts();
      ok(titulos.join("|").toLowerCase() === "día a día|mis clases|más", `${tag} ${plan} menú en tres bloques`);
      ok(!(await page.locator('.p-riel [data-r="tareas"], .p-riel [data-r="cursos"]').count()), `${tag} ${plan} Tareas y Cursos no ocupan el menú`);
      const candado = await page.locator('.p-riel [data-r="enlinea"] .candado').count();
      ok(plan === "prof_basico" ? candado === 1 : candado === 0, `${tag} ${plan} candado en Exámenes en línea solo si el plan no lo incluye`);
    } else {
      await page.goto(BASE + "/app/profesor.html#/mas"); await page.waitForTimeout(600);
      ok((await page.locator(".p-mas .titulo-bloque").count()) >= 2, `${tag} ${plan} «Más» agrupado por bloques`);
      await page.screenshot({ path: `${OUT}/${tag}-${plan}-mas.png`, fullPage: true });
    }
    // Tareas marca «Notas» como sección activa
    await page.goto(BASE + "/app/profesor.html#/tareas"); await page.waitForTimeout(900);
    ok(await page.locator('[data-r="calificaciones"][aria-current="page"]').count() >= 1, `${tag} ${plan} en Tareas queda marcada «Notas»`);
    ok(await page.locator('a[href="#/calificaciones"]', { hasText: "Ver todas las notas" }).isVisible(), `${tag} ${plan} Tareas tiene regreso a Notas`);
    await page.goto(BASE + "/app/profesor.html#/calificaciones"); await page.waitForTimeout(900);
    ok(await page.locator('a[href="#/tareas"]').first().isVisible(), `${tag} ${plan} Notas lleva a «Tareas y entregas»`);
    await page.goto(BASE + "/app/profesor.html#/grupos"); await page.waitForTimeout(900);
    ok(await page.locator('a[href="#/cursos"]').first().isVisible(), `${tag} ${plan} Grupos lleva a «Asignaturas y cursos»`);
    // Cambios sin guardar: al salir por el menú se pregunta y se puede quedar
    await page.goto(BASE + "/app/profesor.html#/asistencia"); await page.waitForTimeout(1000);
    await page.locator("button", { hasText: /^A$/ }).first().click();
    await page.evaluate(() => { location.hash = "#/inicio"; }); await page.waitForTimeout(500);
    ok(await page.getByText("Cambios sin guardar").isVisible(), `${tag} ${plan} avisa antes de salir con asistencia sin guardar`);
    await page.getByRole("button", { name: "Cancelar" }).click(); await page.waitForTimeout(400);
    ok(page.url().includes("#/asistencia") && await page.locator(".pie-fijo").count() > 0, `${tag} ${plan} «Cancelar» deja la lista como estaba`);
    await page.evaluate(() => { location.hash = "#/inicio"; }); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Continuar sin guardar" }).click(); await page.waitForTimeout(900);
    ok(page.url().includes("#/inicio"), `${tag} ${plan} «Continuar sin guardar» sí sale`);
    // Pegar una lista
    await page.goto(BASE + "/app/profesor.html#/estudiantes"); await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Pegar una lista" }).click(); await page.waitForTimeout(300);
    const dlg = page.locator("dialog.modal");
    await dlg.locator("textarea").fill("Ana Sofía López\nPérez Ruiz, Carlos\nMaría José Gutiérrez Castillo");
    ok((await dlg.locator(".pegar-vista").innerText()).includes("3 estudiantes"), `${tag} ${plan} vista previa con el conteo`);
    ok((await dlg.locator(".pegar-vista").innerText()).includes("Pérez Ruiz"), `${tag} ${plan} vista previa separa apellidos`);
    await page.screenshot({ path: `${OUT}/${tag}-${plan}-pegar.png` });
    let env = null; page.on("request", (r) => { if (r.url().includes("d360_importar_estudiantes")) env = JSON.parse(r.postData() || "{}"); });
    await dlg.getByRole("button", { name: "Guardar estudiantes" }).click(); await page.waitForTimeout(700);
    ok(env?.p_filas?.length === 3 && env.p_filas[1].nombres === "Carlos", `${tag} ${plan} se envían los 3 estudiantes al servidor`);
    ok(await page.getByText("Algunos nombres no se guardaron").isVisible(), `${tag} ${plan} avisa cuáles se omitieron`);
    await page.close();
  }
  delete process.env.PLAN;
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
process.exit(fallos.length || errores.length ? 1 : 0);
