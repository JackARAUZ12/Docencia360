// Video para CLIENTES · Docente independiente (16:9, 1920×1080, con música y efectos).
// Muestra el sistema real en una computadora y un teléfono a la vez: desde crear la
// cuenta hasta el día a día. Usa datos de ejemplo SIMULADOS (nada sale a internet).
// Uso: (servidor estático en :8080)  node tests/video/cliente-docente.mjs
// Resultado: tests/video/salida/docencia360-docentes.mp4
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { preparar, G1, E, sesion } from "../ui/simulacion.mjs";
import { generarAudio } from "./audio.mjs";

const BASE = process.env.BASE || "http://localhost:8080";
const SALIDA = process.env.SALIDA || "tests/video/salida";
const CRUDO = path.join(SALIDA, "crudo-cliente");
fs.rmSync(CRUDO, { recursive: true, force: true }); fs.mkdirSync(CRUDO, { recursive: true });
const W = 1920, H = 1080;
const avisos = [], eventos = [];
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
process.env.PLAN = "prof_premium"; process.env.ESTADO = "activa";

// Cursor visible dentro de cada pantalla (computadora y teléfono)
const CURSOR = () => {
  if (document.getElementById("tut-cursor")) return;
  const css = document.createElement("style");
  css.textContent = `#tut-cursor{position:fixed;left:-50px;top:-50px;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(242,201,76,.55);
    border:2px solid #1E3A32;z-index:2147483647;pointer-events:none;transition:transform .12s;box-shadow:0 0 0 6px rgba(242,201,76,.25)}#tut-cursor.clic{transform:scale(1.6);background:rgba(242,201,76,.95)}`;
  document.documentElement.append(css);
  const c = Object.assign(document.createElement("div"), { id: "tut-cursor" }); document.documentElement.append(c);
  addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
  addEventListener("mousedown", () => c.classList.add("clic"), true);
  addEventListener("mouseup", () => setTimeout(() => c.classList.remove("clic"), 140), true);
  addEventListener("mouseleave", () => { c.style.left = "-50px"; }, true);
};

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: CRUDO, size: { width: W, height: H } } });
const pg = await contexto.newPage();
const T0 = Date.now();
const marcar = (tipo, desfase = 0) => eventos.push({ tipo, t: (Date.now() - T0) / 1000 + desfase });
pg.on("pageerror", (e) => avisos.push("error en página: " + e.message));
await pg.addInitScript(() => { window.open = () => ({ location: "", close() {} }); });
await preparar(pg, false, "profesor", "propietario");
// Respuestas para el recorrido del cliente
await pg.route(/rpc\/d360_validar_codigo_registro/, (r) => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ ok: true, requiere: true, codigo: "D360-PRUE-BA01", modalidad: "profesor", plan: "prof_premium", meses_pagados: 1 }) }));
await pg.route(/rpc\/d360_importar_estudiantes/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ creados: 4, inscritos: 4, omitidos: [] }) }));
await pg.route(/functions\/v1\/acceso-codigo/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token_hash: "x", cuenta_id: "22222222-2222-2222-2222-222222222222" }) }));
await pg.route(/auth\/v1\/verify/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sesion) }));

// ---------- Escenario ----------
const esc = (fn, ...a) => pg.evaluate(([f, args]) => window.esc[f](...args), [fn, a]).catch(() => {});
let paso = 0;
async function modo(m) { marcar("whoosh"); await esc("modo", m); await pausa(1000); }
async function tarjeta(et, tit, txt, pasos = [], ms = 5000) {
  await esc("sub", "", ""); await esc("lado", "", "", "");
  marcar("whoosh"); await esc("modo", "tarjeta"); await pausa(500);
  marcar("campana"); await esc("tarjeta", et, tit, txt, pasos); await pausa(ms);
  await esc("tarjeta", ""); await pausa(500);
}
async function sub(texto, ms = 4200, titulo) { paso += 1; await esc("sub", titulo || `Paso ${paso}`, texto); await pausa(ms); }
async function lado(et, tit, txt, ms = 600) { await esc("lado", et, tit, txt); await pausa(ms); }
const marco = async (c) => (await pg.$("#" + c)).contentFrame();
async function cursor(c) { const f = await marco(c); await f.evaluate(CURSOR).catch(() => {}); return f; }
let recargas = 0;
const TEL = BASE.replace("localhost", "127.0.0.1");   // el teléfono es otro dispositivo: su propia sesión
async function cargar(c, url, ms = 1800) {
  if (c === "tel" && url.startsWith("/")) url = TEL + url;
  // Siempre una carga completa (aunque sea la misma página) para no arrastrar datos de la escena anterior
  const [ruta, frag] = url.split("#"); recargas += 1;
  await esc("cargar", c, `${ruta}${ruta.includes("?") ? "&" : "?"}v=${recargas}${frag ? "#" + frag : ""}`); await pausa(ms);
  const f = await marco(c); await f.waitForLoadState("domcontentloaded").catch(() => {}); await pausa(300);
  return cursor(c);
}
async function hash(c, h, ms = 1600) { const f = await marco(c); await f.evaluate((x) => { location.hash = x; }, h); await pausa(ms); return cursor(c); }
async function clic(l, { espera = 900, sonido = "clic" } = {}) {
  try {
    await l.first().scrollIntoViewIfNeeded({ timeout: 5000 });
    await pausa(250);
    const b = await l.first().boundingBox();
    if (b) await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 24 });
    await pausa(220);
    marcar(sonido);
    await l.first().click({ timeout: 5000 });
    await pausa(espera);
    return true;
  } catch (e) { avisos.push(`clic (paso ${paso}) ${l}: ${e.message.split("\n")[0]}`); return false; }
}
async function escribir(l, texto, { retraso = 60 } = {}) {
  if (!(await clic(l, { espera: 200 }))) return;
  await l.first().fill("");
  for (const ch of texto) { marcar("tecla"); await pg.keyboard.type(ch); await pausa(retraso); }
  await pausa(350);
}
async function exito(ms = 400) { marcar("exito"); await pausa(ms); }

// ======================= GUION =======================
await pg.goto(BASE + "/tests/video/escenario.html"); await pausa(800);
await tarjeta("Docencia360 · Para docentes", "Tu clase, ordenada desde el primer día", "Te mostramos cómo crear tu cuenta, dejar lista tu clase y usarla en tu computadora y en tu teléfono.",
  ["Crea tu cuenta", "Arma tu clase", "Pasa lista", "Califica", "Cobra", "Informa"], 6000);

// 1) Crear la cuenta (computadora)
await tarjeta("Parte 1", "Crea tu cuenta en 1 minuto", "Al contratar tu plan recibes un código de acceso por WhatsApp. Con él, tu cuenta queda activa al instante.", [], 4500);
let pc = await cargar("pc", "/index.html", 2000);
await modo("pc");
await sub("Entra a docencia360 y toca «Crear mi cuenta».", 2600);
await clic(pc.locator("a.b-borde", { hasText: "Crear mi cuenta" }), { espera: 1800 });
pc = await cursor("pc");
await sub("Escribe el código de acceso que recibiste.", 1200);
await escribir(pc.locator("input.codigo-acceso"), "D360-PRUE-BA01");
await clic(pc.getByRole("button", { name: "Continuar" }), { espera: 1800 });
await sub("Completa tus datos: tu nombre, el nombre de tu espacio de clases, tu correo y una contraseña.", 1200);
await escribir(pc.locator("input[name=tu_nombre]"), "Marta Ruiz");
await escribir(pc.locator("input[name=nombre]"), "Clases de Matemática Prof. Marta", { retraso: 35 });
await escribir(pc.locator("input[name=email]"), "marta@ejemplo.com", { retraso: 40 });
await escribir(pc.locator("input[name=clave]"), "MiClave2026", { retraso: 45 });
await clic(pc.locator("input[name=acepto]"), { espera: 500 });
await clic(pc.getByRole("button", { name: "Crear mi cuenta" }), { espera: 2000 });
await exito();
await sub("¡Listo! Tu cuenta ya está activa. Guarda tu código personal: con él entras rápido desde tu teléfono.", 5200);

// 2) Bienvenida guiada (cuenta nueva, sin datos)
const VACIO = /supabase\.co\/rest\/v1\/(asignaturas|grupos|estudiantes|horarios|asistencias|evaluaciones|estudiantes_acceso|actividades|grupo_estudiantes|cargos|pagos|movimientos|rubricas|banco_preguntas)(\?|$)/;
const vacio = async (route) => {
  if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  const fila = { id: "00000000-0000-0000-0000-0000000000a9", nombre: "Matemática · 9no grado" };
  const single = (route.request().headers()["accept"] || "").includes("vnd.pgrst.object");
  return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(single ? fila : [fila]) });
};
await pg.route(VACIO, vacio);
await tarjeta("Parte 2", "Tu primera clase, guiada paso a paso", "La primera vez que entras, Docencia360 te acompaña para dejar todo listo.", [], 4200);
await modo("pc");
await clic(pc.getByRole("link", { name: "Ir a mi panel" }), { espera: 2600 });
pc = await cursor("pc");
await sub("Primero: ¿qué enseñas y a qué nivel?", 1200);
await escribir(pc.locator("dialog.bienvenida input[name=asig]"), "Matemática");
await escribir(pc.locator("dialog.bienvenida input[name=nivel]"), "9no grado");
await clic(pc.getByRole("button", { name: "Continuar" }), { espera: 1200 });
await sub("Tu grupo: marca los días y la hora de clase. Así el sistema te avisa cuándo pasar lista.", 1400);
await clic(pc.locator(".bv-dia", { hasText: "Lun" }), { espera: 300 });
await clic(pc.locator(".bv-dia", { hasText: "Mié" }), { espera: 300 });
await clic(pc.locator(".bv-dia", { hasText: "Vie" }), { espera: 600 });
await clic(pc.getByRole("button", { name: "Crear mi grupo" }), { espera: 1500 });
await sub("Agrega a tus estudiantes: pega la lista desde WhatsApp, Word o Excel. Un nombre por línea.", 1400);
await clic(pc.getByRole("button", { name: /Escribir o pegar la lista/ }), { espera: 1000 });
await escribir(pc.locator("dialog.bienvenida textarea"), "Ana Sofía López\nCarlos Pérez Ruiz\nMaría José Gutiérrez\nLuis Fernando Ruiz", { retraso: 28 });
await clic(pc.getByRole("button", { name: "Agregar al grupo" }), { espera: 1600 });
await exito();
await sub("¡Tu clase quedó creada! El botón «Primeros pasos» te acompaña con lo que falta.", 3800);
await clic(pc.getByRole("button", { name: "Ir a Inicio" }), { espera: 1400 });
await pg.unroute(VACIO, vacio);

// 3) Computadora y teléfono
// Clase de ahora y lista sin tomar para el ejemplo
{ const d = new Date(); const dd = (n) => String(n).padStart(2, "0");
  const ini = `${dd(Math.max(d.getHours() - 1, 0))}:00:00`, fin = `${dd(Math.min(d.getHours() + 1, 23))}:59:00`;
  await pg.route(/rest\/v1\/horarios\?.*dia=eq/, (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ hora_inicio: ini, hora_fin: fin, grupo_id: G1, grupos: { nombre: "Matemática 9no", estado: "activo" } }]) }));
  await pg.route(/rest\/v1\/asistencias\?.*fecha=eq/, (r) => r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : r.fallback()); }
await tarjeta("Parte 3", "En tu computadora y en tu teléfono", "Todo se guarda en línea: empiezas en la computadora y sigues en el teléfono, en el aula.", [], 4200);
pc = await cargar("pc", "/app/profesor.html#/inicio", 2200);
let tel = await cargar("tel", "/entrar.html", 1800);
await modo("ambos");
await sub("En tu teléfono entras con el código de tu espacio y tu código personal. Sin correos ni contraseñas largas.", 1500);
await escribir(tel.locator("#inst"), "K7M2QP");
await escribir(tel.locator("#pin"), "482915");
await clic(tel.locator("#b-codigo"), { espera: 2600 });
tel = await cursor("tel");
await sub("Inicio te muestra tu clase de ahora, lo pendiente y los avisos importantes. Igual en la computadora y en el teléfono.", 4600);

// 4) Pasar lista en el teléfono
await modo("tel");
await lado("Pasar lista", "Asistencia en segundos", "Tocas «Todos presentes» y solo cambias a quien faltó o llegó tarde.", 1200);
await clic(tel.locator(".clase-ahora a.btn").first(), { espera: 1600 });
tel = await cursor("tel");
await clic(tel.getByRole("button", { name: "✓ Todos presentes" }), { espera: 1100 });
await clic(tel.locator(".pase li").nth(1).locator('[data-e="ausente"]'), { espera: 700 });
await lado("Pasar lista", "Asistencia en segundos", "Marcas A si faltó, T si llegó tarde o J si tiene excusa, y guardas. Listo.", 2200);
await clic(tel.locator(".pie-fijo .btn"), { espera: 1400 });
await exito(1200);

// 5) Notas (computadora)
await esc("lado", "", "", "");
await modo("pc");
pc = await hash("pc", "#/calificaciones", 1800);
await sub("Notas: creas tus evaluaciones con su peso y escribes las notas. El promedio se calcula solo.", 1500);
await clic(pc.getByRole("button", { name: "Por evaluación" }), { espera: 1300 });
{ const inp = pc.locator(".calificar input");
  if (await inp.count()) { await escribir(inp.nth(0), "88"); await pg.keyboard.press("Enter"); marcar("tecla"); await pausa(300);
    for (const ch of "74") { marcar("tecla"); await pg.keyboard.type(ch); await pausa(90); } await pausa(500); } }
await clic(pc.locator(".pie-fijo .btn"), { espera: 1500 });
await exito(1500);

// 6) Exámenes en línea y aula del estudiante
await tarjeta("Parte 4", "Exámenes y tareas en línea", "Tus estudiantes responden desde su teléfono y la nota se calcula sola.", [], 4000);
await modo("pc");
pc = await hash("pc", "#/enlinea", 1800);
await sub("Creas exámenes con preguntas de opción múltiple, verdadero o falso y respuesta corta. Los compartes con un enlace o un código QR.", 4800);
await clic(pc.locator('main a[href^="#/enlinea/"]').filter({ hasText: /cinemática|Examen|Tarea/i }).first(), { espera: 2200 });
pc = await cursor("pc");
await sub("Ves quién entregó y las notas de cada estudiante. Solo revisas las respuestas abiertas.", 4200);
tel = await cargar("tel", "/aula.html", 1800);
await modo("ambos");
await sub("Cada estudiante entra a su aula con el código de su profesor y su código personal.", 1200);
await escribir(tel.getByLabel(/Código de tu profesor/), "K7M2QP");
await escribir(tel.getByLabel("Tu código personal de 6 números"), "123456");
await clic(tel.getByRole("button", { name: "Entrar a mi aula" }), { espera: 2000 });
tel = await cursor("tel");
await exito();
await sub("En su aula ve sus tareas y exámenes pendientes, sus notas, su asistencia, tus avisos y tus materiales.", 4800);
await pg.mouse.move(1560, 600, { steps: 10 }); await pg.mouse.wheel(0, 500); await pausa(1800); await pg.mouse.wheel(0, -500); await pausa(800);

// 7) Cobros con comprobante
await tarjeta("Parte 5", "Cobra sin complicarte", "Mensualidades o clases particulares, con su comprobante para imprimir o enviar.", [], 4000);
await modo("pc");
pc = await hash("pc", "#/cobros", 1800);
await sub("Finanzas te dice cuánto entró, cuánto gastaste y quién te debe.", 4000);
pc = await hash("pc", "#/cobros?vista=deben", 1600);
await sub("Registras un pago con un toque…", 1000);
await clic(pc.locator(".lista-cobros li").first().getByRole("button", { name: "Registrar pago" }), { espera: 1200 });
{ const d = pc.locator("dialog.modal").last();
  if (await d.getByRole("button", { name: "Cobrar" }).count()) await clic(d.getByRole("button", { name: "Cobrar" }), { espera: 900 }); }
await clic(pc.locator("dialog.modal").last().getByRole("button", { name: "Registrar pago" }), { espera: 1800 });
await exito();
await sub("…y sale su comprobante: para impresora de ticket (58 u 80 mm), en hoja carta o por WhatsApp.", 2000);
await clic(pc.locator("dialog.modal").getByRole("button", { name: "58 mm" }), { espera: 1400 });
await clic(pc.locator("dialog.modal").getByRole("button", { name: "Carta / A4" }), { espera: 2200 });
await pc.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); })); await pausa(600);

// 8) Reporte a la familia por WhatsApp (teléfono)
tel = await cargar("tel", `/app/profesor.html#/estudiantes/${E(1)}`, 2200);
await modo("tel");
await lado("Familias", "Informa por WhatsApp", "Desde la ficha del estudiante, un mensaje con su asistencia y su promedio, listo para enviar.", 1200);
await clic(tel.getByRole("button", { name: "Enviar reporte por WhatsApp" }), { espera: 2400 });
await exito(2800);
await tel.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); })).catch(() => {});

// 9) Informes
await esc("lado", "", "", "");
await modo("pc");
pc = await hash("pc", "#/informes", 2000);
await sub("Informes listos para imprimir o guardar en PDF: promedio, asistencia y quién necesita apoyo.", 4600);
await pg.mouse.move(900, 600, { steps: 10 }); await pg.mouse.wheel(0, 400); await pausa(1800); await pg.mouse.wheel(0, -400); await pausa(800);

// Cierre
await tarjeta("Docencia360", "Menos papeles, más tiempo para enseñar", "Pide tu código de acceso por WhatsApp y empieza hoy. Te ayudamos a configurarlo.",
  ["Asistencia", "Notas", "Exámenes en línea", "Aula del estudiante", "Cobros", "Informes"], 7000);
await esc("modo", "tarjeta"); await pausa(1200);

// ======================= MONTAJE =======================
const crudo = await pg.video().path();
await pg.close(); await contexto.close(); await navegador.close();
const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", crudo]).toString().trim()) || (Date.now() - T0) / 1000;
const wav = path.join(CRUDO, "audio.wav");
generarAudio(dur, eventos, wav);
const mp4 = path.join(SALIDA, "docencia360-docentes.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", crudo, "-i", wav,
  "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
  "-af", "loudnorm=I=-16:TP=-2:LRA=11,aresample=48000,alimiter=limit=0.85:level=0", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", mp4]);
console.log("Video:", mp4, `(${Math.round(dur)} s, ${eventos.length} efectos)`);
console.log(avisos.length ? "Avisos:\n" + avisos.join("\n") : "Sin avisos.");
