// Copia la aplicación web a escritorio/web para empaquetarla dentro del programa.
// Así el programa abre aunque no haya internet (no depende de la página web).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const AQUI = path.dirname(fileURLToPath(import.meta.url));   // funciona en Windows y Linux
const RAIZ = path.resolve(AQUI, "..");
const DESTINO = path.resolve(AQUI, "web");
const PAGINAS = ["index.html", "entrar.html", "cuentas.html", "registro.html", "recuperar.html", "verificar.html", "privacidad.html", "terminos.html",
  "aula.html", "alumno.html", "inscripcion.html", "manifest.webmanifest", "app"];
fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(DESTINO, { recursive: true });
for (const p of PAGINAS) if (fs.existsSync(path.join(RAIZ, p))) fs.cpSync(path.join(RAIZ, p), path.join(DESTINO, p), { recursive: true });
// assets sin el panel de administración de la plataforma (eso es solo web)
fs.cpSync(path.join(RAIZ, "assets"), path.join(DESTINO, "assets"), { recursive: true, filter: (f) => !f.includes(`${path.sep}admin`) });
const n = fs.readdirSync(DESTINO, { recursive: true }).length;
console.log(`web/ lista (${n} archivos)`);
