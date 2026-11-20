// Programa de escritorio (Electron): abre desde sus archivos, entra a la cuenta, funciona
// sin internet y sube los cambios al volver. Uso: xvfb-run -a node tests/ui/escritorio.mjs
// (antes: cd escritorio && npm install && npm run preparar)
import { createRequire } from "node:module";
const { _electron } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import { preparar } from "./simulacion.mjs";
const OUT = "tests/ui/capturas/escritorio"; fs.mkdirSync(OUT, { recursive: true });
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const G1 = "33333333-3333-3333-3333-333333333331";
const dirDatos = fs.mkdtempSync("/tmp/d360-escritorio-");
const app = await _electron.launch({ executablePath: "escritorio/node_modules/electron/dist/electron", args: ["escritorio", "--no-sandbox", `--user-data-dir=${dirDatos}`], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" } });
const p = await app.firstWindow();
p.on("pageerror", (e) => errores.push(e.message));
await p.waitForLoadState("domcontentloaded");
ok(p.url().startsWith("app://docencia360/entrar.html"), `abre la pantalla de entrada desde los archivos del programa (${p.url()})`);
ok(await p.evaluate(() => !!window.d360Escritorio && /^\d+\.\d+\.\d+$/.test(window.d360Escritorio.version)), "la página sabe que está en el programa de escritorio (y su versión)");
// Cada archivo se sirve con su tipo fijo (en Windows el registro puede decir que .js es texto y la app no correría)
const tipos = await p.evaluate(async () => Promise.all(["/assets/js/core/sb.js", "/assets/css/d360.css", "/entrar.html", "/manifest.webmanifest"].map(async (f) => (await fetch(f)).headers.get("content-type"))));
ok(/^text\/javascript/.test(tipos[0]) && /^text\/css/.test(tipos[1]) && /^text\/html/.test(tipos[2]) && /manifest\+json/.test(tipos[3]), `los archivos se sirven con su tipo correcto (${tipos.join(" · ")})`);
// Sesión y datos simulados (Supabase)
const estado = { sinRed: false };
await preparar(p, true, "profesor", "propietario");
await p.route(/supabase\.co/, (route) => (estado.sinRed ? route.abort("internetdisconnected") : route.fallback()));
await p.goto("app://docencia360/app/profesor.html#/inicio"); await p.waitForTimeout(2500);
ok(await p.locator("main").getByText("Hola, Ana").first().isVisible().catch(() => false), "entra al panel del profesor con los módulos cargados desde el programa");
await p.screenshot({ path: `${OUT}/1-inicio.png` });
// Abre pantallas con internet (quedan guardadas) y luego sin internet
for (const r of ["grupos", `asistencia?grupo=${G1}`]) { await p.evaluate((x) => { location.hash = "#/" + x; }, r); await p.waitForTimeout(1300); }
estado.sinRed = true;
await p.evaluate(() => dispatchEvent(new Event("offline")));
await p.evaluate(() => { location.hash = "#/grupos"; }); await p.waitForTimeout(1300);
ok(await p.locator(".conexion:not([hidden])").isVisible() && await p.locator("main").getByText("Matemática 9no").first().isVisible(), "sin internet muestra lo guardado y el aviso «Sin internet»");
await p.evaluate((g) => { location.hash = `#/asistencia?grupo=${g}`; }, G1); await p.waitForTimeout(1300);
await p.getByRole("button", { name: "✓ Todos presentes" }).click();
await p.getByRole("button", { name: "Guardar asistencia" }).click(); await p.waitForTimeout(900);
ok(/1 cambio\(s\) por subir/.test(await p.locator(".conexion").innerText()), "sin internet la lista queda guardada en la computadora");
// Al recargar el programa sin internet, todo sigue ahí (los módulos vienen del programa)
await p.reload(); await p.waitForTimeout(2500);
ok(await p.locator("main").getByText("Hola, Ana").first().isVisible().catch(() => false) || await p.locator("main").innerText().then((t) => t.length > 50), "sin internet el programa vuelve a abrir (no depende de la página web)");
let subida = null; p.on("request", (r) => { if (r.url().includes("/rest/v1/asistencias") && r.method() === "POST") subida = r.url(); });
estado.sinRed = false;
await p.evaluate(() => dispatchEvent(new Event("online"))); await p.waitForTimeout(2500);
ok(!!subida, "al volver el internet sube la lista guardada");
// Enlaces externos se abren en el navegador, no dentro del programa
const abiertas = app.windows().length;
await p.evaluate(() => window.open("https://wa.me/50588887777", "_blank")); await p.waitForTimeout(600);
ok(app.windows().length === abiertas, "los enlaces externos (WhatsApp) no se abren dentro del programa");
await p.screenshot({ path: `${OUT}/2-final.png` });
await app.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
