// Control de pagos, rúbricas y banco de preguntas: por plan, en teléfono y computadora.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar, E, EV2, A1, A2 } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/extras"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const browser = await chromium.launch();
async function pagina(ctxB, plan, tag) {
  process.env.PLAN = plan;
  const p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} ${plan}: ${e.message}`));
  await p.addInitScript(() => { window.open = (u) => { (window.__abiertos ||= []).push(u); return { location: "", close() {} }; }; });
  await preparar(p, true);
  return p;
}
const ancho = async (p, w, t) => { const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w + 1, `${t} sin desborde`); };
for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  // ---- Básico: candados ----
  let p = await pagina(ctxB, "prof_basico", tag);
  await p.goto(BASE + "/app/profesor.html#/cobros"); await p.waitForTimeout(1200);
  ok(await p.getByText("Lleva tus cuentas sin complicarte").isVisible() && await p.getByText("Finanzas · mejora tu plan").isVisible(), `${tag} básico: Finanzas muestra qué hace y el candado`);
  await p.goto(BASE + "/app/profesor.html#/calificaciones"); await p.waitForTimeout(1000);
  ok(!(await p.locator('a[href="#/rubricas"]').count()), `${tag} básico: sin rúbricas en Notas`);
  await p.close();

  // ---- Profesional: cobros y rúbricas ----
  p = await pagina(ctxB, "prof_profesional", tag);
  await p.goto(BASE + "/app/profesor.html#/inicio"); await p.waitForTimeout(1300);
  ok(await p.getByText(/con pagos atrasados/).isVisible(), `${tag} Inicio avisa de pagos atrasados`);
  ok(await p.locator('nav a[href="#/cobros"]').first().textContent().then((t) => t.includes("Finanzas")), `${tag} el menú dice «Finanzas»`);
  await p.goto(BASE + "/app/profesor.html#/cobros"); await p.waitForTimeout(1300);
  ok(await p.getByText("ganancia", { exact: true }).isVisible() && await p.getByText("te deben", { exact: true }).isVisible(), `${tag} Finanzas: resumen del mes con ingresos, gastos, ganancia y lo que te deben`);
  ok(await p.getByText("Clases particulares").first().isVisible() && await p.getByText("Talleres").first().isVisible() && await p.locator(".barras-cat li").count() === 2, `${tag} Finanzas: de dónde entró y en qué gastaste`);
  ok(await p.getByRole("heading", { name: "¿Cómo cobras a tus estudiantes?" }).isVisible(), `${tag} Finanzas pregunta cómo cobras`);
  await ancho(p, w, `${tag} Finanzas`);
  await p.screenshot({ path: `${OUT}/${tag}-finanzas.png`, fullPage: true });
  // Gasto
  let mov = null; p.on("request", (r) => { if (r.url().includes("/rest/v1/movimientos") && r.method() === "POST") mov = JSON.parse(r.postData() || "null"); });
  await p.getByRole("button", { name: "Registrar gasto" }).first().click(); await p.waitForTimeout(400);
  { const d = p.locator("dialog.modal").last();
    await d.locator('[name="concepto"]').fill("Hojas para el examen");
    await d.locator('[name="monto"]').fill("120");
    await p.screenshot({ path: `${OUT}/${tag}-gasto.png` });
    await d.getByRole("button", { name: /Guardar/ }).click(); await p.waitForTimeout(600); }
  const m1 = Array.isArray(mov) ? mov[0] : mov;
  ok(m1 && m1.tipo === "gasto" && Number(m1.monto) === 120 && m1.concepto === "Hojas para el examen", `${tag} registra un gasto`);
  // Clase particular
  let clase = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_cobro_clase")) clase = JSON.parse(r.postData() || "{}"); });
  await p.goto(BASE + "/app/profesor.html#/cobros?vista=clases"); await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "Registrar clase" }).first().click(); await p.waitForTimeout(400);
  { const d = p.locator("dialog.modal").last();
    await d.locator('[name="estudiante_id"]').selectOption({ index: 0 });
    const monto = d.locator('[name="monto"]'); if (!(await monto.inputValue())) await monto.fill("300");
    await p.screenshot({ path: `${OUT}/${tag}-clase.png` });
    await d.getByRole("button", { name: /Registrar|Guardar/ }).last().click(); await p.waitForTimeout(700); }
  ok(clase && clase.p_estudiante && Number(clase.p_monto) > 0 && clase.p_fecha, `${tag} registra una clase particular`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  // Gastos e ingresos
  await p.goto(BASE + "/app/profesor.html#/cobros?vista=movimientos"); await p.waitForTimeout(1200);
  ok(await p.getByText("Fotocopias del examen").isVisible() && await p.getByText("Taller de repaso").isVisible(), `${tag} lista de gastos e ingresos`);
  await ancho(p, w, `${tag} Gastos e ingresos`);
  // Quién debe
  await p.goto(BASE + "/app/profesor.html#/cobros?vista=deben"); await p.waitForTimeout(1300);
  ok(await p.locator(".lista-cobros li").count() >= 1, `${tag} Finanzas: quién debe`);
  await ancho(p, w, `${tag} Quién debe`);
  // El pago se registra con la misma función que «Cobrar» (con clave única: funciona sin internet y no se duplica)
  let pago = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_cobrar_varios")) { const b = JSON.parse(r.postData() || "{}"); pago = { ...(b.p_items?.[0] || {}), clave: b.p_clave }; } });
  await p.locator(".lista-cobros li").first().getByRole("button", { name: "Registrar pago" }).click(); await p.waitForTimeout(500);
  const dlg = p.locator("dialog.modal").last();
  if (await dlg.getByRole("button", { name: "Cobrar" }).count()) { await dlg.getByRole("button", { name: "Cobrar" }).first().click(); await p.waitForTimeout(400); }
  await p.locator("dialog.modal").last().getByRole("button", { name: "Registrar pago" }).click(); await p.waitForTimeout(700);
  ok(pago && pago.cargo_id && pago.monto > 0 && /^[0-9a-f-]{36}$/.test(pago.clave || ""), `${tag} registra el pago de un cobro`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await p.goto(BASE + "/app/profesor.html#/cobros?vista=deben"); await p.waitForTimeout(1200);
  await p.locator(".lista-cobros li").first().getByRole("button", { name: "WhatsApp" }).click(); await p.waitForTimeout(400);
  ok((await p.locator("dialog.modal textarea").inputValue()).includes("pago pendiente"), `${tag} recordatorio de pago por WhatsApp listo para revisar`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  let gen = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_cobros_generar")) gen = JSON.parse(r.postData() || "{}"); });
  await p.getByRole("button", { name: "Generar mensualidades" }).click(); await p.waitForTimeout(500);
  if (await p.locator("dialog.modal").count()) {
    await p.screenshot({ path: `${OUT}/${tag}-generar.png` });
    await p.locator("dialog.modal").getByRole("button", { name: "Generar" }).click(); await p.waitForTimeout(600);
    ok(gen?.p_periodo && Array.isArray(gen.p_grupos), `${tag} genera las mensualidades del mes elegido`);
  } else ok(await p.getByText(/Primero pon la mensualidad/).isVisible(), `${tag} sin mensualidad pide ponerla primero`);
  await p.goto(BASE + `/app/profesor.html#/estudiantes/${E(1)}`); await p.waitForTimeout(1300);
  ok(await p.getByRole("heading", { name: "Pagos" }).isVisible(), `${tag} la ficha del estudiante muestra sus pagos`);
  await p.goto(BASE + "/app/profesor.html#/rubricas"); await p.waitForTimeout(1100);
  ok(await p.getByText("Exposición oral").first().isVisible(), `${tag} rúbricas: lista y plantillas`);
  let rub = null; p.on("request", (r) => { if (r.url().includes("/rest/v1/rubricas") && r.method() === "POST") rub = JSON.parse(r.postData() || "null"); });
  await p.locator(".chip", { hasText: "Tarea en el cuaderno" }).click(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${tag}-rubrica-editor.png`, fullPage: true });
  await p.getByRole("button", { name: "Guardar rúbrica" }).click(); await p.waitForTimeout(600);
  ok(rub?.nombre === "Tarea en el cuaderno" && rub.criterios.length === 3, `${tag} crea una rúbrica desde plantilla`);
  await p.goto(BASE + `/app/profesor.html#/calificaciones?vista=evaluacion&evaluacion=${EV2}`); await p.waitForTimeout(1400);
  const bRub = p.locator(".calificar").getByRole("button", { name: "Rúbrica" }).first();
  ok(await bRub.isVisible(), `${tag} con rúbrica aparece el botón «Rúbrica» al poner notas`);
  await bRub.click(); await p.waitForTimeout(400);
  const fil = p.locator("dialog.modal .rub-fila");
  await fil.nth(0).locator(".chip").first().click(); await fil.nth(1).locator(".chip").first().click();
  await p.screenshot({ path: `${OUT}/${tag}-calificar-rubrica.png` });
  await p.getByRole("button", { name: "Aplicar" }).click(); await p.waitForTimeout(400);
  ok(await p.locator(".calificar input").first().inputValue() === "20", `${tag} la rúbrica calcula la nota (8/8 → 20/20)`);
  let up = null; p.on("request", (r) => { if (r.url().includes("/rest/v1/calificaciones") && r.method() === "POST") up = JSON.parse(r.postData() || "null"); });
  await p.locator(".pie-fijo .btn").click(); await p.waitForTimeout(600);
  ok(Array.isArray(up) && up.some((x) => Array.isArray(x.rubrica_detalle) && x.rubrica_detalle.length === 2), `${tag} la nota se guarda con el detalle de la rúbrica`);
  await p.goto(BASE + "/app/profesor.html#/banco"); await p.waitForTimeout(1000);
  ok(await p.getByText("Disponible en el plan Premium.").isVisible(), `${tag} profesional: banco de preguntas con candado`);
  await p.close();

  // ---- Premium: banco de preguntas ----
  p = await pagina(ctxB, "prof_premium", tag);
  await p.goto(BASE + "/app/profesor.html#/banco"); await p.waitForTimeout(1200);
  ok(await p.getByText("1/2 es mayor que 1/3.").isVisible() && await p.locator(".chip", { hasText: "Fracciones" }).isVisible(), `${tag} premium: banco con temas`);
  await ancho(p, w, `${tag} Banco`);
  await p.screenshot({ path: `${OUT}/${tag}-banco.png`, fullPage: true });
  let a2b = null, b2a = null;
  p.on("request", (r) => { if (r.url().includes("rpc/d360_actividad_a_banco")) a2b = JSON.parse(r.postData() || "{}"); if (r.url().includes("rpc/d360_banco_a_actividad")) b2a = JSON.parse(r.postData() || "{}"); });
  for (const act of [A2, A1]) {
    await p.goto(BASE + `/app/profesor.html#/enlinea/${act}`); await p.waitForTimeout(1300);
    if (await p.getByRole("button", { name: "Agregar del banco" }).count()) {
      await p.getByRole("button", { name: "Agregar del banco" }).click(); await p.waitForTimeout(500);
      await p.locator("dialog.modal input[type=checkbox]").first().check();
      await p.getByRole("button", { name: "Agregar al examen" }).click(); await p.waitForTimeout(500);
      break;
    }
  }
  ok(Array.isArray(b2a?.p_ids) && b2a.p_ids.length === 1, `${tag} agrega preguntas del banco a un examen`);
  await p.goto(BASE + `/app/profesor.html#/enlinea/${A1}`); await p.waitForTimeout(1300);
  await p.getByRole("button", { name: "Guardar en el banco" }).click(); await p.waitForTimeout(400);
  await p.locator("dialog.modal").getByRole("button", { name: "Guardar" }).click(); await p.waitForTimeout(500);
  ok(a2b?.p_tema, `${tag} guarda las preguntas de un examen en el banco`);
  await p.close();

  // ---- Aula del estudiante: pagos y rúbrica ----
  p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} aula: ${e.message}`));
  await preparar(p, false);
  await p.addInitScript(() => { try { localStorage.setItem("d360-aula", JSON.stringify({ sesion: "a".repeat(48) })); } catch (_) {} });
  await p.goto(BASE + "/aula.html#/notas"); await p.waitForTimeout(1300);
  ok(await p.getByText("Rúbrica: Dominio del tema: Excelente · Claridad: Bueno").isVisible() && await p.getByRole("heading", { name: "Mis pagos" }).isVisible(), `${tag} el estudiante ve la rúbrica y sus pagos en su aula`);
  await ancho(p, w, `${tag} Aula notas`);
  await p.screenshot({ path: `${OUT}/${tag}-aula-notas.png`, fullPage: true });
  await p.close();
  await ctxB.close();
}
delete process.env.PLAN;
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
process.exit(fallos.length || errores.length ? 1 : 0);
