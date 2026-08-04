#!/usr/bin/env node
/**
 * Migrazione one-shot dei dati di una parrocchia da Supabase al database
 * locale SQLite di Nuntius (da ripristinare poi nell'app: Backup →
 * "Ripristina da una copia…").
 *
 * ATTENZIONE: il file prodotto contiene dati personali (in gran parte di
 * minori): salvarlo SOLO in cartelle private, mai nel repo.
 *
 * Autenticazione (una delle due):
 *   - SB_SESSION_FILE: percorso del supabase-session.json salvato dal vecchio
 *     Sender (default: ~/Library/Application Support/Nuntius Sender/…);
 *   - SB_EMAIL + SB_PASSWORD: credenziali della parrocchia.
 *
 * Uso:
 *   node scripts/migra-da-supabase.mjs <file-di-uscita.db>
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("../webapp/node_modules/better-sqlite3");
const { migra } = require("../sender/db/schema.js");

const SB_URL = process.env.SB_URL ?? "https://snzxgqbwtrmxumcvhans.supabase.co";
// Chiave publishable: è pubblica per progetto (stava nel client).
const SB_ANON = process.env.SB_ANON ?? "sb_publishable_SjhqoPnoGl3wvXStH36S_A_MvmWFObe";

const uscita = process.argv[2];
if (!uscita) {
  console.error("Uso: node scripts/migra-da-supabase.mjs <file-di-uscita.db>");
  process.exit(1);
}

// ---------- Autenticazione ----------

async function token() {
  if (process.env.SB_EMAIL && process.env.SB_PASSWORD) {
    return auth("password", { email: process.env.SB_EMAIL, password: process.env.SB_PASSWORD });
  }
  const fileSessione =
    process.env.SB_SESSION_FILE ??
    path.join(os.homedir(), "Library", "Application Support", "Nuntius Sender", "supabase-session.json");
  const sessione = JSON.parse(fs.readFileSync(fileSessione, "utf8"));
  const nuova = await auth("refresh_token", { refresh_token: sessione.refresh_token });
  // I refresh token ruotano: risalva la sessione per poter rieseguire lo script.
  fs.writeFileSync(
    fileSessione,
    JSON.stringify({ access_token: nuova.access_token, refresh_token: nuova.refresh_token })
  );
  return nuova;
}

async function auth(grant, corpo) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!res.ok) throw new Error(`Autenticazione fallita (${res.status}): ${await res.text()}`);
  return res.json();
}

// ---------- Lettura tabelle (paginata) ----------

async function leggiTabella(accessToken, tabella) {
  const righe = [];
  const pagina = 1000;
  for (let da = 0; ; da += pagina) {
    const res = await fetch(`${SB_URL}/rest/v1/${tabella}?select=*`, {
      headers: {
        apikey: SB_ANON,
        Authorization: `Bearer ${accessToken}`,
        Range: `${da}-${da + pagina - 1}`,
      },
    });
    if (!res.ok) throw new Error(`Lettura di ${tabella} fallita (${res.status}): ${await res.text()}`);
    const blocco = await res.json();
    righe.push(...blocco);
    if (blocco.length < pagina) return righe;
  }
}

// ---------- Scrittura del database locale ----------

// Colonne locali per tabella (parrocchia_id viene lasciata cadere).
const TABELLE = {
  persone: ["id", "cognome", "nome", "data_nascita", "cellulare", "telefono_raw",
    "cellulare_raw", "email", "indirizzo", "comune", "note", "created_at", "updated_at"],
  gruppi: ["id", "nome", "attivita", "anno", "archiviato", "created_at"],
  appartenenze: ["persona_id", "gruppo_id", "tipo"],
  liste: ["id", "nome", "descrizione", "created_at"],
  liste_persone: ["lista_id", "persona_id"],
  template: ["id", "titolo", "testo", "created_at"],
  campagne: ["id", "titolo", "testo", "stato", "created_at", "updated_at"],
  invii: ["id", "campagna_id", "persona_id", "numero", "esito", "dettaglio", "inviato_at"],
};

const valore = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : v ?? null);

const sessione = await token();
const [parrocchia] = await leggiTabella(sessione.access_token, "parrocchie");
if (!parrocchia) throw new Error("Nessuna parrocchia visibile con queste credenziali.");
console.log(`Parrocchia: ${parrocchia.nome}${parrocchia.diocesi ? ` (${parrocchia.diocesi})` : ""}`);

fs.mkdirSync(path.dirname(path.resolve(uscita)), { recursive: true });
fs.rmSync(uscita, { force: true });
const db = new Database(uscita);
db.pragma("foreign_keys = ON");
migra(db);

db.prepare("insert into impostazioni (chiave, valore) values ('nome_parrocchia', ?)").run(parrocchia.nome);
if (parrocchia.diocesi) {
  db.prepare("insert into impostazioni (chiave, valore) values ('diocesi', ?)").run(parrocchia.diocesi);
}

for (const [tabella, colonne] of Object.entries(TABELLE)) {
  const righe = await leggiTabella(sessione.access_token, tabella);
  const ins = db.prepare(
    `insert into ${tabella} (${colonne.join(", ")}) values (${colonne.map(() => "?").join(", ")})`
  );
  const tutte = db.transaction(() => {
    for (const r of righe) ins.run(...colonne.map((c) => valore(r[c])));
  });
  tutte();
  console.log(`  ${tabella}: ${righe.length} righe`);
}

db.close();
console.log(`\nFatto: ${uscita}`);
console.log("Ora nell'app: Backup → \"Ripristina da una copia…\" scegliendo questo file.");
