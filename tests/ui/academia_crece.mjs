// Academias, bloque 3: interesados, inscripción en línea (página pública), recuperaciones y cambio de nivel.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar, registro, G1, E } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const OUT = "tests/ui/capturas/academia"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const browser = await chromium.launch();
const ancho = async (p, w, t) => { const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w + 1, `${t} sin desborde`); };
const cerrarDialogos = (p) => p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
const pagina = async (ctxB, rol, tag, conSesion = true) => {
  const p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} ${rol}: ${e.message}`));
  await p.addInitScript(() => { window.open = (u) => { (window.__abiertos ||= []).push(u); return { location: "", close() {} }; }; });
  await preparar(p, conSesion, "academia", rol);
  return p;
};
for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  let p = await pagina(ctxB, "propietario", tag);
  // ---- Interesados ----
  await p.goto(BASE + "/app/academia.html#/interesados"); await p.waitForTimeout(1300);
  ok(await p.getByText("Valeria Sánchez López").isVisible() && await p.getByText("nuevos sin contactar").isVisible() && await p.getByText("Pidió una clase de prueba").isVisible(), `${tag} interesados: lista por atender con cifras`);
  await ancho(p, w, `${tag} Interesados`);
  await p.screenshot({ path: `${OUT}/${tag}-interesados.png`, fullPage: true });
  let upd = null; p.on("request", (r) => { if (r.url().includes("/rest/v1/interesados") && r.method() === "PATCH") upd = JSON.parse(r.postData() || "null"); });
  await p.locator(".lista-interesados li", { hasText: "Valeria" }).getByRole("button", { name: "WhatsApp" }).click(); await p.waitForTimeout(500);
  const wa = await p.evaluate(() => (window.__abiertos || []).pop() || "");
  ok(wa.includes("wa.me/50584561122") && decodeURIComponent(wa).includes("Álgebra intensiva") && upd?.estado === "contactado", `${tag} WhatsApp con mensaje listo y pasa a «Contactado»`);
  await p.goto(BASE + "/app/academia.html#/interesados"); await p.waitForTimeout(1200);
  upd = null;
  await p.locator(".lista-interesados li", { hasText: "Valeria" }).getByRole("button", { name: "Clase de prueba" }).click(); await p.waitForTimeout(400);
  await p.locator("dialog.modal").getByRole("button", { name: "Agendar" }).click(); await p.waitForTimeout(600);
  ok(upd?.estado === "prueba" && upd.prueba_grupo_id === G1 && upd.prueba_fecha, `${tag} agenda la clase de prueba (grupo y fecha)`);
  await p.goto(BASE + "/app/academia.html#/interesados?vista=prueba"); await p.waitForTimeout(1200);
  upd = null;
  await p.locator(".lista-interesados li", { hasText: "Andrés" }).getByRole("button", { name: "Vino", exact: true }).click(); await p.waitForTimeout(600);
  ok(upd?.prueba_resultado === "asistio", `${tag} anota que vino a la clase de prueba`);
  await p.goto(BASE + "/app/academia.html#/interesados"); await p.waitForTimeout(1200);
  let mat = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_interesado_matricular")) mat = JSON.parse(r.postData() || "{}"); });
  await p.locator(".lista-interesados li", { hasText: "Valeria" }).getByRole("button", { name: "Matricular" }).click(); await p.waitForTimeout(400);
  const d = p.locator("dialog.modal").last();
  ok(await d.locator('[name="nombres"]').inputValue() === "Valeria Sánchez" && await d.locator('[name="apellidos"]').inputValue() === "López" && await d.locator('[name="monto_matricula"]').inputValue() === "300",
    `${tag} matricular propone nombres, apellidos y precios del curso`);
  await p.screenshot({ path: `${OUT}/${tag}-matricular-interesado.png` });
  await d.getByRole("button", { name: "Matricular" }).click(); await p.waitForTimeout(800);
  ok(mat && mat.p_interesado === "in1" && mat.p_grupo === G1 && Number(mat.p_mensualidad) === 800 && Number(mat.p_meses) === 3, `${tag} matricula al interesado en un paso`);
  ok(p.url().includes(`#/estudiantes/${E(1)}`), `${tag} lleva a la ficha del nuevo estudiante`);
  // Enlace de inscripción
  await p.goto(BASE + "/app/academia.html#/interesados"); await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "Enlace de inscripción" }).click(); await p.waitForTimeout(800);
  ok((await p.locator('dialog.modal input[aria-label="Enlace de inscripción"]').inputValue()).includes("inscripcion.html?a=abc1234567") && await p.locator("dialog.modal .qr-chico svg").count() === 1,
    `${tag} enlace de inscripción con QR para compartir`);
  await p.screenshot({ path: `${OUT}/${tag}-enlace-inscripcion.png` });
  await cerrarDialogos(p);
  // ---- Recuperaciones ----
  await p.goto(BASE + "/app/academia.html#/recuperaciones"); await p.waitForTimeout(1300);
  ok(await p.getByText("Faltaron y no han recuperado (1)").isVisible() && await p.getByText("Próximas (1)").isVisible(), `${tag} recuperaciones: ausencias pendientes y próximas`);
  await ancho(p, w, `${tag} Recuperaciones`);
  let rec = null; p.on("request", (r) => { if (r.url().includes("/rest/v1/recuperaciones") && r.method() === "POST") rec = JSON.parse(r.postData() || "null"); });
  await p.getByRole("button", { name: "Agendar recuperación" }).click(); await p.waitForTimeout(400);
  await p.locator("dialog.modal").getByRole("button", { name: "Agendar" }).click(); await p.waitForTimeout(600);
  const r1 = Array.isArray(rec) ? rec[0] : rec;
  ok(r1 && r1.estudiante_id === E(2) && r1.grupo_origen === G1 && r1.grupo_destino && r1.grupo_destino !== G1 && r1.fecha, `${tag} agenda la recuperación en otro grupo`);
  await p.goto(BASE + `/app/academia.html#/asistencia?grupo=${G1}`); await p.waitForTimeout(1400);
  ok(await p.getByText("Vienen a recuperar (1)").isVisible(), `${tag} al pasar lista se ve quién viene a recuperar`);
  let marca = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_recuperacion_marcar")) marca = JSON.parse(r.postData() || "{}"); });
  await p.locator(".recuperan").getByRole("button", { name: "Vino", exact: true }).click(); await p.waitForTimeout(500);
  ok(marca?.p_id === "rc1" && marca.p_estado === "asistio", `${tag} marca que vino a recuperar`);
  await p.screenshot({ path: `${OUT}/${tag}-asistencia-recupera.png`, fullPage: true });
  // ---- Cambio de nivel ----
  await p.goto(BASE + `/app/academia.html#/grupos/${G1}`); await p.waitForTimeout(1300);
  let prom = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_promover")) prom = JSON.parse(r.postData() || "{}"); });
  await p.getByRole("button", { name: "Pasar al siguiente nivel" }).click(); await p.waitForTimeout(800);
  const dn = p.locator("dialog.modal").last();
  ok(await dn.locator('optgroup[label="Siguiente nivel: Álgebra avanzada"]').count() === 1, `${tag} propone los grupos del siguiente nivel del curso`);
  await p.screenshot({ path: `${OUT}/${tag}-pasar-nivel.png` });
  await dn.getByRole("button", { name: "Pasar de nivel" }).click(); await p.waitForTimeout(800);
  ok(prom && prom.p_grupo_origen === G1 && prom.p_grupo_destino && prom.p_estudiantes.length >= 1 && prom.p_certificar === true && prom.p_cobrar_matricula === false, `${tag} pasa de nivel con certificado y sin cobrar matrícula`);
  await p.close();
  // ---- Página pública de inscripción ----
  p = await pagina(ctxB, "propietario", tag, false);
  registro.inscripcion = null;
  let env = null; p.on("request", (r) => { if (r.url().includes("rpc/d360_inscripcion_enviar")) env = JSON.parse(r.postData() || "{}"); });
  await p.goto(BASE + "/inscripcion.html?a=abc1234567"); await p.waitForTimeout(1200);
  ok(await p.getByRole("heading", { name: "Academia Horizonte" }).isVisible() && await p.getByText("C$1,200.00 al mes").isVisible(), `${tag} inscripción pública: academia, cursos y precios`);
  await ancho(p, w, `${tag} Inscripción pública`);
  await p.getByRole("button", { name: "Enviar mi inscripción" }).click(); await p.waitForTimeout(300);
  ok(await p.getByText("Elige el curso que te interesa.").isVisible(), `${tag} pide elegir curso antes de enviar`);
  await p.locator(".curso-insc", { hasText: "Inglés A1" }).click(); await p.waitForTimeout(200);
  ok(await p.locator(".grupo-insc.lleno input").isDisabled(), `${tag} un grupo con cupo lleno no se puede elegir`);
  await p.locator(".grupo-insc", { hasText: "A1 noche" }).click();
  await p.locator('[name="nombre"]').fill("Laura Pérez");
  await p.locator('[name="telefono"]').fill("8888 1234");
  await p.getByLabel(/Quiero una clase de prueba/).check();
  await p.screenshot({ path: `${OUT}/${tag}-inscripcion-publica.png`, fullPage: true });
  await p.getByRole("button", { name: "Enviar mi inscripción" }).click(); await p.waitForTimeout(700);
  ok(env && env.p_token === "abc1234567" && env.p_datos.curso_id === "c1" && env.p_datos.grupo_id === "gx1" && env.p_datos.quiere_prueba === true && env.p_datos.web === "", `${tag} envía la inscripción con curso, horario y clase de prueba`);
  ok(await p.getByRole("heading", { name: "¡Recibimos tu inscripción!" }).isVisible(), `${tag} confirma que se recibió`);
  await p.goto(BASE + "/inscripcion.html?a=MAL!"); await p.waitForTimeout(600);
  ok(await p.getByRole("heading", { name: "Enlace no válido" }).isVisible(), `${tag} un enlace mal escrito avisa que no es válido`);
  await p.close();
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
