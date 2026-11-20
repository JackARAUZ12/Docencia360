// Docencia360 para computadora (Windows).
// · Abre la aplicación desde archivos guardados en el programa (funciona sin internet).
// · Con internet, guarda y protege todo en el servidor (Supabase), igual que la web.
// · Se actualiza solo: busca versiones nuevas publicadas en GitHub.
const { app, BrowserWindow, protocol, net, shell, ipcMain, Menu, dialog } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ESQUEMA = "app", HOST = "docencia360";
const WEB = path.join(__dirname, "web");
const INICIO = `${ESQUEMA}://${HOST}/entrar.html`;

// El esquema app:// se comporta como un sitio seguro (guarda sesión y datos sin internet)
protocol.registerSchemesAsPrivileged([{ scheme: ESQUEMA, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// Una sola ventana del programa a la vez
if (!app.requestSingleInstanceLock()) app.quit();

let ventana = null;
function crearVentana() {
  ventana = new BrowserWindow({
    width: 1366, height: 860, minWidth: 900, minHeight: 600, show: false,
    title: "Docencia360", backgroundColor: "#F4F6F2", autoHideMenuBar: true,
    icon: path.join(__dirname, "recursos", "icono.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true,
      additionalArguments: [`--d360-version=${app.getVersion()}`] },
  });
  ventana.once("ready-to-show", () => ventana.show());
  // Enlaces a otros sitios (WhatsApp, correo, página web) se abren en el navegador
  const esInterno = (u) => u.startsWith(`${ESQUEMA}://${HOST}/`);
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (esInterno(url)) return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, "recursos", "icono.png") } };
    if (/^(https?:|mailto:|tel:)/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  ventana.webContents.on("will-navigate", (e, url) => { if (!esInterno(url)) { e.preventDefault(); if (/^(https?:|mailto:|tel:)/.test(url)) shell.openExternal(url); } });
  ventana.loadURL(INICIO);
}

app.on("second-instance", () => { if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); } });

app.whenReady().then(() => {
  // Sirve los archivos de la app desde la carpeta del programa (sin salir de ella)
  protocol.handle(ESQUEMA, (req) => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "") || "entrar.html";
    if (rel.endsWith("/")) rel += "index.html";
    const archivo = path.normalize(path.join(WEB, rel));
    if (u.host !== HOST || !archivo.startsWith(WEB + path.sep)) return new Response("No permitido", { status: 403 });
    return net.fetch(pathToFileURL(archivo).toString());
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Docencia360", submenu: [{ role: "reload", label: "Recargar" }, { role: "togglefullscreen", label: "Pantalla completa" }, { type: "separator" }, { role: "quit", label: "Salir" }] },
    { label: "Ver", submenu: [{ role: "zoomIn", label: "Acercar" }, { role: "zoomOut", label: "Alejar" }, { role: "resetZoom", label: "Tamaño normal" }] },
    { label: "Ayuda", submenu: [
      { label: "Buscar actualizaciones", click: async () => {
        const r = await buscarActualizaciones();
        dialog.showMessageBox(ventana, { type: "info", title: "Docencia360", message: r.ok ? (r.version && r.version !== app.getVersion() ? `Se está descargando la versión ${r.version}. Se instalará al cerrar el programa.` : `Tienes la versión más reciente (${app.getVersion()}).`)
          : "No se pudo buscar actualizaciones. Revisa tu conexión a internet e inténtalo de nuevo." });
      } },
      { label: `Versión ${app.getVersion()}`, enabled: false },
    ] },
  ]));
  crearVentana();
  buscarActualizaciones();
});
app.on("window-all-closed", () => app.quit());

// ---------- Actualizaciones automáticas (solo con internet; sin internet se ignora) ----------
async function buscarActualizaciones() {
  if (!app.isPackaged) return { ok: false, motivo: "desarrollo" };
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;   // se instala al cerrar el programa
    const r = await autoUpdater.checkForUpdatesAndNotify({ title: "Docencia360", body: "Hay una versión nueva. Se instalará al cerrar el programa." });
    return { ok: true, version: r?.updateInfo?.version || null };
  } catch (e) { return { ok: false, motivo: String(e?.message || e) }; }
}
ipcMain.handle("d360:actualizar", () => buscarActualizaciones());
