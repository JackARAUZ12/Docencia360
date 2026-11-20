// Genera sw.js con la lista de archivos de la app y una versión según su contenido.
// Correr después de cambiar archivos de la app:  node herramientas/generar-sw.mjs
// (la prueba tests/ui/sin_internet.mjs falla si sw.js quedó desactualizado)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGINAS = ["index.html", "entrar.html", "cuentas.html", "registro.html", "recuperar.html", "verificar.html", "privacidad.html", "terminos.html",
  "aula.html", "alumno.html", "inscripcion.html", "app/profesor.html", "app/academia.html", "app/colegio.html", "app/familias.html", "manifest.webmanifest"];
const recorrer = (d) => fs.readdirSync(path.join(RAIZ, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? recorrer(path.join(d, e.name)) : [path.join(d, e.name)]));
const archivos = [...PAGINAS.filter((p) => fs.existsSync(path.join(RAIZ, p))),
  ...["assets/css", "assets/img", "assets/vendor", "assets/js"].flatMap(recorrer).filter((f) => !f.includes("/admin/") && !f.endsWith(".LICENSE"))].sort();
const hash = crypto.createHash("sha256");
for (const f of archivos) hash.update(f).update(fs.readFileSync(path.join(RAIZ, f)));
const version = hash.digest("hex").slice(0, 12);
const plantilla = fs.readFileSync(path.join(RAIZ, "herramientas/sw.plantilla.js"), "utf8");
fs.writeFileSync(path.join(RAIZ, "sw.js"), plantilla.replace("__VERSION__", version).replace("__ARCHIVOS__", JSON.stringify(archivos, null, 0).replace(/","/g, '",\n  "')));
console.log(`sw.js · versión ${version} · ${archivos.length} archivos`);
