/**
 * Accesso dati: proxy IPC verso lo strato locale SQLite (sender/db/db.js),
 * esposto dal preload come window.nuntius.db. Stesse funzioni e stesse forme
 * di ritorno della vecchia versione Supabase: le viste non cambiano.
 */
import { vocePersonaFields } from "./importPlan.js";

async function invoca(metodo, ...args) {
  const res = await window.nuntius.db(metodo, args);
  if (!res.ok) throw new Error(res.errore);
  return res.dato;
}

const proxy = (metodo) => (...args) => invoca(metodo, ...args);

// ---------- Profilo / impostazioni ----------

/** null finché la parrocchia non è configurata (primo avvio). */
export const getProfilo = proxy("getProfilo");

export async function salvaParrocchia(nome, diocesi) {
  await invoca("setImpostazione", "nome_parrocchia", nome);
  if (diocesi) await invoca("setImpostazione", "diocesi", diocesi);
}

/** Compatibilità con la versione con account: senza login non c'è nulla da azzerare. */
export function resetProfilo() {}

// ---------- Gruppi ----------

export const fetchGruppi = proxy("fetchGruppi");
export const fetchGruppo = proxy("fetchGruppo");
export const aggiornaGruppo = proxy("aggiornaGruppo");
export const eliminaGruppo = proxy("eliminaGruppo");

// ---------- Persone ----------

export const fetchPersone = proxy("fetchPersone");
export const fetchPersoneMinime = proxy("fetchPersoneMinime");
export const creaPersona = proxy("creaPersona");
export const aggiornaPersona = proxy("aggiornaPersona");
export const aggiungiAlGruppo = proxy("aggiungiAlGruppo");
export const rimuoviDalGruppo = proxy("rimuoviDalGruppo");

// ---------- Import ----------

/**
 * Le voci del piano (buildImportPlan) vengono mappate qui nei campi della
 * tabella `persone`: lo strato dati nel main process riceve solo
 * { esistenteId, tipo, campi } e non dipende dalle lib della webapp.
 */
export function importaGruppo({ nome, anno, attivita, voci }) {
  return invoca("importaGruppo", {
    nome,
    anno,
    attivita,
    voci: voci.map((v) => ({
      esistenteId: v.esistenteId,
      tipo: v.tipo,
      campi: vocePersonaFields(v),
    })),
  });
}

// ---------- Liste ----------

export const fetchListe = proxy("fetchListe");
export const creaLista = proxy("creaLista");
export const fetchLista = proxy("fetchLista");
export const aggiornaLista = proxy("aggiornaLista");
export const aggiungiALista = proxy("aggiungiALista");
export const rimuoviDaLista = proxy("rimuoviDaLista");
export const eliminaLista = proxy("eliminaLista");

// ---------- Template ----------

export const fetchTemplates = proxy("fetchTemplates");
export const salvaTemplate = proxy("salvaTemplate");
export const eliminaTemplate = proxy("eliminaTemplate");

// ---------- Campagne ----------

export const fetchCampagne = proxy("fetchCampagne");
export const fetchCampagna = proxy("fetchCampagna");
export const creaCampagna = proxy("creaCampagna");
export const cambiaStatoCampagna = proxy("cambiaStatoCampagna");
export const eliminaCampagna = proxy("eliminaCampagna");
