const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nuntius", {
  statoIniziale: () => ipcRenderer.invoke("stato-iniziale"),
  login: (email, password) => ipcRenderer.invoke("login", { email, password }),
  logout: () => ipcRenderer.invoke("logout"),
  waAvvia: () => ipcRenderer.invoke("wa-avvia"),
  campagnePronte: () => ipcRenderer.invoke("campagne-pronte"),
  campagnaInvia: (id) => ipcRenderer.invoke("campagna-invia", id),
  invioDiProva: (numero, testo) => ipcRenderer.invoke("invio-di-prova", { numero, testo }),
  onLog: (cb) => ipcRenderer.on("log", (_e, msg) => cb(msg)),
  onQr: (cb) => ipcRenderer.on("wa-qr", (_e, dataUrl) => cb(dataUrl)),
  onWaPronto: (cb) => ipcRenderer.on("wa-pronto", (_e, pronto) => cb(pronto)),
  onProgresso: (cb) => ipcRenderer.on("progresso", (_e, p) => cb(p)),
});
