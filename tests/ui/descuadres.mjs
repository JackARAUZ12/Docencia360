// Auditoría de descuadres: por pantalla, en teléfono (360/390) y PC, claro y oscuro.
// Busca: errores JS/consola, desborde de página, elementos que se salen de la pantalla,
// textos cortados, botones/campos encimados, ventanas emergentes que se desbordan.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const { preparar, E, G1 } = await import("./simulacion.mjs");
const B = process.env.BASE || "http://localhost:8080";
const PROF = ["inicio", "asistencia", "calificaciones", "tareas", "enlinea", "enlinea/accesos", "aula", "cobros", "cobros?vista=deben", "cobros?vista=clases", "cobros?vista=movimientos", "cobros?vista=mensualidades", "rubricas", "banco", "grupos", `grupos/${G1}`, "estudiantes", `estudiantes/${E(1)}`, "calendario", "informes", "cursos", "cuenta", "mas"];
const ACA = ["inicio", "caja", "interesados", "recuperaciones", "comunicados", "enlinea", "aula", "banco", "pagos-instructores", "finanzas?vista=resumen", "finanzas?vista=gastos", "familias", "estudiantes", `estudiantes/${E(1)}`, "cursos", "grupos", `grupos/${G1}`, "instructores", "asistencia", "calificaciones", "tareas", "rubricas", "calendario", "matriculas", "finanzas", "certificados", "informes", "equipo", "cuenta", "mas"];
const COL = ["inicio", "comunicados", "calendario", "estudiantes", `estudiantes/${E(1)}`, "asistencia", "calificaciones", "boletines", "horarios", "estructura", "docentes", "familias", "institucion", "matriculas", "finanzas", "certificados", "informes", "equipo", "cuenta", "grupos", "mas"];
const FAM = ["inicio", "notas", "asistencia", "avisos", "pagos"];
const CASOS = [
  ...["prof_basico", "prof_profesional", "prof_premium"].map((pl) => ({ n: `profesor ${pl}`, url: "/app/profesor.html#/", rutas: PROF, mod: "profesor", rol: "propietario", plan: pl })),
  { n: "profesor asistente", url: "/app/profesor.html#/", rutas: PROF, mod: "profesor", rol: "docente", plan: "prof_premium" },
  { n: "academia", url: "/app/academia.html#/", rutas: ACA, mod: "academia", rol: "propietario" },
  { n: "academia instructor", url: "/app/academia.html#/", rutas: ["inicio", "mis-pagos", "recuperaciones", "enlinea", "aula", "comunicados", "asistencia"], mod: "academia", rol: "docente" },
  { n: "academia familias", url: "/app/familias.html#/", rutas: FAM, mod: "academia", rol: "tutor" },
  { n: "colegio", url: "/app/colegio.html#/", rutas: COL, mod: "colegio", rol: "director" },
  { n: "familias", url: "/app/familias.html#/", rutas: FAM, mod: "colegio", rol: "tutor" },
  { n: "público", publico: ["/index.html", "/entrar.html", "/registro.html", "/recuperar.html", "/verificar.html", "/privacidad.html", "/terminos.html", "/cuentas.html", "/aula.html", "/inscripcion.html?a=abc1234567"] },
];
const SOLO = process.env.SOLO;

// Revisión dentro de la página
const revisar = () => {
  const W = innerWidth, out = [];
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const enScroll = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
  const nombre = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} «${(el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 30)}»`;
  const raiz = document.querySelector("dialog[open]") || document.body;
  const todos = [...raiz.querySelectorAll("*")].filter((el) => !["SCRIPT", "STYLE", "svg", "path", "OPTION"].includes(el.tagName) && !el.closest("svg"));
  for (const el of todos) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !enScroll(el) && getComputedStyle(el).position !== "fixed") out.push(`se sale de la pantalla: ${nombre(el)} (${Math.round(r.left)}→${Math.round(r.right)})`);
    // texto cortado sin puntos suspensivos
    const s = getComputedStyle(el);
    if (el.children.length === 0 && (el.innerText || "").trim() && /(hidden|clip)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== "ellipsis" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
      out.push(`texto cortado: ${nombre(el)}`);
  }
  // controles encimados
  const ctrl = [...raiz.querySelectorAll("button, a.btn, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea")].filter(vis).filter((el) => getComputedStyle(el).position !== "fixed" && !el.closest(".guia-flotante, .toast, nav.barra-abajo, .menu-abajo"));
  // rectángulo realmente visible (recortado por contenedores con scroll); los de barras fijas/pegajosas se ignoran
  const pegado = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const ps = getComputedStyle(p).position; if (ps === "sticky" || ps === "fixed") return true; } return false; };
  const recorte = (el) => { let r = el.getBoundingClientRect(); let a = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowY !== "visible" || s.overflowX !== "visible") { const q = p.getBoundingClientRect(); a = { l: Math.max(a.l, q.left), t: Math.max(a.t, q.top), r: Math.min(a.r, q.right), b: Math.min(a.b, q.bottom) }; } }
    a.b = Math.min(a.b, innerHeight); a.t = Math.max(a.t, 0); return { left: a.l, right: a.r, top: a.t, bottom: a.b }; };
  const R = ctrl.map(recorte);
  const P = ctrl.map(pegado);
  for (let i = 0; i < ctrl.length; i++) for (let j = i + 1; j < ctrl.length; j++) {
    if (ctrl[i].contains(ctrl[j]) || ctrl[j].contains(ctrl[i]) || P[i] !== P[j]) continue;
    const a = R[i], b = R[j];
    const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ix > 4 && iy > 4) out.push(`encimados: ${nombre(ctrl[i])} y ${nombre(ctrl[j])}`);
  }
  // botones con el texto en 3+ líneas (se ve apretado)
  for (const el of ctrl.filter((e) => e.tagName === "BUTTON" || e.matches("a.btn"))) {
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    if (el.innerText.trim() && el.getBoundingClientRect().height > lh * 3 + 24 && !el.matches(".bv-opcion, .chip, .tarjeta, .opcion, .modo-btn, .curso-insc, .atajo")) out.push(`botón apretado: ${nombre(el)}`);
  }
  const texto = (raiz === document.body ? (document.querySelector("main") || document.body) : raiz).innerText;
  for (const mal of ["undefined", "[object Object]", "NaN", "Invalid Date", "(opcional) (opcional)", "null"]) {
    const re = mal === "null" ? /(^|[\s:·(])null([\s).,]|$)/ : mal === "NaN" ? /(^|[\s$:])NaN\b/ : null;
    if (re ? re.test(texto) : texto.includes(mal)) { const i = texto.indexOf(mal); out.push(`texto roto «${mal}»: …${texto.slice(Math.max(0, i - 40), i + 30).replace(/\s+/g, " ")}…`); }
  }
  if (document.documentElement.scrollWidth > W + 1) out.push(`desborde de página ${document.documentElement.scrollWidth}px`);
  return [...new Set(out)];
};

const b = await chromium.launch();
const hallazgos = [];
const anota = (t) => { hallazgos.push(t); console.log("✗", t); };
for (const caso of CASOS) {
  if (SOLO && !caso.n.includes(SOLO)) continue;
  for (const [w, hh, tag] of [[360, 760, "tel360"], [390, 844, "tel390"], [768, 1000, "tableta"], [1366, 900, "pc"]]) {
    for (const tema of ["claro", "oscuro"]) {
      if (tema === "oscuro" && tag !== "tel390" && tag !== "pc") continue;
      const c = await b.newContext({ viewport: { width: w, height: hh } });
      const p = await c.newPage();
      const lugar = { r: "" };
      p.on("pageerror", (e) => anota(`${caso.n} ${tag} ${tema} ${lugar.r}: error JS ${e.message}`));
      p.on("console", (m) => { if (m.type() === "error" && !/fonts|Failed to load resource.*(fonts|ejemplo\.invalid)|ERR_FAILED|net::/.test(m.text())) anota(`${caso.n} ${tag} ${tema} ${lugar.r}: consola ${m.text().slice(0, 140)}`); });
      p.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(B)) anota(`${caso.n} ${tag}: archivo no encontrado ${r.url()}`); });
      if (caso.plan) process.env.PLAN = caso.plan; else delete process.env.PLAN;
      await preparar(p, !caso.publico, caso.mod || "profesor", caso.rol || "propietario");
      await p.addInitScript((t) => { try { localStorage.setItem("d360-tema", t); } catch (_) {} }, tema);
      const rutas = caso.publico || caso.rutas;
      let primera = true;
      for (const r of rutas) {
        lugar.r = r;
        if (caso.publico) { await p.goto(B + r); await p.waitForTimeout(900); }
        else if (primera) { await p.goto(B + caso.url + r); await p.waitForTimeout(1400); primera = false; }
        else { await p.evaluate((x) => { location.hash = x; }, "#/" + r); await p.waitForTimeout(800); }
        // cerrar bienvenida u otros diálogos automáticos
        while (await p.locator("dialog[open]").count()) { await p.keyboard.press("Escape"); await p.waitForTimeout(250); if (await p.locator("dialog[open]").count()) { await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); })); } }
        for (const x of await p.evaluate(revisar)) anota(`${caso.n} ${tag} ${tema} ${r}: ${x}`);
        // abrir cada botón de la cabecera (crear/registrar…) y revisar la ventana
        if (!caso.publico && tema === "claro" && (tag === "tel360" || tag === "pc")) {
          const n = await p.locator("main .p-titulo .acciones button").count();
          for (let i = 0; i < n; i++) {
            const bt = p.locator("main .p-titulo .acciones button").nth(i);
            if (!(await bt.isVisible()) || await bt.isDisabled()) continue;
            const txt = (await bt.innerText()).trim();
            if (/Exportar|PDF|Excel|Imprimir|Descargar/i.test(txt)) continue;
            await bt.click(); await p.waitForTimeout(500);
            if (await p.locator("dialog[open]").count()) {
              for (const x of await p.evaluate(revisar)) anota(`${caso.n} ${tag} ${r} ventana «${txt}»: ${x}`);
              await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { d.close(); d.remove(); }));
            }
            if (!p.url().includes(r.split("?")[0])) { await p.evaluate((x) => { location.hash = x; }, "#/" + r); await p.waitForTimeout(700); }
          }
        }
      }
      await c.close();
    }
  }
  console.log("revisado:", caso.n);
}
await b.close();
console.log(`\n${hallazgos.length} hallazgo(s)`);
