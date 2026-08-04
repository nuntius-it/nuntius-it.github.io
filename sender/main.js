const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const QRCode = require("qrcode");
const { DELAY_MIN_SEC, DELAY_MAX_SEC } = require("./config.js");
const { creaDb } = require("./db/db.js");
const {
  backupAutomatico, serveBackupOggi, scriviBackup, cartellaBackup,
  verificaBackup, sostituisciDb,
} = require("./backup.js");

let win;
let dati = null; // API dati locale (db/db.js), aperta in whenReady
let waClient = null;
let waPronto = false;
let invioInCorso = false;

// ---------- Cartella dati ----------
// L'app si chiamava "Nuntius Sender": al primo avvio con il nuovo nome la
// cartella dati viene rinominata, portando con sé la sessione WhatsApp.
// NUNTIUS_USERDATA consente a sviluppo/collaudo di usare una cartella isolata.
if (process.env.NUNTIUS_USERDATA) {
  app.setPath("userData", process.env.NUNTIUS_USERDATA);
} else {
  const vecchia = path.join(app.getPath("appData"), "Nuntius Sender");
  const nuova = app.getPath("userData");
  if (fs.existsSync(vecchia) && !fs.existsSync(nuova)) fs.renameSync(vecchia, nuova);
}

const percorsoDb = () => path.join(app.getPath("userData"), "nuntius.db");

// ---------- Istanza unica ----------
// Due istanze insieme (es. app installata + npm start) si contenderebbero
// database e sessione WhatsApp: la seconda esce e riporta davanti la prima.
// Il lucchetto vale per cartella dati, quindi NUNTIUS_USERDATA resta isolata.
const istanzaUnica = app.requestSingleInstanceLock();
if (!istanzaUnica) {
  app.quit();
}
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

function send(canale, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(canale, payload);
}

function log(msg) {
  const ts = new Date().toLocaleTimeString("it-IT");
  console.log(`[${ts}] ${msg}`);
  send("log", `[${ts}] ${msg}`);
}

const attesa = (min, max) =>
  new Promise((r) => setTimeout(r, Math.round((Math.random() * (max - min) + min) * 1000)));

// ---------- WhatsApp ----------

// Nell'app impacchettata Chrome è incluso come risorsa in chrome-cache/ (vedi
// electron-builder.yml e release.yml): puppeteer non può usare ~/.cache/puppeteer,
// che sul computer dell'utente non esiste.
function trovaChromeIncluso() {
  if (!app.isPackaged) return undefined;
  const base = path.join(process.resourcesPath, "chrome-cache");
  const eseguibile = process.platform === "win32" ? "chrome.exe" : "Google Chrome for Testing";
  const pila = [base];
  while (pila.length) {
    const dir = pila.pop();
    let voci;
    try { voci = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const voce of voci) {
      const p = path.join(dir, voce.name);
      if (voce.isDirectory()) pila.push(p);
      else if (voce.name === eseguibile) return p;
    }
  }
  return null;
}

// Tamponi per l'aggiornamento di WhatsApp Web di fine luglio 2026
// (wwebjs/whatsapp-web.js#201862): l'iniezione di window.WWebJS a volte non si
// completa (l'invio fallirebbe con "Cannot read properties of undefined (reading
// 'getChat')") e su MsgKey la proprietà _serialized è stata minificata in $1
// (l'invio fallirebbe subito dopo la consegna). Sicura da ripetere; va richiamata
// prima di ogni invio perché un ricaricamento della pagina di WhatsApp la azzera.
async function assicuraIniezione() {
  const pagina = waClient?.pupPage;
  if (!pagina) return false;
  try {
    const giaIniettato = await pagina.evaluate(
      () => typeof window.WWebJS?.getChat === "function"
    );
    if (!giaIniettato) {
      const { LoadUtils } = require("whatsapp-web.js/src/util/Injected/Utils.js");
      await pagina.evaluate(LoadUtils);
      log("Componenti di invio ricaricati.");
    }
    await pagina.evaluate(() => {
      const proto = window.require("WAWebMsgKey")?.prototype;
      if (proto && !("_serialized" in proto)) {
        Object.defineProperty(proto, "_serialized", {
          get() {
            return this.$1;
          },
          configurable: true,
        });
      }
    });
    return await pagina.evaluate(
      () => typeof window.WWebJS?.getChat === "function"
    );
  } catch {
    return false;
  }
}

// Da fine luglio 2026 WhatsApp Web a volte non emette più l'evento "ready"
// (wwebjs/whatsapp-web.js#201864): se dopo l'autenticazione lo stato risulta
// CONNECTED per due controlli di fila, il collegamento viene considerato pronto.
function avviaControlloPronto() {
  let volteConnesso = 0;
  const controllo = setInterval(async () => {
    if (!waClient || waPronto) {
      clearInterval(controllo);
      return;
    }
    let stato = null;
    try {
      stato = await waClient.getState();
    } catch {}
    volteConnesso = stato === "CONNECTED" ? volteConnesso + 1 : 0;
    if (volteConnesso >= 2 && (await assicuraIniezione()) && !waPronto) {
      clearInterval(controllo);
      waPronto = true;
      send("wa-pronto", true);
      log("WhatsApp pronto.");
    }
  }, 5000);
}

async function avviaWhatsApp() {
  if (waClient) return;
  const { Client, LocalAuth } = require("whatsapp-web.js");
  const executablePath = trovaChromeIncluso();
  if (executablePath === null) {
    throw new Error("Chrome incluso nell'app non trovato: reinstallare Nuntius.");
  }
  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(app.getPath("userData"), "whatsapp") }),
    puppeteer: {
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-extensions", "--no-first-run"],
    },
  });

  waClient.on("qr", async (qr) => {
    const dataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 1 });
    send("wa-qr", dataUrl);
    log("In attesa della scansione del QR code…");
  });
  waClient.on("loading_screen", (percent, message) => {
    send("wa-caricamento", { percent: Number(percent) || 0, message });
  });
  let autenticatoLoggato = false;
  waClient.on("authenticated", () => {
    send("wa-autenticato", true);
    if (autenticatoLoggato) return;
    autenticatoLoggato = true;
    log("WhatsApp autenticato.");
    avviaControlloPronto();
  });
  waClient.on("ready", async () => {
    if (waPronto) return;
    await assicuraIniezione();
    if (waPronto) return;
    waPronto = true;
    send("wa-pronto", true);
    log("WhatsApp pronto.");
  });
  waClient.on("disconnected", (motivo) => {
    waPronto = false;
    send("wa-pronto", false);
    log(`WhatsApp disconnesso: ${motivo}`);
    waClient = null;
  });

  log("Avvio di WhatsApp in corso (può richiedere qualche secondo)…");
  try {
    await waClient.initialize();
  } catch (err) {
    // Senza questo, waClient resterebbe assegnato ma rotto e ogni "wa-avvia"
    // successivo verrebbe ignorato fino al riavvio dell'app.
    try { await waClient.destroy(); } catch {}
    waClient = null;
    throw err;
  }
}

async function inviaSingolo(numeroE164, testo) {
  await assicuraIniezione();
  const cifre = numeroE164.replace(/\D/g, "");
  const numberId = await waClient.getNumberId(cifre);
  if (!numberId) return { esito: "non_whatsapp" };
  await waClient.sendMessage(numberId._serialized, testo);
  return { esito: "inviato" };
}

// ---------- IPC: dati ----------

// Canale unico verso db/db.js: il proxy del renderer (webapp/src/lib/db.js)
// chiama i metodi per nome. Le eccezioni tornano come { ok: false } per non
// arrivare al renderer avvolte da "Error invoking remote method".
ipcMain.handle("db", (_e, metodo, args) => {
  try {
    if (["db", "chiudi"].includes(metodo) || typeof dati?.[metodo] !== "function") {
      throw new Error(`Operazione sconosciuta: ${metodo}`);
    }
    return { ok: true, dato: dati[metodo](...(args ?? [])) };
  } catch (err) {
    return { ok: false, errore: err.message };
  }
});

// ---------- IPC: copie di sicurezza ----------

ipcMain.handle("backup-info", () => ({
  ultimo: dati?.getImpostazione("ultimo_backup") ?? null,
  cartella: cartellaBackup(app.getPath("userData")),
}));

ipcMain.handle("backup-esporta", async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Esporta una copia dei dati",
    defaultPath: `nuntius-backup-${new Date().toLocaleDateString("sv")}.db`,
    filters: [{ name: "Copia di Nuntius", extensions: ["db"] }],
  });
  if (canceled || !filePath) return { ok: true, annullato: true };
  try {
    await dati.db.backup(filePath);
    log(`Copia dei dati esportata in ${filePath}.`);
    return { ok: true, percorso: filePath };
  } catch (err) {
    return { ok: false, errore: err.message };
  }
});

ipcMain.handle("backup-ripristina", async () => {
  if (invioInCorso) return { ok: false, errore: "C'è un invio in corso: attendi che finisca." };
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Ripristina da una copia",
    properties: ["openFile"],
    filters: [{ name: "Copia di Nuntius", extensions: ["db"] }],
  });
  if (canceled || !filePaths.length) return { ok: true, annullato: true };
  const file = filePaths[0];

  const verifica = verificaBackup(require("better-sqlite3"), file);
  if (!verifica.ok) return { ok: false, errore: verifica.errore };

  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    title: "Ripristina da una copia",
    message: "Sostituire tutti i dati con quelli della copia?",
    detail:
      "I dati attuali (persone, gruppi, liste, annunci e diario degli invii) verranno " +
      "sostituiti da quelli del file scelto. Prima della sostituzione viene salvata " +
      "una copia di sicurezza automatica dei dati attuali.",
    buttons: ["Sostituisci i dati", "Annulla"],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return { ok: true, annullato: true };

  try {
    if (dati.getProfilo()) {
      await scriviBackup(
        dati.db,
        cartellaBackup(app.getPath("userData")),
        `pre-ripristino-${new Date().toISOString().replace(/[:.]/g, "-")}.db`
      );
    }
    dati.chiudi();
    dati = null;
    sostituisciDb(percorsoDb(), file);
    log("Dati ripristinati dalla copia.");
    return { ok: true };
  } catch (err) {
    return { ok: false, errore: err.message };
  } finally {
    // Riapre in ogni caso (anche dopo un errore, sul database rimasto);
    // se la copia era di una versione più vecchia, migra() la aggiorna.
    if (!dati) dati = creaDb(require("better-sqlite3"), percorsoDb());
  }
});

// ---------- IPC: WhatsApp e invio ----------

ipcMain.handle("stato-iniziale", () => ({
  versione: app.getVersion(),
  profilo: dati?.getProfilo() ?? null,
  waPronto,
}));

ipcMain.handle("wa-avvia", async () => {
  try {
    await avviaWhatsApp();
    return { ok: true };
  } catch (err) {
    log(`Errore avvio WhatsApp: ${err.message}`);
    return { ok: false, errore: err.message };
  }
});

ipcMain.handle("campagna-invia", async (_e, campagnaId) => {
  if (!waPronto) return { ok: false, errore: "WhatsApp non è pronto." };
  if (invioInCorso) return { ok: false, errore: "C'è già un invio in corso." };
  invioInCorso = true;
  try {
    const { campagna } = dati.fetchCampagna(campagnaId);
    const coda = dati.fetchCodaInvii(campagnaId);
    dati.cambiaStatoCampagna(campagnaId, "in_invio");

    log(`Invio "${campagna.titolo}": ${coda.length} messaggi in coda.`);
    let inviati = 0, falliti = 0;

    for (let i = 0; i < coda.length; i++) {
      const invio = coda[i];
      send("progresso", { campagnaId, fatto: i, totale: coda.length });
      try {
        const { esito } = await inviaSingolo(invio.numero, campagna.testo);
        esito === "inviato" ? inviati++ : falliti++;
        dati.aggiornaInvio(invio.id, { esito, inviato_at: new Date().toISOString() });
        log(`(${i + 1}/${coda.length}) ${invio.numero}: ${esito === "inviato" ? "✓ inviato" : "non su WhatsApp"}`);
      } catch (err) {
        falliti++;
        dati.aggiornaInvio(invio.id, { esito: "errore", dettaglio: err.message?.slice(0, 200) });
        log(`(${i + 1}/${coda.length}) ${invio.numero}: ✗ ${err.message}`);
      }
      if (i < coda.length - 1) await attesa(DELAY_MIN_SEC, DELAY_MAX_SEC);
    }

    dati.cambiaStatoCampagna(campagnaId, "completata");
    send("progresso", { campagnaId, fatto: coda.length, totale: coda.length });
    log(`Completato: ${inviati} inviati, ${falliti} non recapitati.`);
    return { ok: true, inviati, falliti };
  } catch (err) {
    log(`Errore invio: ${err.message}`);
    return { ok: false, errore: err.message };
  } finally {
    invioInCorso = false;
  }
});

ipcMain.handle("invio-di-prova", async (_e, { numero, testo }) => {
  if (!waPronto) return { ok: false, errore: "WhatsApp non è pronto." };
  try {
    const { normalizzato } = normalizzaNumero(numero);
    if (!normalizzato) return { ok: false, errore: "Numero non valido." };
    const { esito } = await inviaSingolo(normalizzato, testo);
    log(`Invio di prova a ${normalizzato}: ${esito}`);
    return { ok: esito === "inviato", errore: esito === "inviato" ? null : "Il numero non risulta su WhatsApp." };
  } catch (err) {
    return { ok: false, errore: err.message };
  }
});

function normalizzaNumero(raw) {
  let cifre = String(raw ?? "").replace(/\D/g, "");
  if (cifre.startsWith("0039")) cifre = cifre.slice(4);
  else if (cifre.startsWith("39") && cifre.length >= 11) cifre = cifre.slice(2);
  if (!/^3\d{8,9}$/.test(cifre)) return { normalizzato: null };
  return { normalizzato: `+39${cifre}` };
}

// ---------- Finestra ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Nuntius",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // In sviluppo, NUNTIUS_DEV_URL punta al dev server Vite della webapp
  // (npm run dev in webapp/, poi npm run dev qui). Altrimenti si carica la
  // build copiata in renderer-app/ (npm run ui).
  if (!app.isPackaged && process.env.NUNTIUS_DEV_URL) {
    win.loadURL(process.env.NUNTIUS_DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "renderer-app", "index.html"));
  }
}

app.whenReady().then(() => {
  if (!istanzaUnica) return; // sta già uscendo: non aprire finestra né database
  const userData = app.getPath("userData");
  fs.mkdirSync(userData, { recursive: true });
  dati = creaDb(require("better-sqlite3"), percorsoDb());
  createWindow();
  // Rete di sicurezza se l'ultima chiusura non ha salvato (crash, blackout).
  if (serveBackupOggi(dati)) {
    backupAutomatico(dati, userData)
      .then((file) => file && log("Copia di sicurezza giornaliera aggiornata."))
      .catch((err) => log(`Backup automatico non riuscito: ${err.message}`));
  }
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.checkForUpdatesAndNotify();
    } catch {}
  }
});

app.on("window-all-closed", async () => {
  try { await waClient?.destroy(); } catch {}
  try { if (dati) await backupAutomatico(dati, app.getPath("userData")); } catch {}
  try { dati?.chiudi(); } catch {}
  app.quit();
});
