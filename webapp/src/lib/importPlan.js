/**
 * Costruzione del piano di import: confronta le righe del CSV UNIO con le
 * persone già presenti nel database e prepara inserimenti/aggiornamenti.
 * Logica pura, senza accesso al database (testabile).
 */
import { pickMobile, dedupePhones } from "./phone.js";
import { parseItalianDate } from "./dates.js";

/** Chiave di confronto persona: cognome+nome+data di nascita (case-insensitive). */
export function personaKey(cognome, nome, dataNascitaIso) {
  const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(cognome)}|${norm(nome)}|${dataNascitaIso ?? ""}`;
}

/**
 * @param {Array} righe   righe da parseUnioCsv
 * @param {Array} esistenti persone dal db: {id, cognome, nome, data_nascita}
 * @returns piano con voci annotate e statistiche
 */
export function buildImportPlan(righe, esistenti = []) {
  const byKey = new Map(
    esistenti.map((p) => [personaKey(p.cognome, p.nome, p.data_nascita), p])
  );

  const voci = righe.map((r) => {
    const dataNascitaIso = parseItalianDate(r.dataNascita);
    const numero = pickMobile(r);
    const match = byKey.get(personaKey(r.cognome, r.nome, dataNascitaIso));
    return {
      riga: r,
      dataNascitaIso,
      numero,                    // E.164 o null
      tipo: r.tipo?.trim() || "Partecipante",
      esistenteId: match?.id ?? null,
    };
  });

  const numeriUnici = dedupePhones(voci.map((v) => v.numero));

  // Suggerimenti per nome gruppo/anno dal contenuto del file.
  const primo = righe[0] ?? {};
  return {
    voci,
    suggerimenti: { nome: primo.gruppo ?? "", anno: primo.anno ?? "" },
    stats: {
      totale: voci.length,
      nuove: voci.filter((v) => !v.esistenteId).length,
      esistenti: voci.filter((v) => v.esistenteId).length,
      senzaNumero: voci.filter((v) => !v.numero).length,
      numeriUnici: numeriUnici.length,
    },
  };
}

/** Converte una voce del piano nei campi della tabella `persone`. */
export function vocePersonaFields(voce) {
  const r = voce.riga;
  return {
    cognome: r.cognome?.trim(),
    nome: r.nome?.trim(),
    data_nascita: voce.dataNascitaIso,
    cellulare: voce.numero,
    cellulare_raw: r.cellulare ?? "",
    telefono_raw: r.telefono ?? "",
    email: r.email?.trim() || null,
    indirizzo: r.indirizzo?.trim() || null,
    comune: r.comune?.trim() || null,
  };
}
