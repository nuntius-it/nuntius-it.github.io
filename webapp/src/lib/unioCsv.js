/**
 * Parser dell'export UNIO "Esportazione informazioni gruppo (CSV)".
 *
 * Formato osservato: separatore ";", BOM UTF-8 iniziale, intestazione
 * "Gruppo; Anno; Tipo; Cognome; Nome; Data_nascita; Indirizzo; Comune; Telefono; Cellulare; Email".
 * I nomi colonna vengono riconosciuti in modo tollerante (spazi, maiuscole),
 * così piccole variazioni future del formato non rompono l'import.
 */

const REQUIRED = ["cognome", "nome"];

/** Normalizza un nome di colonna: minuscole, senza spazi/underscore. */
function normalizeHeader(h) {
  return h.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_]+/g, "");
}

const HEADER_MAP = {
  gruppo: "gruppo",
  anno: "anno",
  tipo: "tipo",
  cognome: "cognome",
  nome: "nome",
  datanascita: "dataNascita",
  indirizzo: "indirizzo",
  comune: "comune",
  telefono: "telefono",
  cellulare: "cellulare",
  email: "email",
};

/**
 * @param {string} text contenuto del file CSV
 * @returns {{persone: Array<object>, errori: string[]}}
 */
export function parseUnioCsv(text) {
  const errori = [];
  const lines = String(text ?? "")
    .replace(/^﻿/, "")
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim() !== "");

  if (lines.length < 2) {
    return { persone: [], errori: ["Il file è vuoto o contiene solo l'intestazione."] };
  }

  const rawHeaders = lines[0].split(";").map(normalizeHeader);
  const fields = rawHeaders.map((h) => HEADER_MAP[h] ?? null);

  for (const req of REQUIRED) {
    if (!rawHeaders.includes(req)) {
      return {
        persone: [],
        errori: [
          `Colonna "${req}" non trovata: il file non sembra un export gruppi di UNIO.`,
        ],
      };
    }
  }

  const persone = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";");
    if (values.every((v) => v.trim() === "")) continue;
    const persona = {};
    fields.forEach((field, col) => {
      if (field) persona[field] = (values[col] ?? "").trim();
    });
    if (!persona.cognome && !persona.nome) {
      errori.push(`Riga ${i + 1}: nominativo mancante, riga ignorata.`);
      continue;
    }
    persone.push(persona);
  }

  return { persone, errori };
}
