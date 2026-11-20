// Academia «súper práctica»: buscadores en vivo (sin tildes), barra rápida para buscar y cobrar,
// menú corto con «Día a día», atajos del Inicio por rol y bienvenida guiada.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar, E } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/practico-academia"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const browser = await chromium.launch();
const pagina = async (ctxB, rol, tag) => {
  const p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} ${rol}: ${e.message}`));
  await p.addInitScript(() => { window.open = (u) => { (window.__abiertos ||= []).push(u); return { location: "", close() {} }; }; });
  await preparar(p, true, "academia", rol);
  return p;
};
for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  let p = await pagina(ctxB, "propietario", tag);
  await p.goto(BASE + "/app/academia.html#/inicio"); await p.waitForTimeout(1500);
  // ---- Menú corto ----
  const nav = p.locator("nav.a-lateral");
  ok(await nav.locator(".a-grupo-nav").first().innerText().then((t) => t.includes("Día a día") && t.includes("Cobrar y finanzas") && t.includes("Cierre de caja")), `${tag} el menú empieza con «Día a día» (cobrar, estudiantes, asistencia, interesados, caja)`);
  ok(await nav.locator("details.desplegable").count() >= 2 && !(await nav.locator("details.desplegable[open]").count()), `${tag} el resto del menú va en grupos cerrados`);
  await p.goto(BASE + "/app/academia.html#/cursos"); await p.waitForTimeout(1000);
  ok(await nav.locator('details.desplegable[open] [data-r="cursos"]').count() === 1, `${tag} al entrar a una pantalla se abre su grupo del menú`);
  // ---- Atajos del Inicio ----
  await p.goto(BASE + "/app/academia.html#/inicio"); await p.waitForTimeout(1300);
  ok(await p.locator(".atajos .atajo-principal").getByText("Cobrar").isVisible() && await p.getByText("Caja de hoy").isVisible() && await p.locator(".atajos").getByText("Pasar lista").isVisible(), `${tag} Inicio: atajos para cobrar, caja de hoy y pasar lista`);
  await p.screenshot({ path: `${OUT}/${tag}-inicio-duena.png`, fullPage: true });
  // ---- Barra rápida: buscar sin tildes, en cualquier orden ----
  const barra = p.locator(".a-rapida input");
  await barra.fill("lopez ana"); await p.waitForTimeout(400);
  ok(await p.locator(".rapida-res").getByText("Ana López").isVisible(), `${tag} barra rápida: «lopez ana» encuentra a «Ana López»`);
  await barra.fill("maria jose"); await p.waitForTimeout(400);
  ok(await p.locator(".rapida-res").getByText("María José Gutiérrez Castillo").isVisible(), `${tag} sin tildes: «maria jose» encuentra a «María José»`);
  await p.screenshot({ path: `${OUT}/${tag}-barra-rapida.png` });
  await p.locator(".rapida-res .rapida-item").first().getByRole("button", { name: "Ficha" }).click(); await p.waitForTimeout(800);
  ok(p.url().includes(`#/estudiantes/${E(3)}`), `${tag} desde el resultado abre la ficha`);
  // Cobrar: el botón deja la barra lista y Enter cobra al primero
  await p.locator(".rapida-cobrar").click(); await p.waitForTimeout(200);
  ok((await barra.getAttribute("placeholder")).includes("Quién paga") && await p.locator(".rapida-pista").isVisible(), `${tag} «Cobrar» prepara la barra para buscar a quien paga`);
  await barra.fill("ana"); await p.waitForTimeout(400); await barra.press("Enter"); await p.waitForTimeout(900);
  ok(await p.locator("dialog.modal").getByText("Cobrar · Ana López").isVisible(), `${tag} Enter abre el cobro del estudiante elegido`);
  await p.screenshot({ path: `${OUT}/${tag}-cobrar-desde-barra.png` });
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
  // ---- Buscador en vivo automático en listas largas ----
  await p.goto(BASE + "/app/academia.html#/grupos"); await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const nombres = ["Ana López", "María José Gutiérrez", "Luis Pérez", "José Ñúñez", "Carla Ruiz", "Pedro Díaz", "Sofía Herrera", "Raúl Martínez", "Elena Ríos", "Iván Zeledón", "Lucía Pineda", "Mario Gómez"];
    const s = document.createElement("section"); s.className = "hoja prueba-larga";
    s.innerHTML = "<h2>Lista larga</h2><ul class='lista'>" + nombres.map((n) => `<li><strong>${n}</strong></li>`).join("") + "</ul>";
    document.querySelector("main > div").append(s);
  });
  await p.waitForTimeout(500);
  const bv = p.locator(".prueba-larga .buscador-vivo input");
  ok(await bv.isVisible(), `${tag} una lista de 10+ filas recibe su buscador automáticamente`);
  await bv.fill("maria"); await p.waitForTimeout(300);
  ok(await p.locator(".prueba-larga li:not([hidden])").count() === 1 && await p.locator(".prueba-larga .buscador-cuenta").innerText() === "1 de 12", `${tag} filtra mientras escribes, sin tildes («maria» → «María José»), y dice «1 de 12»`);
  await bv.fill("nunez jose"); await p.waitForTimeout(300);
  ok(await p.locator(".prueba-larga li:not([hidden])").innerText() === "José Ñúñez", `${tag} varias palabras en cualquier orden y con ñ`);
  await bv.fill("zzz"); await p.waitForTimeout(300);
  ok(await p.locator(".prueba-larga").getByText("Nada coincide con «zzz».").isVisible(), `${tag} avisa cuando nada coincide`);
  await bv.press("Escape"); await p.waitForTimeout(300);
  ok(await p.locator(".prueba-larga li:not([hidden])").count() === 12, `${tag} Escape limpia la búsqueda`);
  await p.screenshot({ path: `${OUT}/${tag}-buscador-vivo.png`, fullPage: true });
  // Buscador de estudiantes (el propio de la pantalla) ahora ignora tildes
  await p.goto(BASE + "/app/academia.html#/estudiantes"); await p.waitForTimeout(1200);
  await p.locator('main input[type="search"]').fill("gutierrez"); await p.waitForTimeout(300);
  ok(await p.locator("main tbody tr").count() === 1 && await p.locator("main tbody").getByText("María José Gutiérrez Castillo").isVisible(), `${tag} Estudiantes: «gutierrez» encuentra «Gutiérrez»`);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w + 1, `${tag} sin desborde`);
  await p.close();
  // ---- Cajera e instructor ----
  p = await pagina(ctxB, "finanzas", tag);
  await p.goto(BASE + "/app/academia.html#/inicio"); await p.waitForTimeout(1400);
  ok(await p.getByText("Mi caja de hoy").isVisible() && await p.locator(".rapida-cobrar").isVisible(), `${tag} la cajera ve «Mi caja de hoy» y el botón Cobrar`);
  await p.close();
  p = await pagina(ctxB, "docente", tag);
  await p.goto(BASE + "/app/academia.html#/inicio"); await p.waitForTimeout(1400);
  const navD = await p.locator("nav.a-lateral").innerText();
  ok(!(await p.locator(".rapida-cobrar").count()) && !(await p.locator(".atajos").count()) && navD.includes("Más") && !navD.includes("Cobrar"), `${tag} el instructor: sin cobrar, menú corto con «Más»`);
  await p.close();
  await ctxB.close();
}
// ---- Bienvenida guiada de academia (cuenta nueva sin cursos) ----
{
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await pagina(ctxB, "propietario", "bienvenida");
  const llamadas = [];
  await p.route(/rest\/v1\/(cursos|grupos|horarios|grupo_docentes)(\?.*)?$/, async (route) => {
    const r = route.request(); const t = new URL(r.url()).pathname.split("/").pop();
    if (r.method() === "GET" && t === "cursos") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (r.method() === "POST") {
      const d = JSON.parse(r.postData() || "{}"); llamadas.push([t, d]);
      const fila = { ...(Array.isArray(d) ? d[0] : d), id: t + "-nuevo" };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(r.headers()["accept"]?.includes("vnd.pgrst.object") ? fila : [fila]) });
    }
    return route.fallback();
  });
  let imp = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_importar_estudiantes")) imp = JSON.parse(r.postData() || "{}"); });
  await p.goto(BASE + "/app/academia.html#/inicio"); await p.waitForTimeout(1600);
  const bv = p.locator("dialog.bienvenida");
  ok(await bv.isVisible() && await bv.getByText("En 4 pasos cortos").isVisible(), "bienvenida: aparece la primera vez a la dueña sin cursos");
  await bv.locator("form input").first().fill("Inglés A1");
  await bv.locator('input[type="number"]').first().fill("1200");
  await bv.getByRole("button", { name: "Continuar" }).click(); await p.waitForTimeout(700);
  ok(llamadas.some(([t, d]) => t === "cursos" && d.nombre === "Inglés A1" && Number(d.mensualidad) === 1200), "bienvenida: crea el curso con su mensualidad");
  await bv.locator(".bv-dia", { hasText: "Lun" }).click(); await bv.locator(".bv-dia", { hasText: "Mié" }).click();
  await bv.locator('select[aria-label="Instructor"]').selectOption("nuevo");
  await bv.locator('input[aria-label="Nombre del instructor nuevo"]').fill("Sarah Johnson");
  await p.screenshot({ path: `${OUT}/bienvenida-grupo.png` });
  await bv.getByRole("button", { name: "Crear el grupo" }).click(); await p.waitForTimeout(900);
  ok(llamadas.some(([t]) => t === "grupos") && llamadas.some(([t, d]) => t === "horarios" && Array.isArray(d) && d.length === 2) && llamadas.some(([t]) => t === "grupo_docentes"), "bienvenida: crea el grupo con horario de 2 días e instructor");
  await bv.locator("textarea").fill("Ana Sofía López\nCarlos Pérez Ruiz");
  await bv.getByRole("button", { name: "Agregar al grupo" }).click(); await p.waitForTimeout(900);
  ok(imp?.p_filas?.length === 2 && imp.p_grupo === "grupos-nuevo", "bienvenida: agrega la lista de estudiantes al grupo");
  ok(await bv.getByRole("heading", { name: "Matrículas y cobros" }).isVisible(), "bienvenida: ofrece matricular con cobros");
  await bv.getByRole("button", { name: /Matricular a los/ }).click(); await p.waitForTimeout(900);
  ok(await bv.getByRole("heading", { name: "¡Tu academia está lista!" }).isVisible(), "bienvenida: termina con el resumen");
  await p.screenshot({ path: `${OUT}/bienvenida-lista.png` });
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
