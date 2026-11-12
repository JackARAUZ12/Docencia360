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
import { preparar, G1 } from "../ui/simulacion.mjs";

const BASE = process.env.BASE || "http://localhost:8080";
const SALIDA = process.env.SALIDA || "tests/video/salida";
const CRUDO = path.join(SALIDA, "crudo");
fs.rmSync(CRUDO, { recursive: true, force: true });
fs.mkdirSync(CRUDO, { recursive: true });
const W = 1280, H = 720;
const avisos = [];
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

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
const TOTAL = 16;
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
async function hash(h) { await pg.evaluate((x) => { location.hash = x; }, h); await pausa(1400); await capa(); }
async function bajar(px, ms = 1400) { await pg.mouse.wheel(0, px); await pausa(ms); }

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: CRUDO, size: { width: W, height: H } } });
const videos = [];
async function nuevaPagina(conSesion) {
  if (pg) { const v = pg.video(); await pg.close(); videos.push(await v.path()); }
  pg = await ctx.newPage();
  pg.on("pageerror", (e) => avisos.push("error en página: " + e.message));
  if (!conSesion) await pg.addInitScript(() => { try { if (!sessionStorage.getItem("tut-limpio")) { localStorage.clear(); sessionStorage.setItem("tut-limpio", "1"); } } catch (_) {} });
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
await sub("Cuenta creada y activa", "Su cuenta queda activa al instante. Recibe un código de institución y un código personal para entrar desde cualquier teléfono.", 5200);

// 4) El panel del profesor (con datos de ejemplo)
await tarjeta("Parte 3", "El panel del profesor", "Para el recorrido usamos una cuenta con datos de ejemplo: grupos, estudiantes, asistencia y notas.");
await nuevaPagina(true);
await ir("/app/profesor.html#/inicio");
await sub("Inicio", "Inicio te dice qué toca hoy: tus clases, a qué grupo pasar lista, evaluaciones por calificar y próximas fechas.", 5000);
await nota("Mientras empiezas, una guía de 5 pasos marca sola lo que ya hiciste: grupo, estudiantes, horario, lista y evaluación.", 4600);
await bajar(500, 2200); await pg.mouse.wheel(0, -1000); await pausa(600);

await hash("#/grupos");
await sub("Grupos y horarios", "Un grupo reúne a los estudiantes de una misma clase. Al crearlo escribes la asignatura ahí mismo.", 4200);
await clic(pg.getByRole("button", { name: /Nuevo grupo/ }), { espera: 1100 });
await escribir("dialog input[name=nombre]", "Física 11mo · sábados");
await nota("Pones nombre, asignatura, cupo y fechas. Al guardar, el grupo aparece en tu lista.", 3600);
await pg.keyboard.press("Escape"); await pausa(700);

await hash(`#/grupos/${G1}`);
await sub("Dentro de un grupo", "Aquí ves a los integrantes, el horario semanal y el botón «Agregar» para sumar estudiantes.", 4200);
await clic(pg.getByRole("button", { name: "Agregar", exact: true }), { espera: 1200 });
await nota("Puedes elegir estudiantes que ya tienes, registrar uno nuevo o importar toda la lista desde Excel.", 4400);
await pg.keyboard.press("Escape"); await pausa(700);

await hash("#/estudiantes");
await sub("Estudiantes", "La lista de todos tus estudiantes, con buscador y filtros por estado.", 3600);
await clic(pg.getByRole("button", { name: /Importar Excel/ }), { espera: 1200 });
await nota("¿Tienes la lista en Excel? Súbela: el sistema reconoce las columnas, revisa fechas y omite duplicados.", 3600);
const csv = "Nombre completo;Fecha de nacimiento;Teléfono\r\nValeria Torres Mena;12/05/2012;8855-1020\r\nJosé Martínez;03/09/2011;8855-2233\r\nKarla Sánchez;21/01/2012;8855-4410\r\n";
await pg.locator("dialog input[type=file]").setInputFiles({ name: "lista.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") }).catch((e) => avisos.push("csv: " + e.message));
await pausa(1500);
await nota("Antes de importar ves exactamente qué se va a guardar. Un clic y quedan registrados.", 3800);
await pg.keyboard.press("Escape"); await pausa(700);

await hash("#/asistencia");
await sub("Pasar lista", "Eliges el grupo y la fecha. Tocas P (presente), A (ausente), T (tarde) o J (justificado) por estudiante.", 4000);
const botones = pg.locator(".pase .opc button");
for (const i of [0, 5, 9]) { if ((await botones.count()) > i) await clic(botones.nth(i), { espera: 500 }); }
await nota("Al guardar, el sistema te ofrece pasar directo al siguiente grupo. Si cambias de grupo sin guardar, te avisa.", 3800);
await clic(".pie-fijo .btn", { espera: 1500 });

await hash("#/calificaciones");
await sub("Calificaciones", "Creas evaluaciones (exámenes, tareas, proyectos) con su peso. El promedio de cada estudiante se calcula solo.", 4000);
await clic(pg.getByRole("button", { name: "Por evaluación" }), { espera: 1200 });
const inp = pg.locator(".calificar input");
if (await inp.count()) {
  await escribir(inp.nth(0), "88"); await pg.keyboard.press("Enter"); await pausa(300);
  await pg.keyboard.type("74", { delay: 70 }); await pausa(500);
}
await nota("Eliges la evaluación y pones las notas en una lista: Enter pasa al siguiente estudiante. También tienes el cuadro completo.", 4200);
await clic(".pie-fijo .btn", { espera: 1600 });

await hash("#/tareas");
await sub("Tareas", "Asignas tareas a un grupo con fecha de entrega y marcas quién entregó.", 3800);
await hash("#/calendario");
await sub("Calendario", "Tu mes completo: clases según el horario, evaluaciones y fechas importantes. Toca un día para ver el detalle o agregar una fecha.", 4600);
await hash("#/informes");
await sub("Informes", "Informe por grupo o por estudiante: promedio, asistencia y quién está en riesgo. Desde el plan Profesional lo imprimes o guardas en PDF.", 5000);
await bajar(400, 2000); await pg.mouse.wheel(0, -800); await pausa(500);

await hash("#/cuenta");
await sub("Mi cuenta", "Aquí ves tu plan, cuánto usas y hasta cuándo está pagado. Comparas los planes y pides un cambio por WhatsApp.", 5000);
await bajar(450, 2600);
await nota("También están tus códigos de acceso y, en el plan Premium, tu asistente: entra con su propio código y solo ve sus grupos.", 4800);
await pg.mouse.wheel(0, -1200); await pausa(600);

await tarjeta("Listo", "Así de simple es Docencia360", "Código de acceso → cuenta activa → grupos → estudiantes → lista → notas → informes. ¿Dudas? Escríbenos por WhatsApp.", 6000);

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
