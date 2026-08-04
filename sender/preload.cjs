const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nuntius", {
  db: (metodo, args) => ipcRenderer.invoke("db", metodo, args),
  statoIniziale: () => ipcRenderer.invoke("stato-iniziale"),
  waAvvia: () => ipcRenderer.invoke("wa-avvia"),
  campagnaInvia: (id) => ipcRenderer.invoke("campagna-invia", id),
  invioDiProva: (numero, testo) => ipcRenderer.invoke("invio-di-prova", { numero, testo }),
  onLog: (cb) => ipcRenderer.on("log", (_e, msg) => cb(msg)),
  onQr: (cb) => ipcRenderer.on("wa-qr", (_e, dataUrl) => cb(dataUrl)),
  onAutenticato: (cb) => ipcRenderer.on("wa-autenticato", () => cb()),
  onCaricamento: (cb) => ipcRenderer.on("wa-caricamento", (_e, p) => cb(p)),
  onWaPronto: (cb) => ipcRenderer.on("wa-pronto", (_e, pronto) => cb(pronto)),
  onProgresso: (cb) => ipcRenderer.on("progresso", (_e, p) => cb(p)),
});
