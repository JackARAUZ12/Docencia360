// Puente mínimo entre el programa y la página: solo datos de lectura.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("d360Escritorio", {
  version: (process.argv.find((a) => a.startsWith("--d360-version=")) || "").split("=")[1] || "",
  plataforma: process.platform,
  buscarActualizacion: () => ipcRenderer.invoke("d360:actualizar"),
});
