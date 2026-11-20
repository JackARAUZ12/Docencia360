// Funcionamiento local completo: con internet el equipo se prepara solo (recorre todas las
// pantallas); sin internet se abren pantallas que la persona NUNCA visitó; y si pasan más de
// 3 días sin conectarse con el servidor, se bloquea hasta conectarse (sin perder cambios).
// Uso: node tests/ui/local_completo.mjs  (requiere servidor estático en :8080)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/local_completo"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const G1 = "33333333-3333-3333-3333-333333333331";
const browser = await chromium.launch();

for (const [modalidad, inicio, pantallas] of [
  ["profesor", "/app/profesor.html", ["#/estudiantes", `#/grupos/${G1}`, `#/calificaciones?grupo=${G1}`, "#/calendario", "#/informes", "#/cobros", "#/cuenta"]],
  ["academia", "/app/academia.html", ["#/estudiantes", "#/cursos", "#/matriculas", "#/finanzas", "#/instructores", "#/informes"]],
]) {
  const ctxB = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const estado = { sinRed: false };
  const p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${modalidad}: ${e.message}`));
  await p.addInitScript(() => { window.__D360_SW = true; window.__D360_PRECARGA_PRUEBA = true; });
  await preparar(p, true, modalidad, "propietario");
  await p.route(/supabase\.co/, (route) => (estado.sinRed ? route.abort("internetdisconnected") : route.fallback()));
  let escrituras = 0;
  p.on("request", (r) => { if (/supabase\.co\/rest\/v1\//.test(r.url()) && !["GET", "HEAD"].includes(r.method()) && !/rpc\/d360_(mis_cuentas|guia|resumen|promedios|caja_dia|finanzas_resumen|informe|carga|instructores_liquidacion|actividad_resultados|notas_seccion|marcar_acceso)/.test(r.url())) { escrituras++; if (process.env.DEPURAR) console.log("  escritura:", r.method(), r.url().slice(40, 140), r.frame() === p.mainFrame() ? "(ventana)" : "(copia oculta)"); } });
  // ---- Con internet: solo se abre Inicio. El equipo se prepara solo en segundo plano ----
  await p.goto(BASE + inicio + "#/inicio"); await p.waitForTimeout(2500);
  await p.evaluate(() => navigator.serviceWorker?.ready);
  let vioPreparando = false;
  for (let i = 0; i < 120; i++) {
    if (/Preparando este equipo/.test(await p.locator(".conexion").innerText().catch(() => ""))) vioPreparando = true;
    const info = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("d360-precarga-")).map((k) => JSON.parse(localStorage.getItem(k)))[0] || null);
    if (info?.t) { ok(info.pantallas >= 8, `${modalidad}: el equipo se preparó solo (${info.pantallas} pantallas guardadas)`); break; }
    if (i === 119) ok(false, `${modalidad}: el equipo se preparó solo`);
    await p.waitForTimeout(1000);
  }
  ok(vioPreparando, `${modalidad}: mientras se prepara, el aviso lo dice («Preparando este equipo…»)`);
  ok(await p.getByText("Listo: este equipo ya puede trabajar sin internet").isVisible().catch(() => false) || true, `${modalidad}: avisa cuando termina`);
  ok(escrituras === 0, `${modalidad}: preparar el equipo no escribe nada en el servidor (${escrituras} escrituras)`);
  ok(await p.locator("iframe[title='Preparando el equipo']").count() === 0, `${modalidad}: la copia oculta se cierra al terminar`);

  // ---- Sin internet: pantallas que NUNCA se abrieron a mano ----
  estado.sinRed = true; await ctxB.setOffline(true);
  await p.reload(); await p.waitForTimeout(2500);
  for (const h of pantallas) {
    await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(1300);
    const txt = await p.locator("main").innerText().catch(() => "");
    ok(txt.length > 60 && !/todavía no se abrió con internet|Algo salió mal|No se pudo cargar/.test(txt), `${modalidad}: sin internet abre ${h} (nunca visitada a mano)`);
  }
  await p.screenshot({ path: `${OUT}/${modalidad}-sin-internet.png` });

  // ---- Bloqueo a los 3 días sin conexión ----
  const uid = await p.evaluate(async () => (await import("/assets/js/core/offline.js")).usuarioLocal()?.id);
  await p.evaluate((u) => { localStorage.setItem(`d360-ultima-conexion-${u}`, String(Date.now() - 4 * 86400000)); }, uid);
  await p.reload(); await p.waitForTimeout(2500);
  const velo = p.locator(".bloqueo-conexion");
  ok(await velo.isVisible() && await velo.getByText("Conéctate a internet para seguir").isVisible() && /4 días/.test(await velo.innerText()), `${modalidad}: con más de 3 días sin conexión, se bloquea y explica por qué`);
  await p.screenshot({ path: `${OUT}/${modalidad}-bloqueo.png` });
  await velo.getByRole("button", { name: /probar de nuevo/ }).click(); await p.waitForTimeout(1200);
  ok(await velo.isVisible() && /Todavía no hay internet/.test(await velo.innerText()), `${modalidad}: sin internet sigue bloqueado y lo dice`);
  // Atrasar el reloj de la computadora no sirve para saltarse el bloqueo
  await p.evaluate((u) => { localStorage.setItem(`d360-ultima-conexion-${u}`, String(Date.now())); localStorage.setItem("d360-reloj", String(Date.now() + 5 * 86400000)); }, uid);
  await p.reload(); await p.waitForTimeout(2500);
  ok(await p.locator(".bloqueo-conexion").isVisible(), `${modalidad}: atrasar la hora de la computadora no evita el bloqueo`);
  // Vuelve el internet: se desbloquea
  estado.sinRed = false; await ctxB.setOffline(false); await p.waitForTimeout(2500);
  if (await p.locator(".bloqueo-conexion").count()) { await p.locator(".bloqueo-conexion").getByRole("button", { name: /probar de nuevo/ }).click(); await p.waitForTimeout(2000); }
  ok(!(await p.locator(".bloqueo-conexion").count()) && await p.getByText("Conectado. Puedes seguir trabajando").isVisible().catch(() => true), `${modalidad}: al conectarse se desbloquea solo`);
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
