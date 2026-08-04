/** Test delle copie di sicurezza (sender/backup.js) su file temporanei. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { creaDb } from "../../sender/db/db.js";
import {
  scriviBackup, ruotaBackup, backupAutomatico, serveBackupOggi,
  verificaBackup, sostituisciDb, cartellaBackup,
} from "../../sender/backup.js";

let dir; // finta userData temporanea
let d;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nuntius-backup-"));
  d = creaDb(Database, path.join(dir, "nuntius.db"));
});

afterEach(() => {
  try { d.chiudi(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("backup automatico", () => {
  it("non fa nulla finché la parrocchia non è configurata", async () => {
    expect(await backupAutomatico(d, dir)).toBeNull();
    expect(fs.existsSync(cartellaBackup(dir))).toBe(false);
  });

  it("scrive il file del giorno e aggiorna ultimo_backup", async () => {
    d.setImpostazione("nome_parrocchia", "Demo");
    expect(serveBackupOggi(d)).toBe(true);
    const file = await backupAutomatico(d, dir);
    expect(fs.existsSync(file)).toBe(true);
    expect(path.basename(file)).toMatch(/^nuntius-\d{4}-\d{2}-\d{2}\.db$/);
    expect(serveBackupOggi(d)).toBe(false);
    expect(verificaBackup(Database, file).ok).toBe(true);
  });

  it("la rotazione conserva i 14 più recenti e ignora gli altri file", () => {
    const cartella = cartellaBackup(dir);
    fs.mkdirSync(cartella, { recursive: true });
    for (let g = 1; g <= 16; g++) {
      fs.writeFileSync(path.join(cartella, `nuntius-2026-07-${String(g).padStart(2, "0")}.db`), "x");
    }
    fs.writeFileSync(path.join(cartella, "pre-ripristino-2026-07-01.db"), "x");
    expect(ruotaBackup(cartella)).toBe(2);
    const rimasti = fs.readdirSync(cartella).sort();
    expect(rimasti).toHaveLength(15); // 14 giornalieri + pre-ripristino
    expect(rimasti).not.toContain("nuntius-2026-07-01.db");
    expect(rimasti).not.toContain("nuntius-2026-07-02.db");
    expect(rimasti).toContain("nuntius-2026-07-16.db");
    expect(rimasti).toContain("pre-ripristino-2026-07-01.db");
  });
});

describe("verifica del file di ripristino", () => {
  it("rifiuta un file che non è un database", () => {
    const file = path.join(dir, "finto.db");
    fs.writeFileSync(file, "questo non è un database");
    expect(verificaBackup(Database, file).ok).toBe(false);
  });

  it("rifiuta un database qualsiasi non di Nuntius", () => {
    const file = path.join(dir, "altro.db");
    const estraneo = new Database(file);
    estraneo.exec("create table t(x)");
    estraneo.close();
    expect(verificaBackup(Database, file).ok).toBe(false);
  });

  it("rifiuta una copia di una versione più nuova dell'app", async () => {
    d.setImpostazione("nome_parrocchia", "Demo");
    const file = await scriviBackup(d.db, dir, "futuro.db");
    const futuro = new Database(file);
    futuro.pragma("user_version = 99");
    futuro.close();
    const esito = verificaBackup(Database, file);
    expect(esito.ok).toBe(false);
    expect(esito.errore).toMatch(/più nuova/);
  });
});

describe("ripristino", () => {
  it("sostituisce i dati con quelli della copia (e pulisce i file wal)", async () => {
    d.setImpostazione("nome_parrocchia", "Parrocchia A");
    d.creaPersona({ cognome: "Rossi", nome: "Anna" });
    const copia = await scriviBackup(d.db, dir, "copia-a.db");
    d.chiudi();

    // "Altro computer": database con dati diversi
    const percorso = path.join(dir, "nuntius.db");
    fs.rmSync(percorso);
    d = creaDb(Database, percorso);
    d.setImpostazione("nome_parrocchia", "Parrocchia B");
    expect(fs.existsSync(percorso + "-wal")).toBe(true); // WAL attivo
    d.chiudi();

    sostituisciDb(percorso, copia);
    expect(fs.existsSync(percorso + "-wal")).toBe(false);

    d = creaDb(Database, percorso);
    expect(d.getProfilo()).toEqual({ nomeParrocchia: "Parrocchia A" });
    expect(d.fetchPersoneMinime()).toHaveLength(1);
  });
});
