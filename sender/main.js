const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const QRCode = require("qrcode");
const { DELAY_MIN_SEC, DELAY_MAX_SEC } = require("./config.js");
const { creaDb } = require("./db/db.js");

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
  await waClient.initialize();
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
  const userData = app.getPath("userData");
  fs.mkdirSync(userData, { recursive: true });
  dati = creaDb(require("better-sqlite3"), path.join(userData, "nuntius.db"));
  createWindow();
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.checkForUpdatesAndNotify();
    } catch {}
  }
});

app.on("window-all-closed", async () => {
  try { await waClient?.destroy(); } catch {}
  try { dati?.chiudi(); } catch {}
  app.quit();
});
