// Primeros pasos se actualizan solos: al guardar algo, el panel de Inicio, el botón flotante
// y la lista abierta cambian en el momento (sin cambiar de pantalla) y avisan «Paso completado».
// Uso: node tests/ui/guia_viva.mjs  (requiere servidor estático en :8080)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { preparar } from "./simulacion.mjs";
const BASE = process.env.BASE || "http://localhost:8080";
const errores = [], fallos = [];
const ok = (c, t) => (c ? console.log("OK", t) : (fallos.push(t), console.log("FALLO", t)));
const browser = await chromium.launch();
const cerrarDialogos = (p) => p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
const insertar = (p, tabla, fila) => p.evaluate(async ([t, f]) => { const { sb, q } = await import("/assets/js/core/sb.js"); await q(sb.from(t).insert(f).select()); }, [tabla, fila]);
const cuenta = async (p, sel) => (await p.locator(sel).first().textContent()).match(/(\d+) de (\d+)/)?.slice(1).map(Number);

for (const [w, hh, tag] of [[390, 844, "movil"], [1366, 900, "pc"]]) {
  // ---------- Profesor ----------
  const ctxB = await browser.newContext({ viewport: { width: w, height: hh } });
  let p = await ctxB.newPage();
  p.on("pageerror", (e) => errores.push(`${tag}: ${e.message}`));
  await preparar(p, true);
  const hay = new Set();   // tablas con datos guardados en esta prueba
  await p.route(/supabase\.co\/rest\/v1\/(grupos|estudiantes|horarios|asistencias|evaluaciones)(\?|$)/, async (route) => {
    const t = new URL(route.request().url()).pathname.split("/").pop();
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: hay.has(t) ? JSON.stringify([{ id: "00000000-0000-0000-0000-0000000000a9", estudiante_id: "e1" }]) : "[]" });
    hay.add(t);
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([{ id: "00000000-0000-0000-0000-0000000000a9", nombre: "Grupo" }]) });
  });
  await p.goto(BASE + "/app/profesor.html#/inicio"); await p.waitForTimeout(1400);
  await cerrarDialogos(p); await p.waitForTimeout(200);
  const antes = await cuenta(p, ".guia-viva h2");
  ok(antes && antes[0] < antes[1], `${tag} profesor: el panel de Inicio muestra ${antes?.[0]} de ${antes?.[1]}`);
  const hechos0 = await p.locator(".guia-viva li.hecho").count();
  await insertar(p, "grupos", { nombre: "Grupo", cuenta_id: "x" }); await p.waitForTimeout(1500);
  const desp = await cuenta(p, ".guia-viva h2");
  ok(desp && desp[0] === antes[0] + 1, `${tag} profesor: al crear el grupo el panel pasa a ${desp?.[0]} de ${desp?.[1]} sin cambiar de pantalla`);
  ok(await p.locator(".guia-viva li.hecho").count() === hechos0 + 1, `${tag} profesor: el paso queda marcado ✓ en la lista`);
  ok(await p.getByText("✓ Paso completado: Crea tu primer grupo").isVisible(), `${tag} profesor: avisa «Paso completado»`);
  // Una acción que completa varios pasos a la vez: el aviso los nombra todos
  await p.evaluate(async () => { const { sb, q } = await import("/assets/js/core/sb.js");
    await Promise.all([q(sb.from("asistencias").insert({ grupo_id: "g", estudiante_id: "e", fecha: "2026-11-20", estado: "presente" })), q(sb.from("evaluaciones").insert({ nombre: "Prueba", grupo_id: "g" }))]); });
  await p.waitForTimeout(1600);
  ok(await p.getByText(/✓ 2 pasos completados: .+ y .+/).isVisible(), `${tag} profesor: si se completan varios pasos a la vez, el aviso los nombra todos`);
  const n2 = (await cuenta(p, ".guia-viva h2"))?.[0];
  await p.evaluate(() => { const t = document.querySelector("#toasts"); if (t) t.replaceChildren(); });
  // Lista abierta desde el botón flotante (en otra pantalla)
  await p.goto(BASE + "/app/profesor.html#/grupos"); await p.waitForTimeout(1300); await cerrarDialogos(p);
  const flot = p.locator("button.guia-flotante");
  ok(await flot.isVisible() && (await flot.textContent()).includes(`${n2}/`), `${tag} profesor: el botón flotante muestra el avance nuevo (${n2})`);
  await flot.click(); await p.waitForTimeout(400);
  ok((await cuenta(p, "dialog.modal .modal-cab h2"))?.[0] === n2, `${tag} profesor: la lista abierta muestra el avance`);
  await insertar(p, "horarios", { grupo_id: "g", dia: 1 }); await p.waitForTimeout(1500);
  ok((await cuenta(p, "dialog.modal .modal-cab h2"))?.[0] === n2 + 1 && await p.locator("dialog.modal li.hecho").count() === n2 + 1, `${tag} profesor: con la lista abierta, el título y los ✓ se actualizan solos`);
  ok((await flot.textContent()).includes(`${n2 + 1}/`), `${tag} profesor: el botón flotante también avanza`);
  // Leer datos no dispara revisiones
  let revisiones = 0; p.on("request", (r) => { if (r.url().includes("/rest/v1/evaluaciones")) revisiones++; });
  await p.evaluate(async () => { const { sb, q } = await import("/assets/js/core/sb.js"); await q(sb.from("grupos").select("id")); await q(sb.rpc("d360_resumen_panel", {})).catch(() => {}); });
  await p.waitForTimeout(1200);
  ok(revisiones === 0, `${tag} profesor: consultar datos no vuelve a revisar los pasos`);
  await p.close(); await ctxB.close();

  // ---------- Academia ----------
  const ctxA = await browser.newContext({ viewport: { width: w, height: hh } });
  p = await ctxA.newPage();
  p.on("pageerror", (e) => errores.push(`${tag} academia: ${e.message}`));
  await preparar(p, true, "academia", "propietario");
  // Academia recién abierta: sin cursos ni matrículas todavía
  const hayA = new Set();
  await p.route(/supabase\.co\/rest\/v1\/(cursos|matriculas)(\?|$)/, async (route) => {
    const t = new URL(route.request().url()).pathname.split("/").pop();
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: hayA.has(t) ? '[{"id":"c1"}]' : "[]" });
    hayA.add(t);
    return route.fulfill({ status: 201, contentType: "application/json", body: '[{"id":"c1"}]' });
  });
  await p.goto(BASE + "/app/academia.html#/inicio"); await p.waitForTimeout(1500); await cerrarDialogos(p);
  const a0 = await cuenta(p, ".guia-viva h2");
  ok(a0 && a0[0] < a0[1], `${tag} academia: «Pon en marcha» muestra ${a0?.[0]} de ${a0?.[1]}`);
  await insertar(p, "cursos", { nombre: "Inglés A1", cuenta_id: "x" }); await p.waitForTimeout(1500);
  ok((await cuenta(p, ".guia-viva h2"))?.[0] === a0[0] + 1 && await p.getByText("✓ Paso completado: Registra tus cursos").isVisible(), `${tag} academia: al registrar el curso, el panel avanza solo y avisa`);
  await insertar(p, "matriculas", { estudiante_id: "e1", cuenta_id: "x" }); await p.waitForTimeout(1500);
  ok(await p.locator(".guia-viva").count() === 1 && (await cuenta(p, ".guia-viva h2"))?.[0] === a0[0] + 2,
    `${tag} academia: con los pasos obligatorios hechos, la guía SIGUE visible hasta completar también los opcionales`);
  await p.close(); await ctxA.close();
}
await browser.close();
console.log(errores.length ? "ERRORES JS:\n" + errores.join("\n") : "Sin errores de JavaScript");
if (fallos.length || errores.length) process.exit(1);
