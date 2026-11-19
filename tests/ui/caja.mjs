// Caja: cobrar varios conceptos con un comprobante, ticket 58/76/80 mm o carta, WhatsApp,
// datos del comprobante, cierre de caja y «clase de ahora» del instructor.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar, E, hoy } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/caja"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const browser = await chromium.launch();
const ancho = async (p, w, t) => { const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w + 1, `${t} sin desborde`); };
const pagina = async (ctxB, rol, tag, modalidad = "academia") => {
  const p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} ${rol}: ${e.message}`));
  await p.addInitScript(() => { window.open = (u) => { (window.__abiertos ||= []).push(u); return { location: "", close() {} }; }; });
  await preparar(p, true, modalidad, rol);
  return p;
};
for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  let p = await pagina(ctxB, "propietario", tag);
  await p.addInitScript(() => { try { localStorage.setItem("d360-ticket-ancho", "58"); } catch (_) {} });
  // ---- Cobrar varios conceptos juntos ----
  await p.goto(BASE + "/app/academia.html#/finanzas"); await p.waitForTimeout(1300);
  let cobro = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_cobrar_varios")) cobro = JSON.parse(r.postData() || "{}"); });
  await p.locator("main").getByRole("button", { name: "Cobrar", exact: true }).first().click(); await p.waitForTimeout(800);
  const dlg = p.locator("dialog.modal").last();
  const chks = dlg.locator(".cobro-chk input");
  ok(await chks.count() >= 1 && await chks.first().isChecked(), `${tag} «Cobrar» abre el cobro con el concepto ya marcado`);
  if (await chks.count() > 1) await chks.nth(1).check();
  await p.screenshot({ path: `${OUT}/${tag}-cobrar-varios.png` });
  await dlg.getByRole("button", { name: "Cobrar e imprimir" }).click(); await p.waitForTimeout(1200);
  ok(cobro && Array.isArray(cobro.p_items) && cobro.p_items.length >= 1 && cobro.p_items.every((x) => x.monto > 0) && cobro.p_metodo === "efectivo", `${tag} cobra los conceptos marcados en un solo paso`);
  const t = p.locator("dialog.modal").last();
  ok(await t.getByText("Recibos N.º").first().isVisible() && await t.getByText("000041, 000042").first().isVisible() && await t.getByText("TOTAL").isVisible(), `${tag} un solo comprobante con los dos recibos y el total`);
  ok(await t.locator(".ticket-hoja.hoja-58").count() === 1, `${tag} recuerda el tamaño de papel de este equipo (58 mm)`);
  await p.screenshot({ path: `${OUT}/${tag}-ticket-58.png` });
  for (const [v, txt] of [["76", "76 mm"], ["80", "80 mm"], ["carta", "Carta / A4"]]) {
    await t.getByRole("button", { name: txt }).click(); await p.waitForTimeout(200);
    ok(await t.locator(`.ticket-hoja.hoja-${v}`).count() === 1, `${tag} vista previa en ${txt}`);
    await p.screenshot({ path: `${OUT}/${tag}-ticket-${v}.png` });
  }
  await t.getByRole("button", { name: "80 mm" }).click(); await p.waitForTimeout(200);
  await t.getByRole("button", { name: "Imprimir", exact: true }).click(); await p.waitForTimeout(700);
  const css = await p.evaluate(() => document.querySelector('iframe[title="Impresión del comprobante"]')?.contentDocument?.querySelector("style")?.textContent || "");
  const cuerpo = await p.evaluate(() => document.querySelector('iframe[title="Impresión del comprobante"]')?.contentDocument?.body?.innerText || "");
  ok(css.includes("size: 80mm auto") && css.includes("width: 72mm") && cuerpo.includes("COMPROBANTE DE PAGO"), `${tag} imprime en papel de 80 mm (área de 72 mm) sin tocar la página`);
  if (await t.getByRole("button", { name: "WhatsApp" }).count()) {
    await t.getByRole("button", { name: "WhatsApp" }).click(); await p.waitForTimeout(300);
    const wa = decodeURIComponent(await p.evaluate(() => (window.__abiertos || []).pop() || ""));
    ok(wa.includes("wa.me/") && wa.includes("COMPROBANTE DE PAGO") && wa.includes("000041"), `${tag} el comprobante se envía por WhatsApp`);
  }
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
  // ---- Datos del comprobante ----
  let tk = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_ticket_guardar")) tk = JSON.parse(r.postData() || "{}"); });
  await p.getByRole("button", { name: "Datos del comprobante" }).click(); await p.waitForTimeout(700);
  await p.locator('dialog.modal [name="ruc"]').fill("J0310000000000");
  await p.locator('dialog.modal [name="pie"]').fill("¡Gracias por estudiar con nosotros!");
  await p.locator("dialog.modal").getByRole("button", { name: "Guardar" }).click(); await p.waitForTimeout(700);
  ok(tk?.p_cfg?.ruc === "J0310000000000" && tk.p_cfg.pie.startsWith("¡Gracias"), `${tag} guarda RUC y mensaje del comprobante`);
  // ---- Pagos recibidos: reimprimir ----
  await p.goto(BASE + "/app/academia.html#/finanzas?vista=pagos"); await p.waitForTimeout(1200);
  await p.locator("main").getByRole("button", { name: "Recibo" }).first().click(); await p.waitForTimeout(800);
  ok(await p.locator("dialog.modal .ticket").count() === 1, `${tag} reimprime cualquier recibo en formato ticket`);
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
  // ---- Cierre de caja ----
  await p.goto(BASE + "/app/academia.html#/caja"); await p.waitForTimeout(1300);
  ok(await p.getByText("cobrado · 3 recibo(s)").isVisible() && await p.getByText("anulado (no suma)").isVisible() && await p.locator("main table, main .tabla").getByText("Cajera Rosa").first().isVisible(), `${tag} caja del día: total, por forma de pago, anulados y quién cobró`);
  await ancho(p, w, `${tag} Cierre de caja`);
  await p.screenshot({ path: `${OUT}/${tag}-caja.png`, fullPage: true });
  let cierre = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_caja_cerrar")) cierre = JSON.parse(r.postData() || "{}"); });
  await p.getByRole("button", { name: "Cerrar caja" }).click(); await p.waitForTimeout(500);
  await p.locator('dialog.modal input[aria-label="Efectivo contado"]').fill("1650");
  ok(await p.getByText("Faltan C$50.00").isVisible(), `${tag} al contar el efectivo dice si cuadra (faltan C$50)`);
  await p.screenshot({ path: `${OUT}/${tag}-cerrar-caja.png` });
  await p.locator("dialog.modal").last().getByRole("button", { name: "Cerrar caja" }).click(); await p.waitForTimeout(1200);
  ok(cierre && Number(cierre.p_efectivo_contado) === 1650 && cierre.p_fecha === hoy && cierre.p_cajero === null, `${tag} cierra la caja del día con el efectivo contado`);
  ok(await p.locator("dialog.modal .ticket").getByText("CIERRE DE CAJA").isVisible(), `${tag} muestra el cierre listo para imprimir`);
  await p.screenshot({ path: `${OUT}/${tag}-cierre-ticket.png` });
  await p.close();
  // ---- La cajera (rol finanzas) ve su caja; el instructor no ve caja ----
  p = await pagina(ctxB, "finanzas", tag);
  await p.goto(BASE + "/app/academia.html#/caja"); await p.waitForTimeout(1300);
  ok(await p.locator('select[aria-label="Cajero"]').inputValue() !== "todos", `${tag} la cajera ve su propia caja por defecto`);
  await p.close();
  process.env.MIEMBRO = "m2";   // el instructor asignado al grupo en la simulación
  p = await pagina(ctxB, "docente", tag);
  await p.clock.setFixedTime(new Date(`${hoy}T08:10:00`));
  await p.goto(BASE + "/app/academia.html#/inicio"); await p.waitForTimeout(1400);
  ok(!(await p.locator('nav.a-lateral a[href="#/caja"]').count()), `${tag} el instructor no ve la caja`);
  ok(await p.getByText("Clase de ahora").isVisible() && await p.locator(".clase-ahora").getByRole("link", { name: /Pasar lista|Ver o corregir/ }).isVisible(), `${tag} el instructor ve su clase de ahora con un toque para pasar lista`);
  await p.screenshot({ path: `${OUT}/${tag}-instructor-clase-ahora.png` });
  delete process.env.MIEMBRO;
  await p.close();
  // ---- Profesor: sus recibos también salen en ticket ----
  p = await pagina(ctxB, "propietario", tag, "profesor");
  process.env.PLAN = "prof_profesional";
  await p.goto(BASE + "/app/profesor.html#/cobros?vista=deben"); await p.waitForTimeout(1300);
  await p.locator(".lista-cobros li").first().getByRole("button", { name: "Registrar pago" }).click(); await p.waitForTimeout(500);
  const dp = p.locator("dialog.modal").last();
  if (await dp.getByRole("button", { name: "Cobrar" }).count()) { await dp.getByRole("button", { name: "Cobrar" }).first().click(); await p.waitForTimeout(400); }
  await p.locator("dialog.modal").last().getByRole("button", { name: "Registrar pago" }).click(); await p.waitForTimeout(1200);
  ok(await p.locator("dialog.modal .ticket").count() === 1, `${tag} profesor: el recibo del pago sale en formato ticket`);
  delete process.env.PLAN;
  await p.close();
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
