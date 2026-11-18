// Pase de lista rápido, observación de un toque y reporte a padres por WhatsApp, por plan.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar, E } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/rapido"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const browser = await chromium.launch();
for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  for (const plan of ["prof_basico", "prof_profesional"]) {
    process.env.PLAN = plan;
    const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
    const page = await ctxB.newPage();
    page.on("pageerror", (e) => errores.push(`${tag} ${plan}: ${e.message}`));
    await preparar(page, true);
    await page.addInitScript(() => { window.__abiertos = []; window.open = (u) => { window.__abiertos.push(u); return null; }; });
    // Lista: sin marcas previas para probar «Todos presentes»
    await page.route(/rest\/v1\/asistencias\?.*fecha=eq/, (r) => r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : r.fallback());
    await page.goto(BASE + "/app/profesor.html#/asistencia"); await page.waitForTimeout(1200);
    const total = await page.locator(".pase li").count();
    await page.getByRole("button", { name: "✓ Todos presentes" }).click(); await page.waitForTimeout(200);
    ok((await page.locator('.pase [data-e="presente"][aria-pressed="true"]').count()) === total && total > 0, `${tag} ${plan} «Todos presentes» marca a los ${total}`);
    await page.locator('.pase li').first().locator('[data-e="ausente"]').click();
    ok(await page.locator('.pase li').first().locator("input").isVisible(), `${tag} ${plan} al marcar ausente aparece el motivo`);
    await page.screenshot({ path: `${OUT}/${tag}-${plan}-lista.png` });
    let obs = null; page.on("request", (r) => { if (r.url().includes("/rest/v1/observaciones") && r.method() === "POST") obs = JSON.parse(r.postData() || "null"); });
    await page.locator(".btn-anotar").first().click(); await page.waitForTimeout(300);
    await page.locator(".chip", { hasText: "No entregó la tarea." }).click();
    await page.screenshot({ path: `${OUT}/${tag}-${plan}-observacion.png` });
    await page.getByRole("button", { name: "Guardar", exact: true }).click(); await page.waitForTimeout(500);
    ok(obs?.texto === "No entregó la tarea." && obs?.tipo === "academica", `${tag} ${plan} la observación de un toque se guarda`);
    let asis = null; page.on("request", (r) => { if (r.url().includes("/rest/v1/asistencias") && r.method() === "POST") asis = JSON.parse(r.postData() || "null"); });
    await page.getByRole("button", { name: "Guardar asistencia" }).click(); await page.waitForTimeout(500);
    ok(Array.isArray(asis) && asis.length === total && asis[0].estado === "ausente", `${tag} ${plan} la lista se guarda completa`);
    // Ficha del estudiante
    await page.goto(BASE + `/app/profesor.html#/estudiantes/${E(1)}`); await page.waitForTimeout(1200);
    if (plan === "prof_basico") {
      ok(!(await page.getByRole("button", { name: "Enviar reporte por WhatsApp" }).count()), `${tag} ${plan} sin reporte por WhatsApp`);
      ok(await page.getByText("Reporte por WhatsApp · mejora tu plan").isVisible(), `${tag} ${plan} candado: «mejora tu plan» en el reporte`);
    } else {
      await page.getByRole("button", { name: "Enviar reporte por WhatsApp" }).click(); await page.waitForTimeout(800);
      const txt = await page.locator("dialog.modal textarea").inputValue();
      ok(/Le comparto el avance de/.test(txt) && /Asistencia: /.test(txt) && /Promedio/.test(txt), `${tag} ${plan} el reporte trae asistencia y promedio`);
      await page.screenshot({ path: `${OUT}/${tag}-${plan}-reporte.png` });
      await page.getByRole("button", { name: "Abrir WhatsApp" }).click(); await page.waitForTimeout(300);
      const url = (await page.evaluate(() => window.__abiertos))[0] || "";
      ok(/^https:\/\/wa\.me\/\d*\?text=/.test(url), `${tag} ${plan} abre WhatsApp con el mensaje (${url.slice(0, 32)}…)`);
      await page.goto(BASE + "/app/profesor.html#/informes"); await page.waitForTimeout(1200);
      ok((await page.getByRole("button", { name: "WhatsApp" }).count()) > 0, `${tag} ${plan} informe del grupo con WhatsApp por estudiante`);
      await page.screenshot({ path: `${OUT}/${tag}-${plan}-informe.png`, fullPage: true });
    }
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= w + 1, `${tag} ${plan} sin desborde horizontal`);
    await ctxB.close();
  }
}
delete process.env.PLAN;
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
process.exit(fallos.length || errores.length ? 1 : 0);
