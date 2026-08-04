/**
 * Copie di sicurezza del database locale. Logica pura (niente dialoghi:
 * quelli stanno in main.js), con il driver iniettato come in db/db.js,
 * così è testabile da vitest.
 *
 * Backup automatico: un file al giorno (nuntius-AAAA-MM-GG.db, il salvataggio
 * in chiusura sovrascrive quello del giorno), conservando gli ultimi 14.
 * Prima di un ripristino viene sempre scritta una copia pre-ripristino.
 */

const path = require("node:path");
const fs = require("node:fs");
const { VERSIONE_SCHEMA } = require("./db/schema.js");

const GIORNI_CONSERVATI = 14;

/** Data locale AAAA-MM-GG (il formato svedese è l'ISO). */
const oggiLocale = () => new Date().toLocaleDateString("sv");

const cartellaBackup = (userData) => path.join(userData, "backup");

/** Copia il database aperto in dir/nomeFile e ritorna il percorso scritto. */
async function scriviBackup(db, dir, nomeFile) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, nomeFile);
  await db.backup(file);
  return file;
}

/** Elimina i backup giornalieri più vecchi, conservandone `conserva`. */
function ruotaBackup(dir, conserva = GIORNI_CONSERVATI) {
  let nomi;
  try {
    nomi = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  const daEliminare = nomi
    .filter((f) => /^nuntius-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse()
    .slice(conserva);
  for (const f of daEliminare) fs.unlinkSync(path.join(dir, f));
  return daEliminare.length;
}

/**
 * Backup giornaliero in userData/backup. Non fa nulla finché la parrocchia
 * non è configurata (database ancora vuoto).
 */
async function backupAutomatico(dati, userData) {
  if (!dati.getProfilo()) return null;
  const dir = cartellaBackup(userData);
  const file = await scriviBackup(dati.db, dir, `nuntius-${oggiLocale()}.db`);
  dati.setImpostazione("ultimo_backup", new Date().toISOString());
  ruotaBackup(dir);
  return file;
}

/** true se oggi non è ancora stato fatto un backup automatico. */
function serveBackupOggi(dati) {
  const ultimo = dati.getImpostazione("ultimo_backup");
  if (!ultimo) return true;
  return new Date(ultimo).toLocaleDateString("sv") !== oggiLocale();
}

/**
 * Controlla che un file scelto per il ripristino sia un database Nuntius
 * integro e non più nuovo dello schema di questa versione dell'app.
 */
function verificaBackup(Database, file) {
  let db;
  try {
    db = new Database(file, { readonly: true });
    const integrita = db.pragma("quick_check", { simple: true });
    if (integrita !== "ok") return { ok: false, errore: "Il file è danneggiato." };
    const versione = db.pragma("user_version", { simple: true });
    if (versione < 1) return { ok: false, errore: "Il file non è una copia di Nuntius." };
    db.prepare("select 1 from impostazioni limit 1"); // lancia se manca la tabella
    if (versione > VERSIONE_SCHEMA) {
      return {
        ok: false,
        errore: "La copia viene da una versione di Nuntius più nuova: aggiorna l'app e riprova.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, errore: "Il file non è una copia di Nuntius." };
  } finally {
    try { db?.close(); } catch {}
  }
}

/**
 * Sostituisce il database con il file di backup. Da chiamare a database
 * CHIUSO; elimina anche i file -wal/-shm rimasti, che apparterrebbero al
 * database precedente.
 */
function sostituisciDb(percorsoDb, fileBackup) {
  for (const suffisso of ["-wal", "-shm"]) {
    try { fs.unlinkSync(percorsoDb + suffisso); } catch {}
  }
  fs.copyFileSync(fileBackup, percorsoDb);
}

module.exports = {
  GIORNI_CONSERVATI,
  cartellaBackup,
  scriviBackup,
  ruotaBackup,
  backupAutomatico,
  serveBackupOggi,
  verificaBackup,
  sostituisciDb,
};
