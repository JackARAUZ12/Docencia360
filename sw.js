// Docencia360 · service worker (GENERADO por herramientas/generar-sw.mjs: no editar a mano).
// Guarda la aplicación en el equipo para que abra aunque no haya internet.
// Con internet siempre se usa la versión más nueva del servidor; la copia es el respaldo.
// Los datos NO pasan por aquí: los maneja assets/js/core/offline.js.
const VERSION = "fac5de68b2ca";
const CACHE = `d360-app-${VERSION}`;
const ARCHIVOS = ["alumno.html",
  "app/academia.html",
  "app/colegio.html",
  "app/familias.html",
  "app/profesor.html",
  "assets/css/academia.css",
  "assets/css/colegio.css",
  "assets/css/d360.css",
  "assets/css/inicio.css",
  "assets/css/profesor.css",
  "assets/img/icono.svg",
  "assets/js/academia/app.js",
  "assets/js/academia/bienvenida.js",
  "assets/js/academia/caja.js",
  "assets/js/academia/certificados.js",
  "assets/js/academia/cursos.js",
  "assets/js/academia/equipo.js",
  "assets/js/academia/finanzas.js",
  "assets/js/academia/informes.js",
  "assets/js/academia/inicio.js",
  "assets/js/academia/instructores.js",
  "assets/js/academia/interesados.js",
  "assets/js/academia/matriculas.js",
  "assets/js/academia/niveles.js",
  "assets/js/academia/pagos_instructores.js",
  "assets/js/academia/rapida.js",
  "assets/js/academia/recuperaciones.js",
  "assets/js/colegio/app.js",
  "assets/js/colegio/boletines.js",
  "assets/js/colegio/calificaciones.js",
  "assets/js/colegio/comunicados.js",
  "assets/js/colegio/docentes.js",
  "assets/js/colegio/estructura.js",
  "assets/js/colegio/familias.js",
  "assets/js/colegio/fichas.js",
  "assets/js/colegio/horarios.js",
  "assets/js/colegio/informes.js",
  "assets/js/colegio/inicio.js",
  "assets/js/colegio/institucion.js",
  "assets/js/colegio/matriculas.js",
  "assets/js/colegio/util.js",
  "assets/js/comun/archivos.js",
  "assets/js/comun/asistencia.js",
  "assets/js/comun/aula.js",
  "assets/js/comun/banco.js",
  "assets/js/comun/calendario.js",
  "assets/js/comun/calificaciones.js",
  "assets/js/comun/cuenta.js",
  "assets/js/comun/enlinea.js",
  "assets/js/comun/estudiantes.js",
  "assets/js/comun/grupos.js",
  "assets/js/comun/importar.js",
  "assets/js/comun/movimientos.js",
  "assets/js/comun/reporte.js",
  "assets/js/comun/rubricas.js",
  "assets/js/comun/tareas.js",
  "assets/js/comun/ticket.js",
  "assets/js/config.js",
  "assets/js/core/conexion.js",
  "assets/js/core/demo.js",
  "assets/js/core/guia.js",
  "assets/js/core/hoja.js",
  "assets/js/core/iconos.js",
  "assets/js/core/offline.js",
  "assets/js/core/panel.js",
  "assets/js/core/sb.js",
  "assets/js/core/sesion.js",
  "assets/js/core/tema.js",
  "assets/js/core/ui.js",
  "assets/js/familias/app.js",
  "assets/js/profesor/app.js",
  "assets/js/profesor/cobros.js",
  "assets/js/profesor/cursos.js",
  "assets/js/profesor/informes.js",
  "assets/js/profesor/inicio.js",
  "assets/js/publico/legal.js",
  "assets/vendor/591.supabase.js",
  "assets/vendor/qrcode.js",
  "assets/vendor/supabase.js",
  "aula.html",
  "cuentas.html",
  "entrar.html",
  "index.html",
  "inscripcion.html",
  "manifest.webmanifest",
  "privacidad.html",
  "recuperar.html",
  "registro.html",
  "terminos.html",
  "verificar.html"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("d360-app-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const conTiempo = (p, ms) => Promise.race([p, new Promise((_, mal) => setTimeout(() => mal(new Error("tiempo")), ms))]);
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url);
  if (url.origin !== location.origin) return;          // Supabase y otros: no se tocan
  e.respondWith((async () => {
    try {
      const resp = await conTiempo(fetch(r), r.mode === "navigate" ? 6000 : 8000);
      if (resp.ok && resp.type === "basic") { const c = await caches.open(CACHE); c.put(r, resp.clone()); }
      return resp;
    } catch (_) {
      const c = await caches.open(CACHE);
      const guardado = (await c.match(r)) || (await c.match(r, { ignoreSearch: true }));
      if (guardado) return guardado;
      return new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Sin conexión</title><body style='font-family:system-ui;padding:2rem;max-width:32rem;margin:auto'><h1>Sin conexión</h1><p>Esta página todavía no se guardó en este equipo. Conéctate a internet una vez y quedará disponible sin conexión.</p><p><a href='" + self.registration.scope + "entrar.html'>Volver a entrar</a></p>",
        { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
    }
  })());
});
