// Horario por día en la ficha del grupo: varios días a la vez, cada uno con su propia hora.
// Uso: node tests/ui/horario_dias.mjs  (requiere servidor estático en :8080)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/horario_dias"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const G1 = "33333333-3333-3333-3333-333333333331";
const browser = await chromium.launch();
for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  for (const modalidad of ["profesor", "academia"]) {
    const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
    const p = await ctxB.newPage();
    p.on("pageerror", (e) => errores.push(`${tag} ${modalidad}: ${e.message}`));
    await preparar(p, true, modalidad, "propietario");
    let enviado = null; p.on("request", (r) => { if (r.url().includes("/rest/v1/horarios") && r.method() === "POST") enviado = JSON.parse(r.postData() || "null"); });
    await p.goto(BASE + `/app/${modalidad}.html#/grupos/${G1}`); await p.waitForTimeout(1500);
    await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
    await p.locator("main .hoja-titulo", { hasText: "Horario semanal" }).getByRole("button", { name: "Agregar" }).click();
    await p.waitForTimeout(400);
    const dlg = p.locator("dialog.modal").last();
    ok(await dlg.getByText("Cada día puede tener su propia hora").isVisible(), `${tag} ${modalidad}: «Agregar horario» explica que cada día lleva su hora`);
    // Sin días marcados no deja guardar
    await dlg.getByRole("button", { name: "Agregar", exact: true }).click(); await p.waitForTimeout(300);
    ok(await dlg.getByText("Marca al menos un día.").isVisible() && !enviado, `${tag} ${modalidad}: sin días marcados no guarda y lo dice`);
    await dlg.getByRole("checkbox", { name: "Martes" }).check();
    await dlg.getByRole("checkbox", { name: "Jueves" }).check();
    await dlg.getByRole("checkbox", { name: "Sábado" }).check();
    await dlg.getByLabel("Sábado: empieza").fill("08:00"); await dlg.getByLabel("Sábado: termina").fill("07:00");
    await dlg.getByRole("button", { name: "Agregar", exact: true }).click(); await p.waitForTimeout(300);
    ok(await dlg.getByText("Sábado: la hora de fin debe ser después de la de inicio.").isVisible() && !enviado, `${tag} ${modalidad}: avisa qué día tiene la hora mal y no guarda`);
    await dlg.getByLabel("Sábado: termina").fill("10:00");
    await p.screenshot({ path: `${OUT}/${tag}-${modalidad}.png` });
    await dlg.getByRole("button", { name: "Agregar", exact: true }).click(); await p.waitForTimeout(800);
    const filas = Array.isArray(enviado) ? enviado : [];
    ok(filas.length === 3 && filas[0].dia === 2 && filas[0].hora_inicio === "16:00" && filas[1].dia === 4 && filas[2].dia === 6 && filas[2].hora_inicio === "08:00" && filas[2].hora_fin === "10:00"
      && filas.every((f) => f.grupo_id === G1), `${tag} ${modalidad}: guarda 3 días de una vez, cada uno con su hora (sábado 8:00–10:00)`);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= w + 1, `${tag} ${modalidad}: sin desborde`);
    await ctxB.close();
  }
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
