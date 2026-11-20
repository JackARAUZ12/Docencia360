// Modo híbrido: sin internet se ve lo guardado, se pasa lista, se crean grupos y se cobra
// con comprobante provisional; al volver la conexión todo se sube solo y en orden.
// Uso: node tests/ui/sin_internet.mjs  (requiere servidor estático en :8080)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { preparar } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/sin_internet"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const G1 = "33333333-3333-3333-3333-333333333331";

// sw.js debe estar al día con los archivos de la app
const antes = fs.readFileSync("sw.js", "utf8");
execFileSync("node", ["herramientas/generar-sw.mjs"]);
ok(fs.readFileSync("sw.js", "utf8") === antes, "sw.js está al día (si falla: correr node herramientas/generar-sw.mjs y volver a probar)");

const browser = await chromium.launch();
// Corta o devuelve el internet: el navegador queda sin conexión y Supabase no responde
async function red(ctxB, estado, hay) { estado.sinRed = !hay; await ctxB.setOffline(!hay); }
async function pagina(ctxB, modalidad, rol, estado, extra) {
  const p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${modalidad}: ${e.message}`));
  if (process.env.DEPURAR) { await p.addInitScript(() => { globalThis.__D360_DEPURAR = true; }); p.on("console", (m) => m.type() === "warning" && console.log("  [consola]", m.text())); }
  if (extra) await p.addInitScript(extra);
  await preparar(p, true, modalidad, rol);
  await p.route(/supabase\.co/, (route) => (estado.sinRed ? route.abort("internetdisconnected") : route.fallback()));
  return p;
}
const barra = (p) => p.locator(".conexion:not([hidden])");

for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  // ================= Profesor =================
  let estado = { sinRed: false };
  let ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  let p = await pagina(ctxB, "profesor", "propietario", estado);
  // Con internet: se abren las pantallas (quedan guardadas en el equipo)
  for (const r of ["inicio", "grupos", `asistencia?grupo=${G1}`, "estudiantes"]) { await p.goto(BASE + `/app/profesor.html#/${r}`); await p.waitForTimeout(1100); }
  ok(!(await barra(p).count()), `${tag} con internet no aparece ningún aviso`);
  const nGrupos = await p.evaluate(async () => { const { sb, q } = await import("/assets/js/core/sb.js"); return (await q(sb.from("grupos").select("*, asignaturas(nombre), cursos(nombre)").eq("cuenta_id", "11111111-1111-1111-1111-111111111111").order("nombre"))).length; }).catch(() => -1);

  // ---- Se va el internet ----
  await red(ctxB, estado, false);
  await p.evaluate(() => { location.hash = "#/grupos"; }); await p.waitForTimeout(1200);
  ok(await barra(p).isVisible() && /Sin internet/.test(await barra(p).innerText()), `${tag} sin internet avisa «Sin internet · ves lo último guardado»`);
  ok(await p.locator("main").getByText("Matemática 9no").first().isVisible(), `${tag} sin internet se ven los grupos guardados`);
  await p.screenshot({ path: `${OUT}/${tag}-1-sin-internet.png` });
  // Pasar lista sin internet
  await p.evaluate((g) => { location.hash = `#/asistencia?grupo=${g}`; }, G1); await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "✓ Todos presentes" }).click(); await p.waitForTimeout(200);
  await p.getByRole("button", { name: "Guardar asistencia" }).click(); await p.waitForTimeout(900);
  ok(await p.getByText("Asistencia guardada").isVisible(), `${tag} sin internet la lista se guarda (en el equipo)`);
  ok(/1 cambio\(s\) por subir/.test(await barra(p).innerText()), `${tag} el aviso cuenta 1 cambio por subir`);
  // Crear un grupo sin internet y abrirlo
  await p.evaluate(() => { location.hash = "#/grupos"; }); await p.waitForTimeout(1000);
  await p.locator("main").getByRole("button", { name: "Nuevo grupo" }).click(); await p.waitForTimeout(400);
  await p.locator('dialog.modal [name="nombre"]').fill("Física 10mo — sin internet");
  await p.locator("dialog.modal").getByRole("button", { name: "Guardar" }).click(); await p.waitForTimeout(1300);
  await p.screenshot({ path: `${OUT}/${tag}-grupo-nuevo.png` });
  if (process.env.DEPURAR) console.log("URL", p.url(), "\n", (await p.locator("main").innerText()).slice(0, 400));
  ok(/#\/grupos\/[0-9a-f-]{36}/.test(p.url()) && await p.getByText("Física 10mo — sin internet").first().isVisible(), `${tag} sin internet se crea un grupo y se abre su ficha`);
  await p.evaluate(() => { location.hash = "#/grupos"; }); await p.waitForTimeout(1000);
  ok(await p.locator("main").getByText("Física 10mo — sin internet").first().isVisible(), `${tag} el grupo nuevo aparece en la lista (pendiente de subir)`);
  // Algo que necesita internet: mensaje claro
  const msg = await p.evaluate(async () => { const { sb, q } = await import("/assets/js/core/sb.js"); try { await q(sb.rpc("d360_regenerar_codigo", { p_miembro: "x" })); return "sin error"; } catch (e) { return e.message; } });
  ok(/necesita internet/.test(msg), `${tag} lo que necesita internet lo dice claro («${msg.slice(0, 40)}…»)`);
  const pend = await p.evaluate(async () => (await import("/assets/js/core/offline.js")).bandeja().then((b) => b.map((x) => x.resumen)));
  ok(pend.length === 2 && pend[0].startsWith("Asistencia") && pend[1].startsWith("Grupo"), `${tag} la bandeja guarda los 2 cambios en orden (${pend.join(" · ")})`);
  await barra(p).getByRole("button", { name: "Ver" }).click(); await p.waitForTimeout(500);
  ok(await p.locator("dialog.modal").getByText("Cambios guardados en este equipo").isVisible() && await p.locator("dialog.modal .lista-bandeja li").count() === 2, `${tag} «Ver» muestra la lista de lo que falta subir`);
  await p.screenshot({ path: `${OUT}/${tag}-2-bandeja.png` });
  await p.locator("dialog.modal .modal-pie").getByRole("button", { name: "Cerrar" }).click();
  // Salir con cambios sin subir: pregunta antes
  let pregunta = null; p.once("dialog", (d) => { pregunta = d.message(); d.dismiss(); });
  await p.evaluate(async () => (await import("/assets/js/core/sesion.js")).salir());
  await p.waitForTimeout(300);
  ok(pregunta && /todavía no se subieron/.test(pregunta) && p.url().includes("profesor.html"), `${tag} al salir con cambios sin subir pregunta antes (y se puede quedar)`);

  // ---- Vuelve el internet: se sube todo, en orden ----
  const subidas = [];
  p.on("request", (r) => { const u = r.url(); if (/rest\/v1\/(asistencias|grupos)/.test(u) && r.method() === "POST") subidas.push({ t: u.match(/v1\/(\w+)/)[1], body: JSON.parse(r.postData() || "null"), auth: r.headers().authorization || "", url: u }); });
  await red(ctxB, estado, true); await p.waitForTimeout(2500);
  ok(subidas.length === 2 && subidas[0].t === "asistencias" && subidas[1].t === "grupos", `${tag} al volver el internet se suben solos y en orden (asistencia y luego grupo)`);
  ok(subidas[0]?.url.includes("on_conflict=grupo_id%2Cestudiante_id%2Cfecha") || subidas[0]?.url.includes("on_conflict=grupo_id,estudiante_id,fecha"), `${tag} la lista se sube como «actualizar si ya existe» (no duplica)`);
  ok(/^[0-9a-f-]{36}$/.test(subidas[1]?.body?.id || "") && subidas[1]?.body?.nombre === "Física 10mo — sin internet", `${tag} el grupo se sube con su id creado en el equipo (un reenvío no lo duplica)`);
  ok(subidas.every((s) => /^Bearer /.test(s.auth)) && !JSON.stringify(subidas).includes("x-d360"), `${tag} se suben con la sesión del usuario (el servidor revisa permisos)`);
  ok(await p.getByText(/Se subieron 2 cambio/).isVisible().catch(() => false) || !(await barra(p).count()), `${tag} avisa «Se subieron 2 cambios» y el aviso desaparece`);
  ok(!(await barra(p).count()), `${tag} con todo subido no queda ningún aviso`);
  void nGrupos;
  await p.close(); await ctxB.close();

  // ================= Academia: cobro sin internet =================
  estado = { sinRed: false };
  ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  p = await pagina(ctxB, "academia", "propietario", estado, () => { window.__D360_SW = true; try { localStorage.setItem("d360-ticket-ancho", "58"); } catch (_) {} });
  await p.goto(BASE + "/app/academia.html#/finanzas"); await p.waitForTimeout(1400);
  await p.evaluate(() => navigator.serviceWorker.ready);
  // Con internet se abre el cobro una vez (queda guardado) y se cancela
  const cobrarAntes = await p.locator("main").getByRole("button", { name: "Cobrar", exact: true }).count();
  await p.locator("main").getByRole("button", { name: "Cobrar", exact: true }).first().click(); await p.waitForTimeout(900);
  await p.locator("dialog.modal").last().getByRole("button", { name: "Cancelar" }).click(); await p.waitForTimeout(300);
  await red(ctxB, estado, false);
  await p.evaluate(() => { location.hash = "#/finanzas?vista=cobrar&x=1"; }); await p.waitForTimeout(1300);
  await p.locator("main").getByRole("button", { name: "Cobrar", exact: true }).first().click(); await p.waitForTimeout(900);
  let dlg = p.locator("dialog.modal").last();
  ok(await dlg.getByRole("button", { name: "Cobrar e imprimir" }).isVisible(), `${tag} sin internet se puede abrir el cobro`);
  await dlg.getByRole("button", { name: "Cobrar e imprimir" }).click(); await p.waitForTimeout(1300);
  const t = p.locator("dialog.modal").last();
  if (process.env.DEPURAR) console.log("TICKET", (await t.innerText().catch(() => "?")).slice(0, 500), "| toasts:", await p.locator("#toasts").innerText().catch(() => ""));
  ok(await t.getByText("COMPROBANTE PROVISIONAL").first().isVisible() && await t.getByText(/P-[0-9A-F]{6} \(provisional\)/).first().isVisible() && await t.getByText(/número definitivo al conectarse/).first().isVisible(),
    `${tag} sin internet entrega comprobante PROVISIONAL con código y aviso`);
  await p.screenshot({ path: `${OUT}/${tag}-3-comprobante-provisional.png` });
  await t.locator(".modal-pie").getByRole("button", { name: "Cerrar" }).click(); await p.waitForTimeout(300);
  // El saldo ya bajó en el equipo: lo cobrado ya no aparece como pendiente (no se cobra dos veces)
  await p.waitForTimeout(800);
  const cobrarDespues = await p.locator("main").getByRole("button", { name: "Cobrar", exact: true }).count();
  ok(cobrarDespues === cobrarAntes - 1, `${tag} lo cobrado sin internet ya no aparece como pendiente en este equipo (${cobrarAntes} → ${cobrarDespues})`);
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
  // La caja avisa y no deja cerrar mientras falte subir
  await p.evaluate(() => { location.hash = "#/caja"; }); await p.waitForTimeout(1300);
  const cajaTxt = await p.locator("main").innerText().catch(() => "");
  ok(/cobro\(s\) hechos sin internet que todavía no aparecen/.test(cajaTxt) || /necesita internet|todavía no se abrió/.test(cajaTxt), `${tag} la caja avisa de los cobros sin subir (o que necesita abrirse con internet)`);
  // Vuelve el internet: el cobro se sube con su clave y la hora real
  let cobro = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_cobrar_varios")) cobro = JSON.parse(r.postData() || "{}"); });
  await red(ctxB, estado, true); await p.waitForTimeout(2500);
  ok(cobro && /^[0-9a-f-]{36}$/.test(cobro.p_clave || "") && cobro.p_cobrado_en && cobro.p_items?.length >= 1, `${tag} al volver el internet el cobro se sube con su clave única y la hora real del cobro`);
  await p.evaluate(async () => (await import("/assets/js/core/conexion.js")).verBandeja({ cuenta: { moneda: "NIO" } })); await p.waitForTimeout(700);
  ok(await p.locator("dialog.modal").getByText("Cobros sin internet ya confirmados").isVisible() && await p.locator("dialog.modal").getByRole("button", { name: "Comprobante final" }).isVisible(),
    `${tag} queda la opción de imprimir el comprobante final con el número definitivo`);
  await p.screenshot({ path: `${OUT}/${tag}-4-confirmados.png` });
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));

  // ================= Rechazo del servidor =================
  await red(ctxB, estado, false);
  await p.evaluate(async () => { const { sb, q } = await import("/assets/js/core/sb.js"); await q(sb.from("observaciones").insert({ cuenta_id: "x", estudiante_id: "e", texto: "Prueba" })); });
  await p.route(/rest\/v1\/observaciones/, (r) => (r.request().method() === "POST" ? r.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy" }) }) : r.fallback()));
  await red(ctxB, estado, true); await p.waitForTimeout(2500);
  ok(/no se pudieron subir/.test(await barra(p).innerText().catch(() => "")), `${tag} si el servidor rechaza un cambio, el aviso lo dice (no se pierde en silencio)`);
  await barra(p).getByRole("button", { name: "Ver" }).click(); await p.waitForTimeout(500);
  ok(await p.locator("dialog.modal").getByText(/no tienes permiso/).isVisible() && await p.locator("dialog.modal").getByRole("button", { name: "Descartar" }).isVisible(), `${tag} explica por qué y deja reintentar o descartar`);
  p.once("dialog", (d) => d.accept());
  await p.locator("dialog.modal").getByRole("button", { name: "Descartar" }).click(); await p.waitForTimeout(600);
  ok(await p.locator("dialog.modal").getByText("No hay nada pendiente").isVisible(), `${tag} al descartar queda todo limpio`);
  await p.close(); await ctxB.close();

  // ================= La app abre sin internet (service worker) =================
  estado = { sinRed: false };
  ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  p = await pagina(ctxB, "profesor", "propietario", estado, () => { window.__D360_SW = true; });
  await p.goto(BASE + "/app/profesor.html#/inicio"); await p.waitForTimeout(1500);
  await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(1500);
  await p.goto(BASE + "/app/profesor.html#/grupos"); await p.waitForTimeout(1200);
  await red(ctxB, estado, false);
  await p.reload(); await p.waitForTimeout(2500);
  ok(await p.locator("main").getByText("Matemática 9no").first().isVisible().catch(() => false), `${tag} sin internet la aplicación abre (recargando la página) y muestra lo guardado`);
  ok(await barra(p).isVisible().catch(() => false), `${tag} y avisa que está sin internet`);
  await p.screenshot({ path: `${OUT}/${tag}-5-abre-sin-internet.png` });
  await p.close(); await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
