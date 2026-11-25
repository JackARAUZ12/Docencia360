// Primeros pasos del colegio: bienvenida con los 4 bloques, pasos con avance real (botón y
// panel de Inicio), consejos por sección, demo y que el docente no la vea. Celular y PC.
// Uso: node tests/ui/guia_colegio.mjs  (requiere servidor estático en :8080)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/guia_colegio"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const insertar = (p, tabla, fila) => p.evaluate(async ([t, f]) => { const { sb, q } = await import("/assets/js/core/sb.js"); await q(sb.from(t).insert(f).select()); }, [tabla, fila]);
const avance = async (p) => (await p.locator("button.guia-flotante").textContent().catch(() => "")).match(/(\d+)\/(\d+)/)?.slice(1).map(Number);
const ancho = async (p, w, t) => ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= w + 1, `${t} sin desborde horizontal`);
const browser = await chromium.launch();
for (const [w, hh, tag] of [[360, 740, "movil"], [768, 1024, "tablet"], [1366, 900, "pc"]]) {
  // ---------- Demo: bienvenida y pasos desde cero ----------
  process.env.DEMO = "1";
  let ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  let p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} demo: ${e.message}`));
  await preparar(p, true, "colegio", "propietario");
  await p.goto(BASE + "/app/colegio.html#/inicio"); await p.waitForTimeout(1800);
  const bv = p.locator("dialog.bienvenida");
  ok(await bv.isVisible() && await bv.locator(".bv-fases li").count() === 4, `${tag} la bienvenida del colegio explica los 4 bloques`);
  ok(await bv.getByText("Estás en la demostración.").isVisible(), `${tag} en la demo avisa que es demostración`);
  await ancho(p, w, `${tag} bienvenida`);
  await p.screenshot({ path: `${OUT}/${tag}-1-bienvenida.png` });
  await bv.getByRole("button", { name: "Empezar: datos del colegio" }).click(); await p.waitForTimeout(1500);
  ok(p.url().endsWith("#/institucion") && !(await bv.count()), `${tag} «Empezar» lleva a los datos del colegio`);
  const a0 = await avance(p);
  ok(a0 && a0[0] === 0 && a0[1] >= 9, `${tag} el botón «Primeros pasos» empieza en 0 de ${a0?.[1]}`);
  ok(await p.locator(".ayuda-primera").first().isVisible(), `${tag} la primera vez en la sección aparece un consejo`);
  await insertar(p, "periodos", { nombre: "I Bimestre", cuenta_id: "x" }); await p.waitForTimeout(1800);
  ok((await avance(p))?.[0] === 1 && await p.getByText("✓ Paso completado: Completa los datos del colegio y el año escolar").isVisible(), `${tag} al guardar el año escolar el paso se marca y avisa`);
  await p.evaluate(() => { location.hash = "#/docentes"; }); await p.waitForTimeout(1800);
  ok((await avance(p))?.[0] === 2, `${tag} en la demo «Registra a tus docentes» se marca al ver la pantalla`);
  await p.locator("button.guia-flotante").click(); await p.waitForTimeout(500);
  const lista = p.locator("dialog.modal .pasos-guia li");
  ok(await lista.count() === a0[1] && await lista.nth(1).getByText("Crea los grados y sus secciones").isVisible(), `${tag} la lista muestra los ${a0[1]} pasos en orden`);
  await ancho(p, w, `${tag} lista de pasos`);
  await p.screenshot({ path: `${OUT}/${tag}-2-lista.png` });
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
  await p.evaluate(() => { location.hash = "#/inicio"; }); await p.waitForTimeout(1800);
  ok(/Pon en marcha tu colegio · 2 de/.test(await p.locator("main .guia-viva h2").textContent().catch(() => "")), `${tag} Inicio muestra «Pon en marcha tu colegio» con el avance`);
  await ancho(p, w, `${tag} Inicio con la guía`);
  await p.screenshot({ path: `${OUT}/${tag}-3-inicio.png`, fullPage: true });
  await ctxB.close();
  delete process.env.DEMO;

  // ---------- Colegio real con datos: sin bienvenida, pasos según los datos ----------
  ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} colegio: ${e.message}`));
  await preparar(p, true, "colegio", "propietario");
  await p.goto(BASE + "/app/colegio.html#/inicio"); await p.waitForTimeout(1800);
  ok(!(await p.locator("dialog.bienvenida").count()), `${tag} un colegio que ya tiene secciones no ve la bienvenida`);
  const ar = await avance(p);
  ok(!ar || ar[0] > 0, `${tag} los pasos ya hechos aparecen marcados por los datos (${ar ? ar.join("/") : "todo completo"})`);
  await p.goto(BASE + "/app/colegio.html#/cuenta"); await p.waitForTimeout(1300);
  ok(await p.getByRole("button", { name: "Mostrar la guía" }).isVisible() && await p.getByRole("button", { name: "Ver la bienvenida otra vez" }).isVisible(), `${tag} en «Plan y cuenta» se puede volver a mostrar la guía y la bienvenida`);
  await p.getByRole("button", { name: "Ver la bienvenida otra vez" }).click(); await p.waitForTimeout(500);
  ok(await p.locator("dialog.bienvenida").isVisible(), `${tag} la bienvenida se vuelve a abrir desde «Plan y cuenta»`);
  await ctxB.close();

  // ---------- Docente: no ve la guía de la dirección ----------
  ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} docente: ${e.message}`));
  await preparar(p, true, "colegio", "docente");
  await p.goto(BASE + "/app/colegio.html#/inicio"); await p.waitForTimeout(1800);
  ok(!(await p.locator("dialog.bienvenida").count()) && !(await p.locator("button.guia-flotante:not([hidden])").count()) && !(await p.locator(".guia-viva").count()), `${tag} el docente no ve la bienvenida ni los primeros pasos`);
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
