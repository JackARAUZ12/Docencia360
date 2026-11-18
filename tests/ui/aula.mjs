// Aula virtual: el estudiante entra, navega su aula, abre una tarea con archivo y sube una foto;
// el profesor publica avisos/materiales, pide archivos en una actividad y revisa el archivo.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar, registro, A1 } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/aula"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const FOTO = `${OUT}/foto.png`;
fs.writeFileSync(FOTO, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const browser = await chromium.launch();
for (const [w, hh, tag] of [[360, 760, "movil"], [1280, 860, "pc"]]) {
  // ---- Estudiante ----
  let ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  let page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`${tag} estudiante: ${e.message}`));
  await page.addInitScript(() => { window.open = () => ({ location: "", close() {} }); });
  await preparar(page, false);
  await page.goto(BASE + "/alumno.html"); await page.waitForTimeout(900);
  ok(page.url().includes("aula.html"), `${tag} alumno.html sin enlace lleva al aula`);
  await page.getByLabel("Código de tu profesor").fill("k7m2qp");
  await page.getByLabel("Tu código personal de 6 números").fill("123456");
  await page.screenshot({ path: `${OUT}/${tag}-1-entrar.png` });
  await page.getByRole("button", { name: "Entrar a mi aula" }).click(); await page.waitForTimeout(800);
  ok(await page.getByText("Hola, Ana").isVisible(), `${tag} entra a su aula`);
  ok(await page.getByText("Mañana hay examen de fracciones.").first().isVisible(), `${tag} ve los avisos del profesor en Inicio`);
  let sw = await page.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w + 1, `${tag} Inicio sin desborde`);
  await page.screenshot({ path: `${OUT}/${tag}-2-inicio.png`, fullPage: true });
  await page.goto(BASE + "/aula.html#/materiales"); await page.waitForTimeout(900);
  ok(await page.getByText("Guía unidad 3").isVisible() && await page.getByRole("link", { name: "Abrir enlace" }).isVisible(), `${tag} ve materiales (archivo y enlace) sin volver a entrar`);
  await page.getByRole("button", { name: "Ver PDF" }).click(); await page.waitForTimeout(500);
  ok((registro.archivos || []).some((x) => x.accion === "ver" && x.material === "ma1"), `${tag} abrir un PDF pide una URL temporal al servidor`);
  await page.screenshot({ path: `${OUT}/${tag}-3-materiales.png`, fullPage: true });
  await page.goto(BASE + "/aula.html#/notas"); await page.waitForTimeout(800);
  ok(await page.getByText("Examen parcial").isVisible() && await page.getByText("91.7%").isVisible(), `${tag} ve sus notas y su asistencia`);
  await page.screenshot({ path: `${OUT}/${tag}-4-notas.png`, fullPage: true });
  await page.goto(BASE + "/aula.html#/actividades"); await page.waitForTimeout(800);
  ok(await page.getByText("Comentario: ¡Muy bien!").isVisible(), `${tag} ve la nota y el comentario del profesor`);
  await page.locator(".item-a", { hasText: "Ejercicios en el cuaderno" }).getByRole("button", { name: "Hacer tarea" }).click(); await page.waitForTimeout(1000);
  ok(page.url().includes("a=tareafoto1") && await page.getByRole("button", { name: "Empezar tarea" }).isVisible(), `${tag} la tarea se abre sin pedir el código otra vez`);
  await page.getByRole("button", { name: "Empezar tarea" }).click(); await page.waitForTimeout(800);
  ok(await page.getByText("Tu trabajo en archivos").isVisible(), `${tag} la tarea pide fotos o PDF`);
  await page.locator(".zona-archivos input[type=file]").setInputFiles(FOTO); await page.waitForTimeout(900);
  ok(await page.locator(".archivos-ent li").count() === 1 && (registro.archivos || []).some((x) => x.accion === "subir" && x.tipo === "image/png"), `${tag} sube la foto (con URL firmada)`);
  ok((registro.storage || []).some((x) => x.includes("/object/upload/sign/")), `${tag} el archivo va directo al almacenamiento privado`);
  await page.screenshot({ path: `${OUT}/${tag}-5-tarea-archivo.png`, fullPage: true });
  await page.getByRole("button", { name: "Quitar" }).click(); await page.waitForTimeout(500);
  ok(await page.locator(".archivos-ent li").count() === 0, `${tag} puede quitar un archivo antes de entregar`);
  await page.goto(BASE + "/aula.html#/inicio"); await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Salir" }).click(); await page.waitForTimeout(400);
  ok(await page.getByLabel("Código de tu profesor").isVisible(), `${tag} «Salir» vuelve a pedir los códigos`);
  await ctxB.close();

  // ---- Profesor ----
  ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`${tag} profesor: ${e.message}`));
  await page.addInitScript(() => { window.open = () => ({ location: "", close() {} }); });
  await preparar(page, true);
  await page.goto(BASE + "/app/profesor.html#/aula"); await page.waitForTimeout(1200);
  ok(await page.getByRole("heading", { name: "Aula virtual" }).isVisible() && await page.getByText("Mañana hay examen de fracciones.").isVisible() && await page.getByText("Guía unidad 3").isVisible(), `${tag} el profesor ve avisos y materiales del grupo`);
  let aviso = null; page.on("request", (r) => { if (r.url().includes("/rest/v1/avisos_aula") && r.method() === "POST") aviso = JSON.parse(r.postData() || "null"); });
  await page.getByLabel("Nuevo aviso").fill("Traer calculadora el lunes.");
  await page.getByRole("button", { name: "Publicar aviso" }).click(); await page.waitForTimeout(500);
  ok(aviso?.texto === "Traer calculadora el lunes.", `${tag} publica un aviso`);
  let mat = null; page.on("request", (r) => { if (r.url().includes("/rest/v1/materiales") && r.method() === "POST") mat = JSON.parse(r.postData() || "null"); });
  await page.getByLabel("Título").fill("Video de fracciones");
  await page.getByLabel("Enlace").fill("https://www.youtube.com/watch?v=abc");
  await page.getByRole("button", { name: "Publicar material" }).click(); await page.waitForTimeout(500);
  ok(mat?.url === "https://www.youtube.com/watch?v=abc", `${tag} publica un material con enlace`);
  sw = await page.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w + 1, `${tag} Aula virtual sin desborde`);
  await page.screenshot({ path: `${OUT}/${tag}-6-profesor-aula.png`, fullPage: true });
  await page.goto(BASE + "/app/profesor.html#/enlinea?nueva=1"); await page.waitForTimeout(1200);
  ok(await page.getByText("El estudiante sube fotos o PDF de su trabajo").isVisible(), `${tag} al crear una actividad se puede pedir archivo`);
  await page.screenshot({ path: `${OUT}/${tag}-7-editor.png`, fullPage: true });
  await ctxB.close();
}
// Plan Básico: candado en el menú y vista previa
{
  process.env.PLAN = "prof_basico";
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`basico: ${e.message}`));
  await preparar(page, true);
  await page.goto(BASE + "/app/profesor.html#/aula"); await page.waitForTimeout(1200);
  ok(await page.locator('.p-riel [data-r="aula"] .candado').count() === 1 && await page.getByText("Disponible en los planes Profesional y Premium.").isVisible(), "básico: Aula virtual con candado y explicación");
  delete process.env.PLAN;
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
process.exit(fallos.length || errores.length ? 1 : 0);
