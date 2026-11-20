// Docencia360 · service worker (GENERADO por herramientas/generar-sw.mjs: no editar a mano).
// Guarda la aplicación en el equipo para que abra aunque no haya internet.
// Con internet siempre se usa la versión más nueva del servidor; la copia es el respaldo.
// Los datos NO pasan por aquí: los maneja assets/js/core/offline.js.
const VERSION = "__VERSION__";
const CACHE = `d360-app-${VERSION}`;
const ARCHIVOS = __ARCHIVOS__;
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
