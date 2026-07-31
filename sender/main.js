const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createClient } = require("@supabase/supabase-js");
const QRCode = require("qrcode");
const { SUPABASE_URL, SUPABASE_ANON_KEY, DELAY_MIN_SEC, DELAY_MAX_SEC } = require("./config.js");

let win;
let supabase;
let waClient = null;
let waPronto = false;
let invioInCorso = false;

const sessionFile = () => path.join(app.getPath("userData"), "supabase-session.json");

function send(canale, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(canale, payload);
}

function log(msg) {
  const ts = new Date().toLocaleTimeString("it-IT");
  send("log", `[${ts}] ${msg}`);
}

const attesa = (min, max) =>
  new Promise((r) => setTimeout(r, Math.round((Math.random() * (max - min) + min) * 1000)));

// ---------- Supabase ----------

function initSupabase() {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  supabase.auth.onAuthStateChange((_evento, sess) => {
    if (sess) {
      fs.writeFileSync(
        sessionFile(),
        JSON.stringify({ access_token: sess.access_token, refresh_token: sess.refresh_token })
      );
    }
  });
}

async function restoreSession() {
  try {
    const saved = JSON.parse(fs.readFileSync(sessionFile(), "utf8"));
    const { data, error } = await supabase.auth.setSession(saved);
    if (error || !data.session) return null;
    return data.session;
  } catch {
    return null;
  }
}

async function nomeParrocchia() {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return null;
  const { data } = await supabase
    .from("profili")
    .select("parrocchie(nome)")
    .eq("user_id", sess.session.user.id)
    .maybeSingle();
  return data?.parrocchie?.nome ?? sess.session.user.email;
}

// ---------- WhatsApp ----------

async function avviaWhatsApp() {
  if (waClient) return;
  const { Client, LocalAuth } = require("whatsapp-web.js");
  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(app.getPath("userData"), "whatsapp") }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-extensions", "--no-first-run"],
    },
  });

  waClient.on("qr", async (qr) => {
    const dataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 1 });
    send("wa-qr", dataUrl);
    log("In attesa della scansione del QR code…");
  });
  waClient.on("authenticated", () => log("WhatsApp autenticato."));
  waClient.on("ready", () => {
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
  const cifre = numeroE164.replace(/\D/g, "");
  const numberId = await waClient.getNumberId(cifre);
  if (!numberId) return { esito: "non_whatsapp" };
  await waClient.sendMessage(numberId._serialized, testo);
  return { esito: "inviato" };
}

// ---------- IPC ----------

ipcMain.handle("stato-iniziale", async () => {
  const sess = await restoreSession();
  return {
    versione: app.getVersion(),
    loggato: Boolean(sess),
    parrocchia: sess ? await nomeParrocchia() : null,
    waPronto,
  };
});

ipcMain.handle("login", async (_e, { email, password }) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, errore: "Credenziali non valide, riprova." };
  return { ok: true, parrocchia: await nomeParrocchia() };
});

ipcMain.handle("logout", async () => {
  await supabase.auth.signOut();
  try { fs.unlinkSync(sessionFile()); } catch {}
  return { ok: true };
});

ipcMain.handle("wa-avvia", async () => {
  try {
    await avviaWhatsApp();
    return { ok: true };
  } catch (err) {
    log(`Errore avvio WhatsApp: ${err.message}`);
    return { ok: false, errore: err.message };
  }
});

ipcMain.handle("campagne-pronte", async () => {
  const { data, error } = await supabase
    .from("campagne")
    .select("id, titolo, testo, stato, created_at, invii(count)")
    .in("stato", ["pronta", "in_invio"])
    .order("created_at", { ascending: false });
  if (error) return { ok: false, errore: error.message };
  return {
    ok: true,
    campagne: data.map((c) => ({ ...c, destinatari: c.invii?.[0]?.count ?? 0 })),
  };
});

ipcMain.handle("campagna-invia", async (_e, campagnaId) => {
  if (!waPronto) return { ok: false, errore: "WhatsApp non è pronto." };
  if (invioInCorso) return { ok: false, errore: "C'è già un invio in corso." };
  invioInCorso = true;
  try {
    const { data: campagna } = await supabase
      .from("campagne").select("*").eq("id", campagnaId).single();
    const { data: coda } = await supabase
      .from("invii").select("id, numero")
      .eq("campagna_id", campagnaId).eq("esito", "in_coda");

    await supabase.from("campagne")
      .update({ stato: "in_invio", updated_at: new Date().toISOString() })
      .eq("id", campagnaId);

    log(`Invio "${campagna.titolo}": ${coda.length} messaggi in coda.`);
    let inviati = 0, falliti = 0;

    for (let i = 0; i < coda.length; i++) {
      const invio = coda[i];
      send("progresso", { campagnaId, fatto: i, totale: coda.length });
      try {
        const { esito } = await inviaSingolo(invio.numero, campagna.testo);
        esito === "inviato" ? inviati++ : falliti++;
        await supabase.from("invii").update({
          esito, inviato_at: new Date().toISOString(),
        }).eq("id", invio.id);
        log(`(${i + 1}/${coda.length}) ${invio.numero}: ${esito === "inviato" ? "✓ inviato" : "non su WhatsApp"}`);
      } catch (err) {
        falliti++;
        await supabase.from("invii").update({
          esito: "errore", dettaglio: err.message?.slice(0, 200),
        }).eq("id", invio.id);
        log(`(${i + 1}/${coda.length}) ${invio.numero}: ✗ ${err.message}`);
      }
      if (i < coda.length - 1) await attesa(DELAY_MIN_SEC, DELAY_MAX_SEC);
    }

    await supabase.from("campagne")
      .update({ stato: "completata", updated_at: new Date().toISOString() })
      .eq("id", campagnaId);
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
    width: 980,
    height: 720,
    title: "Nuntius Sender",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  initSupabase();
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
  app.quit();
});
