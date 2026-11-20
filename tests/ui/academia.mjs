// Academias: aula virtual, comunicados, familias, finanzas con gastos y pago a instructores.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/academia"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const browser = await chromium.launch();
const ancho = async (p, w, t) => { const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w + 1, `${t} sin desborde`); };
const pagina = async (ctxB, rol, tag) => {
  const p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} ${rol}: ${e.message}`));
  await p.addInitScript(() => { window.open = (u) => { (window.__abiertos ||= []).push(u); return { location: "", close() {} }; }; });
  await preparar(p, true, "academia", rol);
  return p;
};
for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  // ---- Dirección ----
  let p = await pagina(ctxB, "propietario", tag);
  await p.goto(BASE + "/app/academia.html#/inicio"); await p.waitForTimeout(1400);
  const menu = await p.locator("nav.a-lateral").textContent();
  ok(["Comunicados", "Exámenes en línea", "Aula virtual", "Pagos a instructores", "Familias"].every((x) => menu.includes(x)), `${tag} el menú trae comunicados, aula, exámenes, pagos a instructores y familias`);
  ok(!/\b(estudiantes activos)\b/.test("") && (await p.locator(".cifra b").first().innerText()).length > 0, `${tag} las cifras en Inicio muestran número (también el 0)`);

  // Pagos a instructores
  await p.goto(BASE + "/app/academia.html#/pagos-instructores"); await p.waitForTimeout(1300);
  ok(await p.getByText("a pagar en el mes").isVisible() && await p.getByText("C$150.00 por hora · 3 clases · 6 h").isVisible() && await p.getByText(/Salario fijo · C\$8,000.00 al mes/).isVisible(),
    `${tag} pagos a instructores: por hora y salario fijo con sus clases y horas`);
  ok(await p.getByText(/sin forma de pago/).first().isVisible() && await p.getByText(/no tienen instructor asignado/).isVisible(), `${tag} avisa de instructores sin forma de pago y clases sin instructor`);
  await ancho(p, w, `${tag} Pagos a instructores`);
  await p.screenshot({ path: `${OUT}/${tag}-pagos-instructores.png`, fullPage: true });
  let tarifa = null; p.on("request", (r) => { if (r.url().includes("/rest/v1/tarifas_instructor") && r.method() === "POST") tarifa = JSON.parse(r.postData() || "null"); });
  await p.getByRole("button", { name: "Definir pago" }).click(); await p.waitForTimeout(400);
  await p.locator('dialog.modal [name="forma"]').selectOption("clase");
  await p.locator('dialog.modal [name="monto"]').fill("250");
  await p.locator("dialog.modal").getByRole("button", { name: "Guardar" }).click(); await p.waitForTimeout(600);
  const t1 = Array.isArray(tarifa) ? tarifa[0] : tarifa;
  ok(t1 && t1.miembro_id === "m4" && t1.forma === "clase" && Number(t1.monto) === 250, `${tag} define la forma de pago (por clase, C$250)`);
  await p.goto(BASE + "/app/academia.html#/pagos-instructores"); await p.waitForTimeout(1200);
  let pago = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_instructor_pagar")) pago = JSON.parse(r.postData() || "{}"); });
  await p.getByRole("button", { name: "Pagar", exact: true }).first().click(); await p.waitForTimeout(400);
  ok((await p.locator('dialog.modal [name="monto"]').inputValue()) === "500", `${tag} el pago propone lo que falta (900 − 400 = 500)`);
  await p.locator('dialog.modal [name="nota"]').fill("Resto de noviembre");
  await p.locator("dialog.modal").getByRole("button", { name: "Registrar pago" }).click(); await p.waitForTimeout(700);
  ok(pago && pago.p_miembro === "m2" && Number(pago.p_monto) === 500 && /^\d{4}-\d{2}$/.test(pago.p_periodo) && pago.p_detalle?.forma === "hora", `${tag} registra el pago del mes al instructor`);
  ok(await p.getByText("Comprobante de pago a instructor").isVisible(), `${tag} muestra el comprobante para imprimir y firmar`);
  await p.screenshot({ path: `${OUT}/${tag}-comprobante.png` });
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
  await p.getByRole("button", { name: "Detalle" }).first().click(); await p.waitForTimeout(400);
  ok(await p.locator("dialog.modal").getByText("sin horario").isVisible() && await p.locator("dialog.modal").getByText("Adelanto").isVisible(), `${tag} el detalle muestra clases dadas (y las sin horario) y pagos`);
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));

  // Finanzas: resumen y gastos
  await p.goto(BASE + "/app/academia.html#/finanzas?vista=resumen"); await p.waitForTimeout(1300);
  ok(await p.getByText("ganancia", { exact: true }).isVisible() && await p.getByText("En qué se gastó").isVisible(), `${tag} Finanzas: resumen del mes con ganancia real`);
  await ancho(p, w, `${tag} Resumen del mes`);
  let mov = null; p.on("request", (r) => { if (r.url().includes("/rest/v1/movimientos") && r.method() === "POST") mov = JSON.parse(r.postData() || "null"); });
  await p.getByRole("button", { name: "Registrar gasto" }).first().click(); await p.waitForTimeout(400);
  ok(await p.locator('dialog.modal [name="categoria"] option', { hasText: "Alquiler del local" }).count() === 1, `${tag} los gastos traen categorías de academia`);
  await p.locator('dialog.modal [name="concepto"]').fill("Alquiler de noviembre");
  await p.locator('dialog.modal [name="monto"]').fill("6000");
  await p.locator("dialog.modal").getByRole("button", { name: "Guardar" }).click(); await p.waitForTimeout(600);
  const m1 = Array.isArray(mov) ? mov[0] : mov;
  ok(m1 && m1.tipo === "gasto" && Number(m1.monto) === 6000 && m1.categoria === "Alquiler del local", `${tag} registra un gasto de la academia`);
  await p.goto(BASE + "/app/academia.html#/finanzas?vista=gastos"); await p.waitForTimeout(1200);
  ok(await p.getByText("Fotocopias del examen").isVisible(), `${tag} lista de gastos e ingresos del mes`);
  await ancho(p, w, `${tag} Gastos`);

  // Comunicados
  await p.goto(BASE + "/app/academia.html#/comunicados"); await p.waitForTimeout(1100);
  let com = null; p.on("request", (r) => { if (r.url().includes("/rest/v1/comunicados") && r.method() === "POST") com = JSON.parse(r.postData() || "null"); });
  await p.getByRole("button", { name: "Nuevo comunicado" }).click(); await p.waitForTimeout(400);
  ok(await p.locator('dialog.modal [name="audiencia"] option', { hasText: "Un grupo" }).count() === 1, `${tag} los comunicados se dirigen a grupos (no secciones)`);
  await p.locator('dialog.modal [name="titulo"]').fill("Feriado");
  await p.locator('dialog.modal [name="cuerpo"]').fill("El lunes no hay clases.");
  await p.locator("dialog.modal").getByRole("button", { name: "Publicar" }).click(); await p.waitForTimeout(600);
  const c1 = Array.isArray(com) ? com[0] : com;
  ok(c1 && c1.titulo === "Feriado" && c1.audiencia === "todos", `${tag} publica un comunicado para toda la academia`);
  // Aula, exámenes y familias
  for (const [r, txt] of [["enlinea", "Banco de preguntas"], ["aula", "Aula virtual"], ["familias", "Familias con acceso"]]) {
    await p.goto(BASE + `/app/academia.html#/${r}`); await p.waitForTimeout(1100);
    ok(await p.getByText(txt).first().isVisible(), `${tag} ${r} disponible en la academia`);
    await ancho(p, w, `${tag} ${r}`);
  }
  await p.close();

  // ---- Instructor: solo sus pagos ----
  p = await pagina(ctxB, "docente", tag);
  await p.goto(BASE + "/app/academia.html#/mis-pagos"); await p.waitForTimeout(1300);
  ok(await p.getByRole("heading", { name: "Mis pagos" }).isVisible() && !(await p.getByRole("button", { name: "Pagar", exact: true }).count()) && !(await p.getByRole("button", { name: "Tarifa" }).count()),
    `${tag} el instructor ve «Mis pagos» sin poder pagar ni cambiar tarifas`);
  ok(!(await p.locator('nav.a-lateral a[href="#/pagos-instructores"]').count()) && !(await p.locator('nav.a-lateral a[href="#/finanzas"]').count()), `${tag} el instructor no ve finanzas ni pagos de otros en el menú`);
  await p.close();

  // ---- Familia de la academia ----
  p = await pagina(ctxB, "tutor", tag);
  await p.goto(BASE + "/app/academia.html#/inicio"); await p.waitForTimeout(1500);
  ok(p.url().includes("familias.html"), `${tag} la familia entra a su portal`);
  await p.goto(BASE + "/app/familias.html#/notas"); await p.waitForTimeout(1300);
  ok(await p.getByText("Matemática 9no").first().isVisible() && await p.getByText("85 de 100").isVisible(), `${tag} la familia ve las notas por grupo de la academia`);
  await ancho(p, w, `${tag} Portal de familias`);
  await p.screenshot({ path: `${OUT}/${tag}-familia-notas.png`, fullPage: true });
  await p.close();
  await ctxB.close();
}
// Sin familias en el plan: candado con explicación
process.env.SIN_FAMILIAS = "1";
{ const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await pagina(ctxB, "propietario", "movil");
  await p.goto(BASE + "/app/academia.html#/familias"); await p.waitForTimeout(1200);
  ok(await p.getByText("Disponible en el plan Empresarial.").isVisible(), "sin el plan Empresarial, Familias explica qué es y cómo obtenerlo");
  await ctxB.close(); }
delete process.env.SIN_FAMILIAS;
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
