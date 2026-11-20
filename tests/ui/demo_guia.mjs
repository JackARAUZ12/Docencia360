// Demostración: la misma bienvenida y los mismos «Primeros pasos» que una cuenta nueva.
// En la demo los pasos se marcan por lo que la persona HACE ahí (no por los datos de ejemplo).
// Uso: node tests/ui/demo_guia.mjs  (requiere servidor estático en :8080)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/demo_guia"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const insertar = (p, tabla, fila) => p.evaluate(async ([t, f]) => { const { sb, q } = await import("/assets/js/core/sb.js"); await q(sb.from(t).insert(f).select()); }, [tabla, fila]);
const avance = async (p) => (await p.locator("button.guia-flotante").textContent().catch(() => "")).match(/(\d+)\/(\d+)/)?.slice(1).map(Number);
process.env.DEMO = "1";
const browser = await chromium.launch();
for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  // ---------- Profesor ----------
  let ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  let p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag}: ${e.message}`));
  await preparar(p, true, "profesor", "propietario");
  await p.goto(BASE + "/app/profesor.html#/inicio"); await p.waitForTimeout(1500);
  const bv = p.locator("dialog.bienvenida");
  ok(await bv.isVisible(), `${tag} profesor: en la demo aparece la misma bienvenida que al crear la cuenta`);
  ok(await bv.getByText("Estás en la demostración.").isVisible() && await bv.getByRole("button", { name: "Saltar por ahora" }).isVisible(), `${tag} profesor: la bienvenida avisa que es demo y deja saltarla`);
  await p.screenshot({ path: `${OUT}/${tag}-profesor-bienvenida.png` });
  await bv.getByRole("button", { name: "Saltar por ahora" }).click(); await p.waitForTimeout(1500);
  const a0 = await avance(p);
  ok(a0 && a0[0] === 0, `${tag} profesor: «Primeros pasos» empieza en 0 aunque la demo ya tenga datos (${a0?.join("/")})`);
  ok(await p.locator("main .guia-viva").getByText(/Primeros pasos · 0 de/).isVisible(), `${tag} profesor: Inicio muestra el recorrido arriba`);
  await p.screenshot({ path: `${OUT}/${tag}-profesor-inicio.png`, fullPage: true });
  await insertar(p, "grupos", { nombre: "Mi grupo de prueba", cuenta_id: "x" }); await p.waitForTimeout(1800);
  ok((await avance(p))?.[0] === 1 && await p.getByText("✓ Paso completado: Crea tu primer grupo").isVisible(), `${tag} profesor: al crear un grupo en la demo, el paso se marca y avisa`);
  await p.evaluate(() => { location.hash = "#/enlinea/accesos"; }); await p.waitForTimeout(1800);
  ok((await avance(p))?.[0] === 2, `${tag} profesor: lo que la demo no permite (dar códigos) se marca al ver la pantalla`);
  await p.locator("button.guia-flotante").click(); await p.waitForTimeout(400);
  ok(await p.locator("dialog.modal").getByText(/Así empieza una cuenta nueva/).isVisible(), `${tag} profesor: la lista explica que en la demo se hace con datos de prueba`);
  await p.screenshot({ path: `${OUT}/${tag}-profesor-lista.png` });
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
  await p.reload(); await p.waitForTimeout(1800);
  ok(!(await p.locator("dialog.bienvenida").count()) && (await avance(p))?.[0] === 2, `${tag} profesor: al recargar no repite la bienvenida y guarda el avance`);
  await ctxB.close();

  // ---------- Academia ----------
  ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} academia: ${e.message}`));
  await preparar(p, true, "academia", "propietario");
  await p.goto(BASE + "/app/academia.html#/inicio"); await p.waitForTimeout(1600);
  const bva = p.locator("dialog.bienvenida");
  ok(await bva.isVisible() && await bva.getByText("Estás en la demostración.").isVisible(), `${tag} academia: en la demo aparece la bienvenida de la academia`);
  await p.screenshot({ path: `${OUT}/${tag}-academia-bienvenida.png` });
  await bva.getByRole("button", { name: "Saltar por ahora" }).click(); await p.waitForTimeout(1500);
  const panel = p.locator("main .guia-viva h2");
  ok(/Pon en marcha tu academia · 0 de/.test(await panel.textContent().catch(() => "")), `${tag} academia: «Pon en marcha» empieza en 0 en la demo`);
  await insertar(p, "cursos", { nombre: "Curso de prueba", cuenta_id: "x" }); await p.waitForTimeout(1800);
  ok(/· 1 de/.test(await panel.textContent().catch(() => "")), `${tag} academia: al registrar un curso el paso se marca`);
  await p.screenshot({ path: `${OUT}/${tag}-academia-inicio.png` });
  await ctxB.close();
}
delete process.env.DEMO;
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
