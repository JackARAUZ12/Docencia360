// Video tutorial 16:9 (1280×720) de Docencia360 · Profesor independiente.
// Un navegador automático recorre el sistema con datos de ejemplo SIMULADOS
// (nada sale a internet) y muestra un subtítulo por paso y un cursor visible.
// Uso: node tests/video/tutorial.mjs   (requiere el servidor estático en :8080)
// Resultado: tests/video/salida/docencia360-tutorial-profesor.mp4
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { preparar, G1, E } from "../ui/simulacion.mjs";
import { crearXlsx } from "../../assets/js/core/hoja.js";

const BASE = process.env.BASE || "http://localhost:8080";
const SALIDA = process.env.SALIDA || "tests/video/salida";
const CRUDO = path.join(SALIDA, "crudo");
fs.rmSync(CRUDO, { recursive: true, force: true });
fs.mkdirSync(CRUDO, { recursive: true });
const W = 1280, H = 720;
const avisos = [];
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
// Archivos de ejemplo: plantilla de Excel llena y una foto de cuaderno
const PLANTILLA = path.join(SALIDA, "plantilla-llena.xlsx");
fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(PLANTILLA, Buffer.from(await crearXlsx([{ nombre: "Estudiantes", filas: [
  ["Nombres", "Apellidos", "Fecha de nacimiento", "Sexo", "Teléfono", "Correo", "Responsable", "Teléfono del responsable", "Parentesco", "Observaciones"],
  ["Ana Sofía", "López Rivas", "15/03/2012", "F", "88887777", "", "María Rivas", "55554444", "Madre", ""],
  ["Carlos", "Pérez Ruiz", "02/07/2011", "M", "", "", "Juan Pérez", "55551111", "Padre", ""],
  ["María José", "Gutiérrez", "21/01/2012", "F", "", "", "", "", "", ""]] }]).arrayBuffer()));
const FOTO = path.join(SALIDA, "cuaderno.png");
fs.writeFileSync(FOTO, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

// ---------- Capa visual: subtítulos, tarjetas de título y cursor ----------
const CAPA = () => {
  if (window.__tut) return;
  const css = document.createElement("style");
  css.textContent = `
    #tut-cursor{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(242,201,76,.55);
      border:2px solid #1E3A32;z-index:2147483647;pointer-events:none;transition:transform .12s, background .12s;box-shadow:0 0 0 4px rgba(242,201,76,.25)}
    #tut-cursor.clic{transform:scale(1.7);background:rgba(242,201,76,.9)}
    #tut-sub{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);width:min(1060px,92vw);z-index:2147483646;pointer-events:none;
      background:rgba(23,33,43,.92);color:#F4F6F2;border-radius:14px;padding:14px 22px 16px;font:500 19px/1.4 Inter,system-ui,sans-serif;
      box-shadow:0 10px 30px rgba(0,0,0,.25);border-left:6px solid #F2C94C;opacity:0;transition:opacity .35s}
    #tut-sub.ver{opacity:1}
    #tut-sub b{display:block;font:800 13px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#F2C94C;margin-bottom:6px}
    #tut-tarjeta{position:fixed;inset:0;z-index:2147483645;display:flex;flex-direction:column;justify-content:center;padding:0 110px;
      background:#1E3A32;color:#F4F6F2;font-family:Inter,system-ui,sans-serif;opacity:0;transition:opacity .45s;pointer-events:none}
    #tut-tarjeta.ver{opacity:1}
    #tut-tarjeta small{font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#F2C94C;font-size:18px}
    #tut-tarjeta h1{font-size:64px;line-height:1.02;margin:.35em 0 .3em;color:#F4F6F2;font-weight:800;letter-spacing:-.02em;max-width:17ch}
    #tut-tarjeta p{font-size:24px;max-width:46ch;opacity:.85;margin:0}
    #tut-tarjeta .tut-marca{position:absolute;left:110px;top:60px;font-weight:800;font-size:26px;color:#F4F6F2}#tut-tarjeta .tut-marca span{color:#F2C94C}`;
  document.documentElement.append(css);
  const cur = Object.assign(document.createElement("div"), { id: "tut-cursor" });
  const sub = Object.assign(document.createElement("div"), { id: "tut-sub" });
  const tar = Object.assign(document.createElement("div"), { id: "tut-tarjeta" });
  document.documentElement.append(tar, sub, cur);
  addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; }, true);
  addEventListener("mousedown", () => cur.classList.add("clic"), true);
  addEventListener("mouseup", () => setTimeout(() => cur.classList.remove("clic"), 120), true);
  window.__tut = {
    sub(et, txt) { sub.innerHTML = ""; if (!txt) return sub.classList.remove("ver"); const b = document.createElement("b"); b.textContent = et; sub.append(b, txt); sub.classList.add("ver"); },
    tarjeta(et, tit, txt) {
      if (!tit) return tar.classList.remove("ver");
      tar.innerHTML = '<div class="tut-marca">Docencia<span>360</span></div>';
      const s = document.createElement("small"); s.textContent = et; const h = document.createElement("h1"); h.textContent = tit; const p = document.createElement("p"); p.textContent = txt || "";
      tar.append(s, h, p); tar.classList.add("ver");
    },
  };
};

let pg, paso = 0;
const TOTAL = Number(process.env.TOTAL_PASOS || 26);
async function capa() { await pg.evaluate(CAPA).catch(() => {}); }
async function sub(titulo, texto, ms = 4200) {
  paso += 1; await capa();
  await pg.evaluate(([e, t]) => window.__tut.sub(e, t), [`Paso ${paso} de ${TOTAL} · ${titulo}`, texto]).catch(() => {});
  await pausa(ms);
}
async function nota(texto, ms = 3600) {   // subtítulo extra dentro del mismo paso
  await capa();
  await pg.evaluate(([e, t]) => window.__tut.sub(e, t), [`Paso ${paso} de ${TOTAL}`, texto]).catch(() => {});
  await pausa(ms);
}
async function tarjeta(et, tit, txt, ms = 3800) {
  await capa();
  await pg.evaluate(([a, b, c]) => { window.__tut.sub("", ""); window.__tut.tarjeta(a, b, c); }, [et, tit, txt]);
  await pausa(ms);
  await pg.evaluate(() => window.__tut.tarjeta()).catch(() => {});
  await pausa(500);
}
let mx = W / 2, my = H / 2;
async function mover(x, y) { await pg.mouse.move(x, y, { steps: 22 }); mx = x; my = y; await pausa(120); }
async function clic(loc, { espera = 900 } = {}) {
  try {
    const l = typeof loc === "string" ? pg.locator(loc).first() : loc.first();
    await l.scrollIntoViewIfNeeded({ timeout: 4000 });
    const b = await l.boundingBox();
    if (b) await mover(b.x + b.width / 2, b.y + b.height / 2);
    await pausa(250);
    await l.click({ timeout: 4000 });
    await pausa(espera);
    return true;
  } catch (e) { avisos.push(`clic: ${String(loc)} · ${e.message.split("\n")[0]}`); return false; }
}
async function escribir(loc, texto) {
  const l = typeof loc === "string" ? pg.locator(loc).first() : loc.first();
  if (!(await clic(l, { espera: 200 }))) return;
  await l.fill("");
  await pg.keyboard.type(texto, { delay: 55 });
  await pausa(350);
}
async function ir(url) {
  await pg.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await pausa(1300); await capa(); await pg.mouse.move(mx, my);
}
async function hash(h) {   // al cambiar de pantalla se borra el subtítulo anterior
  await pg.evaluate((x) => { window.__tut?.sub("", ""); location.hash = x; }, h); await pausa(1400); await capa();
}
async function bajar(px, ms = 1400) { await pg.mouse.wheel(0, px); await pausa(ms); }

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: CRUDO, size: { width: W, height: H } } });
const videos = [];
async function nuevaPagina(conSesion) {
  if (pg) { const v = pg.video(); await pg.close(); videos.push(await v.path()); }
  pg = await ctx.newPage();
  pg.on("pageerror", (e) => avisos.push("error en página: " + e.message));
  if (!conSesion) await pg.addInitScript(() => { try { if (!sessionStorage.getItem("tut-limpio")) { localStorage.clear(); sessionStorage.setItem("tut-limpio", "1"); } } catch (_) {} });
  await pg.addInitScript(() => { window.open = () => ({ location: "", close() {} }); });
  await preparar(pg, conSesion, "profesor", "propietario");
  // El código que genera el administrador en el video es el mismo que luego usa el cliente
  await pg.route(/rpc\/d360_admin_crear_codigo/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "k3", codigo: "D360-PRUE-BA01" }) }));
}

// ======================= GUION =======================
// 1) Presentación y portada (sin sesión)
await nuevaPagina(false);
await ir("/index.html");
await tarjeta("Video tutorial", "Docencia360 para el profesor independiente", "Desde que recibes tu código de acceso hasta tu primer informe. Duración: unos minutos.", 5200);
await sub("La página principal", "Esta es la página pública de Docencia360. Aquí tus clientes conocen los planes y pueden ver una demostración sin registrarse.", 5200);
await bajar(700, 1800); await bajar(700, 1800); await pg.mouse.wheel(0, -2000); await pausa(800);

// 2) El administrador genera el código
await tarjeta("Parte 1", "El administrador entrega el acceso", "Tú recibes el pago y generas un código de acceso para tu cliente.");
await ir("/admin/entrar.html");
await sub("Entrada del administrador", "Tú entras por «Administrador», al pie de la portada, con tu correo y tu contraseña.", 3000);
await escribir("#email", "administrador@ejemplo.com");
await escribir("#clave", "••••••••••");
await pausa(800);
await nuevaPagina(true);
await ir("/admin/index.html#/codigos");
await sub("Códigos de registro", "En el panel de administrador, la sección «Códigos de registro» muestra cada código, su plan, si ya está pagado y qué cuenta se creó con él.", 5200);
await clic(pg.getByRole("button", { name: "Generar código" }), { espera: 1200 });
await nota("Eliges el plan que pagó el cliente y los meses pagados. Con 1 mes o más, su cuenta nace activa y el pago queda registrado solo.", 4200);
await pg.locator("dialog [name=plan]").selectOption("prof_basico").catch(() => {});
await clic("dialog [name=plan]", { espera: 600 });
await escribir("dialog [name=nota]", "Prof. Marta Ruiz · pagó por transferencia");
await clic(pg.locator("dialog").getByRole("button", { name: "Generar código" }), { espera: 1500 });
await nota("Listo: copias el código o lo envías directo por WhatsApp. El enlace ya lleva el código escrito.", 4800);
await clic(pg.locator("dialog").last().getByRole("button", { name: "Cerrar" }), { espera: 800 });

// 3) El cliente crea su cuenta con el código (sin sesión)
await tarjeta("Parte 2", "Tu cliente crea su cuenta", "Con el código entra de inmediato: sin correos de confirmación y con su plan ya activo.");
await nuevaPagina(false);
await ir("/registro.html");
await sub("Código de acceso", "Tu cliente abre el enlace o la página de registro y escribe el código que le enviaste.", 3200);
await escribir("input.codigo-acceso", "D360-PRUE-BA01");
await clic(pg.getByRole("button", { name: "Continuar" }), { espera: 1600 });
await sub("Sus datos", "Como el código ya trae el tipo de cuenta y el plan pagado, pasa directo a sus datos. A la derecha ve su plan: «Ya pagado».", 4200);
await escribir("input[name=tu_nombre]", "Marta Ruiz");
await escribir("input[name=nombre]", "Clases de Matemática Prof. Marta");
await escribir("input[name=email]", "marta@ejemplo.com");
await escribir("input[name=clave]", "una-clave-segura");
await clic("input[name=acepto]", { espera: 500 });
await clic(pg.getByRole("button", { name: "Crear mi cuenta" }), { espera: 1800 });
await sub("Cuenta creada y activa", "Su cuenta queda activa al instante. Recibe el código de su espacio y un código personal para entrar rápido desde cualquier teléfono.", 5200);

// 4) Primera vez: bienvenida guiada (cuenta nueva, sin grupos)
await tarjeta("Parte 3", "La primera vez: Primeros pasos", "Una bienvenida guiada deja lista tu primera clase en un par de minutos, paso a paso.");
await nuevaPagina(true);
await pg.route(/supabase\.co\/rest\/v1\/(asignaturas|grupos|estudiantes|horarios|asistencias|evaluaciones|estudiantes_acceso|actividades|grupo_estudiantes)/, async (route) => {
  if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  const fila = { id: "00000000-0000-0000-0000-0000000000a9", nombre: "Matemática · 9no grado" };
  const single = (route.request().headers()["accept"] || "").includes("vnd.pgrst.object");
  return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(single ? fila : [fila]) });
});
await ir("/app/profesor.html#/inicio");
await sub("Bienvenida", "Al entrar por primera vez, el sistema te recibe y te guía. Primero: ¿qué enseñas y a qué nivel?", 4200);
await escribir("dialog.bienvenida input[name=asig]", "Matemática");
await escribir("dialog.bienvenida input[name=nivel]", "9no grado");
await clic(pg.getByRole("button", { name: "Continuar" }), { espera: 1100 });
await sub("Tu primer grupo", "El nombre del grupo se sugiere solo. Marcas los días y la hora de clase, así Inicio te avisará cuándo pasar lista.", 4200);
await clic(pg.getByRole("checkbox", { name: "Lunes" }), { espera: 300 });
await clic(pg.getByRole("checkbox", { name: "Miércoles" }), { espera: 500 });
await clic(pg.getByRole("button", { name: "Crear mi grupo" }), { espera: 1400 });
await sub("Tus estudiantes", "Eliges cómo agregarlos: escribiendo o pegando la lista, o con una plantilla de Excel. Si quieres, lo dejas para después.", 4600);
await clic(pg.getByRole("button", { name: /Con una plantilla de Excel/ }), { espera: 1200 });
await nota("Tres pasos: descargas la plantilla de Excel, la llenas (un estudiante por fila) y la subes.", 3800);
await clic(pg.getByRole("button", { name: "Descargar plantilla" }), { espera: 900 });
await pg.locator("dialog.bienvenida input[type=file]").setInputFiles(PLANTILLA).catch((e) => avisos.push("plantilla: " + e.message));
await pausa(1500);
await nota("Al subirla, el sistema la revisa y te dice cuántos estudiantes están listos. Un toque y quedan en tu grupo.", 4200);
await clic(pg.getByRole("button", { name: "Agregar al grupo" }), { espera: 1500 });
await sub("¡Listo!", "Tu clase quedó creada. Desde aquí puedes pasar tu primera lista.", 3600);
await clic(pg.getByRole("button", { name: "Ir a Inicio" }), { espera: 1500 });
await sub("El botón «Primeros pasos»", "Abajo a la derecha te acompaña un botón con tu avance. Los pasos se marcan solos y cambian según tu plan.", 4200);
await clic(".guia-flotante", { espera: 1500 });
await pausa(2500);
await pg.keyboard.press("Escape"); await pausa(600);

// 5) El día a día (cuenta con datos de ejemplo)
await tarjeta("Parte 4", "Tu día a día", "Usamos una cuenta con datos de ejemplo: grupos, estudiantes, asistencia y notas.");
await nuevaPagina(true);
{
  const d = new Date(); const dd = (n) => String(n).padStart(2, "0");
  const ini = `${dd(Math.max(d.getHours() - 1, 0))}:00:00`, fin = `${dd(Math.min(d.getHours() + 1, 23))}:59:00`;
  await pg.route(/rest\/v1\/horarios\?.*dia=eq/, (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ hora_inicio: ini, hora_fin: fin, grupo_id: G1, grupos: { nombre: "Matemática 9no", estado: "activo" } }]) }));
  await pg.route(/rest\/v1\/asistencias\?.*fecha=eq/, (r) => r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : r.fallback());
}
await ir("/app/profesor.html#/inicio");
await sub("Inicio y «Clase de ahora»", "Si tienes clase en este momento, Inicio te la muestra arriba con un botón para pasar lista en un toque.", 4600);
await nota("El menú está en tres bloques: «Día a día», «Mis clases» y «Más». Lo que tu plan no incluye aparece con candado.", 4400);
await clic(pg.locator(".clase-ahora a.btn").first(), { espera: 1500 });
await sub("Pasar lista rápido", "Tocas «Todos presentes» y luego solo cambias a quien faltó (A), llegó tarde (T) o tiene excusa (J).", 4200);
await clic(pg.getByRole("button", { name: "✓ Todos presentes" }), { espera: 900 });
await clic(pg.locator(".pase li").nth(1).locator('[data-e="ausente"]'), { espera: 600 });
await escribir(pg.locator(".pase li").nth(1).locator("input"), "Avisó que estaba enfermo");
await nota("El lápiz junto al nombre anota una observación de un toque: «No entregó la tarea», «Excelente participación»…", 4000);
await clic(pg.locator(".btn-anotar").first(), { espera: 900 });
await clic(pg.locator(".chip", { hasText: "Excelente participación" }), { espera: 700 });
await clic(pg.locator("dialog").getByRole("button", { name: "Guardar", exact: true }), { espera: 900 });
await clic(".pie-fijo .btn", { espera: 1500 });

await hash("#/calificaciones");
await sub("Notas y tareas", "Creas evaluaciones con su peso y escribes las notas: el promedio se calcula solo. «Tareas y entregas» muestra quién entregó.", 4600);
await clic(pg.getByRole("button", { name: "Por evaluación" }), { espera: 1200 });
const inp = pg.locator(".calificar input");
if (await inp.count()) { await escribir(inp.nth(0), "88"); await pg.keyboard.press("Enter"); await pausa(300); await pg.keyboard.type("74", { delay: 70 }); await pausa(500); }
await clic(".pie-fijo .btn", { espera: 1500 });

await hash("#/estudiantes");
await sub("Pegar una lista", "Para agregar varios estudiantes de una vez, pegas los nombres desde WhatsApp o Word y ves cómo quedarán antes de guardar.", 4400);
await clic(pg.getByRole("button", { name: "Pegar una lista" }), { espera: 1000 });
await escribir("dialog textarea", "Valeria Torres Mena\nJosé Martínez\nSánchez Ruiz, Karla");
await pausa(1500);
await pg.keyboard.press("Escape"); await pausa(600);

await hash(`#/estudiantes/${E(1)}`);
await sub("Reporte a la familia por WhatsApp", "Desde la ficha del estudiante armas un mensaje con su asistencia, su promedio y tu última observación. Lo revisas y se abre WhatsApp.", 4800);
await clic(pg.getByRole("button", { name: "Enviar reporte por WhatsApp" }), { espera: 1600 });
await pausa(2200);
await pg.keyboard.press("Escape"); await pausa(600);

// 6) Exámenes en línea y aula virtual (profesor)
await tarjeta("Parte 5", "Exámenes en línea y aula virtual", "Planes Profesional y Premium: tus estudiantes responden y entregan desde su propia aula.");
await hash("#/enlinea");
await sub("Exámenes y tareas en línea", "Creas exámenes con preguntas que se califican solas, o tareas donde el estudiante sube fotos o PDF de su trabajo.", 4600);
await clic(pg.getByRole("button", { name: /Nueva actividad/ }), { espera: 1200 });
await bajar(500, 1500);
await nota("Marcas «El estudiante sube fotos o PDF» y le das puntos al archivo. Lo calificas tú al revisarlo.", 4200);
await pg.keyboard.press("Escape"); await pausa(600);
await hash("#/enlinea/accesos");
await sub("Códigos de los estudiantes", "Activas el acceso de tus estudiantes: cada uno recibe un código personal y una tarjeta para imprimir con las instrucciones.", 4600);
await hash("#/aula");
await sub("Aula virtual", "Publicas avisos y materiales por grupo: guías en PDF, fotos o enlaces de YouTube y Drive.", 4200);
await escribir(pg.getByLabel("Nuevo aviso"), "Mañana repasamos fracciones. Traigan calculadora.");
await clic(pg.getByRole("button", { name: "Publicar aviso" }), { espera: 1300 });

// 7) El aula del estudiante
await tarjeta("Parte 6", "El aula del estudiante", "Cada estudiante entra con el código de su profesor y su código personal. No necesita correo.");
await nuevaPagina(false);
await ir("/aula.html");
await sub("Entrar al aula", "El estudiante abre «Soy estudiante», escribe los dos códigos y su teléfono lo recuerda para la próxima vez.", 4200);
await escribir(pg.getByLabel("Código de tu profesor"), "K7M2QP");
await escribir(pg.getByLabel("Tu código personal de 6 números"), "123456");
await clic(pg.getByRole("button", { name: "Entrar a mi aula" }), { espera: 1600 });
await sub("Su inicio", "Ve lo que tiene por hacer, su promedio, su asistencia, tus avisos y los materiales nuevos.", 4600);
await bajar(500, 2000); await pg.mouse.wheel(0, -1000); await pausa(600);
await clic(pg.locator(".item-a", { hasText: "Ejercicios en el cuaderno" }).getByRole("button", { name: "Hacer tarea" }), { espera: 1500 });
await sub("Entregar una tarea con foto", "Abre la tarea sin volver a escribir el código, toma una foto de su cuaderno y la entrega. Las fotos se achican solas.", 4400);
await clic(pg.getByRole("button", { name: "Empezar tarea" }), { espera: 1400 });
await pg.locator(".zona-archivos input[type=file]").setInputFiles(FOTO).catch((e) => avisos.push("foto: " + e.message));
await pausa(1800);
await ir("/aula.html#/notas");
await sub("Sus notas y asistencia", "En «Mis notas» ve cada calificación, su promedio por grupo y su asistencia. Cuando revisas una entrega, ve tu nota y tu comentario.", 4800);
await ir("/aula.html#/materiales");
await sub("Materiales y avisos", "Aquí descarga tus guías y abre tus enlaces, siempre con enlaces privados que vencen en minutos.", 4200);

// 8) Informes y cuenta
await tarjeta("Parte 7", "Informes y tu cuenta", "Todo queda listo para imprimir, compartir o mejorar de plan cuando lo necesites.");
await nuevaPagina(true);
await ir("/app/profesor.html#/informes");
await sub("Informes", "Informe por grupo o por estudiante: promedio, asistencia y quién está en riesgo, con botón de WhatsApp por estudiante.", 4800);
await bajar(400, 1800); await pg.mouse.wheel(0, -800); await pausa(500);
await hash("#/cuenta");
await sub("Mi cuenta", "Tu plan, cuánto usas y hasta cuándo está pagado. Comparas los planes, ves tus códigos y puedes volver a ver la guía de Primeros pasos.", 5000);
await bajar(450, 2400); await pg.mouse.wheel(0, -1200); await pausa(600);

await tarjeta("Listo", "Así de simple es Docencia360", "Código de acceso → cuenta activa → primera clase guiada → lista y notas → aula virtual para tus estudiantes. ¿Dudas? Escríbenos por WhatsApp.", 6500);

// ======================= CIERRE: unir los tramos en un MP4 =======================
{ const v = pg.video(); await pg.close(); videos.push(await v.path()); }
await ctx.close(); await navegador.close();
const lista = path.join(CRUDO, "lista.txt");
fs.writeFileSync(lista, videos.map((v) => `file '${path.resolve(v)}'`).join("\n"));
const mp4 = path.join(SALIDA, "docencia360-tutorial-profesor.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lista,
  "-vf", "fps=30,scale=1280:720:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-movflags", "+faststart", mp4]);
console.log("Video:", mp4);
console.log(avisos.length ? "Avisos:\n" + avisos.join("\n") : "Sin avisos.");
