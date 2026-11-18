// Portal del estudiante: entrar sin enlace, ver la lista y pasar al examen con el código ya puesto.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/alumno"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const browser = await chromium.launch();
for (const [w, hh, tag] of [[360, 760, "movil"], [1280, 860, "pc"]]) {
  const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  const page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`${tag}: ${e.message}`));
  await preparar(page, false);
  await page.goto(BASE + "/alumno.html"); await page.waitForTimeout(900);
  ok(await page.getByText("Tus tareas y exámenes").isVisible(), `${tag} sin enlace pide los dos códigos (ya no se queda sin salida)`);
  await page.screenshot({ path: `${OUT}/${tag}-1-entrar.png` });
  await page.getByLabel("Código de tu profesor").fill("k7m2qp");
  await page.getByLabel("Tu código personal de 6 números").fill("999999");
  await page.getByRole("button", { name: "Ver mis tareas y exámenes" }).click(); await page.waitForTimeout(500);
  ok(/no es correcto/.test(await page.locator("#aviso").innerText()), `${tag} código equivocado: mensaje claro`);
  await page.getByLabel("Tu código personal de 6 números").fill("123456");
  await page.getByRole("button", { name: "Ver mis tareas y exámenes" }).click(); await page.waitForTimeout(600);
  ok(await page.getByText("Hola, Ana").isVisible(), `${tag} entra y saluda al estudiante`);
  ok(await page.getByRole("button", { name: "Empezar examen" }).isVisible() && await page.getByText("Nota: 8 de 10").isVisible() && await page.getByText(/Abre /).isVisible(),
    `${tag} ve «Por hacer», «Próximamente» y sus notas`);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= w + 1, `${tag} sin desborde horizontal`);
  await page.screenshot({ path: `${OUT}/${tag}-2-lista.png`, fullPage: true });
  await page.getByRole("button", { name: "Empezar examen" }).click(); await page.waitForTimeout(900);
  ok(page.url().includes("a=fisica2026") && await page.locator(".pin-alumno").inputValue() === "123456", `${tag} abre el examen con su código ya escrito (aún no empieza el tiempo)`);
  ok(await page.getByText("← Mis tareas y exámenes").isVisible(), `${tag} puede volver a su lista`);
  await page.screenshot({ path: `${OUT}/${tag}-3-examen.png` });
  await page.getByText("← Mis tareas y exámenes").click(); await page.waitForTimeout(800);
  ok(await page.getByText("Hola, Ana").isVisible(), `${tag} al volver no tiene que escribir los códigos otra vez`);
  await page.getByRole("button", { name: "Salir" }).click(); await page.waitForTimeout(300);
  ok(await page.getByLabel("Código de tu profesor").isVisible(), `${tag} «Salir» cierra su sesión en ese aparato`);
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
process.exit(fallos.length || errores.length ? 1 : 0);
